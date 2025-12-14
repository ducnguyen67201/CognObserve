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
 * State preserved across continueAsNew restarts.
 * This state survives workflow restarts and maintains continuity.
 */
export interface AlertWorkflowState {
  /** Total evaluations across all runs */
  totalEvaluations: number;
  /** Evaluations in current run (reset on continueAsNew) */
  evaluationsThisRun: number;
  /** Timestamp of last evaluation */
  lastEvaluatedAt: number;
  /** Timestamp when this run started */
  runStartedAt: number;
  /** Number of times workflow has continued as new */
  continueAsNewCount: number;
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

// ============================================
// Repository Index Workflow Types
// ============================================

/**
 * Repository index workflow input (for full repo indexing).
 * Triggered when user enables a repository or requests re-index.
 */
export interface RepositoryIndexInput {
  repositoryId: string;
  installationId: number;
  owner: string;
  repo: string;
  branch: string;
  mode: "initial" | "reindex";
}

/**
 * Repository index workflow result
 */
export interface RepositoryIndexResult {
  success: boolean;
  filesProcessed: number;
  chunksCreated: number;
  error?: string;
}

/**
 * Input for fetch repository tree activity
 */
export interface FetchTreeInput {
  installationId: number;
  owner: string;
  repo: string;
  branch: string;
}

/**
 * Input for fetch repository file contents activity
 */
export interface FetchContentsInput {
  installationId: number;
  owner: string;
  repo: string;
  branch: string;
  files: string[];
}

/**
 * Input for store repository chunks activity
 */
export interface StoreRepositoryChunksInput {
  repositoryId: string;
  chunks: CodeChunkData[];
}

/**
 * Result from storeRepositoryChunks (includes chunk IDs for embedding)
 */
export interface StoreRepositoryChunksResult {
  chunksCreated: number;
  chunkIds: string[];
}

// ============================================
// Embedding Generation Types
// ============================================

/**
 * Input for generateEmbeddings activity
 */
export interface GenerateEmbeddingsInput {
  chunks: EmbeddingChunk[];
  batchSize?: number;
}

/**
 * Chunk data for embedding generation
 */
export interface EmbeddingChunk {
  id: string;
  content: string;
  contentHash: string;
}

/**
 * Single embedding result
 */
export interface EmbeddingResult {
  chunkId: string;
  embedding: number[];
}

/**
 * Output from generateEmbeddings activity
 */
export interface GenerateEmbeddingsOutput {
  embeddings: EmbeddingResult[];
  tokensUsed: number;
  estimatedCost: number;
  chunksProcessed: number;
  batchCount: number;
  /** Number of embeddings retrieved from cache */
  cached: number;
  /** Number of embeddings generated via API */
  generated: number;
}

/**
 * Input for storeEmbeddings activity
 */
export interface StoreEmbeddingsInput {
  embeddings: EmbeddingResult[];
}

/**
 * Output from storeEmbeddings activity
 */
export interface StoreEmbeddingsOutput {
  storedCount: number;
}

// ============================================
// Vector Search Types
// ============================================

/**
 * Input for searchCodebase activity
 */
export interface SearchCodebaseInput {
  /** Repository ID to search within */
  repoId: string;
  /** Natural language or code query */
  query: string;
  /** Maximum number of results (default: 10, max: 100) */
  topK?: number;
  /** Minimum similarity threshold 0-1 (default: 0.5) */
  minSimilarity?: number;
  /** Optional file patterns to filter (e.g., ["*.ts", "src/**"]) */
  filePatterns?: string[];
}

/**
 * Single search result
 */
export interface SearchResult {
  /** Code chunk ID */
  chunkId: string;
  /** Repository ID */
  repoId: string;
  /** File path within repository */
  filePath: string;
  /** Start line number (1-based) */
  startLine: number;
  /** End line number (1-based) */
  endLine: number;
  /** Code content */
  content: string;
  /** Programming language */
  language: string | null;
  /** Chunk type (function, class, module, block) */
  chunkType: string;
  /** Cosine similarity score (0-1, higher is better) */
  similarity: number;
}

/**
 * Output from searchCodebase activity
 */
export interface SearchCodebaseOutput {
  /** Search results ordered by similarity */
  results: SearchResult[];
  /** Query embedding tokens used */
  queryTokens: number;
  /** Total search latency in milliseconds */
  searchLatencyMs: number;
  /** Whether query was truncated */
  queryTruncated: boolean;
}

/**
 * Input for project-level search (resolves repo from project)
 */
export interface SearchProjectCodebaseInput {
  /** Project ID (will resolve to repository) */
  projectId: string;
  /** Natural language or code query */
  query: string;
  /** Maximum number of results */
  topK?: number;
  /** Minimum similarity threshold */
  minSimilarity?: number;
  /** Optional file patterns */
  filePatterns?: string[];
}

// ============================================
// RCA (Root Cause Analysis) Types
// ============================================

/**
 * Alert type enum for RCA analysis
 */
export type RCAAlertType =
  | "ERROR_RATE"
  | "LATENCY_P50"
  | "LATENCY_P95"
  | "LATENCY_P99";

/**
 * Input for analyzeTraces activity
 */
export interface TraceAnalysisInput {
  /** Project ID to analyze traces for */
  projectId: string;
  /** Type of alert that triggered the analysis */
  alertType: RCAAlertType;
  /** Current value that triggered the alert */
  alertValue: number;
  /** Alert threshold that was exceeded */
  threshold: number;
  /** Start of analysis window (ISO 8601 datetime) */
  windowStart: string;
  /** End of analysis window - when alert triggered (ISO 8601 datetime) */
  windowEnd: string;
}

/**
 * Summary statistics from trace analysis
 */
export interface TraceAnalysisSummary {
  /** Total unique traces in window */
  totalTraces: number;
  /** Total spans analyzed */
  totalSpans: number;
  /** Number of spans with errors */
  errorCount: number;
  /** Error rate (0-1 range) */
  errorRate: number;
  /** 50th percentile latency in milliseconds */
  latencyP50: number;
  /** 95th percentile latency in milliseconds */
  latencyP95: number;
  /** 99th percentile latency in milliseconds */
  latencyP99: number;
  /** Mean latency in milliseconds */
  meanLatency: number;
}

/**
 * Grouped error pattern from trace analysis
 */
export interface ErrorPattern {
  /** Normalized error message */
  message: string;
  /** Number of occurrences */
  count: number;
  /** Percentage of total errors (0-100) */
  percentage: number;
  /** Sample span IDs (up to 3) */
  sampleSpanIds: string[];
  /** First 500 chars of stack trace if available */
  stackTrace?: string;
}

/**
 * Affected endpoint statistics
 */
export interface AffectedEndpoint {
  /** Span name/operation */
  name: string;
  /** Number of errors for this endpoint */
  errorCount: number;
  /** Total span count for this endpoint */
  totalCount: number;
  /** Error rate for this endpoint (0-1) */
  errorRate: number;
  /** 95th percentile latency in milliseconds */
  latencyP95: number;
  /** Sample trace IDs (up to 3) */
  sampleTraceIds: string[];
}

/**
 * Affected LLM model statistics (for AI observability)
 */
export interface AffectedModel {
  /** Model identifier (e.g., "gpt-4o", "claude-3-5-sonnet") */
  model: string;
  /** Number of errors for this model */
  errorCount: number;
  /** Average latency in milliseconds */
  avgLatency: number;
  /** Average tokens per call */
  avgTokens: number;
  /** Total cost incurred */
  totalCost: number;
}

/**
 * Time distribution bucket (5-minute intervals)
 */
export interface TimeDistributionBucket {
  /** Bucket start time (ISO 8601 datetime) */
  bucket: string;
  /** Number of errors in this bucket */
  errorCount: number;
  /** Number of spans in this bucket */
  spanCount: number;
  /** Average latency in this bucket (milliseconds) */
  avgLatency: number;
}

/**
 * Anomaly type detected during analysis
 */
export type AnomalyType = "latency_spike" | "error_burst" | "throughput_drop";

/**
 * Anomaly severity level
 */
export type AnomalySeverity = "high" | "medium" | "low";

/**
 * Detected anomaly during trace analysis
 */
export interface DetectedAnomaly {
  /** Type of anomaly */
  type: AnomalyType;
  /** When the anomaly occurred (ISO 8601 datetime) */
  timestamp: string;
  /** Human-readable description */
  description: string;
  /** Severity level */
  severity: AnomalySeverity;
}

/**
 * Output from analyzeTraces activity - structured for LLM consumption
 */
export interface TraceAnalysisOutput {
  /** Summary statistics */
  summary: TraceAnalysisSummary;
  /** Grouped error patterns (top 10) */
  errorPatterns: ErrorPattern[];
  /** Affected endpoints grouped by name (top 20) */
  affectedEndpoints: AffectedEndpoint[];
  /** Affected LLM models (top 10) */
  affectedModels: AffectedModel[];
  /** Time-bucketed distribution (5-min intervals) */
  timeDistribution: TimeDistributionBucket[];
  /** Detected anomalies (top 10) */
  anomalies: DetectedAnomaly[];
}
