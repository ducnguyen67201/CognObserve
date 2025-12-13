# Engineering Spec: Repository Indexing Workflow

**Issue**: #134
**Status**: Draft
**Author**: Engineering Team
**Created**: 2025-12-13

## Overview

Wire up the GitHub repository indexing flow to trigger Temporal workflows when a repository is enabled or re-indexed. This connects the existing UI enable/disable functionality to actual code indexing via Temporal.

## Problem Statement

Currently when a user enables a repository for indexing:
- ✅ Database is updated (`enabled: true`, `indexStatus: "PENDING"`)
- ❌ No actual indexing occurs (Temporal workflow not triggered)

The same applies to re-indexing - status is updated but no workflow runs.

## Goals

1. Trigger `githubIndexWorkflow` when repository is enabled
2. Trigger re-indexing workflow when user clicks "Re-index"
3. Update repository status based on workflow progress
4. Handle workflow failures gracefully

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Repository Indexing Flow                              │
└─────────────────────────────────────────────────────────────────────────────┘

  User clicks "Enable Repository"
           │
           ▼
  ┌─────────────────────────────────────┐
  │ tRPC: github.enableRepository       │
  │                                     │
  │ 1. Update DB: enabled=true          │
  │ 2. Update DB: indexStatus=PENDING   │
  │ 3. Start Temporal workflow          │
  └──────────┬──────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────┐
  │ Temporal: githubIndexWorkflow       │
  │                                     │
  │ Input:                              │
  │   - repositoryId                    │
  │   - installationId                  │
  │   - owner, repo, branch             │
  └──────────┬──────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                      Workflow Activities                         │
  └─────────────────────────────────────────────────────────────────┘
             │
  ┌──────────┼──────────┬──────────────┬───────────────┐
  │          │          │              │               │
  ▼          ▼          ▼              ▼               ▼
┌──────┐  ┌──────┐  ┌────────┐  ┌───────────┐  ┌────────────┐
│Update│  │Fetch │  │ Parse  │  │ Generate  │  │   Store    │
│Status│  │Files │  │ Files  │  │ Embeddings│  │  Chunks    │
│      │  │      │  │        │  │           │  │            │
│INDEXING│ │GitHub│  │Tree-   │  │ OpenAI    │  │ PostgreSQL │
│      │  │ API  │  │sitter  │  │ API       │  │            │
└──────┘  └──────┘  └────────┘  └───────────┘  └────────────┘
             │
             ▼
  ┌─────────────────────────────────────┐
  │ Final Activity: updateIndexStatus   │
  │                                     │
  │ - indexStatus = INDEXED             │
  │ - lastIndexedAt = NOW()             │
  └─────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Create Temporal Client in Web App

**File**: `apps/web/src/lib/temporal.ts`

```typescript
import { Client, Connection } from "@temporalio/client";
import { env } from "./env";

let _client: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (_client) return _client;

  const connection = await Connection.connect({
    address: env.TEMPORAL_ADDRESS || "localhost:7233",
  });

  _client = new Client({ connection });
  return _client;
}
```

### Step 2: Define Workflow Input Types

**File**: `apps/worker/src/workflows/github-index/types.ts`

```typescript
export interface GitHubIndexWorkflowInput {
  repositoryId: string;
  installationId: number;
  owner: string;
  repo: string;
  branch: string;
  fullReindex?: boolean; // If true, delete existing chunks first
}

export interface GitHubIndexWorkflowResult {
  success: boolean;
  chunksCreated: number;
  filesProcessed: number;
  error?: string;
}
```

### Step 3: Create Index Workflow

**File**: `apps/worker/src/workflows/github-index/workflow.ts`

