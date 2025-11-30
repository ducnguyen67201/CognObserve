import { Trace } from './trace';
import { Transport } from './transport';
import { resolveConfig, validateConfig } from './config';
import {
  runWithContext,
  getActiveTrace,
  getActiveSpan,
  getActiveContext,
} from './context';
import { createObserve, type ObserveOptions } from './observe';
import type {
  CognObserveConfig,
  ResolvedConfig,
  TraceOptions,
  TraceData,
  SpanLevel,
} from './types';

/**
 * Main CognObserve client class
 */
class CognObserveClient {
  private config: ResolvedConfig | null = null;
  private transport: Transport | null = null;
  private initialized = false;
  private shutdownRegistered = false;
  private _observe: ReturnType<typeof createObserve> | null = null;

  /**
   * Initialize the CognObserve SDK
   *
   * @example
   * ```typescript
   * CognObserve.init({
   *   apiKey: 'co_your_api_key',
   *   debug: true,
   * });
   * ```
   */
  init(config: CognObserveConfig): void {
    if (this.initialized) {
      console.warn(
        '[CognObserve] Already initialized. Call shutdown() first to re-initialize.'
      );
      return;
    }

    this.config = resolveConfig(config);

    // Skip validation if disabled
    if (!this.config.disabled) {
      validateConfig(this.config);
    }

    this.transport = new Transport(this.config);
    this.initialized = true;

    // Create observe function with transport callback
    const handleTraceEnd = (data: TraceData) => {
      this.transport!.enqueue(data);
    };
    this._observe = createObserve(handleTraceEnd, this.config.debug);

    if (this.config.debug) {
      console.log('[CognObserve] Initialized', {
        endpoint: this.config.endpoint,
        disabled: this.config.disabled,
      });
    }

    // Register shutdown handler
    this.registerShutdownHandler();
  }

  /**
   * Register process shutdown handlers
   */
  private registerShutdownHandler(): void {
    if (this.shutdownRegistered) return;

    const shutdown = () => {
      this.shutdown().catch((err) => {
        console.error('[CognObserve] Shutdown error:', err);
      });
    };

    process.on('beforeExit', shutdown);
    process.on('SIGINT', () => {
      shutdown();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      shutdown();
      process.exit(0);
    });

    this.shutdownRegistered = true;
  }

  /**
   * Ensure the SDK is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        '[CognObserve] SDK not initialized. Call CognObserve.init() first.'
      );
    }
  }

  /**
   * Start a new trace
   *
   * @example
   * ```typescript
   * const trace = CognObserve.startTrace({ name: 'my-operation' });
   * const span = trace.startSpan({ name: 'sub-operation' });
   * // ... do work
   * span.end();
   * trace.end();
   * ```
   */
  startTrace(options: TraceOptions): Trace {
    this.ensureInitialized();

    // Handler for when trace ends
    const handleEnd = (data: TraceData) => {
      this.transport!.enqueue(data);
    };

    const trace = new Trace(options, handleEnd);

    if (this.config!.debug) {
      console.log(
        `[CognObserve] Started trace "${options.name}" (${trace.id})`
      );
    }

    return trace;
  }

  /**
   * Run a function within a trace context
   *
   * @example
   * ```typescript
   * const result = await CognObserve.trace(
   *   { name: 'my-operation' },
   *   async (trace) => {
   *     const span = trace.startSpan({ name: 'step-1' });
   *     // ... do work
   *     span.end();
   *     return someResult;
   *   }
   * );
   * ```
   */
  trace<T>(options: TraceOptions, fn: (trace: Trace) => T): T {
    const trace = this.startTrace(options);

    try {
      const result = runWithContext({ trace, span: null }, () => fn(trace));

      // Handle async functions
      if (result instanceof Promise) {
        return result
          .then((res) => {
            trace.end();
            return res;
          })
          .catch((err) => {
            trace.end();
            throw err;
          }) as T;
      }

      trace.end();
      return result;
    } catch (err) {
      trace.end();
      throw err;
    }
  }

  /**
   * Get the currently active trace from async context
   */
  getActiveTrace(): Trace | undefined {
    return getActiveTrace();
  }

  /**
   * Get the currently active span from async context
   */
  getActiveSpan() {
    return getActiveSpan();
  }

  /**
   * Flush all pending traces to the server
   */
  async flush(): Promise<void> {
    if (!this.transport) return;
    await this.transport.flush();
  }

  /**
   * Shutdown the SDK, flushing any pending data
   */
  async shutdown(): Promise<void> {
    if (!this.transport) return;

    const debug = this.config?.debug ?? false;

    if (debug) {
      console.log('[CognObserve] Shutting down...');
    }

    await this.transport.shutdown();
    this.transport = null;
    this.config = null;
    this.initialized = false;

    if (debug) {
      console.log('[CognObserve] Shutdown complete');
    }
  }

  /**
   * Observe and trace an async function (recommended API)
   *
   * @example
   * ```typescript
   * // Simple usage
   * const result = await CognObserve.observe('fetch-user', async () => {
   *   return db.query('SELECT * FROM users');
   * });
   *
   * // For LLM calls (auto-extracts tokens)
   * const response = await CognObserve.observe({
   *   name: 'openai-call',
   *   type: 'generation',
   * }, async () => {
   *   return openai.chat.completions.create({ ... });
   * });
   *
   * // Auto-nesting works automatically
   * await CognObserve.observe('parent', async () => {
   *   await CognObserve.observe('child-1', async () => { ... });
   *   await CognObserve.observe('child-2', async () => { ... });
   * });
   * ```
   */
  async observe<T>(
    nameOrOptions: string | ObserveOptions,
    fn: () => Promise<T>
  ): Promise<T> {
    this.ensureInitialized();
    return this._observe!(nameOrOptions, fn);
  }

  /**
   * Log a message (creates an instant span)
   *
   * @example
   * ```typescript
   * CognObserve.log('User logged in', { userId: '123' });
   * CognObserve.log('Payment failed', { error: 'timeout' }, 'ERROR');
   * ```
   */
  log(
    message: string,
    data?: Record<string, unknown>,
    level: SpanLevel = 'DEFAULT'
  ): void {
    const context = getActiveContext();
    if (!context) {
      if (this.config?.debug) {
        console.warn(
          '[CognObserve] log() called outside of observe() context, creating standalone trace'
        );
      }
      // Create a standalone trace for the log
      const trace = this.startTrace({ name: 'log' });
      const span = trace.startSpan({ name: message, metadata: data });
      span.setLevel(level);
      span.end();
      trace.end();
      return;
    }

    // Add log as a span to current trace
    const { trace, span: parentSpan } = context;
    const logSpan = trace.startSpan({
      name: message,
      parentSpanId: parentSpan?.id,
      metadata: data,
    });
    logSpan.setLevel(level);
    logSpan.end();
  }

  /**
   * Whether the SDK is initialized
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Whether the SDK is disabled
   */
  get isDisabled(): boolean {
    return this.config?.disabled ?? false;
  }
}

// Export singleton instance
export const CognObserve = new CognObserveClient();
