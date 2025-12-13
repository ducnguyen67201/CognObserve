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
