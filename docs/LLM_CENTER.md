# LLM Center Documentation

> **Centralized LLM processing service for CognObserve.**
> Multi-provider support, smart routing, structured outputs, and usage tracking.

## Overview

LLM Center is the unified interface for all LLM operations in CognObserve. It abstracts away provider-specific details and provides:

- **Multi-provider support**: OpenAI and Anthropic out of the box
- **Smart routing**: Per-operation routing with automatic fallback chains
- **Structured outputs**: Zod schema validation for type-safe responses
- **Usage tracking**: Cost, tokens, and latency monitoring
- **Rate limiting**: Built-in rate limiting with token bucket algorithm
- **Retry logic**: Exponential backoff with jitter

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LLM CENTER ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────────┘

                              User Code
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              LLMCenter                                       │
│                         (center.ts - 300 lines)                              │
│                                                                             │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                       │
│   │   embed()   │   │  complete() │   │   chat()    │                       │
│   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘                       │
│          │                 │                 │                              │
│          └─────────────────┼─────────────────┘                              │
│                            │                                                │
│                            ▼                                                │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    Internal Components                               │  │
│   │                                                                     │  │
│   │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │  │
│   │  │  SmartRouter    │  │  RateLimiter    │  │  UsageTracker   │     │  │
│   │  │  (router.ts)    │  │  (rate-limiter) │  │  (usage-tracker)│     │  │
│   │  │                 │  │                 │  │                 │     │  │
│   │  │  - Routing      │  │  - Token bucket │  │  - Event store  │     │  │
│   │  │  - Fallbacks    │  │  - Per-minute   │  │  - O(1) stats   │     │  │
│   │  │  - Retries      │  │    limits       │  │  - Callbacks    │     │  │
│   │  └────────┬────────┘  └─────────────────┘  └─────────────────┘     │  │
│   │           │                                                         │  │
│   └───────────┼─────────────────────────────────────────────────────────┘  │
│               │                                                             │
│               ▼                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    ProviderFactory                                   │  │
│   │                 (provider-factory.ts)                                │  │
│   │                                                                     │  │
│   │  ┌─────────────────┐              ┌─────────────────┐               │  │
│   │  │  OpenAIProvider │              │AnthropicProvider│               │  │
│   │  │  (openai.ts)    │              │ (anthropic.ts)  │               │  │
│   │  │                 │              │                 │               │  │
│   │  │  - Embeddings   │              │  - Chat         │               │  │
│   │  │  - Chat         │              │  - Complete     │               │  │
│   │  │  - Complete     │              │  - No embeddings│               │  │
│   │  └─────────────────┘              └─────────────────┘               │  │
│   │                                                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │      External APIs      │
                    │  OpenAI  │  Anthropic   │
                    └─────────────────────────┘
```

## Module Structure

```
packages/shared/src/llm/
├── center.ts              # Main orchestrator (embed, chat, complete)
├── router.ts              # Smart routing with fallback chains
├── provider-factory.ts    # Provider initialization from config
├── usage-tracker.ts       # Usage event tracking & statistics
├── types.ts               # Type definitions
├── errors.ts              # Custom error classes
├── config.types.ts        # Configuration type definitions
│
├── providers/
│   ├── base.ts            # Abstract base provider class
│   ├── openai.ts          # OpenAI implementation
│   ├── anthropic.ts       # Anthropic implementation
│   └── index.ts           # Provider exports
│
├── utils/
│   ├── rate-limiter.ts    # Token bucket rate limiter
│   ├── retry.ts           # Exponential backoff retry
│   └── index.ts           # Utility exports
│
├── configs/
│   ├── development.ts     # Dev config (cheap models, no fallback)
│   ├── production.ts      # Prod config (quality models, full fallback)
│   └── index.ts           # Config factory (auto-selects by NODE_ENV)
│
└── index.ts               # Public exports
```

## Quick Start

### Basic Usage

```typescript
import { createLLMCenter, getConfig } from "@cognobserve/shared/llm";

// Create instance (uses NODE_ENV to select config)
const llm = createLLMCenter(getConfig());

// Generate embeddings
const embedResult = await llm.embed(["Hello world", "How are you?"]);
console.log(embedResult.embeddings);  // [[0.1, 0.2, ...], [0.3, 0.4, ...]]
console.log(embedResult.usage.totalTokens);  // 8
console.log(embedResult.usage.estimatedCost);  // 0.0000002

// Chat completion
const chatResult = await llm.chat([
  { role: "system", content: "You are a helpful assistant" },
  { role: "user", content: "What is TypeScript?" },
]);
console.log(chatResult.message.content);  // "TypeScript is..."
```

### Structured Outputs (Zod Validation)

```typescript
import { z } from "zod";

// Define schema
const SentimentSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
  keywords: z.array(z.string()),
});

// Chat with structured output
const result = await llm.chat(
  [{ role: "user", content: "Analyze: I love this product!" }],
  { schema: SentimentSchema }
);

