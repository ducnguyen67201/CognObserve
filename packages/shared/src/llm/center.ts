/**
 * LLM Center - Centralized LLM Processing Service
 *
 * Single entry point for all LLM operations with:
 * - Multi-provider support (OpenAI, Anthropic)
 * - Smart routing with automatic fallback
 * - Structured outputs with Zod validation
 * - Centralized cost tracking and usage metrics
 * - Built-in rate limiting and retry logic
 */

import type { z } from "zod";
import type {
  LLMProvider,
  ProviderName,
  EmbedOptions,
  EmbedResult,
  CompleteOptions,
  CompleteResult,
  ChatOptions,
  ChatResult,
  Message,
  UsageEvent,
  UsageStats,
} from "./types";
import type { LLMCenterConfig } from "./config.types";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { SmartRouter } from "./router";
import { RateLimiter } from "./utils/rate-limiter";
import { ProviderNotConfiguredError } from "./errors";

// ============================================
// LLM Center
// ============================================

/**
 * LLM Center - Centralized LLM Processing Service
 *
 * @example
 * ```typescript
 * import { createLLMCenter } from "@cognobserve/shared/llm";
 *
 * const llm = createLLMCenter({
 *   defaultProvider: "openai",
 *   providers: {
 *     openai: { apiKey: process.env.OPENAI_API_KEY! },
 *     anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! },
 *   },
 *   routing: {
 *     embed: { primary: { provider: "openai", model: "text-embedding-3-small" } },
 *     chat: { primary: { provider: "anthropic", model: "claude-3-5-sonnet-20241022" } },
 *     complete: { primary: { provider: "openai", model: "gpt-4o-mini" } },
 *   },
 * });
 *
 * // Generate embeddings
 * const embedResult = await llm.embed(["Hello world"]);
 *
 * // Chat with structured output
 * const chatResult = await llm.chat(
 *   [{ role: "user", content: "Analyze this text" }],
 *   { schema: MySchema }
 * );
 * ```
 */
export class LLMCenter {
  private providers: Map<ProviderName, LLMProvider> = new Map();
  private router: SmartRouter;
  private config: LLMCenterConfig;
  private rateLimiter?: RateLimiter;
  private usageEvents: UsageEvent[] = [];

  constructor(config: LLMCenterConfig) {
    this.config = config;

    // Initialize providers
    if (config.providers.openai) {
      this.providers.set("openai", new OpenAIProvider(config.providers.openai));
    }
    if (config.providers.anthropic) {
      this.providers.set(
        "anthropic",
        new AnthropicProvider(config.providers.anthropic)
      );
    }

    // Validate that at least one provider is configured
    if (this.providers.size === 0) {
      throw new Error("At least one LLM provider must be configured");
    }

    // Validate default provider is configured
    if (!this.providers.has(config.defaultProvider)) {
      throw new ProviderNotConfiguredError(config.defaultProvider);
    }

    // Initialize router
    this.router = new SmartRouter({
      providers: this.providers,
      config,
    });

    // Initialize rate limiter
    if (config.rateLimiting?.enabled) {
      this.rateLimiter = new RateLimiter({
        requestsPerMinute: config.rateLimiting.requestsPerMinute ?? 500,
        tokensPerMinute: config.rateLimiting.tokensPerMinute,
      });
    }
  }

