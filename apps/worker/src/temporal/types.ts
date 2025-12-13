// ============================================================
// TEMPORAL TYPES - Shared between Activities and Workflows
// ============================================================
// These types define the contract between workflows and activities.
// Keep them serializable (no functions, classes, or complex objects).
// ============================================================

/**
 * User metadata input for trace ingestion
 */
export interface UserInput {
  name?: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Span input for trace ingestion
 */
export interface SpanInput {
  id: string;
  parentSpanId?: string;
  name: string;
  startTime: string; // ISO 8601 string (Temporal serialization)
  endTime?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  model?: string;
  modelParameters?: Record<string, unknown>;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  level?: "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";
  statusMessage?: string;
}

/**
 * Trace workflow input
 */
export interface TraceWorkflowInput {
  id: string;
  projectId: string;
  name: string;
  timestamp: string; // ISO 8601 string
  metadata?: Record<string, unknown>;
  sessionId?: string;
  userId?: string;
  user?: UserInput;
  spans: SpanInput[];
}

/**
 * Trace workflow result
 */
export interface TraceWorkflowResult {
  traceId: string;
  spanCount: number;
  costsCalculated: number;
}

/**
 * Score workflow input
 */
export interface ScoreWorkflowInput {
  id: string;
  projectId: string;
  configId?: string;
  traceId?: string;
  spanId?: string;
  sessionId?: string; // External session ID
  trackedUserId?: string; // External user ID
  name: string;
  value: number | string | boolean;
  comment?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Score workflow result
 */
export interface ScoreWorkflowResult {
  scoreId: string;
  dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
}

/**
 * Alert evaluation workflow input
 */
export interface AlertWorkflowInput {
  alertId: string;
  projectId: string;
  alertName: string;
  severity: string;
  evaluationIntervalMs: number;
}

/**
 * Alert evaluation result from evaluateAlert activity
 */
export interface AlertEvaluationResult {
  alertId: string;
  conditionMet: boolean;
  currentValue: number;
  threshold: number;
  sampleCount: number;
}

/**
 * Alert state transition result
 */
export interface AlertStateTransition {
  alertId: string;
  previousState: string;
  newState: string;
  shouldNotify: boolean;
}

/**
 * Score config validation result
 */
export interface ScoreValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Score data type enum (matches Prisma)
 */
export type ScoreDataType = "NUMERIC" | "CATEGORICAL" | "BOOLEAN";

// ============================================
// GitHub Index Workflow Types
// ============================================

/**
 * GitHub index workflow input (from webhook)
 */
export interface GitHubIndexInput {
  repoId: string;
  projectId: string;
  event: "push" | "pull_request";
  payload: unknown;
  deliveryId: string;
}

/**
 * GitHub index workflow result
 */
export interface GitHubIndexResult {
  success: boolean;
  repoId: string;
  event: "push" | "pull_request";
  filesProcessed: number;
  chunksCreated: number;
  commitSha?: string;
  prNumber?: number;
  error?: string;
}

/**
 * Changed file info extracted from GitHub events
 */
export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "removed";
}

/**
 * File content fetched from GitHub
 */
export interface FileContent {
  path: string;
  content: string;
  encoding: "utf-8" | "base64";
}

/**
 * Code chunk data for storage
 */
export interface CodeChunkData {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
  language: string | null;
  chunkType: "function" | "class" | "module" | "block";
}

/**
 * Input for storeGitHubIndex internal procedure
 */
export interface StoreGitHubIndexInput {
  repoId: string;
  event: "push" | "pull_request";
  // Commit fields (for push events)
  commitSha?: string;
  commitMessage?: string;
  commitAuthor?: string;
  commitAuthorEmail?: string;
  commitTimestamp?: string;
  // PR fields (for pull_request events)
  prNumber?: number;
  prTitle?: string;
  prBody?: string;
  prState?: string;
  prAuthor?: string;
  prBaseBranch?: string;
  prHeadBranch?: string;
  prMergedAt?: string;
  prClosedAt?: string;
  // Changed files and chunks
  changedFiles: string[];
  chunks: CodeChunkData[];
}
