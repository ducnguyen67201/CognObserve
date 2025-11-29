"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Clock, Zap, Layers, ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";
import type { SpanItem } from "@cognobserve/api/client";

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: "bg-gray-100 text-gray-800",
  DEFAULT: "bg-blue-100 text-blue-800",
  WARNING: "bg-yellow-100 text-yellow-800",
  ERROR: "bg-red-100 text-red-800",
};

const formatDuration = (startTime: string, endTime: string | null): string => {
  if (!endTime) return "Running...";
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
};

const formatTimestamp = (timestamp: string): string => {
  return new Date(timestamp).toLocaleString();
};

interface SpanTreeNode {
  span: SpanItem;
  children: SpanTreeNode[];
  depth: number;
}

const buildSpanTree = (spans: SpanItem[]): SpanTreeNode[] => {
  const spanMap = new Map<string, SpanTreeNode>();
  const roots: SpanTreeNode[] = [];

  spans.forEach((span) => {
    spanMap.set(span.id, { span, children: [], depth: 0 });
  });

  spans.forEach((span) => {
    const node = spanMap.get(span.id)!;
    if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
      const parent = spanMap.get(span.parentSpanId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
};

const flattenTree = (nodes: SpanTreeNode[]): SpanTreeNode[] => {
  const result: SpanTreeNode[] = [];
  const traverse = (nodeList: SpanTreeNode[]) => {
    nodeList.forEach((node) => {
      result.push(node);
      traverse(node.children);
    });
  };
  traverse(nodes);
  return result;
};

export default function TraceDetailPage() {
  const params = useParams<{
    workspaceSlug: string;
    projectId: string;
    traceId: string;
  }>();
  const { workspaceSlug, workspaceUrl } = useWorkspaceUrl();
  const { projectId, traceId } = params;

  const { data: trace, isLoading } = trpc.traces.get.useQuery(
    { workspaceSlug: workspaceSlug ?? "", projectId, traceId },
    { enabled: !!workspaceSlug && !!projectId && !!traceId }
  );

  const spanTree = useMemo(() => {
    if (!trace?.spans) return [];
    return flattenTree(buildSpanTree(trace.spans));
  }, [trace?.spans]);

  const totalTokens = useMemo(() => {
    if (!trace?.spans) return 0;
    return trace.spans.reduce((sum, span) => sum + (span.totalTokens ?? 0), 0);
  }, [trace?.spans]);

  const renderSpan = (node: SpanTreeNode) => {
    const { span, depth } = node;
    const levelColor = LEVEL_COLORS[span.level] ?? LEVEL_COLORS.DEFAULT;

    return (
      <div
        key={span.id}
        className="border-b last:border-b-0"
        style={{ paddingLeft: `${depth * 24}px` }}
      >
        <div className="flex items-center gap-3 py-3 px-4">
          {depth > 0 && (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{span.name}</span>
              <Badge variant="secondary" className={levelColor}>
                {span.level}
              </Badge>
              {span.model && (
                <Badge variant="outline" className="text-xs">
                  {span.model}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(span.startTime, span.endTime)}
              </span>
              {span.totalTokens && (
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  {span.totalTokens} tokens
                </span>
              )}
            </div>
          </div>
        </div>
        {Boolean(span.input || span.output) && (
          <div className="px-4 pb-3 space-y-2">
            {Boolean(span.input) && (
              <div>
                <span className="text-xs font-medium text-muted-foreground">
                  Input:
                </span>
                <pre className="mt-1 p-2 bg-muted rounded-md text-xs overflow-x-auto max-h-32">
                  {typeof span.input === "string"
                    ? String(span.input)
                    : JSON.stringify(span.input, null, 2)}
                </pre>
              </div>
            )}
            {Boolean(span.output) && (
              <div>
                <span className="text-xs font-medium text-muted-foreground">
                  Output:
                </span>
                <pre className="mt-1 p-2 bg-muted rounded-md text-xs overflow-x-auto max-h-32">
                  {typeof span.output === "string"
                    ? String(span.output)
                    : JSON.stringify(span.output, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-1 h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={workspaceUrl(`/projects/${projectId}`)}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Trace Not Found
            </h1>
            <p className="text-muted-foreground">
              This trace does not exist or you don&apos;t have access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={workspaceUrl(`/projects/${projectId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{trace.name}</h1>
          <p className="text-muted-foreground">
            {formatTimestamp(trace.timestamp)}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spans</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{trace.spans.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalTokens > 0 ? totalTokens : "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(() => {
                const first = trace.spans[0];
                const last = trace.spans[trace.spans.length - 1];
                if (first && last) {
                  return formatDuration(first.startTime, last.endTime);
                }
                return "-";
              })()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Metadata */}
      {Boolean(trace.metadata) && (
        <Card>
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="p-3 bg-muted rounded-md text-sm overflow-x-auto">
              {JSON.stringify(trace.metadata, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Spans */}
      <Card>
        <CardHeader>
          <CardTitle>Spans</CardTitle>
          <CardDescription>
            Hierarchical view of all spans in this trace.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {spanTree.length > 0 ? (
            <div className="divide-y">{spanTree.map(renderSpan)}</div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Layers className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No spans</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                This trace has no spans recorded.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
