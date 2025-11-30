"use client";

import { useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { buildSpanTree, calculateTraceDuration } from "@/lib/traces";
import type { WaterfallSpan } from "@/lib/traces";
import type { TraceDetail } from "@cognobserve/api/client";

const STALE_TIME = 5 * 60 * 1000; // 5 minutes

interface UseTraceDetailOptions {
  workspaceSlug: string;
  projectId: string;
  traceId: string | null;
}

interface TraceStats {
  totalTokens: number;
  hasErrors: boolean;
  hasWarnings: boolean;
  duration: number | null;
  primaryModel: string | null;
  spanCount: number;
}

interface UseTraceDetailReturn {
  trace: TraceDetail | null;
  spanTree: WaterfallSpan[];
  stats: TraceStats | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook for fetching trace detail with computed span tree.
 * Optimized with staleTime since trace data is rarely updated.
 */
export function useTraceDetail({
  workspaceSlug,
  projectId,
  traceId,
}: UseTraceDetailOptions): UseTraceDetailReturn {
  const { data, isLoading, error, refetch } = trpc.traces.get.useQuery(
    { workspaceSlug, projectId, traceId: traceId! },
    {
      enabled: !!traceId && !!workspaceSlug && !!projectId,
      staleTime: STALE_TIME,
    }
  );

  // Compute trace statistics
  const stats = useMemo((): TraceStats | null => {
    if (!data) return null;

    const spans = data.spans;
    const totalTokens = spans.reduce((sum, s) => sum + (s.totalTokens ?? 0), 0);
    const hasErrors = spans.some((s) => s.level === "ERROR");
    const hasWarnings = spans.some((s) => s.level === "WARNING");
    const duration = calculateTraceDuration(spans);

    // Find primary model (most common)
    const modelCounts = spans
      .filter((s) => s.model)
      .reduce(
        (acc, s) => {
          acc[s.model!] = (acc[s.model!] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

    const primaryModel =
      Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      totalTokens,
      hasErrors,
      hasWarnings,
      duration,
      primaryModel,
      spanCount: spans.length,
    };
  }, [data]);

  // Build span tree for waterfall
  const spanTree = useMemo((): WaterfallSpan[] => {
    if (!data || !stats?.duration) return [];
    return buildSpanTree(data.spans, stats.duration);
  }, [data, stats?.duration]);

  return {
    trace: data ?? null,
    spanTree,
    stats,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
