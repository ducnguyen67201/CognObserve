# Self-Hosted Distribution Specification

**Issue:** #96
**Epic:** Open Source Distribution
**Points:** 13
**Sprint:** Post-MVP (Foundation now, polish later)
**Dependencies:** #94 (Single VPS Deployment)

---

## 1. Executive Summary

Enable CognObserve to be self-hosted by the open-source community with minimal configuration. Users should be able to run the entire platform with a single `docker compose up` command.

### Success Criteria

| Metric | Target |
|--------|--------|
| Time to first trace | < 5 minutes |
| Required config vars | ≤ 5 |
| Docker Compose complexity | Single file, < 50 lines |
| Documentation completeness | Full self-hosting guide |

### Phased Approach

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      IMPLEMENTATION PHASES                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  PHASE 1 (Now)              PHASE 2 (Post-MVP)       PHASE 3 (Scale)   │
│  Foundation                 Polish                   Enterprise        │
│  ────────────               ──────                   ──────────        │
│  • Env-first config         • All-in-one image      • Helm chart       │
│  • docker-compose.yml       • Auto-migrations       • HA setup docs    │
│  • Sensible defaults        • One-click deploys     • Upgrade guides   │
│  • Config documentation     • Health dashboard      • Backup/restore   │
│  • Basic health checks      • Quick start wizard    • Multi-tenancy    │
│                                                                         │
│  Effort: 1 day              Effort: 1 week          Effort: 2 weeks    │
│  Priority: P0               Priority: P1            Priority: P2       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Architecture Overview

### 2.1 Current Architecture (Multi-Service)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CURRENT: Separate Services                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│   │     Web     │    │   Worker    │    │   Ingest    │                │
│   │   Next.js   │    │   Node.js   │    │     Go      │                │
│   │   :3000     │    │     -       │    │   :8080     │                │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                │
│          │                  │                  │                        │
│          └──────────────────┼──────────────────┘                        │
│                             │                                           │
│                   ┌─────────▼─────────┐                                │
│                   │  PostgreSQL Redis │                                │
│                   └───────────────────┘                                │
│                                                                         │
│   Pros: Scalable, clear separation                                     │
│   Cons: Complex for self-hosters                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Self-Hosted Architecture (All-in-One Option)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TARGET: All-in-One Container                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │              cognobserve/cognobserve:latest                     │   │
│   │  ┌───────────────────────────────────────────────────────────┐  │   │
│   │  │                    Process Manager                        │  │   │
│   │  │                    (supervisord)                          │  │   │
│   │  └───────────────────────────────────────────────────────────┘  │   │
│   │         │                   │                   │               │   │
│   │  ┌──────▼──────┐    ┌───────▼───────┐   ┌──────▼──────┐        │   │
│   │  │    Web      │    │    Worker     │   │   Ingest    │        │   │
│   │  │   :3000     │    │   (daemon)    │   │   :8080     │        │   │
│   │  └─────────────┘    └───────────────┘   └─────────────┘        │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                             │                                           │
│                   ┌─────────▼─────────┐                                │
│                   │  PostgreSQL Redis │                                │
│                   │   (external or    │                                │
│                   │    bundled)       │                                │
│                   └───────────────────┘                                │
│                                                                         │
│   Pros: Simple for self-hosters, single container                      │
│   Cons: Less flexible scaling                                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Deployment Options Matrix

| Option | Complexity | Scalability | Best For |
|--------|------------|-------------|----------|
| All-in-One + Embedded DB | ⭐ Very Easy | Limited | Evaluation, small teams |
| All-in-One + External DB | ⭐⭐ Easy | Moderate | Small-medium teams |
| Multi-Service Compose | ⭐⭐⭐ Medium | Good | Production |
| Kubernetes/Helm | ⭐⭐⭐⭐ Advanced | Excellent | Enterprise |

---

## 3. Technical Design

### 3.1 Configuration Management

#### 3.1.1 Environment Variable Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CONFIGURATION PRIORITY                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   1. Environment Variables     (highest priority)                       │
│      └── DATABASE_URL, REDIS_URL, etc.                                 │
│                                                                         │
│   2. .env File                 (if present)                            │
│      └── /app/.env                                                     │
│                                                                         │
│   3. Default Values            (lowest priority)                        │
│      └── Sensible defaults in code                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 3.1.2 Configuration Schema

