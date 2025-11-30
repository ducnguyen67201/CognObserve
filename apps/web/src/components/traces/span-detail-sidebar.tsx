"use client";

import { useState, useCallback } from "react";
import { X, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SpanJsonViewer } from "./span-json-viewer";
import { SPAN_TYPE_CONFIG, SPAN_LEVEL_COLORS } from "./span-type-config";
import { inferSpanType } from "@/lib/traces/infer-span-type";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import { useSpanDetail } from "@/hooks/traces/use-span-detail";
import type { SpanLevel } from "@/lib/traces/types";

interface SpanDetailSidebarProps {
  workspaceSlug: string;
  projectId: string;
  traceId: string;
  spanId: string;
  onClose: () => void;
}

const formatTime = (iso: string): string => {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
};

/**
 * Sidebar panel showing full span details.
 * Lazy loads input/output/metadata on render.
 */
export function SpanDetailSidebar({
  workspaceSlug,
  projectId,
  traceId,
  spanId,
  onClose,
}: SpanDetailSidebarProps) {
  const { span, isLoading, error } = useSpanDetail({
    workspaceSlug,
    projectId,
    traceId,
    spanId,
  });

  if (error) {
    return (
      <div className="flex flex-col h-full border-l w-[400px]">
        <SidebarHeader onClose={onClose} />
        <div className="flex items-center justify-center flex-1 text-destructive">
          Failed to load span details
        </div>
      </div>
    );
  }

  if (isLoading || !span) {
    return (
      <div className="flex flex-col h-full border-l w-[400px]">
        <SidebarHeader onClose={onClose} />
        <SpanDetailSkeleton />
      </div>
    );
  }

  const spanType = inferSpanType(span);
  const typeConfig = SPAN_TYPE_CONFIG[spanType];
  const TypeIcon = typeConfig.icon;
  const level = span.level as SpanLevel;

  return (
    <div className="flex flex-col h-full border-l w-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <TypeIcon className={cn("h-5 w-5 flex-shrink-0", typeConfig.color)} />
          <span className="font-semibold truncate" title={span.name}>
            {span.name}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="flex-shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <Badge className={cn(SPAN_LEVEL_COLORS[level], "text-white")}>
              {level}
            </Badge>
            <Badge variant="outline" className={typeConfig.bgColor}>
              {typeConfig.label}
            </Badge>
            {span.model && <Badge variant="secondary">{span.model}</Badge>}
          </div>

          {/* Status Message (if error/warning) */}
          {span.statusMessage && (
            <div
              className={cn(
                "p-3 rounded-lg text-sm",
                level === "ERROR"
                  ? "bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800"
                  : "bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800"
              )}
            >
              {span.statusMessage}
            </div>
          )}

          {/* Timing */}
          <Section title="Timing">
            <InfoRow label="Start" value={formatTime(span.startTime)} />
            {span.endTime && <InfoRow label="End" value={formatTime(span.endTime)} />}
            <InfoRow
              label="Duration"
              value={span.duration !== null ? formatDuration(span.duration) : "Running..."}
              mono
            />
          </Section>

          {/* Token Usage (LLM only) */}
          {span.totalTokens && (
            <Section title="Token Usage">
              <InfoRow
                label="Prompt"
                value={span.promptTokens?.toLocaleString() ?? "-"}
              />
              <InfoRow
                label="Completion"
                value={span.completionTokens?.toLocaleString() ?? "-"}
              />
              <InfoRow
                label="Total"
                value={span.totalTokens.toLocaleString()}
                mono
              />
            </Section>
          )}

          {/* Input */}
          {span.input !== null && span.input !== undefined && (
            <CollapsibleSection title="Input" defaultOpen>
              <SpanJsonViewer data={span.input} />
            </CollapsibleSection>
          )}

          {/* Output */}
          {span.output !== null && span.output !== undefined && (
            <CollapsibleSection title="Output" defaultOpen>
              <SpanJsonViewer data={span.output} />
            </CollapsibleSection>
          )}

          {/* Model Parameters (LLM) */}
          {span.modelParameters !== null && span.modelParameters !== undefined && (
            <CollapsibleSection title="Model Parameters">
              <SpanJsonViewer data={span.modelParameters} />
            </CollapsibleSection>
          )}

          {/* Metadata */}
          {span.metadata !== null && span.metadata !== undefined && (
            <CollapsibleSection title="Metadata">
              <SpanJsonViewer data={span.metadata} />
            </CollapsibleSection>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SidebarHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
      <span className="font-semibold">Span Details</span>
      <Button variant="ghost" size="icon" onClick={onClose}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-sm font-medium mb-2">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | number | undefined | null;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono" : ""}>{value ?? "-"}</span>
    </div>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return (
    <div>
      <button
        className="flex items-center gap-2 text-sm font-medium mb-2 hover:text-foreground"
        onClick={handleToggle}
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        {title}
      </button>
      {isOpen && children}
    </div>
  );
}

function SpanDetailSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-20" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
