/**
 * Formatting utilities for trace data display.
 */

/**
 * Formats duration in milliseconds to a human-readable string.
 * - Under 1 second: displays in milliseconds (e.g., "500ms")
 * - Under 1 minute: displays in seconds (e.g., "2.50s")
 * - 1 minute or more: displays in minutes (e.g., "1.50m")
 */
export const formatDuration = (ms: number | null): string => {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
};

/**
 * Formats token count to a human-readable string.
 * - Under 1000: displays the raw number
 * - 1000 or more: displays with 'k' suffix (e.g., "5.0k")
 */
export const formatTokens = (tokens: number | null): string => {
  if (tokens === null) return "-";
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return tokens.toLocaleString();
};

/**
 * Formats a timestamp to a localized date/time string.
 */
export const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};
