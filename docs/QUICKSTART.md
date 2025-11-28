# Quickstart

## Prerequisites
- Node.js 24+
- pnpm (`npm install -g pnpm`)
- Go 1.23+
- Docker

## Setup (One Time)

```bash
# 1. Start databases
docker-compose up -d

# 2. Install dependencies
pnpm install

# 3. Setup database
cp .env.example .env
pnpm db:generate
pnpm db:push

# 4. Install Go deps
cd apps/ingest && go mod download && cd ../..
```

## Run (Daily)

```bash
# Terminal 1 - Web + Worker
pnpm dev

# Terminal 2 - Ingest API
cd apps/ingest && make dev
```

## URLs

- Web: http://localhost:3000
- API: http://localhost:8080
- Health: http://localhost:8080/health

## Test

```bash
curl http://localhost:8080/health
```
