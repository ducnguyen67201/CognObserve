"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, ChevronDown, Activity, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSpanTypeConfig,
  getSpanLevelColor,
  getSpanLevelBorder,
} from "@/components/traces/span-type-config";
import { WATERFALL, getTimeScaleConfig } from "@/components/traces/waterfall-constants";
import type { SpanType, SpanLevel } from "@/lib/traces/types";

// Timeline item type - can be trace or span
interface TimelineItem {
  id: string;
  name: string;
  type: "trace" | "span";
  traceId?: string;
  spanType?: SpanType;
  level?: SpanLevel;
  startTime: Date;
  endTime: Date | null;
  duration: number | null;
  percentStart: number;
  percentWidth: number;
  depth: number;
  totalTokens?: number | null;
  model?: string | null;
  hasChildren: boolean;
  isCollapsed: boolean;
  childCount: number;
}

interface SessionTimelineData {
  id: string;
  name: string;
  timestamp: Date;
  spans: Array<{
    id: string;
    name: string;
    startTime: Date;
    endTime: Date | null;
    level: string;
    model: string | null;
    totalTokens: number | null;
    totalCost: unknown;
  }>;
}

interface SessionWaterfallProps {
  timeline: SessionTimelineData[];
  sessionDuration: number;
  onTraceSelect?: (traceId: string) => void;
}

