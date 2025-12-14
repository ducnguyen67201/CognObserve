/**
 * LLM Provider Factory
 *
 * Creates and manages LLM provider instances from configuration.
 * Centralizes provider initialization logic.
 */

import type { LLMProvider, ProviderName } from "./types";
import type { LLMCenterConfig } from "./config.types";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { ProviderNotConfiguredError } from "./errors";

// ============================================
// Types
// ============================================

export interface ProviderRegistry {
  providers: Map<ProviderName, LLMProvider>;
  defaultProvider: ProviderName;
}

// ============================================
// Factory
// ============================================

/**
 * Create provider instances from configuration.
 *
 * @param config - LLM Center configuration
 * @returns Provider registry with initialized providers
 * @throws Error if no providers configured
 * @throws ProviderNotConfiguredError if default provider not configured
 */
export function createProviders(config: LLMCenterConfig): ProviderRegistry {
  const providers = new Map<ProviderName, LLMProvider>();

  // Initialize OpenAI provider if configured
  if (config.providers.openai) {
    providers.set("openai", new OpenAIProvider(config.providers.openai));
  }

  // Initialize Anthropic provider if configured
  if (config.providers.anthropic) {
    providers.set("anthropic", new AnthropicProvider(config.providers.anthropic));
  }

  // Validate at least one provider is configured
  if (providers.size === 0) {
    throw new Error("At least one LLM provider must be configured");
  }

  // Validate default provider is configured
  if (!providers.has(config.defaultProvider)) {
    throw new ProviderNotConfiguredError(config.defaultProvider);
  }

  return {
    providers,
    defaultProvider: config.defaultProvider,
  };
}

/**
 * Get a provider by name from the registry.
 *
 * @param registry - Provider registry
 * @param name - Provider name
 * @returns Provider instance
 * @throws ProviderNotConfiguredError if provider not found
 */
export function getProvider(
  registry: ProviderRegistry,
  name: ProviderName
): LLMProvider {
  const provider = registry.providers.get(name);
  if (!provider) {
    throw new ProviderNotConfiguredError(name);
  }
  return provider;
}

/**
 * Check if a provider is configured in the registry.
 *
 * @param registry - Provider registry
 * @param name - Provider name
 * @returns True if provider exists
 */
export function hasProvider(
  registry: ProviderRegistry,
  name: ProviderName
): boolean {
  return registry.providers.has(name);
}

/**
 * Shutdown all providers in the registry.
 *
 * @param registry - Provider registry
 */
export async function shutdownProviders(
  registry: ProviderRegistry
): Promise<void> {
  for (const provider of registry.providers.values()) {
    await provider.shutdown?.();
  }
}
