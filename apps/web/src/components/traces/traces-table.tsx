"use client";

import { useCallback, useState } from "react";
import { AlertCircle, AlertTriangle, Activity, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTraces } from "@/hooks/traces/use-traces";
import { TraceDetailPanel } from "./trace-detail-panel";
import { formatDuration, formatTokens } from "@/lib/format";
import type { TraceListItem } from "@cognobserve/api/client";

interface TracesTableProps {
  workspaceSlug: string;
  projectId: string;
}

export function TracesTable({ workspaceSlug, projectId }: TracesTableProps) {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const { traces, isLoading, error, hasMore, loadMore, isLoadingMore, refetch } = useTraces({
    workspaceSlug,
    projectId,
  });

  const handleTableClick = useCallback((event: React.MouseEvent<HTMLTableSectionElement>) => {
    const row = (event.target as HTMLElement).closest("tr[data-trace-id]");
    if (row) {
      const traceId = row.getAttribute("data-trace-id");
      if (traceId) {
        setSelectedTraceId(traceId);
      }
    }
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedTraceId(null);
  }, []);

  const renderTraceRow = useCallback((trace: TraceListItem) => (
    <TableRow
      key={trace.id}
      data-trace-id={trace.id}
      className="cursor-pointer hover:bg-muted/50"
    >
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {trace.name}
          {trace.primaryModel && (
            <Badge variant="outline" className="text-xs">
              {trace.primaryModel}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatDistanceToNow(new Date(trace.timestamp), { addSuffix: true })}
      </TableCell>
      <TableCell className="text-center">{trace.spanCount}</TableCell>
      <TableCell className="text-right font-mono">
        {formatDuration(trace.duration)}
      </TableCell>
      <TableCell className="text-right font-mono">
        {formatTokens(trace.totalTokens)}
      </TableCell>
      <TableCell className="text-center">
        <div className="flex items-center justify-center gap-1">
          {trace.hasErrors && (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
          {trace.hasWarnings && !trace.hasErrors && (
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          )}
          {!trace.hasErrors && !trace.hasWarnings && (
            <span className="h-2 w-2 rounded-full bg-green-500" />
          )}
        </div>
      </TableCell>
    </TableRow>
  ), []);

  if (isLoading) {
    return <TracesTableSkeleton />;
  }

  if (error) {
    return <TracesErrorState error={error} onRetry={refetch} />;
  }

  if (traces.length === 0) {
    return <TracesEmptyState />;
  }

  return (
    <>
      <div className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Name</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="text-center">Spans</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody onClick={handleTableClick}>{traces.map(renderTraceRow)}</TableBody>
        </Table>

        {hasMore && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={loadMore} disabled={isLoadingMore}>
              {isLoadingMore ? "Loading..." : "Load More"}
            </Button>
          </div>
        )}
      </div>

      <TraceDetailPanel
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        traceId={selectedTraceId}
        onClose={handleClosePanel}
      />
    </>
  );
}

function TracesTableSkeleton() {
  const renderSkeletonRow = (index: number) => (
    <TableRow key={index}>
      <TableCell>
        <Skeleton className="h-4 w-48" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell className="text-center">
        <Skeleton className="mx-auto h-4 w-8" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="ml-auto h-4 w-16" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="ml-auto h-4 w-12" />
      </TableCell>
      <TableCell className="text-center">
        <Skeleton className="mx-auto h-4 w-4" />
      </TableCell>
    </TableRow>
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[300px]">Name</TableHead>
          <TableHead>Time</TableHead>
          <TableHead className="text-center">Spans</TableHead>
          <TableHead className="text-right">Duration</TableHead>
          <TableHead className="text-right">Tokens</TableHead>
          <TableHead className="text-center">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{[0, 1, 2, 3, 4].map(renderSkeletonRow)}</TableBody>
    </Table>
  );
}

function TracesEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Activity className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-semibold">No traces yet</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Traces will appear here once your application sends data.
      </p>
    </div>
  );
}

interface TracesErrorStateProps {
  error: Error;
  onRetry: () => void;
}

function TracesErrorState({ error, onRetry }: TracesErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="h-12 w-12 text-destructive/50" />
      <h3 className="mt-4 text-lg font-semibold">Failed to load traces</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred."}
      </p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}