```typescript
// packages/shared/src/config/schema.ts

import { z } from "zod";

/**
 * Complete configuration schema for CognObserve
 * All self-hosters configure via these environment variables
 */
export const ConfigSchema = z.object({
  // ============================================================
  // REQUIRED - Must be set by user
  // ============================================================

  /** PostgreSQL connection string */
  DATABASE_URL: z.string().url().startsWith("postgresql://"),

  /** Redis connection string */
  REDIS_URL: z.string().url().startsWith("redis://"),

  /** Secret for NextAuth.js session encryption (min 32 chars) */
  NEXTAUTH_SECRET: z.string().min(32),

  /** Public URL of the application */
  NEXTAUTH_URL: z.string().url(),

  // ============================================================
  // OPTIONAL - Sensible defaults provided
  // ============================================================

  /** Application port */
  PORT: z.coerce.number().default(3000),

  /** Ingest service port */
  INGEST_PORT: z.coerce.number().default(8080),

  /** Log level */
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  /** Data retention in days (0 = forever) */
  RETENTION_DAYS: z.coerce.number().min(0).default(30),

  /** Enable telemetry (anonymous usage stats) */
  TELEMETRY_ENABLED: z.coerce.boolean().default(true),

  /** Max trace payload size in bytes */
  MAX_PAYLOAD_SIZE: z.coerce.number().default(10 * 1024 * 1024), // 10MB

  // ============================================================
  // OPTIONAL - Feature flags
  // ============================================================

  /** Enable user registration (false = invite-only) */
  ENABLE_REGISTRATION: z.coerce.boolean().default(true),

  /** Enable OAuth providers */
  ENABLE_OAUTH: z.coerce.boolean().default(false),

  // ============================================================
  // OPTIONAL - OAuth Providers (if ENABLE_OAUTH=true)
  // ============================================================

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // ============================================================
  // OPTIONAL - Email/Alerting
  // ============================================================

  /** SMTP configuration for alerts */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),

  /** Discord webhook for alerts */
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Validate and parse configuration from environment
 */
export function loadConfig(): Config {
  const result = ConfigSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Configuration Error:");
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
}

/**
 * Get list of required environment variables for documentation
 */
export const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "REDIS_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
] as const;

/**
 * Get default values for optional variables
 */
export const DEFAULT_VALUES: Partial<Config> = {
  PORT: 3000,
  INGEST_PORT: 8080,
  LOG_LEVEL: "info",
  RETENTION_DAYS: 30,
  TELEMETRY_ENABLED: true,
  MAX_PAYLOAD_SIZE: 10 * 1024 * 1024,
  ENABLE_REGISTRATION: true,
  ENABLE_OAUTH: false,
};
```

#### 3.1.3 Configuration Validation on Startup

```typescript
// apps/web/src/lib/config.ts

import { loadConfig, REQUIRED_ENV_VARS } from "@cognobserve/shared/config";

export const config = loadConfig();

// Log configuration summary (without secrets)
console.log("📋 CognObserve Configuration:");
console.log(`   Port: ${config.PORT}`);
console.log(`   Ingest Port: ${config.INGEST_PORT}`);
console.log(`   Log Level: ${config.LOG_LEVEL}`);
console.log(`   Retention: ${config.RETENTION_DAYS} days`);
console.log(`   Registration: ${config.ENABLE_REGISTRATION ? "enabled" : "disabled"}`);
```

### 3.2 Database Migrations

#### 3.2.1 Auto-Migration Strategy

```typescript
// packages/db/src/migrate.ts

import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

/**
 * Run database migrations automatically on startup.
 * Safe to run multiple times (idempotent).
 */
export async function runMigrations(): Promise<void> {
  console.log("🔄 Checking database migrations...");

  try {
    // Run Prisma migrations
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      env: process.env,
    });

    console.log("✅ Database migrations complete");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

/**
 * Check if database is accessible
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  const prisma = new PrismaClient();

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("✅ Database connection successful");
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}
```

