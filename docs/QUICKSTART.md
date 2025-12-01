# Quickstart

## Prerequisites
- Node.js 24+
- pnpm (`npm install -g pnpm`)
- Go 1.23+
- Docker

## Setup (One Time)

```bash
# 1. Start databases (PostgreSQL + Redis)
docker-compose up -d

# 2. Install dependencies
pnpm install

# 3. Setup database
cp .env.example .env
pnpm db:generate
pnpm db:push

# 4. (Optional) Seed sample data
pnpm db:seed

# 5. Install Go deps
cd apps/ingest && go mod download && cd ../..
```

## Run (Daily)

### Option A: All Services Together

```bash
# Terminal 1 - Web + Worker (via Turborepo)
pnpm dev

# Terminal 2 - Ingest API (Go)
cd apps/ingest && make dev
```

### Option B: Run Services Separately

```bash
# Terminal 1 - Web only
pnpm --filter @cognobserve/web dev

# Terminal 2 - Worker only
pnpm --filter @cognobserve/worker dev

# Terminal 3 - Ingest API (Go)
cd apps/ingest && make dev
```

## Architecture

```
SDK → [Ingest :8080] → Redis Queue → [Worker] → PostgreSQL → [Web :3000]
```

| Service | Port | Command | Description |
|---------|------|---------|-------------|
| Web | 3000 | `pnpm --filter @cognobserve/web dev` | Next.js dashboard |
| Worker | - | `pnpm --filter @cognobserve/worker dev` | Queue consumer, persists traces, calculates costs |
| Ingest | 8080 | `cd apps/ingest && make dev` | High-throughput Go ingestion API |
| PostgreSQL | 5432 | `docker-compose up -d` | Primary database |
| Redis | 6379 | `docker-compose up -d` | Message queue |

## URLs

- Web Dashboard: http://localhost:3000
- Ingest API: http://localhost:8080
- Health Check: http://localhost:8080/health

## Test Ingestion

```bash
# Check ingest service health
curl http://localhost:8080/health

# Send a test trace (requires API key from dashboard)
curl -X POST http://localhost:8080/v1/traces \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "name": "test-trace",
    "spans": [{
      "name": "llm-call",
      "start_time": "2024-01-01T00:00:00Z",
      "end_time": "2024-01-01T00:00:01Z",
      "model": "gpt-4o",
      "usage": {
        "prompt_tokens": 100,
        "completion_tokens": 50,
        "total_tokens": 150
      }
    }]
  }'
```

## Worker Details

The worker service (`apps/worker/`) consumes traces from Redis and:

1. **Persists traces** to PostgreSQL
2. **Calculates costs** based on model pricing (from `ModelPricing` table)
3. **Updates daily summaries** in `CostDailySummary` table

### Environment Variables

The worker requires:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string (default: `redis://localhost:6379`)

### Logs

When running, you'll see logs like:
```
Starting CognObserve Worker v0.1.0
Connected to Redis, consuming from cognobserve:traces
Worker initialized and consuming from queue
Processing trace: abc123 with 3 spans
Calculating costs for 2 billable spans
Updated costs for 2 spans
Trace abc123 persisted successfully
```

## Troubleshooting

### Worker not processing traces?
1. Check Redis is running: `docker-compose ps`
2. Check worker logs for errors
3. Verify `REDIS_URL` matches between ingest and worker

### Costs showing $0.00?
1. Ensure `ModelPricing` table is seeded: `pnpm db:seed`
2. Check span has `model` and `usage.prompt_tokens`/`usage.completion_tokens`
3. Model name must match pricing table (e.g., `gpt-4o`, `claude-3-5-sonnet`)
