"use client";

import { useCallback } from "react";
import {
  MessagesSquare,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
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
import { useSessionDetail } from "@/hooks/sessions/use-session-detail";
import { SessionWaterfall } from "./session-waterfall";

interface SessionDetailPanelProps {
  workspaceSlug: string;
  sessionId: string | null;
  onClose: () => void;
}

/**
 * Sheet panel showing session details with waterfall timeline visualization.
 */
export function SessionDetailPanel({
  workspaceSlug,
  sessionId,
  onClose,
}: SessionDetailPanelProps) {
  const { session, timeline, stats, isLoading, error, refetch } = useSessionDetail({
    workspaceSlug,
    sessionId,
  });

  const isOpen = sessionId !== null;

  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );

  const handleTraceSelect = useCallback((traceId: string) => {
    // Future: Could navigate to trace detail or show more info
    console.log("Selected trace:", traceId);
  }, []);

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="!w-[80vw] !max-w-[80vw] p-0 flex flex-col overflow-hidden">
        {/* Accessibility */}
        <SheetTitle className="sr-only">
          {session?.name ?? "Session Details"}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Detailed view of session including traces and their spans in waterfall format
        </SheetDescription>

        {error ? (
          <SessionDetailError error={error} onRetry={handleRetry} />
        ) : isLoading || !session ? (
          <SessionDetailSkeleton />
        ) : (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 flex-shrink-0 border-b">
              {/* Top label */}
              <div className="flex items-center gap-2 text-muted-foreground mb-3">
                <MessagesSquare className="h-4 w-4" />
                <span className="text-sm">Session detail</span>
              </div>

              {/* Title */}
              <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
                {session.name || session.externalId || session.id.slice(0, 8)}
                {stats?.hasErrors && (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                )}
                {stats?.hasWarnings && !stats?.hasErrors && (
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                )}
              </h2>

              {/* Session ID */}
              {session.externalId && session.name && (
                <p className="text-sm text-muted-foreground mb-3">
                  ID: {session.externalId}
                </p>
              )}

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
                      ? `${stats.errorCount} Error${stats.errorCount > 1 ? "s" : ""}`
                      : stats?.hasWarnings
                        ? `${stats.warningCount} Warning${stats.warningCount > 1 ? "s" : ""}`
                        : "Success"}
                  </Badge>
                </StatItem>
                <StatItem label="Traces">
                  <span className="font-medium">{stats?.traceCount ?? 0}</span>
                </StatItem>
                <StatItem label="Spans">
                  <span className="font-medium">{stats?.spanCount ?? 0}</span>
                </StatItem>
                <StatItem label="Duration">
                  <span className="font-medium">
                    {formatDuration(stats?.totalDuration ?? null)}
                  </span>
                </StatItem>
                <StatItem label="Tokens">
                  <span className="font-medium">
                    {formatTokens(stats?.totalTokens ?? null)}
                  </span>
                </StatItem>
                <StatItem label="Cost">
                  <span className="font-medium">
                    {formatCost(stats?.totalCost ?? 0)}
                  </span>
                </StatItem>
              </div>
            </div>

            {/* Waterfall Timeline */}
            <div className="flex-1 overflow-hidden">
              <SessionWaterfall
                timeline={timeline}
                sessionDuration={stats?.totalDuration ?? 0}
                onTraceSelect={handleTraceSelect}
              />
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

const formatCost = (cost: number): string => {
  if (cost === 0) return "$0.00";
  if (cost >= 1000) return `$${(cost / 1000).toFixed(1)}K`;
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(4)}`;
};

function SessionDetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Header skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* Waterfall skeleton */}
      <div className="space-y-1 pt-4 border-t">
        <Skeleton className="h-8 w-full" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

function SessionDetailError({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h3 className="text-lg font-semibold mb-2">Failed to load session</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">
        {error.message || "An unexpected error occurred while loading the session details."}
      </p>
      <Button variant="outline" onClick={onRetry} className="gap-2">
        <RefreshCw className="h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}
