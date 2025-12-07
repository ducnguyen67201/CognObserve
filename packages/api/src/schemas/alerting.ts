/**
 * Alerting Schemas
 *
 * Zod schemas for alerting system - source of truth for types.
 */

import { z } from "zod";

/**
 * Alert types - metrics that can be monitored
 */
export const AlertTypeSchema = z.enum([
  "ERROR_RATE",
  "LATENCY_P50",
  "LATENCY_P95",
  "LATENCY_P99",
]);
export type AlertType = z.infer<typeof AlertTypeSchema>;

/**
 * Alert operators - comparison operators for thresholds
 */
export const AlertOperatorSchema = z.enum(["GREATER_THAN", "LESS_THAN"]);
export type AlertOperator = z.infer<typeof AlertOperatorSchema>;

/**
 * Channel providers - notification channels
 */
export const ChannelProviderSchema = z.enum([
  "GMAIL",
  "DISCORD",
  "SLACK",
  "PAGERDUTY",
  "WEBHOOK",
]);
export type ChannelProvider = z.infer<typeof ChannelProviderSchema>;

/**
 * All possible channel providers (derived from schema)
 */
export const CHANNEL_PROVIDERS = ChannelProviderSchema.options;

/**
 * Provider-specific config schemas
 */
export const GmailConfigSchema = z.object({
  email: z.string().email("Invalid email address"),
});
export type GmailConfig = z.infer<typeof GmailConfigSchema>;

export const DiscordConfigSchema = z.object({
  webhookUrl: z
    .string()
    .url("Invalid URL")
    .refine(
      (url) => url.startsWith("https://discord.com/api/webhooks/"),
      "Must be a Discord webhook URL"
    ),
});
export type DiscordConfig = z.infer<typeof DiscordConfigSchema>;

export const SlackConfigSchema = z.object({
  webhookUrl: z
    .string()
    .url("Invalid URL")
    .refine(
      (url) => url.startsWith("https://hooks.slack.com/"),
      "Must be a Slack webhook URL"
    ),
});
export type SlackConfig = z.infer<typeof SlackConfigSchema>;

export const WebhookConfigSchema = z.object({
  url: z.string().url("Invalid URL"),
  secret: z.string().optional(),
});
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;

/**
 * Alert notification payload - sent to adapters
 */
export const AlertPayloadSchema = z.object({
  alertId: z.string(),
  alertName: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  type: AlertTypeSchema,
  threshold: z.number(),
  actualValue: z.number(),
  operator: AlertOperatorSchema,
  triggeredAt: z.string().datetime(),
  dashboardUrl: z.string().url().optional(),
});
export type AlertPayload = z.infer<typeof AlertPayloadSchema>;

/**
 * Metric result from MetricsService
 */
export const MetricResultSchema = z.object({
  value: z.number(),
  sampleCount: z.number(),
  windowStart: z.date(),
  windowEnd: z.date(),
});
export type MetricResult = z.infer<typeof MetricResultSchema>;

/**
 * Send result from AlertingAdapter
 */
export const SendResultSchema = z.object({
  success: z.boolean(),
  provider: ChannelProviderSchema,
  error: z.string().optional(),
  messageId: z.string().optional(),
});
export type SendResult = z.infer<typeof SendResultSchema>;

/**
 * Type labels for display
 */
export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  ERROR_RATE: "Error Rate",
  LATENCY_P50: "Latency (P50)",
  LATENCY_P95: "Latency (P95)",
  LATENCY_P99: "Latency (P99)",
};

/**
 * Format value based on alert type
 */
export function formatAlertValue(type: AlertType, value: number): string {
  if (type === "ERROR_RATE") {
    return `${value.toFixed(2)}%`;
  }
  return `${value.toFixed(0)}ms`;
}

/**
 * Get operator symbol
 */
export function getOperatorSymbol(operator: AlertOperator): string {
  return operator === "GREATER_THAN" ? ">" : "<";
}
