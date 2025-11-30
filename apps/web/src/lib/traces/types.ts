import type { SpanItem, SpanType as SpanTypeImport, SpanLevel, TraceFilters, QuickToggle } from "@cognobserve/api/client";

// Re-export from schema (source of truth)
export type { SpanLevel, TraceFilters, QuickToggle };
export type SpanType = SpanTypeImport;

export {
  SpanTypeSchema,
  SpanLevelSchema,
  TraceFiltersSchema,
  ALL_SPAN_TYPES,
  ALL_SPAN_LEVELS,
  FILTER_PARAM_KEYS,
  QUICK_TOGGLES,
  hasActiveFilters,
  countActiveFilters,
} from "@cognobserve/api/client";

/**
 * Extended span with computed waterfall properties.
 * Used for rendering the hierarchical waterfall visualization.
 */
export interface WaterfallSpan extends SpanItem {
  /** Hierarchy depth (0 = root span) */
  depth: number;
  /** Start position as percentage of trace duration (0-100) */
  percentStart: number;
  /** Width as percentage of trace duration (0-100, min 0.5 for visibility) */
  percentWidth: number;
  /** Child spans in the hierarchy */
  children: WaterfallSpan[];
  /** Whether this span's children are collapsed */
  isCollapsed: boolean;
  /** Whether this span is visible (false if parent is collapsed) */
  isVisible: boolean;
  /** Inferred span type for icon/color */
  type: SpanType;
}

/**
 * Flattened span for rendering in virtualized list.
 * Includes visibility state based on collapsed parents.
 */
export interface FlatWaterfallSpan extends WaterfallSpan {
  /** Number of hidden children when collapsed */
  hiddenChildCount: number;
}
