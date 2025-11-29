# CognObserve - Claude Code Context

## Project Overview
CognObserve is an AI Platform Monitoring & Observability system, similar to Langfuse. It provides tracing, monitoring, and analytics for AI/LLM applications.

## Tech Stack
- **Monorepo**: pnpm 9.15 workspaces + Turborepo 2.5
- **Web**: Next.js 16, React 19, TypeScript 5.7, Tailwind CSS 3.4, shadcn/ui (yellow theme)
- **Ingest**: Go 1.23 (high-performance ingestion service)
- **Worker**: Node.js 24+ with TypeScript 5.7
- **Database**: PostgreSQL with Prisma 7 (Rust-free, ESM)
- **Cache/Queue**: Redis
- **Type Sharing**: Protocol Buffers (Buf)
- **Containerization**: Docker Compose
- **Linting**: ESLint 9, Prettier 3.4

## Project Structure
```
CognObserve/
├── proto/                       # Protobuf definitions (source of truth)
│   └── cognobserve/v1/
│       ├── common.proto         # Shared types (TokenUsage, SpanLevel)
│       ├── trace.proto          # Trace, Span, Project, ApiKey
│       └── ingest.proto         # Ingestion API messages
├── apps/
│   ├── web/                     # Next.js dashboard & API
│   │   └── src/app/
│   ├── ingest/                  # Go ingestion service (github.com/cognobserve/ingest)
│   │   ├── cmd/ingest/          # Entry point
│   │   └── internal/
│   │       ├── config/          # Configuration
│   │       ├── handler/         # HTTP handlers
│   │       ├── model/           # Internal models
│   │       ├── queue/           # Redis queue producer
│   │       ├── server/          # HTTP server setup
│   │       └── proto/cognobservev1/  # Generated Go types
│   └── worker/                  # Background job processing
├── packages/
│   ├── proto/                   # Generated TypeScript types
│   │   └── src/generated/
│   ├── config-eslint/
│   ├── config-typescript/
│   ├── db/                      # Prisma schema & client
│   └── shared/                  # Shared utilities
├── buf.yaml                     # Buf configuration
├── buf.gen.yaml                 # Code generation config
├── turbo.json
├── docker-compose.yml
├── Makefile                     # Root commands
└── package.json
```

## Commands

### Proto Generation (Types)
```bash
# Generate types for Go and TypeScript
make proto

# Lint proto files
make proto-lint

# Check breaking changes
make proto-breaking
```

### Development
```bash
# Install all dependencies
make install

# Start databases (PostgreSQL, Redis)
make docker-up

# Copy environment file
cp .env.example .env

# Generate Prisma client
pnpm db:generate

# Run TypeScript apps (web, worker)
pnpm dev

# Run Go ingest service
cd apps/ingest && make dev
```

### Build & Deploy
```bash
# Build all
make build

# Build ingest Docker image
cd apps/ingest && make docker-build
```

## Architecture

### Data Flow
```
SDK → [Ingest (Go)] → Redis Queue → [Worker (TS)] → PostgreSQL
                                          ↓
                                    [Web (Next.js)]
```

### Type Sharing with Protobuf
```
proto/*.proto (source of truth)
        ↓
    buf generate
        ↓
┌───────────────────────────────────┐
│                                   │
▼                                   ▼
packages/proto/           apps/ingest/internal/proto/
(TypeScript)              (Go)
```

- Edit `.proto` files → run `make proto` → types sync everywhere
- All services use same type definitions
- Each service bundles types at build time (no runtime dependency)

## Services

| Service | Port | Purpose |
|---------|------|---------|
| Web | 3000 | Dashboard, API |
| Ingest | 8080 | High-throughput trace ingestion |
| Worker | - | Background jobs, queue processing |
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Queue, cache |

## Database Schema
Core models in `packages/db/prisma/schema.prisma`:
- **Project**: Organization/project container
- **ApiKey**: Authentication keys per project
- **Trace**: Top-level trace for a request/operation
- **Span**: Individual operations within a trace (LLM calls, etc.)

## Development Guidelines
- **Types**: Edit `proto/*.proto`, run `make proto`
- **TypeScript packages**: `@cognobserve/proto`, `@cognobserve/shared`, `@cognobserve/db`
- **Go service**: Standard layout in `apps/ingest/`
- Run `pnpm lint` before committing
- Database changes go through `packages/db`