// Result is typed and validated
console.log(result.data.sentiment);    // "positive"
console.log(result.data.confidence);   // 0.95
console.log(result.data.keywords);     // ["love", "product"]
```

### Override Provider/Model

```typescript
// Force specific provider
const result = await llm.chat(messages, {
  provider: "anthropic",
  model: "claude-3-5-sonnet-20241022",
});

// Force specific model (uses default provider for that model)
const embedResult = await llm.embed(texts, {
  model: "text-embedding-3-large",
});
```

## Configuration

### Environment-Aware Config

The `getConfig()` function automatically selects configuration based on `NODE_ENV`:

```typescript
import { getConfig, getConfigByName } from "@cognobserve/shared/llm";

// Auto-select based on NODE_ENV
const config = getConfig();  // development or production

// Explicit selection
const devConfig = getConfigByName("development");
const prodConfig = getConfigByName("production");
```

### Development Config

Optimized for fast iteration and low cost:

| Operation | Primary Model | Fallbacks |
|-----------|---------------|-----------|
| Embed | `text-embedding-3-small` | None |
| Chat | `gpt-4o-mini` | None |
| Complete | `gpt-4o-mini` | None |

- **Fallbacks disabled** (fail fast)
- **Lower rate limits** (100 req/min)
- **Fewer retries** (1 attempt)

### Production Config

Optimized for quality and reliability:

| Operation | Primary Model | Fallbacks |
|-----------|---------------|-----------|
| Embed | `text-embedding-3-small` | `text-embedding-3-large` |
| Chat | `claude-3-5-sonnet` | `gpt-4o` → `gpt-4o-mini` → `claude-3-5-haiku` |
| Complete | `gpt-4o` | `claude-3-5-sonnet` → `gpt-4o-mini` |

- **Fallbacks enabled** (auto-failover)
- **Higher rate limits** (500 req/min)
- **More retries** (3 attempts)

### Custom Configuration

```typescript
import { defineLLMConfig, createLLMCenter } from "@cognobserve/shared/llm";

const customConfig = defineLLMConfig({
  defaultProvider: "openai",

  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY!,
      organization: process.env.OPENAI_ORG_ID,
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY!,
    },
  },

  routing: {
    embed: {
      primary: { provider: "openai", model: "text-embedding-3-small" },
    },
    chat: {
      primary: { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
      fallbacks: [
        { provider: "openai", model: "gpt-4o" },
      ],
    },
    complete: {
      primary: { provider: "openai", model: "gpt-4o" },
    },
  },

  fallback: {
    enabled: true,
    maxAttempts: 3,
    retryDelay: 1000,
    retryableErrors: ["rate_limit", "timeout", "service_unavailable"],
  },

  rateLimiting: {
    enabled: true,
    requestsPerMinute: 500,
  },

  tracking: {
    enabled: true,
    onUsage: (event) => console.log("Usage:", event),
  },
});

const llm = createLLMCenter(customConfig);
```

## Core Components

### LLMCenter (`center.ts`)

The main orchestrator class. Handles:
- Input validation and preprocessing
- Rate limiting
- Routing to SmartRouter
- Usage tracking

```typescript
class LLMCenter {
  embed(texts: string[], options?: EmbedOptions): Promise<EmbedResult>;
  complete<T>(prompt: string, options?: CompleteOptions<T>): Promise<CompleteResult<T>>;
  chat<T>(messages: Message[], options?: ChatOptions<T>): Promise<ChatResult<T>>;

  getUsage(): UsageStats;
  getUsageEvents(): UsageEvent[];
  clearUsage(): void;

  getProvider(name: ProviderName): LLMProvider;
  hasProvider(name: ProviderName): boolean;
  shutdown(): Promise<void>;
}
```

### SmartRouter (`router.ts`)

Handles intelligent routing with fallback chains:

1. If specific provider/model requested → use directly
2. Otherwise → use routing config
3. On retryable error → try next in fallback chain
4. Each model gets retry attempts before moving to next

```
Request → Primary Model (retry 1, 2, 3) → Fallback 1 (retry 1, 2, 3) → Fallback 2 → ...
```

### ProviderFactory (`provider-factory.ts`)

Creates and manages provider instances:

```typescript
import { createProviders, getProvider, shutdownProviders } from "@cognobserve/shared/llm";

const registry = createProviders(config);
const openai = getProvider(registry, "openai");
await shutdownProviders(registry);
```

### UsageTracker (`usage-tracker.ts`)

Tracks usage events with O(1) statistics:

```typescript
import { UsageTracker } from "@cognobserve/shared/llm";

const tracker = new UsageTracker({
  enabled: true,
  onUsage: (event) => sendToAnalytics(event),
});

// Track an event
tracker.track({
  provider: "openai",
  model: "gpt-4o",
  operation: "chat",
  tokens: { prompt: 100, completion: 50, total: 150 },
  cost: 0.003,
  latencyMs: 450,
  success: true,
});

