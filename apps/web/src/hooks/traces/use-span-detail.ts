"use client";

import { trpc } from "@/lib/trpc/client";
import type { SpanDetail } from "@cognobserve/api/client";

interface UseSpanDetailOptions {
  workspaceSlug: string;
  projectId: string;
  traceId: string;
  spanId: string | null;
}

interface UseSpanDetailReturn {
  span: SpanDetail | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook for lazy loading full span details (input/output/metadata).
 * Only fetches when spanId is provided (on user click).
 * Uses Infinity staleTime since span data is immutable.
 */
export function useSpanDetail({
  workspaceSlug,
  projectId,
  traceId,
  spanId,
}: UseSpanDetailOptions): UseSpanDetailReturn {
  const { data, isLoading, error } = trpc.traces.getSpanDetail.useQuery(
    {
      workspaceSlug,
      projectId,
      traceId,
      spanId: spanId!,
    },
    {
      enabled: !!spanId && !!workspaceSlug && !!projectId && !!traceId,
      staleTime: Infinity, // Span data is immutable
    }
  );

  return {
    span: data ?? null,
    isLoading: !!spanId && isLoading,
    error: error as Error | null,
  };
}
