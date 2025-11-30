import type { CognObserveConfig, ResolvedConfig } from './types';

const DEFAULT_ENDPOINT = 'https://ingest.cognobserve.com';
const DEFAULT_FLUSH_INTERVAL = 5000;
const DEFAULT_MAX_BATCH_SIZE = 10;
const DEFAULT_MAX_RETRIES = 3;

/**
 * Get environment variable value (works in Node.js and edge runtimes)
 */
function getEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

/**
 * Resolve configuration with defaults and environment variables
 */
export function resolveConfig(config: CognObserveConfig): ResolvedConfig {
  const apiKey = config.apiKey ?? getEnv('COGNOBSERVE_API_KEY') ?? '';
  const disabled = config.disabled ?? getEnv('COGNOBSERVE_DISABLED') === 'true';

  if (!apiKey && !disabled) {
    console.warn(
      '[CognObserve] No API key provided. Set apiKey in config or COGNOBSERVE_API_KEY env var.'
    );
  }

  return {
    apiKey,
    endpoint:
      config.endpoint ?? getEnv('COGNOBSERVE_ENDPOINT') ?? DEFAULT_ENDPOINT,
    debug: config.debug ?? getEnv('COGNOBSERVE_DEBUG') === 'true',
    disabled,
    flushInterval: config.flushInterval ?? DEFAULT_FLUSH_INTERVAL,
    maxBatchSize: config.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE,
    maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
  };
}

/**
 * Validate resolved configuration
 */
export function validateConfig(config: ResolvedConfig): void {
  if (!config.disabled && !config.apiKey) {
    throw new Error('[CognObserve] API key is required when SDK is enabled');
  }

  if (
    !config.endpoint.startsWith('http://') &&
    !config.endpoint.startsWith('https://')
  ) {
    throw new Error('[CognObserve] Endpoint must be a valid URL');
  }

  if (config.flushInterval < 100) {
    throw new Error('[CognObserve] Flush interval must be at least 100ms');
  }

  if (config.maxBatchSize < 1) {
    throw new Error('[CognObserve] Max batch size must be at least 1');
  }

  if (config.maxRetries < 0) {
    throw new Error('[CognObserve] Max retries cannot be negative');
  }
}
