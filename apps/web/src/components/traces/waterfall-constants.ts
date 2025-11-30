/**
 * Layout constants for waterfall visualization.
 */
export const WATERFALL = {
  /** Height of each span row in pixels */
  ROW_HEIGHT: 44,
  /** Indentation per hierarchy level in pixels */
  INDENT_PER_LEVEL: 24,
  /** Height of the timeline bar in pixels */
  BAR_HEIGHT: 28,
  /** Minimum width of timeline bar in pixels (for very short spans) */
  MIN_BAR_WIDTH: 4,
  /** Width of the name column in pixels */
  NAME_COLUMN_WIDTH: 300,
  /** Padding on timeline edges */
  TIMELINE_PADDING: 16,
  /** Maximum depth to render (prevent deep nesting issues) */
  MAX_DEPTH: 20,
} as const;

/**
 * Time scale intervals for timeline header.
 * Automatically selected based on trace duration.
 */
export const TIME_SCALE_INTERVALS = [
  { threshold: 100, interval: 10, format: (ms: number) => `${ms}ms` },
  { threshold: 1000, interval: 100, format: (ms: number) => `${ms}ms` },
  { threshold: 5000, interval: 500, format: (ms: number) => `${ms}ms` },
  { threshold: 10000, interval: 1000, format: (ms: number) => `${ms / 1000}s` },
  { threshold: 60000, interval: 5000, format: (ms: number) => `${ms / 1000}s` },
  { threshold: Infinity, interval: 10000, format: (ms: number) => `${ms / 1000}s` },
] as const;

/**
 * Gets the appropriate time scale config for a given duration.
 */
export function getTimeScaleConfig(durationMs: number) {
  return TIME_SCALE_INTERVALS.find((i) => durationMs <= i.threshold)!;
}
