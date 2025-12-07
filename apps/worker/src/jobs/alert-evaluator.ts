/**
 * Alert Evaluator v2
 *
 * Worker job that evaluates alerts using a state machine and queue-based batching.
 * Uses dependency injection for testability and future extensibility.
 *
 * State Machine:
 *   INACTIVE → PENDING → FIRING → RESOLVED
 *
 * Features:
 * - Pending duration: Condition must persist before firing
 * - Cooldown: Minimum time between notifications
 * - Severity-based dispatch: CRITICAL flushes faster than LOW
 * - Queue-based batching: Reduces API calls
 */

import type {
  IAlertStore,
  ITriggerQueue,
  IDispatcher,
  IScheduler,
  AlertWithProject,
} from "@cognobserve/api/lib/alerting";
import {
  SEVERITY_DEFAULTS,
  type AlertSeverity,
  type AlertState,
  type AlertOperator,
  type TriggerQueueItem,
} from "@cognobserve/api/schemas";

// Time constants
const MS_PER_MINUTE = 60_000;

// Evaluation runs every 10 seconds
const EVALUATION_INTERVAL_MS = 10_000;

// Batch size for dispatch
const DISPATCH_BATCH_SIZE = 100;

/**
 * Alert Evaluator with state machine and queue-based batching
 */
export class AlertEvaluator {
  private isRunning = false;

  constructor(
    private store: IAlertStore,
    private queue: ITriggerQueue,
    private dispatcher: IDispatcher,
    private scheduler: IScheduler
  ) {}

  /**
   * Start the evaluator and dispatch loops
   */
  start(): void {
    if (this.isRunning) {
      console.warn("AlertEvaluator already running");
      return;
    }

    this.isRunning = true;
    console.log("AlertEvaluator v2 started");

    // Single evaluation loop for all alerts
    this.scheduler.schedule("evaluate", EVALUATION_INTERVAL_MS, () =>
      this.evaluateAll()
    );

    // Severity-based dispatch loops (flush queues at different intervals)
    this.scheduler.schedule(
      "dispatch-critical",
      SEVERITY_DEFAULTS.CRITICAL.flushIntervalMs,
      () => this.flush("CRITICAL")
    );
    this.scheduler.schedule(
      "dispatch-high",
      SEVERITY_DEFAULTS.HIGH.flushIntervalMs,
      () => this.flush("HIGH")
    );
    this.scheduler.schedule(
      "dispatch-medium",
      SEVERITY_DEFAULTS.MEDIUM.flushIntervalMs,
      () => this.flush("MEDIUM")
    );
    this.scheduler.schedule(
      "dispatch-low",
      SEVERITY_DEFAULTS.LOW.flushIntervalMs,
      () => this.flush("LOW")
    );
  }

  /**
   * Stop all scheduled tasks
   */
  stop(): void {
    this.scheduler.cancelAll();
    this.isRunning = false;
    console.log("AlertEvaluator v2 stopped");
  }

  /**
   * Evaluate all enabled alerts
   */
  private async evaluateAll(): Promise<void> {
    const startTime = Date.now();

    try {
      const alerts = await this.store.getEligibleAlerts();
      console.log(`AlertEvaluator: Evaluating ${alerts.length} alerts`);

      for (const alert of alerts) {
        await this.evaluateAlert(alert);
      }

      const duration = Date.now() - startTime;
      console.log(`AlertEvaluator: Evaluation completed in ${duration}ms`);
    } catch (error) {
      console.error("AlertEvaluator: Error during evaluation", error);
    }
  }

