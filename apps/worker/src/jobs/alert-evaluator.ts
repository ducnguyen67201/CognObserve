/**
 * Alert Evaluator
 *
 * Worker job that evaluates alerts and sends notifications.
 * Runs on a cron schedule (every 1 minute).
 */

import { prisma } from "@cognobserve/db";
import type { Alert, AlertChannel, Project } from "@cognobserve/db";
import {
  AlertingAdapter,
  getMetric,
  type AlertPayload,
  type AlertOperator,
  type AlertType,
} from "@cognobserve/api/lib/alerting";

const EVALUATION_INTERVAL_MS = 60_000; // 1 minute

type AlertWithRelations = Alert & {
  channels: AlertChannel[];
  project: Pick<Project, "id" | "name" | "workspaceId">;
};

/**
 * Alert evaluation worker job.
 * Runs every minute to check enabled alerts against thresholds.
 */
export class AlertEvaluator {
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;

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
   * Get alerts that are enabled and not in cooldown
   */
  private async getEligibleAlerts(): Promise<AlertWithRelations[]> {
    return prisma.alert.findMany({
      where: {
        enabled: true,
        OR: [
          { lastTriggeredAt: null },
          {
            lastTriggeredAt: {
              lt: new Date(Date.now() - 60_000), // At least 1 min ago
            },
          },
        ],
      },
      include: {
        channels: true,
        project: {
          select: { id: true, name: true, workspaceId: true },
        },
      },
    });
  }

  /**
   * Evaluate a single alert
   */
  private async evaluateAlert(alert: AlertWithRelations): Promise<void> {
    try {
      // Check cooldown
      if (alert.lastTriggeredAt) {
        const cooldownMs = alert.cooldownMins * 60 * 1000;
        const timeSinceLastTrigger =
          Date.now() - alert.lastTriggeredAt.getTime();
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

      // Send notifications
      const notifiedVia: string[] = [];
      for (const channel of alert.channels) {
        try {
          const adapter = AlertingAdapter(channel.provider);
          const result = await adapter.send(channel.config, payload);

          if (result.success) {
            notifiedVia.push(channel.provider);
            console.log(
              `AlertEvaluator: Sent notification via ${channel.provider}`
            );
          } else {
            console.error(
              `AlertEvaluator: Failed to send via ${channel.provider}:`,
              result.error
            );
          }
        } catch (error) {
          console.error(
            `AlertEvaluator: Error sending via ${channel.provider}:`,
            error
          );
        }
      }

      // Record history and update last triggered
      await prisma.$transaction([
        prisma.alertHistory.create({
          data: {
            alertId: alert.id,
            value: metric.value,
            threshold: alert.threshold,
            notifiedVia,
          },
        }),
        prisma.alert.update({
          where: { id: alert.id },
          data: { lastTriggeredAt: new Date() },
        }),
      ]);
    } catch (error) {
      console.error(
        `AlertEvaluator: Error evaluating alert ${alert.id}:`,
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
