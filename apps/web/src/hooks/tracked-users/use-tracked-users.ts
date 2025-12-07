"use client";

import { useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import type { TrackedUserWithStats } from "@cognobserve/api/client";

const DEFAULT_LIMIT = 50;

interface UseTrackedUsersOptions {
  workspaceSlug: string;
  projectId: string;
  limit?: number;
  search?: string;
}

interface UseTrackedUsersReturn {
  users: TrackedUserWithStats[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
  refetch: () => void;
}

/**
 * Hook for fetching tracked users with infinite scroll support.
 * Uses tRPC's useInfiniteQuery for proper pagination without duplicates.
 */
export function useTrackedUsers({
  workspaceSlug,
  projectId,
  limit = DEFAULT_LIMIT,
  search,
}: UseTrackedUsersOptions): UseTrackedUsersReturn {
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = trpc.trackedUsers.list.useInfiniteQuery(
    { workspaceSlug, projectId, limit, search },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: !!workspaceSlug && !!projectId,
    }
  );

  // Flatten all pages into a single array of users
  const users = useMemo(() => {
    return data?.pages.flatMap((page) => page.items) ?? [];
  }, [data?.pages]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleRefetch = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    users,
    isLoading,
    error: error as Error | null,
    hasMore: !!hasNextPage,
    loadMore,
    isLoadingMore: isFetchingNextPage,
    refetch: handleRefetch,
  };
}
