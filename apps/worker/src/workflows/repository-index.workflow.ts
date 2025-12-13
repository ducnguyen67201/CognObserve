// ============================================================
// REPOSITORY INDEX WORKFLOW - Full repository indexing
// ============================================================
// This workflow indexes an entire repository when enabled or re-indexed.
// Triggered from UI via tRPC router when user enables/re-indexes a repo.
//
// Flow:
// 1. Update status to INDEXING
// 2. If reindex, cleanup existing chunks
// 3. Fetch repository tree (file list)
// 4. Filter to indexable files
// 5. Fetch file contents
// 6. Chunk files
// 7. Store chunks
// 8. Update status to READY (or FAILED on error)
// ============================================================

import {
  proxyActivities,
  log,
  ApplicationFailure,
} from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import type { RepositoryIndexInput, RepositoryIndexResult } from "../temporal/types";
import { ACTIVITY_RETRY } from "@cognobserve/shared";

// ============================================================
// Activity Configuration
// ============================================================

const {
  updateRepositoryIndexStatus,
  cleanupRepositoryChunks,
  fetchRepositoryTree,
  fetchRepositoryContents,
  chunkCodeFiles,
  storeRepositoryChunks,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30m", // Longer timeout for large repos
  retry: {
    ...ACTIVITY_RETRY.DEFAULT,
    maximumAttempts: 3,
  },
});

// ============================================================
// Constants (inline to avoid bundling issues)
// ============================================================
// NOTE: Duplicated from @cognobserve/shared for Temporal sandbox isolation.
// Keep in sync with packages/shared/src/chunking/index.ts

const INDEXABLE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx",
  ".py", ".go", ".rs", ".java",
];

const EXCLUDED_PATTERNS = [
  "node_modules",
  ".git/",
  "dist/",
  "build/",
  ".next/",
  ".min.",
  ".d.ts",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
];

/**
 * Check if a file should be indexed (pure function - safe in workflow).
 */
function shouldIndexFile(path: string): boolean {
  // Check excluded patterns
  for (const pattern of EXCLUDED_PATTERNS) {
    if (path.includes(pattern)) {
      return false;
    }
  }

  // Check extension
  for (const ext of INDEXABLE_EXTENSIONS) {
    if (path.endsWith(ext)) {
      return true;
    }
  }

  return false;
}

// ============================================================
// Main Workflow
// ============================================================

/**
 * Repository Index Workflow
 *
 * Indexes an entire repository when enabled or re-indexed from the UI.
 *
 * @param input - Workflow input with repository details
 * @returns Result with counts of files processed and chunks created
 */
export async function repositoryIndexWorkflow(
  input: RepositoryIndexInput
): Promise<RepositoryIndexResult> {
  const { repositoryId, mode, owner, repo, branch } = input;

  log.info("Starting repository index workflow", {
    repositoryId,
    owner,
    repo,
    branch,
    mode,
  });

  try {
    // Step 1: Update status to INDEXING
    await updateRepositoryIndexStatus(repositoryId, "INDEXING");
    log.info("Status updated to INDEXING");

    // Step 2: If reindex, cleanup existing chunks first
    if (mode === "reindex") {
      log.info("Cleaning up existing chunks for reindex");
      await cleanupRepositoryChunks(repositoryId);
    }

    // Step 3: Fetch repository tree from GitHub API
    log.info("Fetching repository tree");
    const allFiles = await fetchRepositoryTree({
      installationId: input.installationId,
      owner,
      repo,
      branch,
    });
    log.info("Fetched file tree", { totalFiles: allFiles.length });

    // Step 4: Filter to indexable files (deterministic in workflow)
    const filesToIndex = allFiles.filter(shouldIndexFile);
    log.info("Filtered to indexable files", { count: filesToIndex.length });

    // If no files to index, update status and return early
    if (filesToIndex.length === 0) {
      log.info("No indexable files found");
      await updateRepositoryIndexStatus(repositoryId, "READY");
      return {
        success: true,
        filesProcessed: 0,
        chunksCreated: 0,
      };
    }

    // Step 5: Fetch file contents from GitHub API
    log.info("Fetching file contents");
    const fileContents = await fetchRepositoryContents({
      installationId: input.installationId,
      owner,
      repo,
      branch,
      files: filesToIndex,
    });
    log.info("Fetched file contents", { count: fileContents.length });

    // Step 6: Chunk the files
    log.info("Chunking files");
    const chunks = await chunkCodeFiles(fileContents);
    log.info("Created chunks", { count: chunks.length });

    // Step 7: Store chunks in database
    if (chunks.length > 0) {
      log.info("Storing chunks");
      const result = await storeRepositoryChunks({
        repositoryId,
        chunks,
      });
      log.info("Stored chunks", { count: result.chunksCreated });

      // Step 8: Update status to READY
      await updateRepositoryIndexStatus(repositoryId, "READY");

      log.info("Repository indexing completed successfully", {
        repositoryId,
        filesProcessed: fileContents.length,
        chunksCreated: result.chunksCreated,
      });

      return {
        success: true,
        filesProcessed: fileContents.length,
        chunksCreated: result.chunksCreated,
      };
    }

    // No chunks created (files may have been empty or too small)
    await updateRepositoryIndexStatus(repositoryId, "READY");
    return {
      success: true,
      filesProcessed: fileContents.length,
      chunksCreated: 0,
    };
  } catch (error) {
    log.error("Repository indexing failed", { error, repositoryId });

    // Update status to FAILED
    try {
      await updateRepositoryIndexStatus(repositoryId, "FAILED");
    } catch (statusError) {
      log.error("Failed to update status to FAILED", { statusError });
    }

    // Re-throw ApplicationFailure as-is
    if (error instanceof ApplicationFailure) {
      throw error;
    }

    // Return failure result instead of throwing to prevent retries
    return {
      success: false,
      filesProcessed: 0,
      chunksCreated: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
