# Quickstart

Get CognObserve running in under 5 minutes.

## Prerequisites

- Node.js 24+
- pnpm 9+ (`npm install -g pnpm`)
- Go 1.23+
- Docker

## Setup

```bash
# 1. Start databases
docker-compose up -d

# 2. Install dependencies
pnpm install
cd apps/ingest && go mod download && cd ../..

# 3. Setup environment & database
cp .env.example .env
pnpm db:generate
pnpm db:push
pnpm db:seed
```

## Run

```bash
# Terminal 1 - Web + Worker
pnpm dev

# Terminal 2 - Ingest API
cd apps/ingest && make dev
```

## Access

| Service      | URL                          |
| ------------ | ---------------------------- |
| Dashboard    | http://localhost:3000        |
| Ingest API   | http://localhost:8080        |
| Health Check | http://localhost:8080/health |

## Test It

```bash
# 1. Create a project in the dashboard and get an API key

# 2. Send a test trace
curl -X POST http://localhost:8080/v1/traces \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"name":"test","spans":[{"name":"llm-call","start_time":"2024-01-01T00:00:00Z","end_time":"2024-01-01T00:00:01Z","model":"gpt-4o","usage":{"prompt_tokens":100,"completion_tokens":50}}]}'
```

## Troubleshooting

| Issue                | Fix                                                     |
| -------------------- | ------------------------------------------------------- |
| Traces not appearing | Check worker terminal for errors                        |
| Costs showing $0     | Run `pnpm db:seed` to add model pricing                 |
| Connection refused   | Run `docker-compose ps` to verify databases are running |