  /**
   * Evaluate a single alert and update its state
   */
  private async evaluateAlert(alert: AlertWithProject): Promise<void> {
    const evaluationStart = Date.now();

    try {
      // Get current metric value
      const metric = await this.store.getMetric(
        alert.projectId,
        alert.type,
        alert.windowMins
      );

      // Debug logging
      console.log(
        `  [${alert.name}] type=${alert.type} window=${alert.windowMins}min ` +
        `value=${metric.value.toFixed(2)} samples=${metric.sampleCount} ` +
        `threshold=${alert.threshold} op=${alert.operator} state=${alert.state}`
      );

      // Skip if no samples
      if (metric.sampleCount === 0) {
        console.log(`  [${alert.name}] No samples in window, skipping`);
        return;
      }

      // Check if threshold condition is met
      const conditionMet = this.checkThreshold(
        metric.value,
        alert.threshold,
        alert.operator
      );

      // Compute next state based on state machine
      const newState = this.computeNextState(alert, conditionMet);

      // Only process if state changed
      if (newState !== alert.state) {
        await this.transitionState(alert, newState, metric.value, metric.sampleCount);
      } else {
        // Just update lastEvaluatedAt
        await this.store.updateAlertState(alert.id, alert.state, {
          evaluationMs: Date.now() - evaluationStart,
          sampleCount: metric.sampleCount,
          value: metric.value,
        });

        // Check for re-notification when staying in FIRING
        if (alert.state === "FIRING" && conditionMet) {
          await this.maybeRenotify(alert, metric.value);
        }
      }
    } catch (error) {
      console.error(
        `AlertEvaluator: Error evaluating alert ${alert.id}:`,
        error
      );
    }
  }

  /**
   * State machine: Compute the next state based on current state and condition
   *
   * Transitions:
   *   INACTIVE + condition MET     → PENDING
   *   PENDING  + condition MET + time >= pendingDuration → FIRING
   *   PENDING  + condition NOT MET → INACTIVE
   *   FIRING   + condition MET     → FIRING (check cooldown for re-enqueue)
   *   FIRING   + condition NOT MET → RESOLVED
   *   RESOLVED + condition MET     → PENDING
   *   RESOLVED + condition NOT MET → INACTIVE
   */
  private computeNextState(
    alert: AlertWithProject,
    conditionMet: boolean
  ): AlertState {
    const currentState = alert.state;
    const pendingMs = this.getPendingDuration(alert);

    switch (currentState) {
      case "INACTIVE":
        return conditionMet ? "PENDING" : "INACTIVE";

      case "PENDING": {
        if (!conditionMet) {
          return "INACTIVE";
        }
        // Check if pending duration has elapsed
        const pendingDuration = alert.stateChangedAt
          ? Date.now() - alert.stateChangedAt.getTime()
          : 0;
        console.log(
          `    pendingCheck: stateChangedAt=${alert.stateChangedAt?.toISOString()} ` +
          `pendingDuration=${pendingDuration}ms pendingMs=${pendingMs}ms ` +
          `shouldFire=${pendingDuration >= pendingMs}`
        );
        return pendingDuration >= pendingMs ? "FIRING" : "PENDING";
      }

      case "FIRING":
        return conditionMet ? "FIRING" : "RESOLVED";

      case "RESOLVED":
        if (conditionMet) {
          return "PENDING";
        }
        return "INACTIVE";

      default:
        return "INACTIVE";
    }
  }

  /**
   * Handle state transition and enqueue for notification if needed
   */
  private async transitionState(
    alert: AlertWithProject,
    newState: AlertState,
    currentValue: number,
    sampleCount: number
  ): Promise<void> {
    const previousState = alert.state;
    console.log(`Alert "${alert.name}": ${previousState} → ${newState}`);

    // Update state in database
    await this.store.updateAlertState(alert.id, newState, {
      value: currentValue,
      sampleCount,
      stateChanged: true,
    });

    // Enqueue for notification when transitioning to FIRING
    if (newState === "FIRING" && previousState !== "FIRING") {
      await this.enqueueForNotification(alert, currentValue, previousState, newState);
    }

    // Record history for significant state changes
    if (this.isSignificantTransition(previousState, newState)) {
      await this.store.recordHistory({
        alertId: alert.id,
        value: currentValue,
        threshold: alert.threshold,
        state: newState,
        previousState,
        resolved: newState === "RESOLVED",
        resolvedAt: newState === "RESOLVED" ? new Date() : null,
        notifiedVia: [], // Will be updated by dispatcher
        sampleCount,
      });
    }
  }

