"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Cpu,
} from "lucide-react";
import { format } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { formatDuration, formatTokens } from "@/lib/format";
import type { SpanItem } from "@cognobserve/api/client";

interface TraceDetailPanelProps {
  workspaceSlug: string;
  projectId: string;
  traceId: string | null;
  onClose: () => void;
}

// Helper function for span duration (start/end times)
const formatSpanDuration = (startTime: string, endTime: string | null): string => {
  if (!endTime) return "Running...";
  const ms = new Date(endTime).getTime() - new Date(startTime).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
};

const getSpanStatus = (span: SpanItem): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } => {
  if (span.level === "ERROR") return { label: "Error", variant: "destructive" };
  if (span.level === "WARNING") return { label: "Warning", variant: "secondary" };
  if (!span.endTime) return { label: "In Progress", variant: "outline" };
  return { label: "Finished", variant: "default" };
};

// Reusable copy button component
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-5 w-5"
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </Button>
  );
}

export function TraceDetailPanel({
  workspaceSlug,
  projectId,
  traceId,
  onClose,
}: TraceDetailPanelProps) {
  const { data: trace, isLoading } = trpc.traces.get.useQuery(
    { workspaceSlug, projectId, traceId: traceId! },
    { enabled: !!traceId }
  );

  const isOpen = traceId !== null;

  // Calculate trace-level stats
  const traceStats = useMemo(() => {
    if (!trace) return null;

    const spans = trace.spans;
    const totalTokens = spans.reduce((sum, s) => sum + (s.totalTokens ?? 0), 0);
    const hasErrors = spans.some((s) => s.level === "ERROR");
    const hasWarnings = spans.some((s) => s.level === "WARNING");

    let duration: number | null = null;
    if (spans.length > 0) {
      const startTimes = spans.map((s) => new Date(s.startTime).getTime());
      const endTimes = spans.filter((s) => s.endTime).map((s) => new Date(s.endTime!).getTime());
      if (endTimes.length > 0) {
        duration = Math.max(...endTimes) - Math.min(...startTimes);
      }
    }

    // Find primary model
    const modelCounts = spans
      .filter((s) => s.model)
      .reduce((acc, s) => {
        acc[s.model!] = (acc[s.model!] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    const primaryModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return { totalTokens, hasErrors, hasWarnings, duration, primaryModel, spanCount: spans.length };
  }, [trace]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      onClose();
    }
  }, [onClose]);

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl p-0 flex flex-col overflow-hidden">
        {/* Accessibility: Hidden title and description for screen readers */}
        <SheetTitle className="sr-only">
          {trace?.name ?? "Trace Details"}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Detailed view of trace execution including spans, timing, and token usage
        </SheetDescription>

        {isLoading || !trace ? (
          <TraceDetailSkeleton />
        ) : (
          <>
            {/* Header */}
            <div className="px-6 pt-6 pb-4 flex-shrink-0">
              {/* Top label */}
              <div className="flex items-center gap-2 text-muted-foreground mb-3">
                <Activity className="h-4 w-4" />
                <span className="text-sm">Trace detail</span>
              </div>

              {/* Title */}
              <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
                {trace.name}
                {traceStats?.hasErrors && (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                )}
                {traceStats?.hasWarnings && !traceStats?.hasErrors && (
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                )}
              </h2>

              {/* Trace ID */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-muted-foreground">ID:</span>
                <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{trace.id}</code>
                <CopyButton text={trace.id} />
              </div>

              {/* Stats row */}
              <div className="flex items-start gap-6 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Status</div>
                  <Badge variant={traceStats?.hasErrors ? "destructive" : traceStats?.hasWarnings ? "secondary" : "default"}>
                    {traceStats?.hasErrors ? "Error" : traceStats?.hasWarnings ? "Warning" : "Success"}
                  </Badge>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Time</div>
                  <div className="font-medium">{format(new Date(trace.timestamp), "h:mm a")}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Duration</div>
                  <div className="font-medium">{formatDuration(traceStats?.duration ?? null)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Spans</div>
                  <div className="font-medium">{traceStats?.spanCount}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Tokens</div>
                  <div className="font-medium">{formatTokens(traceStats?.totalTokens ?? null)}</div>
                </div>
              </div>
            </div>

            {/* Timeline Section */}
            <div className="flex-1 overflow-hidden border-t">
              <ScrollArea className="h-full">
                <div className="p-6">
                  {/* Section header */}
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-base font-semibold">Timeline</h3>
                    {traceStats?.primaryModel && (
                      <Badge variant="outline" className="gap-1">
                        <Cpu className="h-3 w-3" />
                        {traceStats.primaryModel}
                      </Badge>
                    )}
                  </div>

                  {/* Timeline - Git tree style */}
                  <div className="relative pl-4">
                    {/* Start marker */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="text-xs text-muted-foreground w-20 text-right font-mono">
                        {format(new Date(trace.timestamp), "h:mm:ss")}
                      </div>
                      <div className="w-3 h-3 rounded-full bg-primary flex-shrink-0" />
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-mono">&gt;</span>
                        <span>trace started</span>
                      </div>
                    </div>

                    {/* Spans with tree indentation */}
                    <div className="relative ml-12">
                      {/* Vertical line connecting all spans */}
                      <div className="absolute left-[4.5rem] top-0 bottom-8 w-0.5 bg-border" />

                      {trace.spans.map((span: SpanItem) => (
                        <SpanTimelineItem
                          key={span.id}
                          span={span}
                        />
                      ))}
                    </div>

                    {/* End marker */}
                    {trace.spans.length > 0 && (() => {
                      const endTimes = trace.spans
                        .filter((s) => s.endTime)
                        .map((s) => new Date(s.endTime!).getTime());
                      if (endTimes.length === 0) return null;
                      const lastEndTime = new Date(Math.max(...endTimes));
                      return (
                        <div className="flex items-center gap-3 mt-4">
                          <div className="text-xs text-muted-foreground w-20 text-right font-mono">
                            {format(lastEndTime, "h:mm:ss")}
                          </div>
                          <div className="w-3 h-3 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="font-mono">&lt;</span>
                            <span>trace completed</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </ScrollArea>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface SpanTimelineItemProps {
  span: SpanItem;
}

function SpanTimelineItem({ span }: SpanTimelineItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const status = getSpanStatus(span);
  const isError = span.level === "ERROR";
  const isWarning = span.level === "WARNING";
  const isInProgress = !span.endTime;

  const handleCopy = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const renderCopyButton = useCallback(
    (text: string, field: string) => (
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={(e) => {
          e.stopPropagation();
          handleCopy(text, field);
        }}
      >
        {copiedField === field ? (
          <Check className="h-3 w-3" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    ),
    [copiedField, handleCopy]
  );

  return (
    <div className="flex items-start gap-3 relative mb-2">
      {/* Time column */}
      <div className="text-xs text-muted-foreground w-16 text-right font-mono pt-2.5 flex-shrink-0">
        {format(new Date(span.startTime), "h:mm:ss")}
      </div>

      {/* Git branch connector */}
      <div className="flex items-start pt-2.5 flex-shrink-0">
        {/* Dot on the main line */}
        <div
          className={cn(
            "w-2.5 h-2.5 rounded-full flex-shrink-0 z-10 relative",
            isError && "bg-destructive",
            isWarning && "bg-yellow-500",
            !isError && !isWarning && isInProgress && "bg-primary/50 ring-2 ring-primary",
            !isError && !isWarning && !isInProgress && "bg-primary"
          )}
        />
        {/* Horizontal branch line */}
        <div className="w-8 h-0.5 bg-border mt-[4px]" />
      </div>

      {/* Content with tree indentation */}
      <div className="flex-1 min-w-0 pl-2">
        {/* Header row */}
        <button
          onClick={handleToggle}
          className="w-full flex items-center justify-between py-2.5 px-4 hover:bg-muted/50 rounded-lg transition-colors border border-transparent hover:border-border"
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Branch indicator */}
            <span className="text-muted-foreground/60 font-mono text-sm">├─</span>
            <span className="font-medium truncate">{span.name}</span>
            {span.model && (
              <Badge variant="outline" className="text-xs font-normal flex-shrink-0">
                {span.model}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <Badge
              variant={status.variant}
              className={cn(
                "text-xs",
                status.variant === "default" && "bg-green-500/10 text-green-600 hover:bg-green-500/20"
              )}
            >
              {status.label}
            </Badge>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {/* Expanded content */}
        {isOpen && (
          <div className="mt-2 ml-8 mr-2 space-y-4 border rounded-lg p-4 bg-muted/20 overflow-hidden">
            {/* Span ID */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Span ID:</span>
              <code className="text-xs font-mono bg-background px-2 py-0.5 rounded border">{span.id}</code>
              <CopyButton text={span.id} />
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground text-xs mb-1">Start Time</div>
                <div className="font-mono text-xs">
                  {format(new Date(span.startTime), "h:mm:ss.SSS a")}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs mb-1">Duration</div>
                <div className="font-mono text-xs">
                  {formatSpanDuration(span.startTime, span.endTime)}
                </div>
              </div>
            </div>

            {/* Token usage */}
            {span.totalTokens && (
              <div>
                <div className="text-muted-foreground text-xs mb-2">Token Usage</div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Prompt</div>
                    <div className="font-mono">{formatTokens(span.promptTokens)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Completion</div>
                    <div className="font-mono">{formatTokens(span.completionTokens)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Total</div>
                    <div className="font-mono">{formatTokens(span.totalTokens)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Input */}
            {span.input !== null && span.input !== undefined && (
              <div className="min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-muted-foreground text-xs">Input</div>
                  {renderCopyButton(JSON.stringify(span.input, null, 2), `input-${span.id}`)}
                </div>
                <pre className="p-3 bg-background rounded-lg text-xs overflow-auto max-h-48 border whitespace-pre-wrap break-all">
                  {JSON.stringify(span.input, null, 2)}
                </pre>
              </div>
            )}

            {/* Output */}
            {span.output !== null && span.output !== undefined && (
              <div className="min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-muted-foreground text-xs">Output</div>
                  {renderCopyButton(JSON.stringify(span.output, null, 2), `output-${span.id}`)}
                </div>
                <pre className="p-3 bg-background rounded-lg text-xs overflow-auto max-h-48 border whitespace-pre-wrap break-all">
                  {JSON.stringify(span.output, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TraceDetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Header skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* Timeline skeleton */}
      <div className="space-y-4 pt-4 border-t">
        <Skeleton className="h-5 w-20" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-3 w-3 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
