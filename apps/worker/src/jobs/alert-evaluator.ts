/**
 * Alert Evaluator
 *
 * Worker job that evaluates alerts and triggers notifications via web API.
 * Runs on a cron schedule (every 10 seconds).
 */

import { env } from "@/lib/env";
import { prisma } from "@cognobserve/db";
import type { Alert, Project } from "@cognobserve/db";
import {
  getMetric,
  type AlertPayload,
  type AlertOperator,
  type AlertType,
} from "@cognobserve/api/lib/alerting";

// Time constants
const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE;

const EVALUATION_INTERVAL_MS = 10 * MS_PER_SECOND; // 10 seconds
const MIN_COOLDOWN_MS = 1 * MS_PER_MINUTE; // Minimum 1 minute between triggers

const INTERNAL_SECRET_HEADER = "X-Internal-Secret";

/**
 * Convert minutes to milliseconds
 */
const minutesToMs = (minutes: number): number => minutes * MS_PER_MINUTE;

type AlertWithProject = Alert & {
  project: Pick<Project, "id" | "name" | "workspaceId">;
};

/**
 * Alert evaluation worker job.
 * Runs every 10 seconds to check enabled alerts against thresholds.
 */
export class AlertEvaluator {
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private triggerUrl: string;

  constructor() {
    this.triggerUrl = `${env.WEB_API_URL}/api/internal/alerts/trigger`;
  }

  /**
   * Start the evaluator loop
   */
  start(): void {
    if (this.isRunning) {
      console.warn("AlertEvaluator already running");
      return;
    }

    this.isRunning = true;
    console.log("AlertEvaluator started");

    // Run immediately, then on interval
    this.evaluate();
    this.intervalId = setInterval(
      () => this.evaluate(),
      EVALUATION_INTERVAL_MS
    );
  }

  /**
   * Stop the evaluator loop
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
    console.log("AlertEvaluator stopped");
  }

  /**
   * Run a single evaluation cycle
   */
  async evaluate(): Promise<void> {
    const startTime = Date.now();
    console.log("AlertEvaluator: Starting evaluation cycle");

    try {
      // Get all enabled alerts not in cooldown
      const alerts = await this.getEligibleAlerts();
      console.log(`AlertEvaluator: Found ${alerts.length} eligible alerts`);

      for (const alert of alerts) {
        await this.evaluateAlert(alert);
      }

      const duration = Date.now() - startTime;
      console.log(`AlertEvaluator: Cycle completed in ${duration}ms`);
    } catch (error) {
      console.error("AlertEvaluator: Error during evaluation", error);
    }
  }

  /**
   * Get alerts that are enabled and potentially ready to evaluate.
   * Uses MIN_COOLDOWN_MS as a pre-filter to reduce unnecessary processing.
   * The actual cooldown check happens in evaluateAlert() using alert.cooldownMins.
   */
  private async getEligibleAlerts(): Promise<AlertWithProject[]> {
    return prisma.alert.findMany({
      where: {
        enabled: true,
        OR: [
          { lastTriggeredAt: null },
          {
            lastTriggeredAt: {
              lt: new Date(Date.now() - MIN_COOLDOWN_MS),
            },
          },
        ],
      },
      include: {
        project: {
          select: { id: true, name: true, workspaceId: true },
        },
      },
    });
  }

  /**
   * Evaluate a single alert
   */
  private async evaluateAlert(alert: AlertWithProject): Promise<void> {
    try {
      // Check cooldown - skip if alert was triggered too recently
      if (alert.lastTriggeredAt) {
        const cooldownMs = minutesToMs(alert.cooldownMins);
        const timeSinceLastTrigger = Date.now() - alert.lastTriggeredAt.getTime();

        if (timeSinceLastTrigger < cooldownMs) {
          return; // Still in cooldown
        }
      }

      // Get current metric value
      const metric = await getMetric(
        alert.projectId,
        alert.type as AlertType,
        alert.windowMins
      );

      // Skip if no samples
      if (metric.sampleCount === 0) {
        return;
      }

      // Check threshold
      const isTriggered = this.checkThreshold(
        metric.value,
        alert.threshold,
        alert.operator as AlertOperator
      );

      if (!isTriggered) {
        return;
      }

      console.log(
        `AlertEvaluator: Alert "${alert.name}" triggered - ` +
          `value=${metric.value.toFixed(2)}, threshold=${alert.threshold}`
      );

      // Create alert payload
      const payload: AlertPayload = {
        alertId: alert.id,
        alertName: alert.name,
        projectId: alert.projectId,
        projectName: alert.project.name,
        type: alert.type as AlertType,
        threshold: alert.threshold,
        actualValue: metric.value,
        operator: alert.operator as AlertOperator,
        triggeredAt: new Date().toISOString(),
      };

      // Call web API to send notifications
      await this.triggerAlert(alert.id, payload);
    } catch (error) {
      console.error(
        `AlertEvaluator: Error evaluating alert ${alert.id}:`,
        error
      );
    }
  }

  /**
   * Call web API to trigger alert notifications
   */
  private async triggerAlert(
    alertId: string,
    payload: AlertPayload
  ): Promise<void> {
    try {
      const response = await fetch(this.triggerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [INTERNAL_SECRET_HEADER]: env.INTERNAL_API_SECRET,
        },
        body: JSON.stringify({ alertId, payload }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(
          `AlertEvaluator: Failed to trigger alert ${alertId}:`,
          error
        );
        return;
      }

      const result = (await response.json()) as { notifiedVia?: string[] };
      console.log(
        `AlertEvaluator: Alert triggered successfully - ` +
          `notified via: ${result.notifiedVia?.join(", ") || "none"}`
      );
    } catch (error) {
      console.error(
        `AlertEvaluator: Error calling trigger API for ${alertId}:`,
        error
      );
    }
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
}
