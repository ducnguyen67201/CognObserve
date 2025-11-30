import { TracesTable } from "@/components/traces/traces-table";

interface TracesPageProps {
  params: Promise<{
    workspaceSlug: string;
    projectId: string;
  }>;
}

export default async function TracesPage({ params }: TracesPageProps) {
  const { workspaceSlug, projectId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Traces</h1>
        <p className="text-muted-foreground">
          View and debug trace executions for this project.
        </p>
      </div>

      <TracesTable workspaceSlug={workspaceSlug} projectId={projectId} />
    </div>
  );
}
