"use client";

import { useCallback, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import type { TraceListItem } from "@cognobserve/api/client";

const DEFAULT_LIMIT = 50;

interface UseTracesOptions {
  workspaceSlug: string;
  projectId: string;
  limit?: number;
}

interface UseTracesReturn {
  traces: TraceListItem[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
  refetch: () => void;
}

export function useTraces({
  workspaceSlug,
  projectId,
  limit = DEFAULT_LIMIT,
}: UseTracesOptions): UseTracesReturn {
  const [allTraces, setAllTraces] = useState<TraceListItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { data, isLoading, error, refetch } = trpc.traces.list.useQuery(
    { workspaceSlug, projectId, limit, cursor },
    { enabled: !!workspaceSlug && !!projectId }
  );

  // Reset when project changes
  useEffect(() => {
    setAllTraces([]);
    setCursor(undefined);
  }, [projectId, workspaceSlug]);

  // Merge data when cursor changes
  useEffect(() => {
    if (data?.items && cursor) {
      setAllTraces((prev) => [...prev, ...data.items]);
      setIsLoadingMore(false);
    }
  }, [data?.items, cursor]);

  const traces = cursor ? allTraces : (data?.items ?? []);

  const loadMore = useCallback(() => {
    if (!data?.nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    // Store current items before fetching next page
    // The useEffect will append new items when they arrive
    setAllTraces((prev) => (prev.length === 0 ? (data?.items ?? []) : prev));
    setCursor(data.nextCursor);
  }, [data, isLoadingMore]);

  const handleRefetch = useCallback(() => {
    setAllTraces([]);
    setCursor(undefined);
    refetch();
  }, [refetch]);

  return {
    traces,
    isLoading: isLoading && !cursor,
    error: error as Error | null,
    hasMore: data?.hasMore ?? false,
    loadMore,
    isLoadingMore,
    refetch: handleRefetch,
  };
}
