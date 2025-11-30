import { WorkspaceAnalyticsDashboard } from "@/components/analytics/workspace-analytics-dashboard";

interface WorkspaceDashboardPageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspaceDashboardPage({
  params,
}: WorkspaceDashboardPageProps) {
  const { workspaceSlug } = await params;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to CognObserve. Monitor your AI applications.
        </p>
      </div>

      <WorkspaceAnalyticsDashboard workspaceSlug={workspaceSlug} />
    </div>
  );
}