#### 3.2.2 Startup Sequence

```typescript
// apps/web/src/instrumentation.ts (Next.js instrumentation)

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations, checkDatabaseConnection } = await import("@cognobserve/db/migrate");

    // Check database connection
    const connected = await checkDatabaseConnection();
    if (!connected) {
      console.error("❌ Cannot connect to database. Exiting.");
      process.exit(1);
    }

    // Run migrations (safe to run multiple times)
    if (process.env.AUTO_MIGRATE !== "false") {
      await runMigrations();
    }
  }
}
```

### 3.3 All-in-One Docker Image

#### 3.3.1 Multi-Process Container Design

```dockerfile
# Dockerfile.all-in-one
# Single container running all CognObserve services

# ============================================================
# Stage 1: Build all services
# ============================================================
FROM node:24-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ go

# Setup pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm db:generate

# Build TypeScript services
RUN pnpm --filter web build
RUN pnpm --filter worker build

# Build Go ingest service
WORKDIR /app/apps/ingest
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/ingest ./cmd/ingest

# ============================================================
# Stage 2: Production runtime
# ============================================================
FROM node:24-alpine AS runner

# Install supervisor for process management
RUN apk add --no-cache supervisor

# Create non-root user
RUN addgroup --system --gid 1001 cognobserve && \
    adduser --system --uid 1001 cognobserve

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/ingest ./ingest
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma

# Copy supervisor configuration
COPY docker/supervisord.conf /etc/supervisord.conf

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set ownership
RUN chown -R cognobserve:cognobserve /app

USER cognobserve

# Expose ports
EXPOSE 3000 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Entrypoint runs migrations then starts supervisor
ENTRYPOINT ["/entrypoint.sh"]
```

#### 3.3.2 Supervisor Configuration

```ini
; docker/supervisord.conf
[supervisord]
nodaemon=true
user=cognobserve
logfile=/dev/stdout
logfile_maxbytes=0
pidfile=/tmp/supervisord.pid

[program:web]
command=node apps/web/server.js
directory=/app
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=NODE_ENV="production",PORT="3000"

[program:worker]
command=node apps/worker/dist/index.js
directory=/app
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=NODE_ENV="production"

[program:ingest]
command=/app/ingest
directory=/app
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=PORT="8080"
```

#### 3.3.3 Entrypoint Script

```bash
#!/bin/sh
# docker/entrypoint.sh

set -e

echo "🚀 Starting CognObserve..."

# ============================================================
# 1. Validate required environment variables
# ============================================================
echo "📋 Validating configuration..."

REQUIRED_VARS="DATABASE_URL REDIS_URL NEXTAUTH_SECRET NEXTAUTH_URL"
for var in $REQUIRED_VARS; do
  if [ -z "$(eval echo \$$var)" ]; then
    echo "❌ Error: $var is required but not set"
    exit 1
  fi
done

echo "✅ Configuration valid"

# ============================================================
# 2. Wait for database
# ============================================================
echo "⏳ Waiting for database..."

MAX_RETRIES=30
RETRY_COUNT=0

until node -e "
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  prisma.\$queryRaw\`SELECT 1\`.then(() => process.exit(0)).catch(() => process.exit(1));
" 2>/dev/null; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "❌ Database not available after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "   Waiting for database... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

echo "✅ Database connected"

# ============================================================
# 3. Run migrations (if enabled)
# ============================================================
if [ "${AUTO_MIGRATE:-true}" = "true" ]; then
  echo "🔄 Running database migrations..."
  cd /app/packages/db
  npx prisma migrate deploy
  cd /app
  echo "✅ Migrations complete"
fi

# ============================================================
# 4. Start services via supervisor
# ============================================================
echo "🎉 Starting services..."
exec supervisord -c /etc/supervisord.conf
```

### 3.4 Self-Hosted Docker Compose