// Get statistics
const stats = tracker.getStats();
console.log(stats.totalRequests);      // 1
console.log(stats.totalTokens);        // 150
console.log(stats.totalCost);          // 0.003
console.log(stats.byProvider.openai);  // { requests: 1, tokens: 150, cost: 0.003 }
```

## Error Handling

### Error Types

| Error | Retryable | Description |
|-------|-----------|-------------|
| `RateLimitError` | Yes | Provider rate limit hit |
| `TimeoutError` | Yes | Request timed out |
| `ServiceUnavailableError` | Yes | Provider temporarily down |
| `AuthenticationError` | No | Invalid API key |
| `ModelNotFoundError` | No | Model doesn't exist |
| `ContentFilterError` | No | Content blocked by provider |
| `SchemaValidationError` | No | Response doesn't match schema |
| `AllProvidersFailedError` | No | All providers in chain failed |

### Error Utilities

```typescript
import { isRetryableError, getErrorCode } from "@cognobserve/shared/llm";

try {
  await llm.chat(messages);
} catch (error) {
  if (isRetryableError(error)) {
    // Wait and retry
    await sleep(1000);
    return llm.chat(messages);
  }

  const code = getErrorCode(error);
  console.log(`Error code: ${code}`);  // "rate_limit", "timeout", etc.
}
```

## Usage in Worker (Temporal Activities)

For Temporal workers, use the centralized LLM Manager:

```typescript
// apps/worker/src/lib/llm-manager.ts
import { getLLM } from "@/lib/llm-manager";

// In activities:
export async function generateEmbeddings(input: Input): Promise<Output> {
  const llm = getLLM();  // Singleton - created once, reused
  const result = await llm.embed(input.texts);
  return { embeddings: result.embeddings };
}
```

The LLM Manager provides:
- **Singleton instance** per worker process
- **Lazy initialization** on first use
- **Graceful shutdown** via `shutdownLLM()`

## Model Pricing

### OpenAI (as of Dec 2024)

| Model | Input ($/1M) | Output ($/1M) |
|-------|--------------|---------------|
| gpt-4o | $2.50 | $10.00 |
| gpt-4o-mini | $0.15 | $0.60 |
| text-embedding-3-small | $0.02 | - |
| text-embedding-3-large | $0.13 | - |

### Anthropic (as of Dec 2024)

| Model | Input ($/1M) | Output ($/1M) |
|-------|--------------|---------------|
| claude-3-5-sonnet | $3.00 | $15.00 |
| claude-3-5-haiku | $0.80 | $4.00 |
| claude-3-opus | $15.00 | $75.00 |

## Best Practices

### 1. Use getConfig() for Environment Awareness

```typescript
// Good - auto-selects based on NODE_ENV
const llm = createLLMCenter(getConfig());

// Avoid - hardcoding config
const llm = createLLMCenter(productionConfig);  // May be wrong in dev
```

### 2. Reuse LLMCenter Instance

```typescript
// Good - create once, reuse
const llm = createLLMCenter(getConfig());
export { llm };

// Avoid - creating per request
async function handleRequest() {
  const llm = createLLMCenter(getConfig());  // Expensive!
  return llm.chat(messages);
}
```

### 3. Use Structured Outputs for Type Safety

```typescript
// Good - validated and typed
const result = await llm.chat(messages, { schema: MySchema });
console.log(result.data.field);  // Typed!

// Avoid - parsing JSON manually
const result = await llm.chat(messages);
const data = JSON.parse(result.message.content);  // Unsafe!
```

### 4. Monitor Usage

```typescript
const llm = createLLMCenter({
  ...getConfig(),
  tracking: {
    enabled: true,
    onUsage: (event) => {
      metrics.recordLatency(event.latencyMs);
      metrics.recordCost(event.cost);
      if (!event.success) {
        alerts.notify("LLM Error", event.error);
      }
    },
  },
});
```

## Troubleshooting

### "Provider not configured" Error

```typescript
// Ensure API key is set
const config = defineLLMConfig({
  providers: {
    openai: { apiKey: process.env.OPENAI_API_KEY! },  // Must exist
  },
});
```

### "All providers failed" Error

Check the error details:

```typescript
try {
  await llm.chat(messages);
} catch (error) {
  if (error instanceof AllProvidersFailedError) {
    console.log("Attempts:", error.attempts);
    error.attempts.forEach(({ model, error }) => {
      console.log(`${model.provider}/${model.model}: ${error.message}`);
    });
  }
}
```

### High Latency

1. Check if rate limiting is being hit
2. Verify network connectivity to providers
3. Consider using smaller/faster models for non-critical paths
4. Check usage stats: `llm.getUsage().byOperation`

### Schema Validation Failures

1. Verify schema matches expected response format
2. Check if model is capable of structured output
3. Add more specific instructions in system prompt
4. Try a more capable model

## Related Documentation

- [WORKFLOWS.md](./WORKFLOWS.md) - Temporal workflow integration
- [TYPE_SYSTEM.md](./TYPE_SYSTEM.md) - Type sharing across packages
