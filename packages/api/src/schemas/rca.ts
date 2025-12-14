/**
 * RCA (Root Cause Analysis) Schemas
 *
 * Zod schemas for trace analysis and RCA system - source of truth for types.
 * Used by the analyzeTraces activity in Sprint 3 (#136).
 */

import { z } from "zod";

// ============================================================
// ALERT TYPE (reuse from alerting for consistency)
// ============================================================

/**
 * Alert types supported by RCA analysis
 */
export const RCAAlertTypeSchema = z.enum([
  "ERROR_RATE",
  "LATENCY_P50",
  "LATENCY_P95",
  "LATENCY_P99",
]);
export type RCAAlertType = z.infer<typeof RCAAlertTypeSchema>;

// ============================================================
// TRACE ANALYSIS INPUT
// ============================================================

/**
 * Input for analyzeTraces activity
 */
export const TraceAnalysisInputSchema = z.object({
  /** Project ID to analyze traces for */
  projectId: z.string(),
  /** Type of alert that triggered the analysis */
  alertType: RCAAlertTypeSchema,
  /** Current value that triggered the alert */
  alertValue: z.number(),
  /** Alert threshold that was exceeded */
  threshold: z.number(),
  /** Start of analysis window (ISO 8601 datetime) */
  windowStart: z.string().datetime(),
  /** End of analysis window (ISO 8601 datetime) */
  windowEnd: z.string().datetime(),
});
export type TraceAnalysisInput = z.infer<typeof TraceAnalysisInputSchema>;

// ============================================================
// TRACE ANALYSIS OUTPUT COMPONENTS
// ============================================================

/**
 * Summary statistics from trace analysis
 */
export const TraceAnalysisSummarySchema = z.object({
  /** Total unique traces in window */
  totalTraces: z.number().int().min(0),
  /** Total spans analyzed */
  totalSpans: z.number().int().min(0),
  /** Number of spans with errors */
  errorCount: z.number().int().min(0),
  /** Error rate (0-1 range) */
  errorRate: z.number().min(0).max(1),
  /** 50th percentile latency in milliseconds */
  latencyP50: z.number().min(0),
  /** 95th percentile latency in milliseconds */
  latencyP95: z.number().min(0),
  /** 99th percentile latency in milliseconds */
  latencyP99: z.number().min(0),
  /** Mean latency in milliseconds */
  meanLatency: z.number().min(0),
});
export type TraceAnalysisSummary = z.infer<typeof TraceAnalysisSummarySchema>;

/**
 * Grouped error pattern from trace analysis
 */
export const ErrorPatternSchema = z.object({
  /** Normalized error message */
  message: z.string(),
  /** Number of occurrences */
  count: z.number().int().positive(),
  /** Percentage of total errors (0-100) */
  percentage: z.number().min(0).max(100),
  /** Sample span IDs (up to 3) */
  sampleSpanIds: z.array(z.string()).max(3),
  /** First 500 chars of stack trace if available */
  stackTrace: z.string().max(500).optional(),
});
export type ErrorPattern = z.infer<typeof ErrorPatternSchema>;

/**
 * Affected endpoint statistics
 */
export const AffectedEndpointSchema = z.object({
  /** Span name/operation */
  name: z.string(),
  /** Number of errors for this endpoint */
  errorCount: z.number().int().min(0),
  /** Total span count for this endpoint */
  totalCount: z.number().int().min(0),
  /** Error rate for this endpoint (0-1) */
  errorRate: z.number().min(0).max(1),
  /** 95th percentile latency in milliseconds */
  latencyP95: z.number().min(0),
  /** Sample trace IDs (up to 3) */
  sampleTraceIds: z.array(z.string()).max(3),
});
export type AffectedEndpoint = z.infer<typeof AffectedEndpointSchema>;

/**
 * Affected LLM model statistics (for AI observability)
 */
