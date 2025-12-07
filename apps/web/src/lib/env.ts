import { config } from "dotenv";
import { resolve } from "path";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Load .env from monorepo root (cross-platform: works on Windows, macOS, Linux)
// This runs before createEnv validates the environment variables
config({ path: resolve(process.cwd(), "../../.env") });
// Also try loading from current directory for when running from root via turbo
config({ path: resolve(process.cwd(), ".env") });

export const env = createEnv({
  /**
   * Server-side environment variables schema.
   * These are only available on the server.
   */
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // NextAuth
    NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
    NEXTAUTH_URL: z.string().url().optional(),

    // Cross-service JWT
    JWT_SHARED_SECRET: z.string().min(32, "JWT_SHARED_SECRET must be at least 32 characters"),

    // OAuth Providers (optional)
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),
    AUTH_GITHUB_ID: z.string().optional(),
    AUTH_GITHUB_SECRET: z.string().optional(),

    // Internal API Communication (Go ingest -> Web API)
    INTERNAL_API_SECRET: z
      .string()
      .min(32, "INTERNAL_API_SECRET must be at least 32 characters"),

    // API Key Configuration
    API_KEY_PREFIX: z.string().min(1).default("co_sk_"),
    API_KEY_RANDOM_BYTES_LENGTH: z.coerce.number().min(16).max(64).default(32),
    API_KEY_BASE62_CHARSET: z
      .string()
      .length(62)
      .default("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"),
  },

  /**
   * Client-side environment variables schema.
   * These are exposed to the browser (prefix with NEXT_PUBLIC_).
   */
  client: {
    // Add client-side env vars here if needed
    // NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  },

  /**
   * Runtime environment variables.
   * Map environment variables to the schema.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    JWT_SHARED_SECRET: process.env.JWT_SHARED_SECRET,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
    AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
    INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET,
    API_KEY_PREFIX: process.env.API_KEY_PREFIX,
    API_KEY_RANDOM_BYTES_LENGTH: process.env.API_KEY_RANDOM_BYTES_LENGTH,
    API_KEY_BASE62_CHARSET: process.env.API_KEY_BASE62_CHARSET,
  },

  /**
   * Skip validation in certain environments.
   * Useful for Docker builds where env vars aren't available.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  /**
   * Treat empty strings as undefined.
   * Useful for optional env vars that might be set to "".
   */
  emptyStringAsUndefined: true,
});
