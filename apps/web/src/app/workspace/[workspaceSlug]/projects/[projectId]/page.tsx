"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Activity,
  Clock,
  Zap,
  Settings,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";
import { TracesTable } from "@/components/traces/traces-table";
import { formatTimestamp } from "@/lib/format";

export default function ProjectDetailPage() {
  const params = useParams<{ workspaceSlug: string; projectId: string }>();
  const { workspaceSlug, workspaceUrl } = useWorkspaceUrl();
  const projectId = params.projectId;

  const { data: project, isLoading: isLoadingProject } =
    trpc.projects.get.useQuery(
      { workspaceSlug: workspaceSlug ?? "", projectId },
      { enabled: !!workspaceSlug && !!projectId }
    );

  // Fetch just the first trace for Last Activity stat
  const { data: tracesData } = trpc.traces.list.useQuery(
    { workspaceSlug: workspaceSlug ?? "", projectId, limit: 1 },
    { enabled: !!workspaceSlug && !!projectId }
  );

  const firstTrace = tracesData?.items?.[0];

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
              {firstTrace ? formatTimestamp(firstTrace.timestamp) : "-"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Traces Table */}
      <Card>
        <CardHeader>
          <CardTitle>Traces</CardTitle>
          <CardDescription>
            Recent traces from your AI application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TracesTable
            workspaceSlug={workspaceSlug ?? ""}
            projectId={projectId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
