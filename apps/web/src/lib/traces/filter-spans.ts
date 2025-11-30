import type { TraceFilters, FlatWaterfallSpan } from "./types";

/**
 * Filter spans based on the active filter criteria.
 * This is used for client-side filtering of waterfall spans.
 *
 * Filters applied:
 * - types: Match span type
 * - levels: Match span level
 * - models: Match span model
 * - duration: Match span duration within range
 * - search: Match span name (case-insensitive)
 *
 * Note: Search filter on trace name is handled server-side.
 * This function filters individual spans within a trace.
 */
export function filterSpans(
  spans: FlatWaterfallSpan[],
  filters: TraceFilters
): FlatWaterfallSpan[] {
  // If no filters are active, return all spans
  if (!hasActiveSpanFilters(filters)) {
    return spans;
  }

  return spans.filter((span) => {
    // Type filter
    if (filters.types?.length) {
      if (!filters.types.includes(span.type)) {
        return false;
      }
    }

    // Level filter
    if (filters.levels?.length) {
      if (!filters.levels.includes(span.level as typeof filters.levels[number])) {
        return false;
      }
    }

    // Model filter
    if (filters.models?.length) {
      if (!span.model || !filters.models.includes(span.model)) {
        return false;
      }
    }

    // Duration filter - min
    if (filters.minDuration !== undefined) {
      if (span.duration === null || span.duration < filters.minDuration) {
        return false;
      }
    }

    // Duration filter - max
    if (filters.maxDuration !== undefined) {
      if (span.duration === null || span.duration > filters.maxDuration) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Check if any span-level filters are active.
 * (Excludes search which is trace-level)
 */
function hasActiveSpanFilters(filters: TraceFilters): boolean {
  return (
    (filters.types?.length ?? 0) > 0 ||
    (filters.levels?.length ?? 0) > 0 ||
    (filters.models?.length ?? 0) > 0 ||
    filters.minDuration !== undefined ||
    filters.maxDuration !== undefined
  );
}

/**
 * Find the first span with an error level.
 * Returns the span ID or null if no errors found.
 */
export function findFirstErrorSpan(spans: FlatWaterfallSpan[]): string | null {
  const errorSpan = spans.find((span) => span.level === "ERROR");
  return errorSpan?.id ?? null;
}

/**
 * Find all spans with error level.
 */
export function findErrorSpans(spans: FlatWaterfallSpan[]): FlatWaterfallSpan[] {
  return spans.filter((span) => span.level === "ERROR");
}

/**
 * Get unique models from a list of spans.
 */
export function getUniqueModels(spans: FlatWaterfallSpan[]): string[] {
  const models = new Set<string>();
  for (const span of spans) {
    if (span.model) {
      models.add(span.model);
    }
  }
  return Array.from(models).sort();
}