  /**
   * Enqueue alert for notification
   */
  private async enqueueForNotification(
    alert: AlertWithProject,
    currentValue: number,
    previousState: AlertState,
    newState: AlertState
  ): Promise<void> {
    const item: TriggerQueueItem = {
      alertId: alert.id,
      alertName: alert.name,
      projectId: alert.projectId,
      projectName: alert.project.name,
      severity: alert.severity,
      metricType: alert.type,
      threshold: alert.threshold,
      actualValue: currentValue,
      operator: alert.operator,
      previousState,
      newState,
      queuedAt: new Date(),
      channelIds: alert.channelLinks.map((link) => link.channelId),
    };

    await this.queue.enqueue(item);
    console.log(
      `Alert "${alert.name}" enqueued for notification (severity: ${alert.severity})`
    );
  }

  /**
   * Check if we should re-notify for an alert that's still firing
   */
  private async maybeRenotify(
    alert: AlertWithProject,
    currentValue: number
  ): Promise<void> {
    const cooldownMs = this.getCooldownDuration(alert);
    const timeSinceLastTrigger = alert.lastTriggeredAt
      ? Date.now() - alert.lastTriggeredAt.getTime()
      : Infinity;

    if (timeSinceLastTrigger >= cooldownMs) {
      await this.enqueueForNotification(alert, currentValue, "FIRING", "FIRING");
    }
  }

  /**
   * Flush the queue for a specific severity level
   */
  private async flush(severity: AlertSeverity): Promise<void> {
    try {
      const items = await this.queue.dequeue(severity, DISPATCH_BATCH_SIZE);

      if (items.length === 0) {
        return;
      }

      console.log(`Dispatching ${items.length} ${severity} alerts`);
      const result = await this.dispatcher.dispatch(items);

      if (!result.success) {
        console.error(
          `Dispatch failed for ${severity}: ${result.errors?.join(", ")}`
        );
      } else {
        console.log(
          `Dispatched ${result.sent} ${severity} alerts (${result.failed} failed)`
        );
      }
    } catch (error) {
      console.error(`Error flushing ${severity} queue:`, error);
    }
  }

  /**
   * Get the pending duration in milliseconds for an alert
   */
  private getPendingDuration(alert: AlertWithProject): number {
    const pendingMins =
      alert.pendingMins ?? SEVERITY_DEFAULTS[alert.severity].pendingMins;
    return pendingMins * MS_PER_MINUTE;
  }

  /**
   * Get the cooldown duration in milliseconds for an alert
   */
  private getCooldownDuration(alert: AlertWithProject): number {
    const cooldownMins =
      alert.cooldownMins ?? SEVERITY_DEFAULTS[alert.severity].cooldownMins;
    return cooldownMins * MS_PER_MINUTE;
  }

  /**
   * Check if value exceeds threshold based on operator
   */
  private checkThreshold(
    value: number,
    threshold: number,
    operator: AlertOperator
  ): boolean {
    switch (operator) {
      case "GREATER_THAN":
        return value > threshold;
      case "LESS_THAN":
        return value < threshold;
      default:
        return false;
    }
  }

  /**
   * Check if a state transition is significant enough to record in history
   */
  private isSignificantTransition(
    from: AlertState,
    to: AlertState
  ): boolean {
    // Record when transitioning to FIRING or RESOLVED
    if (to === "FIRING" || to === "RESOLVED") {
      return true;
    }
    // Record when transitioning from FIRING to any other state
    if (from === "FIRING") {
      return true;
    }
    return false;
  }
}
