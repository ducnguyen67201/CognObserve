"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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

export default function ProjectDetailPage() {
  const params = useParams<{ workspaceSlug: string; projectId: string }>();
  const { workspaceSlug, workspaceUrl } = useWorkspaceUrl();
  const projectId = params.projectId;

  const { data: project, isLoading: isLoadingProject } =
    trpc.projects.get.useQuery(
      { workspaceSlug: workspaceSlug ?? "", projectId },
      { enabled: !!workspaceSlug && !!projectId }
    );

  if (isLoadingProject) {
    return (
      <div className="space-y-6 p-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-1 h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-6 p-4">
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
    <div className="space-y-6 p-4">
      {/* Header */}
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

      {/* Traces Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Traces</CardTitle>
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
