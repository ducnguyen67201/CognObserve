"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import type { SessionWithStats } from "@cognobserve/api/client";

const DEFAULT_LIMIT = 50;

interface UseSessionsOptions {
  workspaceSlug: string;
  projectId: string;
  limit?: number;
  search?: string;
}

interface UseSessionsReturn {
  sessions: SessionWithStats[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
  refetch: () => void;
}

export function useSessions({
  workspaceSlug,
  projectId,
  limit = DEFAULT_LIMIT,
  search,
}: UseSessionsOptions): UseSessionsReturn {
  const [allSessions, setAllSessions] = useState<SessionWithStats[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const appendedCursorRef = useRef<string | undefined>(undefined);

  const { data, isLoading, error, refetch } = trpc.sessions.list.useQuery(
    { workspaceSlug, projectId, limit, cursor, search },
    { enabled: !!workspaceSlug && !!projectId }
  );

  // Reset when project changes or search changes
  useEffect(() => {
    setAllSessions([]);
    setCursor(undefined);
    appendedCursorRef.current = undefined;
  }, [projectId, workspaceSlug, search]);

  // Merge data when cursor changes (prevent duplicate appends)
  useEffect(() => {
    if (data?.items && cursor && cursor !== appendedCursorRef.current) {
      setAllSessions((prev) => [...prev, ...data.items]);
      setIsLoadingMore(false);
      appendedCursorRef.current = cursor;
    }
  }, [data?.items, cursor]);

  const sessions = cursor ? allSessions : (data?.items ?? []);

  const loadMore = useCallback(() => {
    if (!data?.nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    // Store current items before fetching next page
    setAllSessions((prev) => (prev.length === 0 ? (data?.items ?? []) : prev));
    setCursor(data.nextCursor);
  }, [data, isLoadingMore]);

  const handleRefetch = useCallback(() => {
    setAllSessions([]);
    setCursor(undefined);
    refetch();
  }, [refetch]);

  return {
    sessions,
    isLoading: isLoading && !cursor,
    error: error as Error | null,
    hasMore: !!data?.nextCursor,
    loadMore,
    isLoadingMore,
    refetch: handleRefetch,
  };
}
