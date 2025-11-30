/**
 * SDK Type Design Decision
 * ========================
 * The SDK maintains its own types separate from @cognobserve/proto for:
 *
 * 1. Developer Experience - Simpler types (e.g., 'DEBUG' vs 'SPAN_LEVEL_DEBUG')
 * 2. Zero Dependencies - No @bufbuild/protobuf required for SDK users
 * 3. SDK-Specific Types - Config, options, etc. that don't exist in proto
 *
 * The transport layer (transport.ts) handles mapping SDK types → proto wire format.
 * Proto remains the source of truth for the wire format between SDK and ingest service.
 */

/**
 * Span levels matching the proto definition
 * Maps to: SPAN_LEVEL_DEBUG, SPAN_LEVEL_DEFAULT, SPAN_LEVEL_WARNING, SPAN_LEVEL_ERROR
 */
export type SpanLevel = 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR';

/**
 * Token usage for LLM calls
 */
export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/**
 * Configuration options for CognObserve.init()
 */
export interface CognObserveConfig {
  /** API key for authentication (or use COGNOBSERVE_API_KEY env var) */
  apiKey?: string;
  /** Ingest service endpoint */
  endpoint?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Disable SDK entirely (useful for development) */
  disabled?: boolean;
  /** Batch flush interval in ms (default: 5000) */
  flushInterval?: number;
  /** Max traces per batch (default: 10) */
  maxBatchSize?: number;
  /** Max retry attempts on failure (default: 3) */
  maxRetries?: number;
}

/**
 * Resolved config with all defaults applied
 */
export interface ResolvedConfig {
  apiKey: string;
  endpoint: string;
  debug: boolean;
  disabled: boolean;
  flushInterval: number;
  maxBatchSize: number;
  maxRetries: number;
}

/**
 * Options for starting a trace
 */
export interface TraceOptions {
  /** Name of the trace */
  name: string;
  /** Optional custom trace ID */
  id?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for starting a span
 */
export interface SpanOptions {
  /** Name of the span */
  name: string;
  /** Optional custom span ID */
  id?: string;
  /** Optional parent span ID (auto-detected if not provided) */
  parentSpanId?: string;
  /** Optional input data */
  input?: Record<string, unknown>;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for ending a span
 */
export interface SpanEndOptions {
  /** Output data to capture */
  output?: Record<string, unknown>;
  /** Span level (default: DEFAULT) */
  level?: SpanLevel;
  /** Status message (useful for errors) */
  statusMessage?: string;
}

/**
 * Internal span data for transport
 */
export interface SpanData {
  id: string;
  traceId: string;
  parentSpanId: string | null;
  name: string;
  startTime: Date;
  endTime: Date | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  model: string | null;
  modelParameters: Record<string, unknown> | null;
  usage: TokenUsage | null;
  level: SpanLevel;
  statusMessage: string | null;
}

/**
 * Internal trace data for transport
 */
export interface TraceData {
  id: string;
  name: string;
  timestamp: Date;
  metadata: Record<string, unknown> | null;
  spans: SpanData[];
}

/**
 * Transport request matching ingest API
 */
export interface IngestRequest {
  trace_id?: string;
  name: string;
  metadata?: Record<string, unknown>;
  spans: IngestSpan[];
}

/**
 * Span format for ingest API
 */
export interface IngestSpan {
  span_id?: string;
  parent_span_id?: string;
  name: string;
  start_time: string;
  end_time?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  model?: string;
  model_parameters?: Record<string, unknown>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  level?: SpanLevel;
  status_message?: string;
}

/**
 * Response from ingest API
 */
export interface IngestResponse {
  trace_id: string;
  span_ids: string[];
  success: boolean;
}
