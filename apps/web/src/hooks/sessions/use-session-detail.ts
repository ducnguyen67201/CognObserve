"use client";

import { useMemo } from "react";
import { trpc } from "@/lib/trpc/client";

interface UseSessionDetailOptions {
  workspaceSlug: string;
  sessionId: string | null;
}

interface SessionStats {
  traceCount: number;
  spanCount: number;
  totalTokens: number;
  totalCost: number;
  errorCount: number;
  warningCount: number;
  totalDuration: number | null;
  hasErrors: boolean;
  hasWarnings: boolean;
}

export function useSessionDetail({
  workspaceSlug,
  sessionId,
}: UseSessionDetailOptions) {
  const enabled = !!workspaceSlug && !!sessionId;

  const { data: timeline, isLoading, error, refetch } = trpc.sessions.timeline.useQuery(
    { workspaceSlug, id: sessionId ?? "" },
    { enabled }
  );

  const { data: session } = trpc.sessions.get.useQuery(
    { workspaceSlug, id: sessionId ?? "" },
    { enabled }
  );

  // Calculate stats from timeline data
  const stats = useMemo((): SessionStats | null => {
    if (!timeline) return null;

    let spanCount = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let errorCount = 0;
    let warningCount = 0;
    let minStartTime: Date | null = null;
    let maxEndTime: Date | null = null;

    for (const trace of timeline) {
      for (const span of trace.spans) {
        spanCount++;
        totalTokens += span.totalTokens ?? 0;
        totalCost += Number(span.totalCost ?? 0);

        if (span.level === "ERROR") errorCount++;
        if (span.level === "WARNING") warningCount++;

        if (span.startTime) {
          const startTime = new Date(span.startTime);
          if (!minStartTime || startTime < minStartTime) {
            minStartTime = startTime;
          }
        }
        if (span.endTime) {
          const endTime = new Date(span.endTime);
          if (!maxEndTime || endTime > maxEndTime) {
            maxEndTime = endTime;
          }
        }
      }
    }

    const totalDuration =
      minStartTime && maxEndTime
        ? maxEndTime.getTime() - minStartTime.getTime()
        : null;

    return {
      traceCount: timeline.length,
      spanCount,
      totalTokens,
      totalCost,
      errorCount,
      warningCount,
      totalDuration,
      hasErrors: errorCount > 0,
      hasWarnings: warningCount > 0,
    };
  }, [timeline]);

  return {
    session,
    timeline: timeline ?? [],
    stats,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