  /**
   * Generate embeddings for texts.
   *
   * @param texts - Array of texts to embed
   * @param options - Embedding options (provider, model, batchSize)
   * @returns Embedding result with vectors and usage info
   *
   * @example
   * ```typescript
   * const result = await llm.embed(["Hello", "World"]);
   * console.log(result.embeddings); // [[0.1, 0.2, ...], [0.3, 0.4, ...]]
   * console.log(result.usage.estimatedCost); // 0.0000002
   * ```
   */
  async embed(texts: string[], options?: EmbedOptions): Promise<EmbedResult> {
    const startTime = Date.now();

    // Apply rate limiting
    await this.rateLimiter?.acquire();

    try {
      const result = await this.router.routeEmbed(texts, options);

      // Track usage
      this.trackUsage({
        provider: result.provider,
        model: result.model,
        operation: "embed",
        tokens: { total: result.usage.totalTokens },
        cost: result.usage.estimatedCost,
        latencyMs: Date.now() - startTime,
        success: true,
      });

      return result;
    } catch (error) {
      // Track failed attempt
      this.trackUsage({
        provider: options?.provider ?? this.config.defaultProvider,
        model: options?.model ?? "unknown",
        operation: "embed",
        tokens: { total: 0 },
        cost: 0,
        latencyMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Generate completion with optional structured output.
   *
   * @param prompt - The prompt text
   * @param options - Completion options (provider, model, schema, temperature)
   * @returns Completion result with data and usage info
   *
   * @example
   * ```typescript
   * // Simple completion
   * const result = await llm.complete("Write a haiku about coding");
   *
   * // Structured output
   * const schema = z.object({
   *   sentiment: z.enum(["positive", "negative", "neutral"]),
   *   confidence: z.number(),
   * });
   * const result = await llm.complete("Analyze: I love this!", { schema });
   * console.log(result.data.sentiment); // "positive"
   * ```
   */
  async complete<T>(
    prompt: string,
    options?: CompleteOptions<z.ZodType<T>>
  ): Promise<CompleteResult<T>> {
    const startTime = Date.now();

    await this.rateLimiter?.acquire();

    try {
      const result = await this.router.routeComplete<T>(prompt, options);

      this.trackUsage({
        provider: result.provider,
        model: result.model,
        operation: "complete",
        tokens: {
          prompt: result.usage.promptTokens,
          completion: result.usage.completionTokens,
          total: result.usage.totalTokens,
        },
        cost: result.usage.estimatedCost,
        latencyMs: Date.now() - startTime,
        success: true,
      });

      return result;
    } catch (error) {
      this.trackUsage({
        provider: options?.provider ?? this.config.defaultProvider,
        model: options?.model ?? "unknown",
        operation: "complete",
        tokens: { total: 0 },
        cost: 0,
        latencyMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Chat with optional structured output.
   *
   * @param messages - Array of chat messages
   * @param options - Chat options (provider, model, schema, temperature)
   * @returns Chat result with response message and usage info
   *
   * @example
   * ```typescript
   * const result = await llm.chat([
   *   { role: "system", content: "You are a helpful assistant" },
   *   { role: "user", content: "Hello!" },
   * ]);
   * console.log(result.message.content); // "Hello! How can I help?"
   * ```
   */
  async chat<T>(
    messages: Message[],
    options?: ChatOptions<z.ZodType<T>>
  ): Promise<ChatResult<T>> {
    const startTime = Date.now();

    await this.rateLimiter?.acquire();

    try {
      const result = await this.router.routeChat<T>(messages, options);

      this.trackUsage({
        provider: result.provider,
        model: result.model,
        operation: "chat",
        tokens: {
          prompt: result.usage.promptTokens,
          completion: result.usage.completionTokens,
          total: result.usage.totalTokens,
        },
        cost: result.usage.estimatedCost,
        latencyMs: Date.now() - startTime,
        success: true,
      });

      return result;
    } catch (error) {
      this.trackUsage({
        provider: options?.provider ?? this.config.defaultProvider,
        model: options?.model ?? "unknown",
        operation: "chat",
        tokens: { total: 0 },
        cost: 0,
        latencyMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Get aggregated usage statistics.
   *
   * @returns Usage stats by provider and operation
   */
  getUsage(): UsageStats {
    const stats: UsageStats = {
      totalRequests: this.usageEvents.length,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      byProvider: {},
      byOperation: {},
    };

    for (const event of this.usageEvents) {
      if (event.success) {
        stats.successfulRequests++;
      } else {
        stats.failedRequests++;
      }

      stats.totalTokens += event.tokens.total;
      stats.totalCost += event.cost;

      // By provider
      let providerStats = stats.byProvider[event.provider];
      if (!providerStats) {
        providerStats = { requests: 0, tokens: 0, cost: 0 };
        stats.byProvider[event.provider] = providerStats;
      }
      providerStats.requests++;
      providerStats.tokens += event.tokens.total;
      providerStats.cost += event.cost;

      // By operation
      let operationStats = stats.byOperation[event.operation];
      if (!operationStats) {
        operationStats = { requests: 0, tokens: 0, cost: 0 };
        stats.byOperation[event.operation] = operationStats;
      }
      operationStats.requests++;
      operationStats.tokens += event.tokens.total;
      operationStats.cost += event.cost;
    }

    return stats;
  }

  /**
   * Get raw usage events.
   *
   * @returns Array of all usage events
   */
  getUsageEvents(): UsageEvent[] {
    return [...this.usageEvents];
  }

  /**
   * Clear usage history.
   */
  clearUsage(): void {
    this.usageEvents = [];
  }

  /**
   * Get a specific provider instance.
   *
   * @param name - Provider name
   * @returns The provider instance
   */
  getProvider(name: ProviderName): LLMProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new ProviderNotConfiguredError(name);
    }
    return provider;
  }

  /**
   * Check if a provider is configured.
   *
   * @param name - Provider name
   * @returns True if provider is configured
   */
  hasProvider(name: ProviderName): boolean {
    return this.providers.has(name);
  }

  /**
   * Shutdown all providers.
   */
  async shutdown(): Promise<void> {
    for (const provider of this.providers.values()) {
      await provider.shutdown?.();
    }
  }

  /**
   * Track usage event.
   */
  private trackUsage(event: Omit<UsageEvent, "timestamp">): void {
    if (this.config.tracking?.enabled === false) return;

    const usageEvent: UsageEvent = {
      ...event,
      timestamp: new Date(),
    };

    this.usageEvents.push(usageEvent);
    this.config.tracking?.onUsage?.(usageEvent);
  }
}

/**
 * Create LLM Center instance.
 *
 * @param config - LLM Center configuration
 * @returns LLMCenter instance
 */
export function createLLMCenter(config: LLMCenterConfig): LLMCenter {
  return new LLMCenter(config);
}