```typescript
import { proxyActivities, defineWorkflow } from "@temporalio/workflow";
import type { GitHubIndexWorkflowInput, GitHubIndexWorkflowResult } from "./types";
import type * as activities from "./activities";

const {
  updateRepositoryStatus,
  fetchRepositoryFiles,
  parseAndChunkFiles,
  generateEmbeddings,
  storeChunks,
  cleanupExistingChunks,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  retry: {
    maximumAttempts: 3,
  },
});

export const githubIndexWorkflow = defineWorkflow(
  async (input: GitHubIndexWorkflowInput): Promise<GitHubIndexWorkflowResult> => {
    const { repositoryId, fullReindex } = input;

    try {
      // 1. Update status to INDEXING
      await updateRepositoryStatus(repositoryId, "INDEXING");

      // 2. If full re-index, clean up existing chunks
      if (fullReindex) {
        await cleanupExistingChunks(repositoryId);
      }

      // 3. Fetch files from GitHub
      const files = await fetchRepositoryFiles(input);

      // 4. Parse and chunk files
      const chunks = await parseAndChunkFiles(files, repositoryId);

      // 5. Generate embeddings
      const chunksWithEmbeddings = await generateEmbeddings(chunks);

      // 6. Store chunks in database
      const storedCount = await storeChunks(chunksWithEmbeddings);

      // 7. Update status to INDEXED
      await updateRepositoryStatus(repositoryId, "INDEXED");

      return {
        success: true,
        chunksCreated: storedCount,
        filesProcessed: files.length,
      };
    } catch (error) {
      // Update status to FAILED
      await updateRepositoryStatus(repositoryId, "FAILED");

      return {
        success: false,
        chunksCreated: 0,
        filesProcessed: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
);
```

### Step 4: Implement Activities

**File**: `apps/worker/src/workflows/github-index/activities.ts`

Activities should use `getInternalCaller()` for database mutations:

```typescript
import { getInternalCaller } from "@/lib/trpc-caller";
import { prisma } from "@cognobserve/db";
import { createAppOctokit } from "@/lib/github";

// Read-only: allowed in activities
export async function fetchRepositoryFiles(input: GitHubIndexWorkflowInput) {
  const octokit = createAppOctokit(input.installationId);
  // Fetch file tree from GitHub API
  // ...
}

// Mutation: must use tRPC internal caller
export async function updateRepositoryStatus(
  repositoryId: string,
  status: "INDEXING" | "INDEXED" | "FAILED"
) {
  const caller = getInternalCaller();
  await caller.internal.updateRepositoryIndexStatus({
    repositoryId,
    status,
    lastIndexedAt: status === "INDEXED" ? new Date() : undefined,
  });
}

export async function storeChunks(chunks: ChunkWithEmbedding[]) {
  const caller = getInternalCaller();
  return await caller.internal.storeCodeChunks({ chunks });
}
```

### Step 5: Add Internal tRPC Procedures

**File**: `packages/api/src/routers/internal.ts`

```typescript
updateRepositoryIndexStatus: internalProcedure
  .input(z.object({
    repositoryId: z.string(),
    status: z.enum(["PENDING", "INDEXING", "INDEXED", "FAILED"]),
    lastIndexedAt: z.date().optional(),
  }))
  .mutation(async ({ input }) => {
    return prisma.gitHubRepository.update({
      where: { id: input.repositoryId },
      data: {
        indexStatus: input.status,
        lastIndexedAt: input.lastIndexedAt,
      },
    });
  }),

storeCodeChunks: internalProcedure
  .input(z.object({
    chunks: z.array(CodeChunkSchema),
  }))
  .mutation(async ({ input }) => {
    // Bulk insert chunks
    return prisma.codeChunk.createMany({
      data: input.chunks,
    });
  }),
```

### Step 6: Trigger Workflow from tRPC Router

**File**: `packages/api/src/routers/github.ts`

```typescript
import { getTemporalClient } from "@/lib/temporal";

enableRepository: protectedProcedure
  .input(RepositoryActionSchema)
  .use(workspaceMiddleware)
  .mutation(async ({ ctx, input }) => {
    // ... existing validation ...

    // Enable and set to pending
    const repo = await prisma.gitHubRepository.update({
      where: { id: repositoryId },
      data: {
        enabled: true,
        indexStatus: "PENDING",
      },
      include: {
        installation: true,
      },
    });

    // Start Temporal workflow
    const client = await getTemporalClient();
    await client.workflow.start("githubIndexWorkflow", {
      taskQueue: "github-indexing",
      workflowId: `github-index-${repositoryId}-${Date.now()}`,
      args: [{
        repositoryId: repo.id,
        installationId: Number(repo.installation.installationId),
        owner: repo.owner,
        repo: repo.repo,
        branch: repo.defaultBranch,
        fullReindex: false,
      }],
    });

    return { success: true };
  }),
```