const formatDuration = (ms: number | null): string => {
  if (ms === null) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

// Infer span type from name
const inferSpanType = (name: string): SpanType => {
  const lower = name.toLowerCase();
  if (lower.includes("llm") || lower.includes("completion") || lower.includes("chat")) return "LLM";
  if (lower.includes("http") || lower.includes("fetch") || lower.includes("api")) return "HTTP";
  if (lower.includes("db") || lower.includes("database") || lower.includes("query")) return "DB";
  if (lower.includes("function") || lower.includes("call")) return "FUNCTION";
  if (lower.includes("log")) return "LOG";
  return "CUSTOM";
};

/**
 * Waterfall visualization for session traces and spans.
 */
export function SessionWaterfall({
  timeline,
  sessionDuration,
  onTraceSelect,
}: SessionWaterfallProps) {
  const [collapsedTraces, setCollapsedTraces] = useState<Set<string>>(new Set());
  const [highlightedItemIds, setHighlightedItemIds] = useState<Set<string>>(new Set());
  const [timeRange, setTimeRange] = useState<{ start: number; end: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Calculate session time boundaries
  const sessionStart = useMemo(() => {
    if (timeline.length === 0) return new Date();
    let minTime = new Date(timeline[0]!.timestamp);
    for (const trace of timeline) {
      const traceTime = new Date(trace.timestamp);
      if (traceTime < minTime) minTime = traceTime;
      for (const span of trace.spans) {
        const spanTime = new Date(span.startTime);
        if (spanTime < minTime) minTime = spanTime;
      }
    }
    return minTime;
  }, [timeline]);

  // Build flat list of visible items
  const flatItems = useMemo((): TimelineItem[] => {
    const items: TimelineItem[] = [];
    const startMs = sessionStart.getTime();

    for (const trace of timeline) {
      const traceTimestamp = new Date(trace.timestamp).getTime();

      // Calculate trace extent from all spans (earliest start to latest end)
      let traceStart = traceTimestamp;
      let traceEnd = traceTimestamp;

      for (const span of trace.spans) {
        const spanStart = new Date(span.startTime).getTime();
        if (spanStart < traceStart) traceStart = spanStart;

        if (span.endTime) {
          const spanEnd = new Date(span.endTime).getTime();
          if (spanEnd > traceEnd) traceEnd = spanEnd;
        } else if (spanStart > traceEnd) {
          traceEnd = spanStart;
        }
      }

      const traceDuration = traceEnd - traceStart;
      const percentStart = sessionDuration > 0 ? ((traceStart - startMs) / sessionDuration) * 100 : 0;
      const percentWidth = sessionDuration > 0 ? (traceDuration / sessionDuration) * 100 : 0;

      const isCollapsed = collapsedTraces.has(trace.id);
      const hasError = trace.spans.some((s) => s.level === "ERROR");
      const hasWarning = trace.spans.some((s) => s.level === "WARNING");

      // Add trace row
      items.push({
        id: trace.id,
        name: trace.name,
        type: "trace",
        startTime: new Date(trace.timestamp),
        endTime: traceEnd ? new Date(traceEnd) : null,
        duration: traceDuration,
        percentStart,
        percentWidth,
        depth: 0,
        hasChildren: trace.spans.length > 0,
        isCollapsed,
        childCount: trace.spans.length,
        level: hasError ? "ERROR" : hasWarning ? "WARNING" : "DEFAULT",
      });

      // Add span rows if not collapsed
      if (!isCollapsed) {
        for (const span of trace.spans) {
          const spanStart = new Date(span.startTime).getTime();
          const spanEnd = span.endTime ? new Date(span.endTime).getTime() : spanStart;
          const spanDuration = spanEnd - spanStart;
          const spanPercentStart = sessionDuration > 0 ? ((spanStart - startMs) / sessionDuration) * 100 : 0;
          const spanPercentWidth = sessionDuration > 0 ? (spanDuration / sessionDuration) * 100 : 0;

          items.push({
            id: span.id,
            name: span.name,
            type: "span",
            traceId: trace.id,
            spanType: inferSpanType(span.name),
            level: (span.level as SpanLevel) || "DEFAULT",
            startTime: new Date(span.startTime),
            endTime: span.endTime ? new Date(span.endTime) : null,
            duration: spanDuration,
            percentStart: spanPercentStart,
            percentWidth: spanPercentWidth,
            depth: 1,
            totalTokens: span.totalTokens,
            model: span.model,
            hasChildren: false,
            isCollapsed: false,
            childCount: 0,
          });
        }
      }
    }

    return items;
  }, [timeline, sessionStart, sessionDuration, collapsedTraces]);

  // Virtual list
  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => WATERFALL.ROW_HEIGHT,
    overscan: 10,
  });

  const handleToggleCollapse = useCallback((traceId: string) => {
    setCollapsedTraces((prev) => {
      const next = new Set(prev);
      if (next.has(traceId)) {
        next.delete(traceId);
      } else {
        next.add(traceId);
      }
      return next;
    });
  }, []);

  const handleRowClick = useCallback(
    (item: TimelineItem) => {
      if (item.type === "trace" && onTraceSelect) {
        onTraceSelect(item.id);
      }
    },
    [onTraceSelect]
  );

  // Get percent position from mouse event
  const getPercentFromEvent = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
      if (!timelineRef.current) return 0;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      return Math.max(0, Math.min(100, (x / rect.width) * 100));
    },
    []
  );

  // Handle mouse down - start drag
  const handleTimelineMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const percent = getPercentFromEvent(e);
      setIsDragging(true);
      setDragStart(percent);
      setDragEnd(percent);
      setTimeRange(null);
      setHighlightedItemIds(new Set());
    },
    [getPercentFromEvent]
  );

  // Handle mouse move - update drag selection
  const handleTimelineMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging || dragStart === null) return;
      const percent = getPercentFromEvent(e);
      setDragEnd(percent);
    },
    [isDragging, dragStart, getPercentFromEvent]
  );

  // Handle mouse up - finalize selection
  const handleTimelineMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging || dragStart === null) return;

      const endPercent = getPercentFromEvent(e);
      const start = Math.min(dragStart, endPercent);
      const end = Math.max(dragStart, endPercent);

      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);

      // If very small selection (click), find closest item
      if (end - start < 1) {
        let closestItem: TimelineItem | null = null;
        let closestDistance = Infinity;

        for (const item of flatItems) {
          const itemEnd = item.percentStart + item.percentWidth;
          if (start >= item.percentStart && start <= itemEnd) {
            closestItem = item;
            break;
          }
          const distance = Math.abs(item.percentStart - start);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestItem = item;
          }
        }

        if (closestItem) {
          const itemIndex = flatItems.findIndex((i) => i.id === closestItem!.id);
          if (itemIndex >= 0) {
            virtualizer.scrollToIndex(itemIndex, { align: "center" });
            setHighlightedItemIds(new Set([closestItem.id]));
            setTimeout(() => setHighlightedItemIds(new Set()), 2000);
          }
        }
        return;
      }

      // Find all items within the selected range
      const selectedIds = new Set<string>();
      let firstItemIndex = -1;

      for (let i = 0; i < flatItems.length; i++) {
        const item = flatItems[i]!;
        const itemEnd = item.percentStart + item.percentWidth;

        // Check if item overlaps with selection
        if (itemEnd >= start && item.percentStart <= end) {
          selectedIds.add(item.id);
          if (firstItemIndex === -1) firstItemIndex = i;
        }
      }

      if (selectedIds.size > 0) {
        setTimeRange({ start, end });
        setHighlightedItemIds(selectedIds);

        // Scroll to first selected item
        if (firstItemIndex >= 0) {
          virtualizer.scrollToIndex(firstItemIndex, { align: "start" });
        }
      }
    },
    [isDragging, dragStart, flatItems, virtualizer, getPercentFromEvent]
  );

  // Handle mouse leave - cancel drag if mouse leaves
  const handleTimelineMouseLeave = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    }
  }, [isDragging]);

  // Clear selection
  const handleClearSelection = useCallback(() => {
    setTimeRange(null);
    setHighlightedItemIds(new Set());
  }, []);

  if (flatItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No traces in this session
      </div>
    );
  }

  // Calculate grid line positions (same as header)
  const gridPositions = useMemo(() => {
    if (sessionDuration <= 0) return [];

    const config = getTimeScaleConfig(sessionDuration);
    const positions: number[] = [];

    const targetMarkerCount = 6;
    let interval = config.interval;
    const rawCount = sessionDuration / interval;
    if (rawCount > targetMarkerCount * 2) {
      interval = Math.ceil(sessionDuration / targetMarkerCount / interval) * interval;
    }

    for (let ms = interval; ms < sessionDuration; ms += interval) {
      positions.push((ms / sessionDuration) * 100);
    }

    return positions;
  }, [sessionDuration]);

  return (
    <div className="flex flex-col border rounded-lg overflow-hidden h-full bg-card">
      {/* Selection info bar */}
      {highlightedItemIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-primary/10 border-b text-sm">
          <span className="text-primary font-medium">
            {highlightedItemIds.size} item{highlightedItemIds.size > 1 ? "s" : ""} selected
          </span>
          <button
            onClick={handleClearSelection}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Timeline header - clickable to jump, drag to select */}
      <SessionTimelineHeader
        durationMs={sessionDuration}
        timelineRef={timelineRef}
        isDragging={isDragging}
        dragStart={dragStart}
        dragEnd={dragEnd}
        timeRange={timeRange}
        onMouseDown={handleTimelineMouseDown}
        onMouseMove={handleTimelineMouseMove}
        onMouseUp={handleTimelineMouseUp}
        onMouseLeave={handleTimelineMouseLeave}
      />

      {/* Virtualized row list */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {/* Vertical grid lines */}
          <div
            className="absolute inset-y-0 pointer-events-none"
            style={{ left: WATERFALL.NAME_COLUMN_WIDTH, right: 0 }}
          >
            {gridPositions.map((position, index) => (
              <div
                key={index}
                className="absolute top-0 bottom-0 w-px bg-border/50"
                style={{ left: `${position}%` }}
              />
            ))}

            {/* Selection range overlay in content */}
            {timeRange && (
              <div
                className="absolute top-0 bottom-0 bg-primary/5 pointer-events-none"
                style={{
                  left: `${timeRange.start}%`,
                  width: `${timeRange.end - timeRange.start}%`,
                }}
              >
                <div className="absolute top-0 bottom-0 left-0 w-0.5 bg-primary/30" />
                <div className="absolute top-0 bottom-0 right-0 w-0.5 bg-primary/30" />
              </div>
            )}
          </div>

          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = flatItems[virtualRow.index];
            if (!item) return null;
            return (
              <div
                key={item.id}
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
                  item={item}
                  isHighlighted={highlightedItemIds.has(item.id)}
                  onClick={() => handleRowClick(item)}
                  onToggleCollapse={() => handleToggleCollapse(item.id)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface SessionTimelineHeaderProps {
  durationMs: number;
  timelineRef: React.RefObject<HTMLDivElement | null>;
  isDragging: boolean;
  dragStart: number | null;
  dragEnd: number | null;
  timeRange: { start: number; end: number } | null;
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseUp: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave: () => void;
}

function SessionTimelineHeader({
  durationMs,
  timelineRef,
  isDragging,
  dragStart,
  dragEnd,
  timeRange,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
}: SessionTimelineHeaderProps) {
  const markers = useMemo(() => {
    if (durationMs <= 0) return [];

    const config = getTimeScaleConfig(durationMs);
    const result: { position: number; label: string }[] = [];

    // Calculate optimal interval to get ~6 markers
    const targetMarkerCount = 6;
    let interval = config.interval;

    // Adjust interval to get approximately target number of markers
    const rawCount = durationMs / interval;
    if (rawCount > targetMarkerCount * 2) {
      interval = Math.ceil(durationMs / targetMarkerCount / interval) * interval;
    }

    for (let ms = interval; ms < durationMs; ms += interval) {
      result.push({
        position: (ms / durationMs) * 100,
        label: formatTimeLabel(ms),
      });
    }

    return result;
  }, [durationMs]);

  // Calculate selection overlay position
  const selectionStyle = useMemo(() => {
    // Show drag selection while dragging
    if (isDragging && dragStart !== null && dragEnd !== null) {
      const left = Math.min(dragStart, dragEnd);
      const width = Math.abs(dragEnd - dragStart);
      return { left: `${left}%`, width: `${width}%` };
    }
    // Show final selection
    if (timeRange) {
      return { left: `${timeRange.start}%`, width: `${timeRange.end - timeRange.start}%` };
    }
    return null;
  }, [isDragging, dragStart, dragEnd, timeRange]);

  return (
    <div
      ref={timelineRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      className={cn(
        "relative h-8 flex-shrink-0 bg-zinc-900 dark:bg-zinc-900 border-b border-zinc-700 cursor-crosshair select-none",
        !isDragging && "hover:bg-zinc-800 transition-colors"
      )}
      style={{ marginLeft: WATERFALL.NAME_COLUMN_WIDTH }}
      title="Click to jump, drag to select time range"
    >
      {/* Selection overlay */}
      {selectionStyle && (
        <div
          className={cn(
            "absolute top-0 bottom-0 pointer-events-none",
            isDragging ? "bg-primary/30" : "bg-primary/20"
          )}
          style={selectionStyle}
        >
          {/* Selection edges */}
          <div className="absolute top-0 bottom-0 left-0 w-0.5 bg-primary" />
          <div className="absolute top-0 bottom-0 right-0 w-0.5 bg-primary" />
        </div>
      )}

      {/* Time markers with vertical lines */}
      {markers.map((marker, index) => (
        <div
          key={index}
          className="absolute top-0 h-full pointer-events-none"
          style={{ left: `${marker.position}%` }}
        >
          {/* Vertical grid line */}
          <div className="absolute top-0 bottom-0 w-px bg-zinc-700" />
          {/* Time label */}
          <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-xs text-zinc-400 font-mono whitespace-nowrap">
            {marker.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// Format time label based on value
const formatTimeLabel = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toLocaleString()} ms`;
  if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};

interface WaterfallRowProps {
  item: TimelineItem;
  isHighlighted: boolean;
  onClick: () => void;
  onToggleCollapse: () => void;
}

function WaterfallRow({ item, isHighlighted, onClick, onToggleCollapse }: WaterfallRowProps) {
  const isTrace = item.type === "trace";
  const level = item.level || "DEFAULT";

  const handleCollapseClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleCollapse();
    },
    [onToggleCollapse]
  );

  // Get icon and colors
  const Icon = isTrace ? MessagesSquare : item.spanType ? getSpanTypeConfig(item.spanType).icon : Activity;
  const iconColor = isTrace ? "text-primary" : item.spanType ? getSpanTypeConfig(item.spanType).color : "text-muted-foreground";

  return (
    <div
      className={cn(
        "flex items-center cursor-pointer hover:bg-muted/50 border-b transition-colors",
        level === "ERROR" && "bg-red-50 dark:bg-red-950/20",
        level === "WARNING" && "bg-yellow-50 dark:bg-yellow-950/20",
        isHighlighted && "!bg-primary/10 border-l-2 border-l-primary"
      )}
      style={{ height: WATERFALL.ROW_HEIGHT }}
      onClick={onClick}
    >
      {/* Name column */}
      <div
        className="flex items-center gap-2 shrink-0 px-2 overflow-hidden"
        style={{
          width: WATERFALL.NAME_COLUMN_WIDTH,
          paddingLeft: item.depth * WATERFALL.INDENT_PER_LEVEL + 8,
        }}
      >
        {/* Collapse toggle for traces */}
        {item.hasChildren ? (
          <button
            onClick={handleCollapseClick}
            className="p-0.5 hover:bg-muted rounded flex-shrink-0"
            aria-label={item.isCollapsed ? "Expand" : "Collapse"}
          >
            {item.isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="w-5 flex-shrink-0" />
        )}

        {/* Icon */}
        <Icon className={cn("h-4 w-4 flex-shrink-0", iconColor)} />

        {/* Name */}
        <span
          className={cn("truncate text-sm", isTrace ? "font-semibold" : "font-medium")}
          title={item.name}
        >
          {item.name}
        </span>

        {/* Collapsed count */}
        {item.isCollapsed && item.childCount > 0 && (
          <span className="text-xs text-muted-foreground flex-shrink-0">
            ({item.childCount})
          </span>
        )}
      </div>

      {/* Timeline bar column */}
      <div className="flex-1 relative h-full px-4">
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 rounded border-l-4",
            getSpanLevelColor(level as SpanLevel),
            getSpanLevelBorder(level as SpanLevel)
          )}
          style={{
            left: `${item.percentStart}%`,
            width: `${Math.max(item.percentWidth, 0.5)}%`,
            height: WATERFALL.BAR_HEIGHT,
            minWidth: WATERFALL.MIN_BAR_WIDTH,
          }}
        >
          {/* Duration label inside bar */}
          {item.duration && item.percentWidth > 5 && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white font-mono">
              {formatDuration(item.duration)}
            </span>
          )}
        </div>

        {/* Duration label outside bar (for narrow bars) */}
        {item.duration && item.percentWidth <= 5 && (
          <span
            className={cn(
              "absolute top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono whitespace-nowrap",
              item.percentStart + item.percentWidth > 85 ? "mr-1" : "ml-1"
            )}
            style={
              item.percentStart + item.percentWidth > 85
                ? { right: `${100 - item.percentStart}%` }
                : { left: `${item.percentStart + item.percentWidth}%` }
            }
          >
            {formatDuration(item.duration)}
          </span>
        )}
      </div>

      {/* Token badge */}
      {item.totalTokens && item.totalTokens > 0 && (
        <div className="shrink-0 px-2 text-xs text-muted-foreground font-mono">
          {item.totalTokens.toLocaleString()} tok
        </div>
      )}

      {/* Model badge */}
      {item.model && (
        <div className="shrink-0 px-2 text-xs text-muted-foreground truncate max-w-[100px]">
          {item.model}
        </div>
      )}
    </div>
  );
}
