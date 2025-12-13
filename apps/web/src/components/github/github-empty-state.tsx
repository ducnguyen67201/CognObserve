"use client";

import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface GitHubEmptyStateProps {
  workspaceSlug: string;
}

export function GitHubEmptyState({ workspaceSlug }: GitHubEmptyStateProps) {
  const handleConnect = () => {
    // TODO: Implement GitHub App OAuth flow
    // This should redirect to GitHub App installation page
    // For now, we'll show a placeholder message
    const installUrl = `/api/github/install?workspace=${workspaceSlug}`;
    window.location.href = installUrl;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Repositories</h1>
        <p className="text-sm text-muted-foreground">
          Connect GitHub to index repositories for Root Cause Analysis.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Github className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Connect GitHub</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
            Connect your GitHub account to import repositories. Once connected,
            you can enable indexing for specific repositories to power Root
            Cause Analysis.
          </p>
          <Button onClick={handleConnect}>
            <Github className="mr-2 h-4 w-4" />
            Connect GitHub
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