### Step 7: Register Workflow in Worker

**File**: `apps/worker/src/startup/index.ts`

```typescript
export const WORKFLOW_REGISTRY = {
  // ... existing workflows ...
  githubIndexWorkflow: {
    name: "githubIndexWorkflow",
    taskQueue: "github-indexing",
  },
} as const;
```

## Database Schema

No schema changes required. Uses existing tables:
- `GitHubRepository` - `indexStatus`, `lastIndexedAt` fields
- `CodeChunk` - stores parsed code chunks with embeddings

## Index Status State Machine

```
┌─────────┐     Enable      ┌─────────┐
│ NONE    │ ───────────────▶│ PENDING │
└─────────┘                 └────┬────┘
                                 │
                    Workflow     │
                    Started      ▼
                            ┌──────────┐
                            │ INDEXING │
                            └────┬─────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  │                  ▼
        ┌─────────┐              │            ┌────────┐
        │ INDEXED │              │            │ FAILED │
        └─────────┘              │            └────────┘
              │                  │                  │
              │   Re-index       │    Re-index     │
              └──────────────────┴──────────────────┘
                                 │
                                 ▼
                            ┌─────────┐
                            │ PENDING │
                            └─────────┘
```

## Error Handling

| Error | Handling |
|-------|----------|
| GitHub API rate limit | Retry with exponential backoff |
| GitHub API auth failure | Fail workflow, mark FAILED |
| File parsing error | Skip file, log warning, continue |
| Embedding API failure | Retry 3x, then fail workflow |
| Database error | Retry 3x, then fail workflow |

## Testing Checklist

- [ ] Enable repository triggers workflow
- [ ] Re-index triggers workflow with `fullReindex: true`
- [ ] Status updates to INDEXING when workflow starts
- [ ] Status updates to INDEXED on success
- [ ] Status updates to FAILED on error
- [ ] Chunks are stored in database
- [ ] UI polls and shows updated status
- [ ] Disable repository stops/cancels running workflow

## Dependencies

- `@temporalio/client` - Already installed in worker
- `@temporalio/workflow` - Already installed in worker
- Need to add `@temporalio/client` to `apps/web` for triggering

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `apps/web/src/lib/temporal.ts` | Temporal client for web app |
| `apps/worker/src/workflows/github-index/types.ts` | Workflow input/output types |
| `apps/worker/src/workflows/github-index/workflow.ts` | Workflow definition |
| `apps/worker/src/workflows/github-index/activities.ts` | Workflow activities |
| `apps/worker/src/workflows/github-index/index.ts` | Barrel export |

### Modified Files
| File | Changes |
|------|---------|
| `apps/web/package.json` | Add @temporalio/client |
| `packages/api/src/routers/github.ts` | Trigger workflow on enable/reindex |
| `packages/api/src/routers/internal.ts` | Add status update procedures |
| `apps/worker/src/startup/index.ts` | Register new workflow |
| `apps/worker/src/temporal/worker.ts` | Add github-indexing task queue |

## Security Considerations

1. **GitHub Token**: Use installation token, not user token
2. **File Access**: Only index files the installation has access to
3. **Rate Limits**: Respect GitHub API rate limits
4. **Data Size**: Limit file size and chunk count per repository

## Performance Considerations

1. **Parallel Processing**: Process files in parallel batches
2. **Incremental Indexing**: Future enhancement - only index changed files
3. **Embedding Batching**: Batch embedding requests to reduce API calls
4. **Database Batching**: Use bulk inserts for chunks

## Future Enhancements

1. Incremental indexing (only changed files)
2. Webhook-triggered indexing on push events
3. Progress tracking and percentage complete
4. Cancel running workflow capability
5. Priority queue for paid workspaces
