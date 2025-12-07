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