```yaml
# docker-compose.self-hosted.yml
#
# CognObserve Self-Hosted Setup
#
# Quick Start:
#   1. Copy this file
#   2. Set required environment variables
#   3. Run: docker compose -f docker-compose.self-hosted.yml up -d
#
# Required Environment Variables:
#   - NEXTAUTH_SECRET: Random 32+ character string
#   - NEXTAUTH_URL: Your domain (e.g., https://observe.yourcompany.com)
#
# Generate NEXTAUTH_SECRET:
#   openssl rand -base64 32
#

version: "3.8"

services:
  # ============================================================
  # CognObserve Application (All-in-One)
  # ============================================================
  cognobserve:
    image: ghcr.io/cognobserve/cognobserve:latest
    container_name: cognobserve
    restart: unless-stopped
    ports:
      - "3000:3000"   # Web UI
      - "8080:8080"   # Ingest API (for SDKs)
    environment:
      # Required
      DATABASE_URL: postgresql://cognobserve:cognobserve@postgres:5432/cognobserve
      REDIS_URL: redis://redis:6379
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:?Please set NEXTAUTH_SECRET}
      NEXTAUTH_URL: ${NEXTAUTH_URL:-http://localhost:3000}

      # Optional - Uncomment to customize
      # LOG_LEVEL: info
      # RETENTION_DAYS: 30
      # ENABLE_REGISTRATION: true
      # TELEMETRY_ENABLED: true
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  # ============================================================
  # PostgreSQL Database
  # ============================================================
  postgres:
    image: postgres:16-alpine
    container_name: cognobserve-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: cognobserve
      POSTGRES_PASSWORD: cognobserve
      POSTGRES_DB: cognobserve
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cognobserve"]
      interval: 10s
      timeout: 5s
      retries: 5
    # Uncomment to expose PostgreSQL externally
    # ports:
    #   - "5432:5432"

  # ============================================================
  # Redis Cache & Queue
  # ============================================================
  redis:
    image: redis:7-alpine
    container_name: cognobserve-redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    # Uncomment to expose Redis externally
    # ports:
    #   - "6379:6379"

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local

# ============================================================
# Optional: Add reverse proxy for HTTPS
# ============================================================
# Uncomment the following to add Caddy for automatic HTTPS:
#
#   caddy:
#     image: caddy:2-alpine
#     container_name: cognobserve-caddy
#     restart: unless-stopped
#     ports:
#       - "80:80"
#       - "443:443"
#     volumes:
#       - ./Caddyfile:/etc/caddy/Caddyfile:ro
#       - caddy_data:/data
#     depends_on:
#       - cognobserve
#
# volumes:
#   caddy_data:
```

### 3.5 Health Check Endpoints

```typescript
// apps/web/src/app/api/health/route.ts

import { prisma } from "@cognobserve/db";
import { redis } from "@/lib/redis";
import { NextResponse } from "next/server";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  timestamp: string;
  checks: {
    database: CheckResult;
    redis: CheckResult;
    ingest: CheckResult;
  };
}

interface CheckResult {
  status: "pass" | "fail";
  latencyMs?: number;
  error?: string;
}

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "pass", latencyMs: Date.now() - start };
  } catch (error) {
    return { status: "fail", error: String(error) };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await redis.ping();
    return { status: "pass", latencyMs: Date.now() - start };
  } catch (error) {
    return { status: "fail", error: String(error) };
  }
}

async function checkIngest(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await fetch("http://ingest:8080/health", {
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      return { status: "pass", latencyMs: Date.now() - start };
    }
    return { status: "fail", error: `HTTP ${res.status}` };
  } catch (error) {
    return { status: "fail", error: String(error) };
  }
}

export async function GET() {
  const [database, redis, ingest] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkIngest(),
  ]);

  const checks = { database, redis, ingest };
  const allPassing = Object.values(checks).every((c) => c.status === "pass");
  const anyFailing = Object.values(checks).some((c) => c.status === "fail");

  const health: HealthStatus = {
    status: allPassing ? "healthy" : anyFailing ? "unhealthy" : "degraded",
    version: process.env.npm_package_version || "unknown",
    timestamp: new Date().toISOString(),
    checks,
  };

  const statusCode = health.status === "healthy" ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
```

---

## 4. User Experience

### 4.1 Quick Start Guide (README Section)

