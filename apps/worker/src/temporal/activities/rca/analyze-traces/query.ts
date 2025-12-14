/**
 * Span Query Functions
 *
 * Database queries for fetching spans within an analysis window.
 */

import { prisma } from "@cognobserve/db";
import { MAX_SPANS_TO_ANALYZE } from "@cognobserve/api/schemas";
import type { SpanRow } from "../types";

/**
 * Query spans within the analysis window.
 * Joins with trace to get trace name and filters by project.
 */
export async function querySpansInWindow(
  projectId: string,
  windowStart: Date,
  windowEnd: Date
): Promise<SpanRow[]> {
  const rows = await prisma.span.findMany({
    where: {
      trace: { projectId },
      startTime: { gte: windowStart, lte: windowEnd },
    },
    select: {
      id: true,
      name: true,
      level: true,
      statusMessage: true,
      model: true,
      startTime: true,
      endTime: true,
      promptTokens: true,
      completionTokens: true,
      totalCost: true,
      output: true,
      trace: { select: { id: true, name: true } },
    },
    take: MAX_SPANS_TO_ANALYZE,
    orderBy: { startTime: "desc" },
  });

  return rows.map((r) => ({
    id: r.id,
    traceId: r.trace.id,
    traceName: r.trace.name,
    name: r.name,
    level: r.level,
    statusMessage: r.statusMessage,
    model: r.model,
    startTime: r.startTime,
    endTime: r.endTime,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    totalCost: r.totalCost,
    output: r.output,
  }));
}
