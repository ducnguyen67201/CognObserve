/**
 * GitHub Indexing Activities
 *
 * Activities for processing GitHub webhook events and indexing code.
 * These handle side effects (database, network) for the workflow.
 *
 * IMPORTANT: Follows READ-ONLY pattern - all mutations via tRPC internal procedures.
 */

import { prisma } from "@cognobserve/db";
import {
  GitHubPushPayloadSchema,
  GitHubPRPayloadSchema,
} from "@cognobserve/api/schemas";
import { createHash } from "crypto";
import { getInternalCaller } from "@/lib/trpc-caller";
import { env } from "@/lib/env";
import type {
  GitHubIndexInput,
  ChangedFile,
  FileContent,
  CodeChunkData,
  StoreGitHubIndexInput,
} from "../types";

// ============================================
// Constants
// ============================================

const INDEXABLE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx", // JavaScript/TypeScript
  ".py", // Python
  ".go", // Go
  ".rs", // Rust
  ".java", // Java
];

const EXCLUDED_PATTERNS = [
  /node_modules/,
  /\.git\//,
  /dist\//,
  /build\//,
  /\.next\//,
  /\.min\./,
  /package-lock\.json/,
  /pnpm-lock\.yaml/,
  /yarn\.lock/,
];

const MAX_FILE_SIZE = 100 * 1024; // 100KB max per file
const MAX_FILES_PER_BATCH = 50;

// ============================================
// Activity: Extract Changed Files
// ============================================

/**
 * Extract changed files from GitHub push/PR payload.
 * Pure computation - no side effects.
 */
export async function extractChangedFiles(
  input: GitHubIndexInput
): Promise<ChangedFile[]> {
  const { event, payload } = input;

  if (event === "push") {
    const parsed = GitHubPushPayloadSchema.parse(payload);
    const changedFiles: ChangedFile[] = [];

    for (const commit of parsed.commits) {
      for (const file of commit.added) {
        changedFiles.push({ path: file, status: "added" });
      }
      for (const file of commit.modified) {
        changedFiles.push({ path: file, status: "modified" });
      }
      for (const file of commit.removed) {
        changedFiles.push({ path: file, status: "removed" });
      }
    }

    // Deduplicate by path (keep last status)
    const fileMap = new Map<string, ChangedFile>();
    for (const file of changedFiles) {
      fileMap.set(file.path, file);
    }

    return Array.from(fileMap.values());
  }

  if (event === "pull_request") {
    // For PRs, we only store metadata (no file indexing yet)
    // File diff indexing can be added later
    return [];
  }

  return [];
}

// ============================================
// Activity: Fetch File Contents from GitHub
// ============================================

/**
 * Fetch file contents from GitHub API.
 * Network I/O - reads repo info from database.
 */
export async function fetchFileContents(input: {
  repoId: string;
  files: ChangedFile[];
  ref: string;
}): Promise<FileContent[]> {
  const { repoId, files, ref } = input;

  // Get repo info for API calls (READ-ONLY)
  const repo = await prisma.gitHubRepository.findUnique({
    where: { id: repoId },
    select: { owner: true, repo: true, installationId: true },
  });

  if (!repo) {
    throw new Error(`Repository not found: ${repoId}`);
  }

  // Filter to non-removed files only
  const filesToFetch = files.filter((f) => f.status !== "removed");

  // Batch fetch to avoid rate limits
  const contents: FileContent[] = [];
  const batches = chunkArray(filesToFetch, MAX_FILES_PER_BATCH);

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        try {
          const content = await fetchSingleFile(
            repo.owner,
            repo.repo,
            file.path,
            ref
          );
          return content;
        } catch (error) {
          console.warn(`[GitHub] Failed to fetch ${file.path}:`, error);
          return null;
        }
      })
    );

    contents.push(...batchResults.filter((c): c is FileContent => c !== null));
  }

  return contents;
}

/**
 * Fetch a single file from GitHub API.
 */
async function fetchSingleFile(
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<FileContent | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${ref}`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "CognObserve-Indexer",
  };

  // Use token if available for higher rate limits
  const token = env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    if (response.status === 404) {
      return null; // File doesn't exist at this ref
    }
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    size: number;
    content: string;
    encoding: string;
  };

  // Skip files that are too large
  if (data.size > MAX_FILE_SIZE) {
    console.log(`[GitHub] Skipping large file: ${path} (${data.size} bytes)`);
    return null;
  }

  // Decode base64 content
  const content = Buffer.from(data.content, "base64").toString("utf-8");

  return {
    path,
    content,
    encoding: "utf-8",
  };
}

// ============================================
// Activity: Chunk Code Files
// ============================================

/**
 * Split code files into chunks for indexing.
 * Pure computation - no side effects.
 */
export async function chunkCodeFiles(
  files: FileContent[]
): Promise<CodeChunkData[]> {
  const allChunks: CodeChunkData[] = [];

  for (const file of files) {
    const language = detectLanguage(file.path);
    const chunks = chunkCode(file.path, file.content, language);
    allChunks.push(...chunks);
  }

  return allChunks;
}

/**
 * Simple line-based chunking.
 * TODO: Implement AST-based chunking in #131
 */
function chunkCode(
  filePath: string,
  content: string,
  language: string | null
): CodeChunkData[] {
  const lines = content.split("\n");
  const chunks: CodeChunkData[] = [];

  const CHUNK_SIZE = 100; // lines per chunk
  const MIN_CHUNK_SIZE = 10;

  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    const chunkLines = lines.slice(i, i + CHUNK_SIZE);

    // Skip tiny chunks at the end - append to previous chunk
    if (chunkLines.length < MIN_CHUNK_SIZE && chunks.length > 0) {
      const prev = chunks[chunks.length - 1];
      if (prev) {
        prev.endLine = i + chunkLines.length;
        prev.content += "\n" + chunkLines.join("\n");
        prev.contentHash = generateContentHash(prev.content);
      }
      continue;
    }

    const chunkContent = chunkLines.join("\n");

    chunks.push({
      filePath,
      startLine: i + 1,
      endLine: i + chunkLines.length,
      content: chunkContent,
      contentHash: generateContentHash(chunkContent),
      language,
      chunkType: "block",
    });
  }

  return chunks;
}

/**
 * Generate SHA-256 hash of content for deduplication.
 */
function generateContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Detect programming language from file extension.
 */
function detectLanguage(filePath: string): string | null {
  const ext = filePath.substring(filePath.lastIndexOf("."));
  const langMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
  };
  return langMap[ext] || null;
}

// ============================================
// Activity: Store Indexed Data
// ============================================

/**
 * Store indexed data via tRPC internal procedure.
 * Mutations go through internal router - NOT direct database access.
 */
export async function storeIndexedData(
  input: StoreGitHubIndexInput
): Promise<{ chunksCreated: number }> {
  const caller = getInternalCaller();
  return caller.internal.storeGitHubIndex(input);
}

// ============================================
// Helper: Filter Indexable Files
// ============================================

/**
 * Check if a file should be indexed based on extension and path.
 * Exported for use in workflow (pure function - safe in workflow context).
 */
export function shouldIndexFile(path: string): boolean {
  // Check excluded patterns
  if (EXCLUDED_PATTERNS.some((p) => p.test(path))) {
    return false;
  }

  // Check extension
  return INDEXABLE_EXTENSIONS.some((ext) => path.endsWith(ext));
}

// ============================================
// Helper: Chunk Array
// ============================================

/**
 * Split an array into chunks of specified size.
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
