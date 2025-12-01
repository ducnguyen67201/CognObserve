"use client";

import * as React from "react";
import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Activity,
  RefreshCw,
  Sparkles,
  FileText,
  Wrench,
  Globe,
  Database,
  Box,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  MessageSquare,
  Bot,
} from "lucide-react";
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
import { useTraceFilters } from "@/hooks/traces/use-trace-filters";
import { TraceDetailPanel } from "./trace-detail-panel";
import { TracesFilterBar } from "./traces-filter-bar";
import { formatDuration, formatTokens } from "@/lib/format";
import type { TraceListItem, SpanType } from "@cognobserve/api/client";
import { cn } from "@/lib/utils";

/**
 * Type badge configuration for visual display
 */
const TYPE_CONFIG: Record<SpanType, { icon: React.ElementType; label: string; className: string }> = {
  LLM: { icon: Sparkles, label: "LLM", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  LOG: { icon: FileText, label: "Log", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400" },
  FUNCTION: { icon: Wrench, label: "Function", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  HTTP: { icon: Globe, label: "HTTP", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  DB: { icon: Database, label: "DB", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  CUSTOM: { icon: Box, label: "Custom", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400" },
};

const getTypeConfig = (type: SpanType) => TYPE_CONFIG[type] ?? TYPE_CONFIG.CUSTOM;

interface TracesTableProps {
  workspaceSlug: string;
  projectId: string;
}

export function TracesTable({ workspaceSlug, projectId }: TracesTableProps) {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const { filters } = useTraceFilters();
  const { traces, isLoading, error, hasMore, loadMore, isLoadingMore, refetch } = useTraces({
    workspaceSlug,
    projectId,
    filters,
  });

  // Collect available models from traces for the filter dropdown
  const availableModels = useMemo(() => {
    const models = new Set<string>();
    for (const trace of traces) {
      if (trace.primaryModel) {
        models.add(trace.primaryModel);
      }
    }
    return Array.from(models).sort();
  }, [traces]);

  const toggleRowExpansion = useCallback((traceId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(traceId)) {
        next.delete(traceId);
      } else {
        next.add(traceId);
      }
      return next;
    });
  }, []);

  const handleOpenDetail = useCallback((traceId: string) => {
    setSelectedTraceId(traceId);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedTraceId(null);
  }, []);

  if (isLoading) {
    return (
      <>
        <TracesFilterBar availableModels={[]} />
        <TracesTableSkeleton />
      </>
    );
  }

  if (error) {
    return (
      <>
        <TracesFilterBar availableModels={availableModels} />
        <TracesErrorState error={error} onRetry={refetch} />
      </>
    );
  }

  if (traces.length === 0) {
    return (
      <>
        <TracesFilterBar availableModels={availableModels} />
        <TracesEmptyState />
      </>
    );
  }

  return (
    <>
      <TracesFilterBar availableModels={availableModels} />
      <div className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead className="w-[180px]">Name</TableHead>
              <TableHead className="w-[90px]">Type</TableHead>
              <TableHead className="min-w-[200px]">Input</TableHead>
              <TableHead className="min-w-[200px]">Output</TableHead>
              <TableHead className="w-[120px]">Time</TableHead>
              <TableHead className="w-[80px] text-right">Duration</TableHead>
              <TableHead className="w-[70px] text-right">Tokens</TableHead>
              <TableHead className="w-[70px] text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {traces.map((trace) => (
              <TraceRowWithExpansion
                key={trace.id}
                trace={trace}
                isExpanded={expandedRows.has(trace.id)}
                onToggleExpand={toggleRowExpansion}
                onOpenDetail={handleOpenDetail}
              />
            ))}
          </TableBody>
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

/**
 * Individual trace row with expansion capability
 */
interface TraceRowWithExpansionProps {
  trace: TraceListItem;
  isExpanded: boolean;
  onToggleExpand: (traceId: string) => void;
  onOpenDetail: (traceId: string) => void;
}

function TraceRowWithExpansion({ trace, isExpanded, onToggleExpand, onOpenDetail }: TraceRowWithExpansionProps) {
  const typeConfig = getTypeConfig(trace.primaryType);
  const TypeIcon = typeConfig.icon;

  const handleRowClick = useCallback(() => {
    onToggleExpand(trace.id);
  }, [trace.id, onToggleExpand]);

  const handleDetailClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenDetail(trace.id);
  }, [trace.id, onOpenDetail]);

  return (
    <>
      {/* Main row */}
      <TableRow
        className={cn(
          "cursor-pointer transition-colors",
          isExpanded ? "bg-muted/50" : "hover:bg-muted/30"
        )}
        onClick={handleRowClick}
      >
        <TableCell className="py-2">
          <div className="flex items-center justify-center">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </TableCell>
        <TableCell className="py-2 font-medium">
          <div className="flex items-center gap-2">
            <span className="truncate">{trace.name}</span>
            {trace.primaryModel && (
              <Badge variant="outline" className="shrink-0 text-xs">
                {trace.primaryModel}
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="py-2">
          <div className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${typeConfig.className}`}>
            <TypeIcon className="h-3 w-3" />
            {typeConfig.label}
          </div>
        </TableCell>
        <TableCell className="max-w-[200px] truncate py-2 text-sm text-muted-foreground" title={trace.inputPreview ?? undefined}>
          {trace.inputPreview ?? <span className="text-muted-foreground/50">-</span>}
        </TableCell>
        <TableCell className="max-w-[200px] truncate py-2 text-sm text-muted-foreground" title={trace.outputPreview ?? undefined}>
          {trace.outputPreview ?? <span className="text-muted-foreground/50">-</span>}
        </TableCell>
        <TableCell className="py-2 text-muted-foreground">
          {formatDistanceToNow(new Date(trace.timestamp), { addSuffix: true })}
        </TableCell>
        <TableCell className="py-2 text-right font-mono">
          {formatDuration(trace.duration)}
        </TableCell>
        <TableCell className="py-2 text-right font-mono">
          {formatTokens(trace.totalTokens)}
        </TableCell>
        <TableCell className="py-2">
          <div className="flex items-center justify-center gap-2">
            {trace.hasErrors && (
              <AlertCircle className="h-4 w-4 text-destructive" />
            )}
            {trace.hasWarnings && !trace.hasErrors && (
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            )}
            {!trace.hasErrors && !trace.hasWarnings && (
              <span className="h-2 w-2 rounded-full bg-green-500" />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleDetailClick}
              title="View full trace details"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {/* Expanded content row */}
      {isExpanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={9} className="p-4">
            <ExpandedTraceContent trace={trace} onOpenDetail={handleDetailClick} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/**
 * Expanded trace content showing full input/output
 */
interface ExpandedTraceContentProps {
  trace: TraceListItem;
  onOpenDetail: (e: React.MouseEvent) => void;
}

function ExpandedTraceContent({ trace, onOpenDetail }: ExpandedTraceContentProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Input */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MessageSquare className="h-4 w-4 text-blue-500" />
            Input
          </div>
          <div className="rounded-lg border bg-background p-3">
            <pre className="whitespace-pre-wrap text-sm text-muted-foreground">
              {trace.inputPreview || <span className="italic text-muted-foreground/50">No input data</span>}
            </pre>
          </div>
        </div>

        {/* Output */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Bot className="h-4 w-4 text-green-500" />
            Output
          </div>
          <div className="rounded-lg border bg-background p-3">
            <pre className="whitespace-pre-wrap text-sm text-muted-foreground">
              {trace.outputPreview || <span className="italic text-muted-foreground/50">No output data</span>}
            </pre>
          </div>
        </div>
      </div>

      {/* Action button */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onOpenDetail}>
          <ExternalLink className="mr-2 h-3.5 w-3.5" />
          View Full Trace Details
        </Button>
      </div>
    </div>
  );
}

function TracesTableSkeleton() {
  const renderSkeletonRow = (index: number) => (
    <TableRow key={index}>
      <TableCell className="py-2">
        <Skeleton className="h-4 w-4" />
      </TableCell>
      <TableCell className="py-2">
        <Skeleton className="h-4 w-32" />
      </TableCell>
      <TableCell className="py-2">
        <Skeleton className="h-5 w-16 rounded-full" />
      </TableCell>
      <TableCell className="py-2">
        <Skeleton className="h-4 w-40" />
      </TableCell>
      <TableCell className="py-2">
        <Skeleton className="h-4 w-40" />
      </TableCell>
      <TableCell className="py-2">
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell className="py-2 text-right">
        <Skeleton className="ml-auto h-4 w-16" />
      </TableCell>
      <TableCell className="py-2 text-right">
        <Skeleton className="ml-auto h-4 w-12" />
      </TableCell>
      <TableCell className="py-2 text-center">
        <Skeleton className="mx-auto h-4 w-12" />
      </TableCell>
    </TableRow>
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40px]"></TableHead>
          <TableHead className="w-[180px]">Name</TableHead>
          <TableHead className="w-[90px]">Type</TableHead>
          <TableHead className="min-w-[200px]">Input</TableHead>
          <TableHead className="min-w-[200px]">Output</TableHead>
          <TableHead className="w-[120px]">Time</TableHead>
          <TableHead className="w-[80px] text-right">Duration</TableHead>
          <TableHead className="w-[70px] text-right">Tokens</TableHead>
          <TableHead className="w-[70px] text-center">Status</TableHead>
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