export const AffectedModelSchema = z.object({
  /** Model identifier (e.g., "gpt-4o", "claude-3-5-sonnet") */
  model: z.string(),
  /** Number of errors for this model */
  errorCount: z.number().int().min(0),
  /** Average latency in milliseconds */
  avgLatency: z.number().min(0),
  /** Average tokens per call */
  avgTokens: z.number().min(0),
  /** Total cost incurred */
  totalCost: z.number().min(0),
});
export type AffectedModel = z.infer<typeof AffectedModelSchema>;

/**
 * Time distribution bucket (5-minute intervals)
 */
export const TimeDistributionBucketSchema = z.object({
  /** Bucket start time (ISO 8601 datetime) */
  bucket: z.string(),
  /** Number of errors in this bucket */
  errorCount: z.number().int().min(0),
  /** Number of spans in this bucket */
  spanCount: z.number().int().min(0),
  /** Average latency in this bucket (milliseconds) */
  avgLatency: z.number().min(0),
});
export type TimeDistributionBucket = z.infer<typeof TimeDistributionBucketSchema>;

// ============================================================
// ANOMALY DETECTION
// ============================================================

/**
 * Anomaly type detected during analysis
 */
export const AnomalyTypeSchema = z.enum([
  "latency_spike",
  "error_burst",
  "throughput_drop",
]);
export type AnomalyType = z.infer<typeof AnomalyTypeSchema>;

/**
 * Anomaly severity level
 */
export const AnomalySeveritySchema = z.enum(["high", "medium", "low"]);
export type AnomalySeverity = z.infer<typeof AnomalySeveritySchema>;

/**
 * Detected anomaly during trace analysis
 */
export const DetectedAnomalySchema = z.object({
  /** Type of anomaly */
  type: AnomalyTypeSchema,
  /** When the anomaly occurred (ISO 8601 datetime) */
  timestamp: z.string(),
  /** Human-readable description */
  description: z.string(),
  /** Severity level */
  severity: AnomalySeveritySchema,
});
export type DetectedAnomaly = z.infer<typeof DetectedAnomalySchema>;

// ============================================================
// TRACE ANALYSIS OUTPUT
// ============================================================

/**
 * Output from analyzeTraces activity - structured for LLM consumption
 */
export const TraceAnalysisOutputSchema = z.object({
  /** Summary statistics */
  summary: TraceAnalysisSummarySchema,
  /** Grouped error patterns (top 10) */
  errorPatterns: z.array(ErrorPatternSchema).max(10),
  /** Affected endpoints grouped by name (top 20) */
  affectedEndpoints: z.array(AffectedEndpointSchema).max(20),
  /** Affected LLM models (top 10) */
  affectedModels: z.array(AffectedModelSchema).max(10),
  /** Time-bucketed distribution (5-min intervals) */
  timeDistribution: z.array(TimeDistributionBucketSchema),
  /** Detected anomalies (top 10) */
  anomalies: z.array(DetectedAnomalySchema).max(10),
});
export type TraceAnalysisOutput = z.infer<typeof TraceAnalysisOutputSchema>;

// ============================================================
// CONSTANTS
// ============================================================

/** Maximum spans to analyze per activity call */
export const MAX_SPANS_TO_ANALYZE = 1000;

/** Time bucket size in minutes for distribution analysis */
export const TIME_BUCKET_MINUTES = 5;

/** Anomaly detection thresholds */
export const ANOMALY_THRESHOLDS = {
  /** Error burst: errors > X times average */
  errorBurstMultiplier: 3,
  /** High severity error burst multiplier */
  highErrorBurstMultiplier: 5,
  /** Latency spike: latency > X times average */
  latencySpikeMultiplier: 2,
  /** High severity latency spike multiplier */
  highLatencySpikeMultiplier: 3,
  /** Throughput drop: throughput < X% of average */
  throughputDropPercentage: 0.5,
  /** High severity throughput drop */
  highThroughputDropPercentage: 0.25,
  /** Minimum baseline throughput to detect drops */
  minBaselineThroughput: 10,
  /** Minimum error count to consider for burst */
  minErrorsForBurst: 5,
  /** Minimum latency to consider for spike (ms) */
  minLatencyForSpike: 100,
} as const;

