// Main client
export { CognObserve } from './cognobserve';

// Classes (for advanced usage)
export { Trace } from './trace';
export { Span } from './span';

// Types
export type {
  CognObserveConfig,
  TraceOptions,
  SpanOptions,
  SpanEndOptions,
  SpanLevel,
  TokenUsage,
} from './types';

// Observe types
export type { ObserveOptions } from './observe';

// Context utilities
export { getActiveTrace, getActiveSpan, runWithContext } from './context';
