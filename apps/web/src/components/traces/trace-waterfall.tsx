"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { WaterfallRow } from "./trace-waterfall-row";
import { TimelineHeader } from "./trace-timeline-header";
import { flattenSpanTree } from "@/lib/traces/span-tree";
import { WATERFALL } from "./waterfall-constants";
import type { WaterfallSpan } from "@/lib/traces/types";

interface TraceWaterfallProps {
  spanTree: WaterfallSpan[];
  traceDuration: number;
  selectedSpanId: string | null;
  onSpanSelect: (spanId: string) => void;
}

/**
 * Virtualized waterfall visualization of trace spans.
 * Supports 500+ spans with smooth scrolling.
 */
export function TraceWaterfall({
  spanTree,
  traceDuration,
  selectedSpanId,
  onSpanSelect,
}: TraceWaterfallProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const parentRef = useRef<HTMLDivElement>(null);

  // Flatten tree respecting collapsed state
  const flatSpans = useMemo(() => {
    return flattenSpanTree(spanTree, collapsedIds);
  }, [spanTree, collapsedIds]);

  // Virtual list for performance with large traces
  const virtualizer = useVirtualizer({
    count: flatSpans.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => WATERFALL.ROW_HEIGHT,
    overscan: 10, // Render 10 extra items for smooth scrolling
  });

  const handleToggleCollapse = useCallback((spanId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) {
        next.delete(spanId);
      } else {
        next.add(spanId);
      }
      return next;
    });
  }, []);

  const handleSpanSelect = useCallback(
    (spanId: string) => {
      onSpanSelect(spanId);
    },
    [onSpanSelect]
  );

  if (flatSpans.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No spans to display
      </div>
    );
  }

  return (
    <div className="flex flex-col border rounded-lg overflow-hidden h-full">
      {/* Timeline header */}
      <TimelineHeader durationMs={traceDuration} />

      {/* Virtualized span list */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const span = flatSpans[virtualRow.index];
            if (!span) return null;
            return (
              <div
                key={span.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <WaterfallRow
                  span={span}
                  isSelected={span.id === selectedSpanId}
                  onSelect={() => handleSpanSelect(span.id)}
                  onToggleCollapse={() => handleToggleCollapse(span.id)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
