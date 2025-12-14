# CognObserve

AI Platform Monitoring & Observability system for tracing, monitoring, and analytics of AI/LLM applications.

## Quick Start

### Prerequisites

- Node.js 24+
- pnpm 9.15+
- Go 1.23+
- Docker & Docker Compose
- [Doppler CLI](https://docs.doppler.com/docs/install-cli) (for secret management)

### 1. Install Doppler CLI

```bash
# macOS
brew install dopplerhq/cli/doppler

# Linux
curl -sLf https://cli.doppler.com/install.sh | sh
```

### 2. Setup Doppler

```bash
# Login to Doppler
doppler login

# Configure project (uses doppler.yaml)
doppler setup --no-interactive

# Verify secrets are accessible
make doppler-check
```

### 3. Start Development

```bash
# Install dependencies
make install

# Start infrastructure (PostgreSQL, Temporal)
make docker-up

# Generate Prisma client
make db-generate

# Run all services
make dev

# In separate terminal: run Go ingest service
make dev-ingest
```

## Project Structure

```
CognObserve/
├── apps/
│   ├── web/           # Next.js dashboard & API
│   ├── ingest/        # Go ingestion service
│   └── worker/        # Temporal worker (TypeScript)
├── packages/
│   ├── api/           # tRPC routers + schemas
│   ├── db/            # Prisma schema & client
│   ├── proto/         # Generated TypeScript types
│   └── shared/        # Shared utilities
├── proto/             # Protobuf definitions
├── doppler.yaml       # Doppler secret management config
└── turbo.json         # Turborepo config
```

## Services

| Service | Port | Purpose |
|---------|------|---------|
| Web | 3000 | Dashboard, API |
| Ingest | 8080 | High-throughput trace ingestion |
| Worker | - | Temporal worker (background jobs) |
| Temporal | 7233 | Workflow orchestration |
| Temporal UI | 8088 | Workflow monitoring |
| PostgreSQL | 5432 | Primary database |

## Secret Management (Doppler)

This project uses [Doppler](https://doppler.com) for centralized secret management.

### Commands

```bash
# Check Doppler is installed
make check-doppler

# Setup Doppler config
make doppler-setup

# Verify secrets are accessible
make doppler-check

# Run with secrets
pnpm dev                    # Uses Doppler automatically
doppler run -- <command>    # Run any command with secrets
```

### Fallback (without Doppler)

If Doppler is not configured, you can use a local `.env` file:

```bash
cp .env.example .env
# Edit .env with your secrets
pnpm dev:no-doppler
```

## Make Commands

```bash
make help              # Show all available commands
make dev               # Run TypeScript apps (web, worker)
make dev-ingest        # Run Go ingest service
make docker-up         # Start PostgreSQL + Temporal
make db-studio         # Open Prisma Studio
make build             # Build all services
```

## Documentation

- [Doppler Setup](docs/specs/issue-104-doppler-secret-management.md)
- [API Keys Spec](docs/specs/01_API_KEYS_SPEC.md)
- [Alert System](docs/specs/issue-99-alert-system-v2.md)
