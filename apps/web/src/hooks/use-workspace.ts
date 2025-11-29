"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import type { WorkspaceListItem, CreateWorkspaceInput } from "@cognobserve/api/client";

interface UseWorkspaceReturn {
  workspaces: WorkspaceListItem[];
  isLoading: boolean;
  error: Error | null;
  createWorkspace: (input: CreateWorkspaceInput) => Promise<WorkspaceListItem>;
  checkSlugAvailable: (slug: string) => Promise<boolean>;
  switchWorkspace: (slug: string) => void;
  refetch: () => void;
}

/**
 * Hook for managing workspaces using tRPC.
 * Provides type-safe queries and mutations.
 */
export function useWorkspace(): UseWorkspaceReturn {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Query: List workspaces with details
  const {
    data: workspaces = [],
    isLoading,
    error,
    refetch,
  } = trpc.workspaces.listWithDetails.useQuery();

  // Mutation: Create workspace
  const createMutation = trpc.workspaces.create.useMutation({
    onSuccess: () => {
      // Invalidate to refetch the list
      utils.workspaces.listWithDetails.invalidate();
    },
  });

  const createWorkspace = async (
    input: CreateWorkspaceInput
  ): Promise<WorkspaceListItem> => {
    return createMutation.mutateAsync(input);
  };

  const checkSlugAvailable = async (slug: string): Promise<boolean> => {
    try {
      const result = await utils.workspaces.checkSlug.fetch({ slug });
      return result.available;
    } catch {
      return false;
    }
  };

  const switchWorkspace = (slug: string): void => {
    router.push(`/workspace/${slug}`);
  };

  return {
    workspaces,
    isLoading,
    error: error as Error | null,
    createWorkspace,
    checkSlugAvailable,
    switchWorkspace,
    refetch,
  };
}
