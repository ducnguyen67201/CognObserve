// ============================================================
// TRACE ACTIVITIES - Orchestration for trace processing
// ============================================================
// IMPORTANT: Temporal activities are READ-ONLY for database.
// All mutations go through tRPC internal procedures.
// ============================================================

import { prisma } from "@cognobserve/db";
import { getInternalCaller } from "@/lib/trpc-caller";
import type { TraceWorkflowInput } from "../types";

/**
 * Persist trace and spans via internal tRPC.
 * Temporal activities are read-only - mutations go through tRPC.
 *
 * @returns The trace ID that was persisted
 */
export async function persistTrace(input: TraceWorkflowInput): Promise<string> {
  console.log(`[Activity:persistTrace] Processing trace: ${input.id} with ${input.spans.length} spans`);

  const caller = getInternalCaller();

  const result = await caller.internal.ingestTrace({
    trace: {
      id: input.id,
      projectId: input.projectId,
      name: input.name,
      timestamp: input.timestamp,
      sessionId: input.sessionId,
      userId: input.userId,
      user: input.user,
      metadata: input.metadata,
    },
    spans: input.spans.map((span) => ({
      id: span.id,
      parentSpanId: span.parentSpanId,
      name: span.name,
      startTime: span.startTime,
      endTime: span.endTime,
      input: span.input,
      output: span.output,
      metadata: span.metadata,
      model: span.model,
      modelParameters: span.modelParameters,
      promptTokens: span.promptTokens,
      completionTokens: span.completionTokens,
      totalTokens: span.totalTokens,
      level: span.level,
      statusMessage: span.statusMessage,
    })),
  });

  console.log(`[Activity:persistTrace] Trace ${input.id} persisted via tRPC`);
  return result.traceId;
}

/**
 * Calculate costs for spans with LLM model usage.
 * Calls tRPC to calculate and update costs.
 *
 * @returns Number of spans that had costs calculated
 */
export async function calculateTraceCosts(traceId: string): Promise<number> {
  console.log(`[Activity:calculateTraceCosts] Calculating costs for trace: ${traceId}`);

  const caller = getInternalCaller();
  const result = await caller.internal.calculateTraceCosts({ traceId });

  console.log(`[Activity:calculateTraceCosts] Updated costs for ${result.updatedCount} spans`);
  return result.updatedCount;
}

/**
 * Update daily cost summary aggregates for a project.
 * Calls tRPC to update summaries.
 */
export async function updateCostSummaries(
  projectId: string,
  dateStr: string
): Promise<void> {
  console.log(`[Activity:updateCostSummaries] Updating summaries for project: ${projectId}`);

  const caller = getInternalCaller();
  await caller.internal.updateCostSummaries({ projectId, date: dateStr });

  console.log(`[Activity:updateCostSummaries] Cost summaries updated via tRPC`);
}

// ============================================================
// READ-ONLY HELPER FUNCTIONS (Database reads are allowed)
// ============================================================

/**
 * Get trace details for validation (read-only)
 */
export async function getTraceDetails(traceId: string): Promise<{
  id: string;
  projectId: string;
  spanCount: number;
} | null> {
  const trace = await prisma.trace.findUnique({
    where: { id: traceId },
    select: {
      id: true,
      projectId: true,
      _count: { select: { spans: true } },
    },
  });

  if (!trace) return null;

  return {
    id: trace.id,
    projectId: trace.projectId,
    spanCount: trace._count.spans,
  };
}

/**
 * Check if a project exists (read-only)
 */
export async function projectExists(projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  return project !== null;
}
