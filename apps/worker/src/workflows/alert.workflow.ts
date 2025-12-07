// ============================================================
// ALERT EVALUATION WORKFLOW - Long-running alert monitoring
// ============================================================
// This workflow runs continuously, evaluating alerts periodically.
// It uses signals for external control (trigger, stop).
// Uses the same state machine as the original AlertEvaluator.
// ============================================================

import {
  proxyActivities,
  condition,
  defineSignal,
  setHandler,
  log,
} from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import type { AlertWorkflowInput } from "../temporal/types";
import { ACTIVITY_RETRY, WORKFLOW_TIMEOUTS } from "@cognobserve/shared";

// Proxy activities with retry configuration
const { evaluateAlert, transitionAlertState, dispatchNotification } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: WORKFLOW_TIMEOUTS.ALERT.ACTIVITY,
    retry: ACTIVITY_RETRY.ALERT,
  });

// ============================================================
// SIGNALS - External control for the workflow
// ============================================================

/**
 * Signal to trigger immediate evaluation (skip waiting for interval)
 */
export const triggerEvaluationSignal = defineSignal("triggerEvaluation");

/**
 * Signal to stop the workflow gracefully
 */
export const stopEvaluationSignal = defineSignal("stopEvaluation");

/**
 * Alert evaluation workflow.
 *
 * This is a long-running workflow that:
 * 1. Evaluates alert conditions periodically
 * 2. Transitions alert state based on results
 * 3. Dispatches notifications when needed
 *
 * The workflow runs until stopped via signal or if the alert is disabled/deleted.
 *
 * @param input - Alert configuration
 */
export async function alertEvaluationWorkflow(
  input: AlertWorkflowInput
): Promise<void> {
  // State for signal handling
  let shouldEvaluate = false;
  let shouldStop = false;

  // Register signal handlers
  setHandler(triggerEvaluationSignal, () => {
    log.info("Received trigger evaluation signal", { alertId: input.alertId });
    shouldEvaluate = true;
  });

  setHandler(stopEvaluationSignal, () => {
    log.info("Received stop signal", { alertId: input.alertId });
    shouldStop = true;
  });

  log.info("Starting alert evaluation workflow", {
    alertId: input.alertId,
    alertName: input.alertName,
    severity: input.severity,
    intervalMs: input.evaluationIntervalMs,
  });

  // Main evaluation loop
  while (!shouldStop) {
    // Wait for either:
    // - Evaluation interval to pass
    // - Manual trigger signal
    // - Stop signal
    await condition(
      () => shouldEvaluate || shouldStop,
      input.evaluationIntervalMs
    );

    // Check if we should stop
    if (shouldStop) {
      log.info("Stopping alert evaluation", { alertId: input.alertId });
      break;
    }

    // Reset trigger flag
    shouldEvaluate = false;

    // Perform evaluation cycle
    try {
      await evaluateAlertCycle(input);
    } catch (error) {
      // Log but don't stop - continue evaluating
      log.warn("Alert evaluation cycle failed", {
        alertId: input.alertId,
        error: String(error),
      });
    }
  }

  log.info("Alert evaluation workflow completed", { alertId: input.alertId });
}

/**
 * Single evaluation cycle: evaluate → transition → notify if needed
 */
async function evaluateAlertCycle(input: AlertWorkflowInput): Promise<void> {
  log.info("Running evaluation cycle", { alertId: input.alertId });

  // Step 1: Evaluate alert condition
  const result = await evaluateAlert(input.alertId);

  log.info("Evaluation result", {
    alertId: input.alertId,
    conditionMet: result.conditionMet,
    currentValue: result.currentValue,
    threshold: result.threshold,
    sampleCount: result.sampleCount,
  });

  // Skip if no samples
  if (result.sampleCount === 0) {
    log.info("No samples in window, skipping transition", {
      alertId: input.alertId,
    });
    return;
  }

  // Step 2: Transition state
  const transition = await transitionAlertState(input.alertId, result.conditionMet);

  log.info("State transition", {
    alertId: input.alertId,
    previousState: transition.previousState,
    newState: transition.newState,
    shouldNotify: transition.shouldNotify,
  });

  // Step 3: Dispatch notification if needed
  if (transition.shouldNotify) {
    const notified = await dispatchNotification(
      input.alertId,
      transition.newState,
      result.currentValue,
      result.threshold
    );

    log.info("Notification dispatched", {
      alertId: input.alertId,
      success: notified,
      state: transition.newState,
    });
  }
}
