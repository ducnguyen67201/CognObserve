import { Separator } from "@/components/ui/separator";
import { ApiKeyList } from "@/components/api-keys";

interface ProjectSettingsPageProps {
  params: Promise<{
    workspaceSlug: string;
    projectId: string;
  }>;
}

export default async function ProjectSettingsPage({
  params,
}: ProjectSettingsPageProps) {
  const { workspaceSlug, projectId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Project Settings</h1>
        <p className="text-muted-foreground">
          Manage your project settings and API keys.
        </p>
      </div>
      <Separator />

      <ApiKeyList workspaceSlug={workspaceSlug} projectId={projectId} />
    </div>
  );
}
