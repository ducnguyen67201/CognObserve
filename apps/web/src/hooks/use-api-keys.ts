"use client";

import { trpc } from "@/lib/trpc/client";
import type { ApiKeyListItem, CreatedApiKey } from "@cognobserve/api";

interface CreateApiKeyInput {
  name: string;
  expiresAt?: string;
}

interface UseApiKeysReturn {
  apiKeys: ApiKeyListItem[];
  isLoading: boolean;
  error: Error | null;
  createApiKey: (input: CreateApiKeyInput) => Promise<CreatedApiKey>;
  deleteApiKey: (keyId: string) => Promise<void>;
  refetch: () => void;
}

/**
 * Hook for managing API keys using tRPC.
 * Provides type-safe queries and mutations.
 */
export function useApiKeys(projectId: string): UseApiKeysReturn {
  const utils = trpc.useUtils();

  // Query: List API keys
  const {
    data: apiKeys = [],
    isLoading,
    error,
    refetch,
  } = trpc.apiKeys.list.useQuery(
    { projectId },
    {
      enabled: !!projectId,
    }
  );

  // Mutation: Create API key
  const createMutation = trpc.apiKeys.create.useMutation({
    onSuccess: () => {
      // Invalidate the list query to refetch
      utils.apiKeys.list.invalidate({ projectId });
    },
  });

  // Mutation: Delete API key
  const deleteMutation = trpc.apiKeys.delete.useMutation({
    onSuccess: () => {
      // Invalidate the list query to refetch
      utils.apiKeys.list.invalidate({ projectId });
    },
  });

  const createApiKey = async (input: CreateApiKeyInput): Promise<CreatedApiKey> => {
    return createMutation.mutateAsync({
      projectId,
      name: input.name,
      expiresAt: input.expiresAt,
    });
  };

  const deleteApiKey = async (keyId: string): Promise<void> => {
    await deleteMutation.mutateAsync({
      projectId,
      keyId,
    });
  };

  return {
    apiKeys,
    isLoading,
    error: error as Error | null,
    createApiKey,
    deleteApiKey,
    refetch,
  };
}