## Code Style Rules

### No Inline Functions
- **Never use inline arrow functions in JSX** - Extract to named functions or handlers
- Define event handlers outside JSX: `const handleClick = () => {}` not `onClick={() => {}}`
- Extract callbacks passed to hooks: `const fetchData = useCallback(...)` not inline in deps

```tsx
// BAD
<Button onClick={() => setOpen(true)}>Open</Button>
{items.map((item) => <Item key={item.id} {...item} />)}

// GOOD
const handleOpen = () => setOpen(true);
const renderItem = (item: Item) => <Item key={item.id} {...item} />;

<Button onClick={handleOpen}>Open</Button>
{items.map(renderItem)}
```

### Constants
- **Use UPPER_SNAKE_CASE for constants**
- Define constants at module level, not inside components
- For complex/shared constants, create a dedicated `constants.ts` file
- Group related constants in objects when appropriate

```tsx
// Simple constants - top of file
const MAX_ITEMS = 10;
const API_TIMEOUT = 5000;

// Complex constants - separate file (e.g., src/lib/constants.ts)
export const NAV_ITEMS = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Projects", href: "/projects", icon: FolderKanban },
] as const;

export const ERROR_MESSAGES = {
  UNAUTHORIZED: "You must be logged in",
  NOT_FOUND: "Resource not found",
} as const;
```

### Custom Hooks
- **Extract reusable logic into custom hooks** in `src/hooks/`
- Use hooks for: data fetching, form handling, subscriptions, complex state
- Name hooks with `use` prefix: `useProjects`, `useAuth`, `useDebounce`
- Keep components thin - business logic belongs in hooks

```tsx
// src/hooks/use-projects.ts
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // ... fetch logic
  return { projects, isLoading, refetch };
}

// Component stays simple
function ProjectsPage() {
  const { projects, isLoading } = useProjects();
  if (isLoading) return <Skeleton />;
  return <ProjectList projects={projects} />;
}
```

## UI Components (shadcn/ui)

### Setup
- **Theme**: Yellow (defined in `apps/web/src/app/globals.css`)
- **Style**: new-york
- **Components**: `apps/web/src/components/ui/`
- **Config**: `apps/web/components.json`

### Best Practices
- **ALWAYS use shadcn/ui components** - Never create custom CSS for buttons, inputs, cards, dialogs, etc.
- **Add components via CLI**: `pnpm dlx shadcn@latest add <component>` from `apps/web/`
- **Use semantic color variables** - Use `primary`, `secondary`, `muted`, `accent`, `destructive` instead of hardcoded colors
- **Extend, don't override** - If customizing, use the `cn()` utility to merge classes
- **Available components**: button, card, input, label, form, sonner, dialog, dropdown-menu, table, tabs, avatar, badge, separator, skeleton

### Usage Examples
```tsx
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

// Use semantic variants
<Button variant="default">Primary Action</Button>  // Yellow theme
<Button variant="secondary">Secondary</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outlined</Button>
<Button variant="ghost">Ghost</Button>

// Cards
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
</Card>
```

### Environment Variables
- Centralized in `apps/web/src/lib/env.ts` using `@t3-oss/env-nextjs`
- Always use `env.VAR_NAME` instead of `process.env.VAR_NAME`
- Validation runs at build/startup time

## API Endpoints

### Ingest Service (Go)
- `GET /health` - Health check
- `POST /v1/traces` - Ingest a trace with spans

## Notes for Claude
- Proto files are source of truth for types
- After editing `.proto`, run `make proto`
- Go ingest service uses chi router (module: `github.com/cognobserve/ingest`)
- Go imports: `import pb "github.com/cognobserve/ingest/internal/proto/cognobservev1"`
- Web app uses Next.js 16 App Router
- Database schema in `packages/db/prisma/schema.prisma`
- Proto definitions in `proto/cognobserve/v1/`
- Full documentation in `/docs` folder
- **UI**: ALWAYS use shadcn/ui components from `@/components/ui/`. Never write custom CSS for standard UI elements.
- **Env vars**: Use `env` from `@/lib/env` instead of `process.env`
- **Adding shadcn components**: Run `pnpm dlx shadcn@latest add <component>` from `apps/web/`
