// ============================================================
// TRACE WORKFLOW - Orchestrates trace ingestion
// ============================================================
// Workflows are pure functions that orchestrate activities.
// They must be deterministic and cannot have side effects.
// All I/O is done through activities.
// ============================================================

import { proxyActivities, log } from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import type { TraceWorkflowInput, TraceWorkflowResult } from "../temporal/types";
import { ACTIVITY_RETRY, WORKFLOW_TIMEOUTS } from "@cognobserve/shared";

// Proxy activities with retry configuration
const { persistTrace, calculateTraceCosts, updateCostSummaries } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: WORKFLOW_TIMEOUTS.TRACE.ACTIVITY,
    retry: ACTIVITY_RETRY.DEFAULT,
  });

/**
 * Trace ingestion workflow.
 *
 * Steps:
 * 1. Persist trace and spans (critical - retries on failure)
 * 2. Calculate costs for LLM spans (non-critical - logged on failure)
 * 3. Update daily cost summaries (non-critical - logged on failure)
 *
 * @param input - Trace data from ingest service
 * @returns Result with trace ID and processing stats
 */
export async function traceWorkflow(
  input: TraceWorkflowInput
): Promise<TraceWorkflowResult> {
  log.info("Starting trace workflow", {
    traceId: input.id,
    projectId: input.projectId,
    spanCount: input.spans.length,
  });

  // Step 1: Persist trace and spans (CRITICAL - will retry)
  const traceId = await persistTrace(input);
  log.info("Trace persisted successfully", { traceId });

  // Step 2: Calculate costs (NON-CRITICAL - log errors but don't fail)
  let costsCalculated = 0;
  try {
    costsCalculated = await calculateTraceCosts(traceId);
    log.info("Costs calculated", { traceId, costsCalculated });
  } catch (error) {
    log.warn("Cost calculation failed (non-critical)", {
      traceId,
      error: String(error),
    });
  }

  // Step 3: Update summaries (NON-CRITICAL - log errors but don't fail)
  try {
    await updateCostSummaries(input.projectId, input.timestamp);
    log.info("Cost summaries updated", { projectId: input.projectId });
  } catch (error) {
    log.warn("Summary update failed (non-critical)", {
      projectId: input.projectId,
      error: String(error),
    });
  }

  log.info("Trace workflow completed", {
    traceId,
    spanCount: input.spans.length,
    costsCalculated,
  });

  return {
    traceId,
    spanCount: input.spans.length,
    costsCalculated,
  };
}