```markdown
## Self-Hosting CognObserve

### Quick Start (Docker Compose)

1. **Generate a secret key:**
   ```bash
   openssl rand -base64 32
   ```

2. **Create environment file:**
   ```bash
   cat > .env << EOF
   NEXTAUTH_SECRET=your-generated-secret-here
   NEXTAUTH_URL=http://localhost:3000
   EOF
   ```

3. **Start CognObserve:**
   ```bash
   curl -O https://raw.githubusercontent.com/cognobserve/cognobserve/main/docker-compose.self-hosted.yml
   docker compose -f docker-compose.self-hosted.yml up -d
   ```

4. **Access the dashboard:**
   Open http://localhost:3000

5. **Start sending traces:**
   ```bash
   # Install SDK
   npm install @cognobserve/sdk

   # Initialize in your app
   import { CognObserve } from '@cognobserve/sdk';

   const observe = new CognObserve({
     apiKey: 'your-api-key',
     endpoint: 'http://localhost:8080',
   });
   ```

### Configuration Options

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXTAUTH_SECRET` | ✅ | - | Session encryption key (32+ chars) |
| `NEXTAUTH_URL` | ✅ | - | Your application URL |
| `LOG_LEVEL` | ❌ | `info` | Logging verbosity |
| `RETENTION_DAYS` | ❌ | `30` | Data retention period |
| `ENABLE_REGISTRATION` | ❌ | `true` | Allow new user signups |

### Production Setup

For production deployments with HTTPS, see our [Production Guide](./docs/self-hosting/production.md).
```

### 4.2 First-Run Experience

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FIRST-RUN WIZARD (Future)                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Step 1: Create Admin Account                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  Email: [admin@example.com                    ]                 │   │
│   │  Password: [••••••••••••                      ]                 │   │
│   │  Confirm: [••••••••••••                       ]                 │   │
│   │                                              [Create Account]   │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   Step 2: Create First Project                                          │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  Project Name: [My AI App                     ]                 │   │
│   │                                                                 │   │
│   │  Your API Key: co_live_xxxxxxxxxxxxxxxxxxxx                    │   │
│   │  [Copy to Clipboard]                                            │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   Step 3: Install SDK                                                   │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  npm install @cognobserve/sdk                                   │   │
│   │                                                                 │   │
│   │  import { CognObserve } from '@cognobserve/sdk';               │   │
│   │  const observe = new CognObserve({                              │   │
│   │    apiKey: 'co_live_xxxxxxxxxxxxxxxxxxxx',                     │   │
│   │    endpoint: 'http://localhost:8080',                          │   │
│   │  });                                                            │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. File Structure

```
CognObserve/
├── docker-compose.self-hosted.yml    # NEW: Self-hosted compose
├── Dockerfile.all-in-one             # NEW: All-in-one image
├── docker/
│   ├── supervisord.conf              # NEW: Process manager config
│   └── entrypoint.sh                 # NEW: Startup script
├── packages/
│   ├── shared/
│   │   └── src/
│   │       └── config/
│   │           ├── schema.ts         # NEW: Config schema
│   │           └── index.ts          # NEW: Config loader
│   └── db/
│       └── src/
│           └── migrate.ts            # NEW: Migration runner
├── apps/
│   └── web/
│       └── src/
│           ├── instrumentation.ts    # NEW: Startup hooks
│           └── app/
│               └── api/
│                   └── health/
│                       └── route.ts  # NEW: Health endpoint
└── docs/
    └── self-hosting/
        ├── README.md                 # NEW: Quick start guide
        ├── configuration.md          # NEW: All config options
        ├── production.md             # NEW: Production guide
        └── troubleshooting.md        # NEW: Common issues
```

---

## 6. Testing Requirements

### 6.1 Configuration Tests

```typescript
// packages/shared/src/config/__tests__/schema.test.ts

