import { RepositoriesPage } from "@/components/github/repositories-page";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspaceRepositoriesPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  return <RepositoriesPage workspaceSlug={workspaceSlug} />;
}
