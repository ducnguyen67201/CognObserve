"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Activity,
  Clock,
  Zap,
  Settings,
  RefreshCw,
} from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";
import type { TraceListItem } from "@cognobserve/api/client";

const formatDuration = (ms: number | null): string => {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
};

const formatTokens = (tokens: number | null): string => {
  if (tokens === null) return "-";
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return tokens.toString();
};

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};

export default function ProjectDetailPage() {
  const params = useParams<{ workspaceSlug: string; projectId: string }>();
  const { workspaceSlug, workspaceUrl } = useWorkspaceUrl();
  const projectId = params.projectId;

  const { data: project, isLoading: isLoadingProject } =
    trpc.projects.get.useQuery(
      { workspaceSlug: workspaceSlug ?? "", projectId },
      { enabled: !!workspaceSlug && !!projectId }
    );

  const {
    data: tracesData,
    isLoading: isLoadingTraces,
    refetch,
  } = trpc.traces.list.useQuery(
    { workspaceSlug: workspaceSlug ?? "", projectId, limit: 50 },
    { enabled: !!workspaceSlug && !!projectId }
  );

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const renderTraceRow = (trace: TraceListItem) => (
    <TableRow
      key={trace.id}
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => {
        window.location.href = workspaceUrl(
          `/projects/${projectId}/traces/${trace.id}`
        );
      }}
    >
      <TableCell className="font-medium">{trace.name}</TableCell>
      <TableCell>{formatTimestamp(trace.timestamp)}</TableCell>
      <TableCell>
        <Badge variant="outline">{trace.spanCount} spans</Badge>
      </TableCell>
      <TableCell>{formatDuration(trace.duration)}</TableCell>
      <TableCell>{formatTokens(trace.totalTokens)}</TableCell>
    </TableRow>
  );

  const renderSkeletonRow = (index: number) => (
    <TableRow key={index}>
      <TableCell>
        <Skeleton className="h-4 w-32" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-36" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-12" />
      </TableCell>
    </TableRow>
  );

  if (isLoadingProject) {
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
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={workspaceUrl("/projects")}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Project Not Found
            </h1>
            <p className="text-muted-foreground">
              This project does not exist or you don&apos;t have access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const traces = tracesData?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={workspaceUrl("/projects")}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            <p className="text-muted-foreground">
              Created {new Date(project.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href={workspaceUrl(`/projects/${projectId}/settings`)}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Traces</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{project.traceCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Keys</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{project.apiKeyCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Activity</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {traces.length > 0 && traces[0]
                ? formatTimestamp(traces[0].timestamp)
                : "-"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Traces Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Traces</CardTitle>
            <CardDescription>
              Recent traces from your AI application.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {isLoadingTraces ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Spans</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{[0, 1, 2, 3, 4].map(renderSkeletonRow)}</TableBody>
            </Table>
          ) : traces.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Spans</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{traces.map(renderTraceRow)}</TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Activity className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No traces yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Start sending traces from your AI application to see them here.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
