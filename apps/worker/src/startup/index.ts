/**
 * Workflow Startup Module
 *
 * Centralizes all workflow initialization on worker startup.
 * Add new workflow starters here as the system grows.
 *
 * Architecture:
 * - Each workflow type has its own starter file (e.g., alert-workflows.ts)
 * - startAllWorkflows() orchestrates all starters
 * - Worker calls startAllWorkflows() after connecting to Temporal
 */

import { getTemporalClient, getTemporalConfig } from "@/temporal";
import { startAlertWorkflows } from "./alert-workflows";

export interface StartupResult {
  alerts: { started: number; skipped: number };
  // Add more workflow types here as needed:
  // schedules: { started: number; skipped: number };
  // retries: { started: number; skipped: number };
}

/**
 * Start all persistent/scheduled workflows.
 * Called once when the worker starts up.
 *
 * This includes:
 * - Alert evaluation workflows (long-running, one per enabled alert)
 * - Future: Scheduled reports, cleanup jobs, etc.
 */
export async function startAllWorkflows(): Promise<StartupResult> {
  console.log("[Startup] Initializing workflows...");

  const client = await getTemporalClient();
  const config = getTemporalConfig();

  // Start alert evaluation workflows
  console.log("[Startup] Starting alert workflows...");
  const alerts = await startAlertWorkflows(client, config.taskQueue);
  console.log(`[Startup] Alerts: ${alerts.started} started, ${alerts.skipped} already running`);

  // Add more workflow starters here as needed:
  // console.log("[Startup] Starting scheduled reports...");
  // const schedules = await startScheduledReports(client, config.taskQueue);

  const result: StartupResult = {
    alerts,
  };

  console.log("[Startup] All workflows initialized");
  return result;
}

// Re-export individual starters for manual use
export { startAlertWorkflows } from "./alert-workflows";
