# @cognobserve/sdk

Official TypeScript SDK for [CognObserve](https://github.com/cognobserve) - AI Platform Monitoring & Observability.

## Installation

```bash
npm install @cognobserve/sdk
# or
pnpm add @cognobserve/sdk
# or
yarn add @cognobserve/sdk
```

## Quick Start

### 1. Initialize the SDK

```typescript
import { CognObserve } from '@cognobserve/sdk';

CognObserve.init({
  apiKey: process.env.COGNOBSERVE_API_KEY,
});
```

### 2. Use observe() for Easy Tracing (Recommended)

The `observe()` wrapper is the simplest way to trace your code:

```typescript
import { CognObserve } from '@cognobserve/sdk';

// Trace any async function
const result = await CognObserve.observe('fetch-users', async () => {
  return db.query('SELECT * FROM users');
});

// For LLM calls, use type: 'generation' to auto-extract tokens
const response = await CognObserve.observe({
  name: 'openai-call',
  type: 'generation',
}, async () => {
  return openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello!' }],
  });
});

// Auto-nesting works automatically
await CognObserve.observe('parent-operation', async () => {
  await CognObserve.observe('child-1', async () => { /* ... */ });
  await CognObserve.observe('child-2', async () => { /* ... */ });
});
```

### 3. Auto-Instrument OpenAI

```typescript
import OpenAI from 'openai';
import { CognObserve } from '@cognobserve/sdk';
import { wrapOpenAI } from '@cognobserve/sdk/integrations';

CognObserve.init({ apiKey: process.env.COGNOBSERVE_API_KEY });

const openai = wrapOpenAI(new OpenAI());

// All calls are now automatically traced
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

### 4. Auto-Instrument Anthropic

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { CognObserve } from '@cognobserve/sdk';
import { wrapAnthropic } from '@cognobserve/sdk/integrations';

CognObserve.init({ apiKey: process.env.COGNOBSERVE_API_KEY });

const anthropic = wrapAnthropic(new Anthropic());

// All calls are now automatically traced
const response = await anthropic.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

## API Reference

### CognObserve.init(config)

Initialize the SDK. Must be called before any other methods.

```typescript
CognObserve.init({
  // Required
  apiKey: 'co_...',

  // Optional
  endpoint: 'https://ingest.cognobserve.com', // Custom endpoint
  debug: false,                                // Enable debug logging
  disabled: false,                             // Disable SDK entirely
  flushInterval: 5000,                         // Batch flush interval (ms)
  maxBatchSize: 10,                            // Max traces per batch
  maxRetries: 3,                               // Retry attempts on failure
});
```

### CognObserve.observe(name | options, fn)

Trace an async function with automatic span creation.

```typescript
// Simple usage with just a name
const result = await CognObserve.observe('my-operation', async () => {
  return doSomething();
});

// With options
const result = await CognObserve.observe({
  name: 'llm-call',
  type: 'generation',        // 'generation' | 'span' (default: 'span')
  metadata: { key: 'value' },
  captureInput: true,        // Capture function input (default: true)
  captureOutput: true,       // Capture function output (default: true)
  userId: 'user-123',
  sessionId: 'session-456',
}, async () => {
  return openai.chat.completions.create({ ... });
});
```

### CognObserve.log(message, data?, level?)

Log a message within an active trace context.

```typescript
await CognObserve.observe('my-operation', async () => {
  CognObserve.log('Starting process', { step: 1 });

  // ... do work ...

  CognObserve.log('Process complete', { step: 2 });
});

// With log level
CognObserve.log('Error occurred', { error: 'timeout' }, 'ERROR');
```

Log levels: `'DEBUG'` | `'DEFAULT'` | `'WARNING'` | `'ERROR'`

### CognObserve.startTrace(options)

Start a trace for manual instrumentation.

```typescript
const trace = CognObserve.startTrace({
  name: 'my-operation',
  metadata: { environment: 'production' },
});

const span = trace.startSpan({ name: 'step-1' });
span.setInput({ query: 'SELECT * FROM users' });
// ... do work ...
span.setOutput({ rowCount: 10 });
span.end();

trace.end();
```

### CognObserve.trace(options, fn)

Run a function within a trace context.

```typescript
const result = await CognObserve.trace(
  { name: 'my-operation' },
  async (trace) => {
    const span = trace.startSpan({ name: 'sub-operation' });
    // ... do work ...
    span.end();
    return someResult;
  }
);
```

### CognObserve.flush()

Flush all pending traces to the server.

```typescript
await CognObserve.flush();
```

### CognObserve.shutdown()

Gracefully shutdown the SDK, flushing pending data.

```typescript
await CognObserve.shutdown();
```

## Span API

When using manual instrumentation, spans have a fluent API:

```typescript
const span = trace.startSpan({ name: 'my-span' });

// Set input/output
span.setInput({ query: 'SELECT *' });
span.setOutput({ rows: 100 });

// Set LLM-specific data
span.setModel('gpt-4', { temperature: 0.7, max_tokens: 1000 });
span.setUsage({
  promptTokens: 100,
  completionTokens: 50,
  totalTokens: 150,
});

// Set metadata and level
span.setMetadata({ key: 'value' });
span.setLevel('WARNING');

// Set error
span.setError('Something went wrong');

// End the span
span.end();
```

## Wrapper Options

Both `wrapOpenAI` and `wrapAnthropic` accept options:

```typescript
const openai = wrapOpenAI(new OpenAI(), {
  tracePrefix: 'my-app',     // Custom span name prefix (default: 'openai')
  captureInput: true,         // Capture input messages (default: true)
  captureOutput: true,        // Capture output content (default: true)
  createTrace: false,         // Create new trace if none active (default: false)
});
```

## Streaming Support

Both OpenAI and Anthropic streaming responses are fully supported:

```typescript
// OpenAI streaming
const stream = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
// Span is automatically ended with accumulated usage data

// Anthropic streaming
const stream = await anthropic.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: true,
});

