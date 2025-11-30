import type { SpanItem } from "@cognobserve/api/client";
import type { WaterfallSpan, FlatWaterfallSpan, SpanType } from "./types";
import { inferSpanType } from "./infer-span-type";

const MIN_PERCENT_WIDTH = 0.5;

/**
 * Builds a hierarchical tree from flat span list.
 * Optimized for 500+ spans with single-pass Map construction.
 *
 * @param spans - Flat list of spans from API
 * @param traceDuration - Total trace duration in ms
 * @returns Array of root WaterfallSpan nodes with children
 */
export function buildSpanTree(
  spans: SpanItem[],
  traceDuration: number
): WaterfallSpan[] {
  if (spans.length === 0) return [];

  // Ensure duration is at least 1ms to avoid division by zero
  const safeDuration = Math.max(traceDuration, 1);
  const invDuration = 100 / safeDuration;

  // First pass: create WaterfallSpan nodes
  const spanMap = new Map<string, WaterfallSpan>();

  for (const span of spans) {
    const percentStart = span.offsetFromTraceStart * invDuration;
    const percentWidth = span.duration
      ? Math.max(span.duration * invDuration, MIN_PERCENT_WIDTH)
      : MIN_PERCENT_WIDTH;

    const type: SpanType = inferSpanType(span);

    spanMap.set(span.id, {
      ...span,
      depth: 0,
      percentStart,
      percentWidth,
      children: [],
      isCollapsed: false,
      isVisible: true,
      type,
    });
  }

  // Second pass: build parent-child relationships
  const roots: WaterfallSpan[] = [];

  for (const span of spans) {
    const node = spanMap.get(span.id)!;

    if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
      const parent = spanMap.get(span.parentSpanId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      // No parent or parent not in this trace = root node
      roots.push(node);
    }
  }

  // Sort children by start time (in-place)
  const sortChildren = (node: WaterfallSpan): void => {
    if (node.children.length > 1) {
      node.children.sort((a, b) => a.offsetFromTraceStart - b.offsetFromTraceStart);
    }
    for (const child of node.children) {
      sortChildren(child);
    }
  };

  for (const root of roots) {
    sortChildren(root);
  }

  // Sort roots by start time
  roots.sort((a, b) => a.offsetFromTraceStart - b.offsetFromTraceStart);

  return roots;
}

/**
 * Counts total descendants of a node (for showing hidden count).
 */
function countDescendants(node: WaterfallSpan): number {
  let count = 0;
  for (const child of node.children) {
    count += 1 + countDescendants(child);
  }
  return count;
}

/**
 * Flattens the span tree to a list for rendering.
 * Respects collapsed state - children of collapsed nodes are excluded.
 *
 * @param roots - Root nodes from buildSpanTree
 * @param collapsedIds - Set of span IDs that are collapsed
 * @returns Flat array of visible spans in DFS order
 */
export function flattenSpanTree(
  roots: WaterfallSpan[],
  collapsedIds: Set<string>
): FlatWaterfallSpan[] {
  const result: FlatWaterfallSpan[] = [];

  const traverse = (node: WaterfallSpan, parentCollapsed: boolean): void => {
    const isCollapsed = collapsedIds.has(node.id);
    const isVisible = !parentCollapsed;

    if (isVisible) {
      const hiddenChildCount = isCollapsed ? countDescendants(node) : 0;

      result.push({
        ...node,
        isCollapsed,
        isVisible,
        hiddenChildCount,
      });
    }

    // Only traverse children if this node is visible and not collapsed
    if (isVisible && !isCollapsed) {
      for (const child of node.children) {
        traverse(child, false);
      }
    }
  };

  for (const root of roots) {
    traverse(root, false);
  }

  return result;
}

/**
 * Calculates the total duration of a trace from spans.
 *
 * @param spans - Array of spans
 * @returns Duration in milliseconds, or null if no spans have end times
 */
export function calculateTraceDuration(spans: SpanItem[]): number | null {
  if (spans.length === 0) return null;

  const startTimes = spans.map((s) => new Date(s.startTime).getTime());
  const endTimes = spans
    .filter((s) => s.endTime)
    .map((s) => new Date(s.endTime!).getTime());

  if (endTimes.length === 0) return null;

  return Math.max(...endTimes) - Math.min(...startTimes);
}
