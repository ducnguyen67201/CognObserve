/**
 * Gmail Adapter
 *
 * Gmail/SMTP adapter for sending alert notifications via email.
 */

import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { BaseAlertingAdapter } from "../adapter";
import type { SendResult } from "../../../schemas/alerting";
import {
  AlertPayload,
  GmailConfigSchema,
  GmailConfig,
  ALERT_TYPE_LABELS,
  formatAlertValue,
  getOperatorSymbol,
} from "../../../schemas/alerting";

// SMTP Configuration from environment
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST ?? "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT ?? "587", 10),
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.SMTP_FROM,
};

/**
 * Gmail/SMTP adapter for sending alert notifications via email.
 *
 * @example
 * ```ts
 * const adapter = new GmailAdapter();
 * await adapter.send({ email: "user@example.com" }, payload);
 * ```
 */
export class GmailAdapter extends BaseAlertingAdapter {
  readonly provider = "GMAIL" as const;
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (!this.transporter) {
      if (!SMTP_CONFIG.user || !SMTP_CONFIG.pass) {
        throw new Error("SMTP credentials not configured");
      }

      this.transporter = nodemailer.createTransport({
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        secure: SMTP_CONFIG.port === 465,
        auth: {
          user: SMTP_CONFIG.user,
          pass: SMTP_CONFIG.pass,
        },
      });
    }
    return this.transporter;
  }

  /**
   * Validate Gmail-specific configuration
   */
  validateConfig(config: unknown): GmailConfig {
    return GmailConfigSchema.parse(config);
  }

  /**
   * Send alert notification via email
   */
  async send(config: unknown, payload: AlertPayload): Promise<SendResult> {
    try {
      const validConfig = this.validateConfig(config);
      const transporter = this.getTransporter();

      const html = this.buildEmailHtml(payload);
      const text = this.buildEmailText(payload);

      const info = await transporter.sendMail({
        from: SMTP_CONFIG.from ?? SMTP_CONFIG.user,
        to: validConfig.email,
        subject: this.buildSubject(payload),
        text,
        html,
      });

      return this.createSuccessResult(info.messageId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return this.createErrorResult(message);
    }
  }

  /**
   * Build email subject line
   */
  private buildSubject(payload: AlertPayload): string {
    const icon = this.getAlertIcon(payload.type);
    return `${icon} Alert: ${payload.alertName} - ${payload.projectName}`;
  }

  /**
   * Build HTML email body
   */
  private buildEmailHtml(payload: AlertPayload): string {
    const typeLabel = ALERT_TYPE_LABELS[payload.type];
    const operatorSymbol = getOperatorSymbol(payload.operator);
    const valueFormatted = formatAlertValue(payload.type, payload.actualValue);
    const thresholdFormatted = formatAlertValue(payload.type, payload.threshold);

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 20px; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; }
    .metric-box { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .metric-label { color: #6b7280; font-size: 14px; margin-bottom: 4px; }
    .metric-value { font-size: 32px; font-weight: bold; color: #dc2626; }
    .threshold { color: #6b7280; font-size: 14px; }
    .details { margin-top: 20px; }
    .details-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .details-label { color: #6b7280; }
    .footer { text-align: center; padding: 20px; color: #9ca3af; font-size: 12px; }
    .button { display: inline-block; background: #eab308; color: #1f2937; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Alert Triggered: ${payload.alertName}</h1>
    </div>
    <div class="content">
      <div class="metric-box">
        <div class="metric-label">${typeLabel}</div>
        <div class="metric-value">${valueFormatted}</div>
        <div class="threshold">Threshold: ${operatorSymbol} ${thresholdFormatted}</div>
      </div>

      <div class="details">
        <div class="details-row">
          <span class="details-label">Project</span>
          <span>${payload.projectName}</span>
        </div>
        <div class="details-row">
          <span class="details-label">Alert Type</span>
          <span>${typeLabel}</span>
        </div>
        <div class="details-row">
          <span class="details-label">Triggered At</span>
          <span>${new Date(payload.triggeredAt).toLocaleString()}</span>
        </div>
      </div>

      ${payload.dashboardUrl ? `<a href="${payload.dashboardUrl}" class="button">View Dashboard</a>` : ""}
    </div>
    <div class="footer">
      <p>This alert was sent by CognObserve</p>
      <p>Manage your alerts in project settings</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Build plain text email body
   */
  private buildEmailText(payload: AlertPayload): string {
    const typeLabel = ALERT_TYPE_LABELS[payload.type];
    const operatorSymbol = getOperatorSymbol(payload.operator);
    const valueFormatted = formatAlertValue(payload.type, payload.actualValue);
    const thresholdFormatted = formatAlertValue(payload.type, payload.threshold);

    return `
ALERT TRIGGERED: ${payload.alertName}

${typeLabel}: ${valueFormatted}
Threshold: ${operatorSymbol} ${thresholdFormatted}

Project: ${payload.projectName}
Triggered At: ${new Date(payload.triggeredAt).toLocaleString()}

${payload.dashboardUrl ? `View Dashboard: ${payload.dashboardUrl}` : ""}

---
This alert was sent by CognObserve
    `.trim();
  }

  /**
   * Get alert icon emoji
   */
  private getAlertIcon(type: AlertPayload["type"]): string {
    const icons: Record<AlertPayload["type"], string> = {
      ERROR_RATE: "🚨",
      LATENCY_P50: "⏱️",
      LATENCY_P95: "⏱️",
      LATENCY_P99: "⏱️",
    };
    return icons[type];
  }
}
