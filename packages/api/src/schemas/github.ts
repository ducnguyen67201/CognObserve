import { z } from "zod";

// ============================================
// Enums (Source of Truth)
// ============================================

export const IndexStatusSchema = z.enum([
  "PENDING",
  "INDEXING",
  "READY",
  "FAILED",
]);
export type IndexStatus = z.infer<typeof IndexStatusSchema>;
export const ALL_INDEX_STATUSES = IndexStatusSchema.options;

export const ChunkTypeSchema = z.enum(["function", "class", "module", "block"]);
export type ChunkType = z.infer<typeof ChunkTypeSchema>;

// ============================================
// UI Display Constants
// ============================================

export const INDEX_STATUS_LABELS: Record<IndexStatus, string> = {
  PENDING: "Pending",
  INDEXING: "Indexing...",
  READY: "Ready",
  FAILED: "Failed",
};

// ============================================
// Input Schemas
// ============================================

export const ConnectRepositorySchema = z.object({
  projectId: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  defaultBranch: z.string().default("main"),
  installationId: z.number().optional(),
});
export type ConnectRepositoryInput = z.infer<typeof ConnectRepositorySchema>;

// ============================================
// Code Chunk Schemas (for Temporal workflows)
// ============================================

export const CodeChunkSchema = z.object({
  filePath: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  content: z.string(),
  contentHash: z.string(),
  language: z.string().nullable(),
  chunkType: ChunkTypeSchema,
});
export type CodeChunkInput = z.infer<typeof CodeChunkSchema>;

// ============================================
// GitHub Webhook Payload Schemas
// ============================================

// Common types
export const GitHubUserSchema = z.object({
  login: z.string(),
  id: z.number(),
  email: z.string().nullable().optional(),
});
export type GitHubUser = z.infer<typeof GitHubUserSchema>;

export const GitHubRepositorySchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  owner: GitHubUserSchema,
  default_branch: z.string(),
  private: z.boolean(),
});
export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>;

// Push event schemas
export const GitHubCommitSchema = z.object({
  id: z.string(),
  message: z.string(),
  timestamp: z.string(),
  author: z.object({
    name: z.string(),
    email: z.string(),
  }),
  added: z.array(z.string()),
  removed: z.array(z.string()),
  modified: z.array(z.string()),
});
export type GitHubCommit = z.infer<typeof GitHubCommitSchema>;

export const GitHubPushPayloadSchema = z.object({
  ref: z.string(),
  before: z.string(),
  after: z.string(),
  repository: GitHubRepositorySchema,
  pusher: z.object({
    name: z.string(),
    email: z.string().optional(),
  }),
  sender: GitHubUserSchema,
  commits: z.array(GitHubCommitSchema),
  head_commit: GitHubCommitSchema.nullable(),
});
export type GitHubPushPayload = z.infer<typeof GitHubPushPayloadSchema>;

// Pull request event schemas
export const GitHubPullRequestSchema = z.object({
  number: z.number(),
  state: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  user: GitHubUserSchema,
  head: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  base: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  merged: z.boolean().nullable(),
  merged_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type GitHubPullRequest = z.infer<typeof GitHubPullRequestSchema>;

export const GitHubPRPayloadSchema = z.object({
  action: z.enum(["opened", "closed", "synchronize", "reopened", "edited"]),
  number: z.number(),
  pull_request: GitHubPullRequestSchema,
  repository: GitHubRepositorySchema,
  sender: GitHubUserSchema,
});
export type GitHubPRPayload = z.infer<typeof GitHubPRPayloadSchema>;
