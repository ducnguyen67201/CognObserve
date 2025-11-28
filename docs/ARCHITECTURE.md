# CognObserve Architecture

## Complete Project Structure

```
CognObserve/
│
├── proto/                                 # 🔵 SOURCE OF TRUTH (you edit these)
│   └── cognobserve/v1/
│       ├── common.proto                   #    TokenUsage, SpanLevel
│       ├── trace.proto                    #    Trace, Span, Project, ApiKey
│       └── ingest.proto                   #    IngestTraceRequest/Response
│
├── buf.yaml                               # Buf configuration
├── buf.gen.yaml                           # Generation targets
│
│   ┌─────────────────────────────────────────────────────────────────┐
│   │                    make proto (buf generate)                    │
│   └─────────────────────────────────────────────────────────────────┘
│                          │                           │
│                          ▼                           ▼
├── packages/
│   ├── proto/                             # 🟢 GENERATED TypeScript types
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts                   #    Re-exports all
│   │       └── generated/                 #    ⚡ Auto-generated
│   │           └── cognobserve/v1/
│   │               ├── common.ts          #    TokenUsage, SpanLevel
│   │               ├── trace.ts           #    Trace, Span, etc.
│   │               └── ingest.ts          #    IngestTraceRequest, etc.
│   │
│   ├── db/                                # 🟡 Prisma (Database types)
│   │   ├── package.json
│   │   ├── prisma/
│   │   │   └── schema.prisma              #    DB schema definition
│   │   └── src/
│   │       └── index.ts                   #    Exports prisma client
│   │           │
│   │           └── generates → node_modules/@prisma/client
│   │                           (Prisma.TraceCreateInput, etc.)
│   │
│   ├── shared/                            # 🔷 Shared utilities (no types!)
│   │   └── src/
│   │       ├── index.ts
│   │       ├── constants.ts               #    APP_NAME, QUEUE_KEYS
│   │       └── utils.ts                   #    generateId, retry, etc.
│   │
│   ├── config-typescript/
│   └── config-eslint/
│
├── apps/
│   ├── ingest/                            # 🟠 Go Service (github.com/cognobserve/ingest)
│   │   ├── go.mod
│   │   ├── cmd/ingest/main.go
│   │   ├── Dockerfile
│   │   ├── Makefile
│   │   └── internal/
│   │       ├── config/
│   │       ├── handler/
│   │       ├── model/
│   │       ├── queue/
│   │       ├── server/
│   │       └── proto/                     # 🟢 GENERATED Go types
│   │           └── cognobservev1/         #    ⚡ Auto-generated
│   │               ├── common.pb.go
│   │               ├── trace.pb.go
│   │               └── ingest.pb.go
│   │
│   ├── web/                               # 🟣 Next.js Dashboard
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   └── src/app/
│   │       └── ...
│   │
│   └── worker/                            # 🟤 Background Processor
│       ├── package.json
│       └── src/
│           ├── index.ts
│           ├── queue/consumer.ts
│           └── processors/trace.ts        #    Proto → Prisma conversion
│
├── docker-compose.yml
├── Makefile
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## Type System Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TYPE DEFINITIONS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────────────┐              ┌──────────────────────┐           │
│   │   proto/*.proto      │              │  prisma/schema.prisma │           │
│   │   (API contracts)    │              │  (Database schema)    │           │
│   └──────────┬───────────┘              └──────────┬───────────┘           │
│              │                                     │                        │
│              │ buf generate                        │ prisma generate        │
│              │                                     │                        │
│              ▼                                     ▼                        │
│   ┌──────────────────────┐              ┌──────────────────────┐           │
│   │ packages/proto/      │              │ @prisma/client       │           │
│   │ src/generated/*.ts   │              │ (in node_modules)    │           │
│   ├──────────────────────┤              ├──────────────────────┤           │
│   │ apps/ingest/         │              │ Prisma.TraceCreate   │           │
│   │ internal/proto/*.go  │              │ Prisma.SpanCreate    │           │
│   └──────────────────────┘              └──────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                                                                             │
│   ┌─────────┐         ┌─────────────┐         ┌─────────────┐              │
│   │   SDK   │  HTTP   │   Ingest    │  Redis  │   Worker    │              │
│   │  (TS)   │ ──────► │    (Go)     │ ──────► │    (TS)     │              │
│   └─────────┘  JSON   └─────────────┘  Queue  └──────┬──────┘              │
│       │                     │                        │                      │
│       │ uses                │ uses                   │ converts             │
│       ▼                     ▼                        ▼                      │
│   ┌─────────┐         ┌─────────────┐         ┌─────────────┐              │
│   │ Proto   │         │ Proto (Go)  │         │ Proto → DB  │              │
│   │ Types   │         │ Types       │         │ Conversion  │              │
│   │  (TS)   │         │ *.pb.go     │         │             │              │
│   └─────────┘         └─────────────┘         └──────┬──────┘              │
│                                                      │                      │
│                                                      │ Prisma ORM           │
│                                                      ▼                      │
│                                               ┌─────────────┐              │
│                                               │ PostgreSQL  │              │
│   ┌─────────┐                                 └──────┬──────┘              │
│   │   Web   │  Prisma                                │                      │
│   │(Next.js)│ ◄──────────────────────────────────────┘                      │
│   └─────────┘  Query                                                        │
│       │                                                                     │
│       │ uses                                                                │
│       ▼                                                                     │
│   ┌─────────┐                                                               │
│   │ Prisma  │                                                               │
│   │ Types   │                                                               │
│   └─────────┘                                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Which Service Uses What Types

| Service | Proto Types | Prisma Types | Shared Utils |
|---------|-------------|--------------|--------------|
| **SDK** (external) | `@cognobserve/proto` | - | - |
| **Ingest** (Go) | `github.com/cognobserve/ingest/internal/proto/cognobservev1` | - | - |
| **Worker** (TS) | `@cognobserve/proto` | `@cognobserve/db` | `@cognobserve/shared` |
| **Web** (Next.js) | `@cognobserve/proto` (API) | `@cognobserve/db` | `@cognobserve/shared` |

## Generation Commands

```bash
# Generate Proto types (Go + TypeScript)
make proto
# Output:
#   → packages/proto/src/generated/*.ts
#   → apps/ingest/internal/proto/cognobservev1/*.pb.go