describe("ConfigSchema", () => {
  it("validates required environment variables", () => {
    const valid = ConfigSchema.safeParse({
      DATABASE_URL: "postgresql://localhost:5432/test",
      REDIS_URL: "redis://localhost:6379",
      NEXTAUTH_SECRET: "a".repeat(32),
      NEXTAUTH_URL: "http://localhost:3000",
    });
    expect(valid.success).toBe(true);
  });

  it("rejects missing required variables", () => {
    const invalid = ConfigSchema.safeParse({});
    expect(invalid.success).toBe(false);
  });

  it("applies default values", () => {
    const result = ConfigSchema.parse({
      DATABASE_URL: "postgresql://localhost:5432/test",
      REDIS_URL: "redis://localhost:6379",
      NEXTAUTH_SECRET: "a".repeat(32),
      NEXTAUTH_URL: "http://localhost:3000",
    });
    expect(result.PORT).toBe(3000);
    expect(result.LOG_LEVEL).toBe("info");
    expect(result.RETENTION_DAYS).toBe(30);
  });
});
```

### 6.2 Docker Image Tests

```bash
#!/bin/bash
# scripts/test-docker-image.sh

set -e

echo "🧪 Testing Docker image..."

# Build image
docker build -f Dockerfile.all-in-one -t cognobserve:test .

# Start test environment
docker compose -f docker-compose.test.yml up -d

# Wait for health
echo "⏳ Waiting for services..."
sleep 30

# Check health endpoint
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health)
if [ "$HTTP_STATUS" != "200" ]; then
  echo "❌ Health check failed: HTTP $HTTP_STATUS"
  docker compose -f docker-compose.test.yml logs
  exit 1
fi

echo "✅ Docker image tests passed"

# Cleanup
docker compose -f docker-compose.test.yml down -v
```

---

## 7. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first trace | < 5 min | User testing |
| Docker image size | < 500MB | `docker images` |
| Startup time | < 30s | Health check timing |
| Memory usage (idle) | < 512MB | `docker stats` |
| Config validation errors | Clear messages | User feedback |

---

## 8. Industry Best Practices

Self-hosted observability platforms typically provide:

| Feature | CognObserve | Industry Standard |
|---------|-------------|-------------------|
| Docker Compose | ✅ | ✅ Required |
| All-in-one image | ✅ (planned) | ✅ Common |
| Auto-migrations | ✅ (planned) | ✅ Expected |
| Required config vars | 4 | 3-5 typical |
| One-click deploys | ✅ (planned) | ✅ Common |
| Helm chart | ❌ (future) | ✅ For enterprise |

---

## 9. Sprint Breakdown

### Phase 1: Foundation (Sprint Current+1) - 5 points

| Task | Points | Priority |
|------|--------|----------|
| Create `ConfigSchema` with Zod | 1 | P0 |
| Add sensible defaults to all services | 1 | P0 |
| Create `docker-compose.self-hosted.yml` | 1 | P0 |
| Add `/api/health` endpoint | 1 | P0 |
| Document environment variables | 1 | P0 |

### Phase 2: Polish (Sprint MVP+1) - 8 points

| Task | Points | Priority |
|------|--------|----------|
| Create `Dockerfile.all-in-one` | 3 | P1 |
| Implement auto-migration on startup | 2 | P1 |
| Add entrypoint with health waiting | 1 | P1 |
| Create self-hosting documentation | 2 | P1 |

### Phase 3: Distribution (Sprint MVP+2) - 5 points

| Task | Points | Priority |
|------|--------|----------|
| Setup GitHub Container Registry | 1 | P1 |
| Add one-click deploy buttons | 2 | P2 |
| Create first-run setup wizard | 2 | P2 |

---

## 10. Definition of Done

### Phase 1 (Foundation)
- [ ] All config via environment variables
- [ ] Sensible defaults for all optional config
- [ ] `docker-compose.self-hosted.yml` works with `docker compose up`
- [ ] Health endpoint returns service status
- [ ] README includes quick start section
- [ ] Environment variables documented

### Phase 2 (Polish)
- [ ] All-in-one Docker image builds successfully
- [ ] Image size < 500MB
- [ ] Auto-migrations run on startup
- [ ] Entrypoint waits for database
- [ ] Supervisor manages all processes
- [ ] Full self-hosting guide published

### Phase 3 (Distribution)
- [ ] Image published to ghcr.io
- [ ] Railway one-click deploy works
- [ ] Render one-click deploy works
- [ ] First-run wizard implemented
- [ ] Upgrade documentation complete
