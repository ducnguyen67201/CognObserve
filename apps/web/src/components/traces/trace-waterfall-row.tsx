"use client";

import React, { useCallback } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlatWaterfallSpan, SpanLevel } from "@/lib/traces/types";
import {
  SPAN_TYPE_CONFIG,
  SPAN_LEVEL_COLORS,
  SPAN_LEVEL_BORDER,
} from "./span-type-config";
import { WATERFALL } from "./waterfall-constants";

interface WaterfallRowProps {
  span: FlatWaterfallSpan;
  isSelected: boolean;
  onSelect: () => void;
  onToggleCollapse: () => void;
}

const formatDuration = (ms: number | null): string => {
  if (ms === null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

/**
 * Single row in the waterfall visualization.
 * Memoized with custom equality check for performance.
 */
export const WaterfallRow = React.memo(
  function WaterfallRow({
    span,
    isSelected,
    onSelect,
    onToggleCollapse,
  }: WaterfallRowProps) {
    const typeConfig = SPAN_TYPE_CONFIG[span.type];
    const TypeIcon = typeConfig.icon;
    const hasChildren = span.children.length > 0;
    const level = span.level as SpanLevel;

    const handleCollapseClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleCollapse();
      },
      [onToggleCollapse]
    );

    return (
      <div
        id={`span-${span.id}`}
        className={cn(
          "flex items-center cursor-pointer hover:bg-muted/50 border-b transition-colors",
          isSelected && "bg-muted",
          level === "ERROR" && "bg-red-50 dark:bg-red-950/20"
        )}
        style={{ height: WATERFALL.ROW_HEIGHT }}
        onClick={onSelect}
      >
        {/* Name column */}
        <div
          className="flex items-center gap-2 shrink-0 px-2 overflow-hidden"
          style={{
            width: WATERFALL.NAME_COLUMN_WIDTH,
            paddingLeft: Math.min(span.depth, WATERFALL.MAX_DEPTH) * WATERFALL.INDENT_PER_LEVEL + 8,
          }}
        >
          {/* Collapse toggle */}
          {hasChildren ? (
            <button
              onClick={handleCollapseClick}
              className="p-0.5 hover:bg-muted rounded flex-shrink-0"
              aria-label={span.isCollapsed ? "Expand" : "Collapse"}
            >
              {span.isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          ) : (
            <span className="w-5 flex-shrink-0" />
          )}

          {/* Type icon */}
          <TypeIcon className={cn("h-4 w-4 flex-shrink-0", typeConfig.color)} />

          {/* Span name */}
          <span className="truncate text-sm font-medium" title={span.name}>
            {span.name}
          </span>

          {/* Collapsed child count */}
          {span.isCollapsed && span.hiddenChildCount > 0 && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              (+{span.hiddenChildCount})
            </span>
          )}
        </div>

        {/* Timeline bar column */}
        <div className="flex-1 relative h-full px-4">
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 rounded border-l-4",
              SPAN_LEVEL_COLORS[level],
              SPAN_LEVEL_BORDER[level]
            )}
            style={{
              left: `${span.percentStart}%`,
              width: `${Math.max(span.percentWidth, 0.5)}%`,
              height: WATERFALL.BAR_HEIGHT,
              minWidth: WATERFALL.MIN_BAR_WIDTH,
            }}
          >
            {/* Duration label inside bar */}
            {span.duration && span.percentWidth > 5 && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white font-mono">
                {formatDuration(span.duration)}
              </span>
            )}
          </div>

          {/* Duration label outside bar (for narrow bars) */}
          {span.duration && span.percentWidth <= 5 && (
            <span
              className="absolute top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono ml-1"
              style={{ left: `${span.percentStart + span.percentWidth}%` }}
            >
              {formatDuration(span.duration)}
            </span>
          )}
        </div>

        {/* Token badge (LLM only) */}
        {span.totalTokens && (
          <div className="shrink-0 px-2 text-xs text-muted-foreground font-mono">
            {span.totalTokens.toLocaleString()} tok
          </div>
        )}
      </div>
    );
  },
  // Custom equality check for performance
  (prevProps, nextProps) => {
    return (
      prevProps.span.id === nextProps.span.id &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.span.isCollapsed === nextProps.span.isCollapsed &&
      prevProps.span.isVisible === nextProps.span.isVisible
    );
  }
);
