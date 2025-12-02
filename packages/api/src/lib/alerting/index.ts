/**
 * Alerting Module
 *
 * Main entry point for the alerting system.
 */

// Re-export adapter
export { BaseAlertingAdapter, type IAlertingAdapter } from "./adapter";

// Re-export registry
export { AdapterRegistry, getAdapter } from "./registry";

// Re-export metrics service
export { getMetric, getAllMetrics } from "./metrics-service";

// Re-export schemas and types
export * from "../../schemas/alerting";

import type { ChannelProvider } from "../../schemas/alerting";
import type { IAlertingAdapter } from "./adapter";
import { AdapterRegistry } from "./registry";

/**
 * Main entry point for getting an alerting adapter.
 *
 * @example
 * ```ts
 * import { AlertingAdapter } from "@cognobserve/api/lib/alerting";
 *
 * // Get adapter by provider
 * const discord = AlertingAdapter("DISCORD");
 * await discord.send(config, payload);
 *
 * // Or use the registry directly
 * const gmail = AlertingAdapter("GMAIL");
 * await gmail.sendTest({ email: "user@example.com" });
 * ```
 */
export function AlertingAdapter(provider: ChannelProvider): IAlertingAdapter {
  return AdapterRegistry.get(provider);
}

// Attach static methods for convenience
AlertingAdapter.register = AdapterRegistry.register.bind(AdapterRegistry);
AlertingAdapter.has = AdapterRegistry.has.bind(AdapterRegistry);
AlertingAdapter.getProviders = AdapterRegistry.getRegisteredProviders.bind(AdapterRegistry);