for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    process.stdout.write(event.delta.text);
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `COGNOBSERVE_API_KEY` | API key (fallback if not in config) |
| `COGNOBSERVE_ENDPOINT` | Custom ingest endpoint |
| `COGNOBSERVE_DEBUG` | Enable debug mode (`true`/`false`) |
| `COGNOBSERVE_DISABLED` | Disable SDK (`true`/`false`) |

## Async Context Propagation

The SDK automatically propagates trace context through async operations using Node.js AsyncLocalStorage:

```typescript
import { CognObserve, getActiveTrace, getActiveSpan } from '@cognobserve/sdk';

async function innerOperation() {
  // Access the active trace from anywhere in the call stack
  const trace = getActiveTrace();
  const parentSpan = getActiveSpan();

  if (trace) {
    const span = trace.startSpan({
      name: 'inner-operation',
      parentSpanId: parentSpan?.id,
    });
    // ...
    span.end();
  }
}

await CognObserve.observe('outer-operation', async () => {
  await innerOperation(); // Context is automatically available
});
```

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  CognObserveConfig,
  TraceOptions,
  SpanOptions,
  SpanEndOptions,
  SpanLevel,
  TokenUsage,
  ObserveOptions,
} from '@cognobserve/sdk';

import type { WrapperOptions } from '@cognobserve/sdk/integrations';
```

## LLM Token Extraction

When using `type: 'generation'` with `observe()`, the SDK automatically extracts token usage from:

- **OpenAI**: `response.usage.prompt_tokens`, `completion_tokens`, `total_tokens`
- **Anthropic**: `response.usage.input_tokens`, `output_tokens`
- **Google/Gemini**: `response.usageMetadata.promptTokenCount`, `candidatesTokenCount`
- **Cohere**: `response.meta.tokens.input_tokens`, `output_tokens`

## Requirements

- Node.js 18+
- OpenAI SDK v4+ (optional peer dependency)
- Anthropic SDK v0.20+ (optional peer dependency)

## License

MIT
