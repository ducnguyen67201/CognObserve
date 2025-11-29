/**
 * API package initialization.
 * Configures shared utilities with environment variables.
 * This file MUST be imported before any routes that use api-key functions.
 */
import { setApiKeyConfig } from "@cognobserve/shared";

// Initialize API key config from environment variables
// These are validated and have defaults in the web app's env.ts
setApiKeyConfig({
  prefix: process.env.API_KEY_PREFIX || "co_sk_",
  randomBytesLength: parseInt(process.env.API_KEY_RANDOM_BYTES_LENGTH || "32", 10),
  base62Charset:
    process.env.API_KEY_BASE62_CHARSET ||
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
});