# Generate Prisma client
pnpm db:generate
# Output:
#   → node_modules/@prisma/client (TypeScript types)
```

## Generated Types Summary

| Location | What | Generated By | Used By |
|----------|------|--------------|---------|
| `proto/*.proto` | Source definitions | You (manual) | buf generate |
| `packages/proto/src/generated/` | TypeScript proto types | `buf generate` | web, worker, SDK |
| `apps/ingest/internal/proto/cognobservev1/` | Go proto types | `buf generate` | ingest |
| `node_modules/@prisma/client` | Database types | `prisma generate` | web, worker |

## Services Overview

| Service | Port | Language | Purpose |
|---------|------|----------|---------|
| **Web** | 3000 | TypeScript (Next.js) | Dashboard, API |
| **Ingest** | 8080 | Go | High-throughput trace ingestion |
| **Worker** | - | TypeScript | Background jobs, queue processing |
| **PostgreSQL** | 5432 | - | Primary database |
| **Redis** | 6379 | - | Queue, cache |

## Go Module Structure

The Go ingest service uses a clean module path:

```
Module: github.com/cognobserve/ingest

Imports:
├── github.com/cognobserve/ingest/internal/config
├── github.com/cognobserve/ingest/internal/handler
├── github.com/cognobserve/ingest/internal/model
├── github.com/cognobserve/ingest/internal/queue
├── github.com/cognobserve/ingest/internal/server
└── github.com/cognobserve/ingest/internal/proto/cognobservev1  (generated)
```

## Type Conversion Flow

The worker handles conversion between Proto types (API) and Prisma types (Database):

```
Queue (Proto-like JSON) → TraceProcessor → Prisma → PostgreSQL
```

### Example Conversion

```typescript
// Queue format (from Go)          →  Prisma format (to DB)
{                                     {
  ID: "abc123",                         id: "abc123",
  ProjectID: "proj1",                   project: { connect: { id: "proj1" } },
  Name: "my-trace",                     name: "my-trace",
  Timestamp: "2024-01-01T...",          timestamp: new Date("2024-01-01T..."),
  Metadata: {...},                      metadata: {...},
}                                     }

// Span level conversion
Proto enum (number)  →  Prisma enum (string)
0 (UNSPECIFIED)     →  DEFAULT
1 (DEBUG)           →  DEBUG
2 (DEFAULT)         →  DEFAULT
3 (WARNING)         →  WARNING
4 (ERROR)           →  ERROR
```