// ============================================================
// CODE CORRELATION SCHEMAS
// ============================================================

/**
 * Individual signal scores for correlation transparency
 */
export const CorrelationSignalsSchema = z.object({
  /** Temporal proximity score (0-1) - higher = more recent */
  temporal: z.number().min(0).max(1),
  /** Semantic similarity score (0-1) - higher = more related to error */
  semantic: z.number().min(0).max(1),
  /** File path match score (0-1) - higher = more stack trace matches */
  pathMatch: z.number().min(0).max(1),
});
export type CorrelationSignals = z.infer<typeof CorrelationSignalsSchema>;

/**
 * Correlated commit with scoring breakdown
 */
export const CorrelatedCommitSchema = z.object({
  /** Commit SHA */
  sha: z.string(),
  /** Commit message (truncated to 200 chars) */
  message: z.string().max(200),
  /** Author name */
  author: z.string(),
  /** Author email */
  authorEmail: z.string().nullable(),
  /** Commit timestamp (ISO 8601) */
  timestamp: z.string().datetime(),
  /** Combined correlation score (0-1) */
  score: z.number().min(0).max(1),
  /** Individual signal scores */
  signals: CorrelationSignalsSchema,
  /** Files changed in this commit */
  filesChanged: z.array(z.string()),
});
export type CorrelatedCommit = z.infer<typeof CorrelatedCommitSchema>;

/**
 * Correlated pull request with scoring breakdown
 */
export const CorrelatedPRSchema = z.object({
  /** PR number */
  number: z.number().int().positive(),
  /** PR title */
  title: z.string().max(200),
  /** PR author login */
  author: z.string(),
  /** When the PR was merged (ISO 8601) */
  mergedAt: z.string().datetime(),
  /** Combined correlation score (0-1) */
  score: z.number().min(0).max(1),
  /** Individual signal scores */
  signals: CorrelationSignalsSchema,
});
export type CorrelatedPR = z.infer<typeof CorrelatedPRSchema>;

/**
 * Relevant code chunk from vector search
 */
export const RelevantCodeChunkSchema = z.object({
  /** File path */
  filePath: z.string(),
  /** Code content (truncated) */
  content: z.string(),
  /** Start line number */
  startLine: z.number().int().positive(),
  /** End line number */
  endLine: z.number().int().positive(),
  /** Cosine similarity score */
  similarity: z.number().min(0).max(1),
});
export type RelevantCodeChunk = z.infer<typeof RelevantCodeChunkSchema>;

/**
 * Input for correlateCodeChanges activity
 */
export const CodeCorrelationInputSchema = z.object({
  /** Project ID to search commits/PRs for */
  projectId: z.string(),
  /** Trace analysis output from analyzeTraces */
  traceAnalysis: TraceAnalysisOutputSchema,
  /** When the alert was triggered (ISO 8601 datetime) */
  alertTriggeredAt: z.string().datetime(),
  /** Lookback window in days (default: 7) */
  lookbackDays: z.number().int().positive().optional().default(7),
});
export type CodeCorrelationInput = z.infer<typeof CodeCorrelationInputSchema>;

/**
 * Output from correlateCodeChanges activity
 */
export const CodeCorrelationOutputSchema = z.object({
  /** Commits ranked by correlation score (top 10) */
  suspectedCommits: z.array(CorrelatedCommitSchema).max(10),
  /** PRs ranked by correlation score (top 5) */
  suspectedPRs: z.array(CorrelatedPRSchema).max(5),
  /** Relevant code chunks from vector search (top 20) */
  relevantCodeChunks: z.array(RelevantCodeChunkSchema).max(20),
  /** Whether repository was found for project */
  hasRepository: z.boolean(),
  /** Search query used for vector search */
  searchQuery: z.string(),
  /** Total commits analyzed */
  commitsAnalyzed: z.number().int().min(0),
  /** Total PRs analyzed */
  prsAnalyzed: z.number().int().min(0),
});
export type CodeCorrelationOutput = z.infer<typeof CodeCorrelationOutputSchema>;
