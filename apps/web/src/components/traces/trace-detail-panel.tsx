"use client";

import { useCallback, useState } from "react";
import { Activity, AlertCircle, AlertTriangle, Cpu, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDuration, formatTokens } from "@/lib/format";
import { useTraceDetail } from "@/hooks/traces/use-trace-detail";
import { TraceWaterfall } from "./trace-waterfall";
import { SpanDetailSidebar } from "./span-detail-sidebar";

interface TraceDetailPanelProps {
  workspaceSlug: string;
  projectId: string;
  traceId: string | null;
  onClose: () => void;
}

/**
 * Sheet panel showing trace details with waterfall visualization.
 * Supports 500+ spans with virtualization.
 */
export function TraceDetailPanel({
  workspaceSlug,
  projectId,
  traceId,
  onClose,
}: TraceDetailPanelProps) {
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);

  const { trace, spanTree, stats, isLoading, error, refetch } = useTraceDetail({
    workspaceSlug,
    projectId,
    traceId,
  });

  const isOpen = traceId !== null;

  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setSelectedSpanId(null);
        onClose();
      }
    },
    [onClose]
  );

  const handleSpanSelect = useCallback((spanId: string) => {
    setSelectedSpanId(spanId);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setSelectedSpanId(null);
  }, []);

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-4xl lg:max-w-6xl p-0 flex flex-col overflow-hidden">
        {/* Accessibility */}
        <SheetTitle className="sr-only">
          {trace?.name ?? "Trace Details"}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Detailed view of trace execution including spans, timing, and token usage
        </SheetDescription>

        {error ? (
          <TraceDetailError error={error} onRetry={handleRetry} />
        ) : isLoading || !trace ? (
          <TraceDetailSkeleton />
        ) : (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 flex-shrink-0 border-b">
              {/* Top label */}
              <div className="flex items-center gap-2 text-muted-foreground mb-3">
                <Activity className="h-4 w-4" />
                <span className="text-sm">Trace detail</span>
              </div>

              {/* Title */}
              <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
                {trace.name}
                {stats?.hasErrors && (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                )}
                {stats?.hasWarnings && !stats?.hasErrors && (
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                )}
              </h2>

              {/* Stats row */}
              <div className="flex items-start gap-6 text-sm flex-wrap">
                <StatItem label="Status">
                  <Badge
                    variant={
                      stats?.hasErrors
                        ? "destructive"
                        : stats?.hasWarnings
                          ? "secondary"
                          : "default"
                    }
                    className={cn(
                      !stats?.hasErrors &&
                        !stats?.hasWarnings &&
                        "bg-green-500/10 text-green-600 hover:bg-green-500/20"
                    )}
                  >
                    {stats?.hasErrors
                      ? "Error"
                      : stats?.hasWarnings
                        ? "Warning"
                        : "Success"}
                  </Badge>
                </StatItem>
                <StatItem label="Time">
                  <span className="font-medium">
                    {format(new Date(trace.timestamp), "h:mm a")}
                  </span>
                </StatItem>
                <StatItem label="Duration">
                  <span className="font-medium">
                    {formatDuration(stats?.duration ?? null)}
                  </span>
                </StatItem>
                <StatItem label="Spans">
                  <span className="font-medium">{stats?.spanCount}</span>
                </StatItem>
                <StatItem label="Tokens">
                  <span className="font-medium">
                    {formatTokens(stats?.totalTokens ?? null)}
                  </span>
                </StatItem>
                {stats?.primaryModel && (
                  <StatItem label="Model">
                    <Badge variant="outline" className="gap-1">
                      <Cpu className="h-3 w-3" />
                      {stats.primaryModel}
                    </Badge>
                  </StatItem>
                )}
              </div>
            </div>

            {/* Main content: Waterfall + Detail sidebar */}
            <div className="flex flex-1 overflow-hidden">
              {/* Waterfall (flex-1 or shrink when sidebar open) */}
              <div
                className={cn(
                  "flex-1 overflow-hidden p-4",
                  selectedSpanId && "hidden sm:block"
                )}
              >
                <TraceWaterfall
                  spanTree={spanTree}
                  traceDuration={stats?.duration ?? 1000}
                  selectedSpanId={selectedSpanId}
                  onSpanSelect={handleSpanSelect}
                />
              </div>

              {/* Span detail sidebar (conditional) */}
              {selectedSpanId && (
                <SpanDetailSidebar
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  traceId={traceId!}
                  spanId={selectedSpanId}
                  onClose={handleCloseSidebar}
                />
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StatItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-muted-foreground text-xs mb-1">{label}</div>
      {children}
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

      {/* Waterfall skeleton */}
      <div className="space-y-2 pt-4 border-t">
        <Skeleton className="h-8 w-full" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}

function TraceDetailError({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h3 className="text-lg font-semibold mb-2">Failed to load trace</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">
        {error.message || "An unexpected error occurred while loading the trace details."}
      </p>
      <Button variant="outline" onClick={onRetry} className="gap-2">
        <RefreshCw className="h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}
