# CognObserve - Claude Code Context

## Project Overview
CognObserve is an AI Platform Monitoring & Observability system. It provides tracing, monitoring, and analytics for AI/LLM applications.

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

### Zod Schemas as Source of Truth
- **Define types as Zod schemas first** - Infer TypeScript types from schemas
- **Store schemas in `packages/api/src/schemas/`** - Centralized location for shared types
- **Never hardcode constants for enums/unions** - Define as Zod schema, derive constants from it
- **Export both schema and inferred type** - `export const MySchema = z.enum([...]); export type My = z.infer<typeof MySchema>;`
- **Client components**: Import from `@cognobserve/api/schemas` (NOT `@cognobserve/api`) to avoid server-side deps

```typescript
// BAD - Hardcoded constants without schema
export const ADMIN_ROLES = ["OWNER", "ADMIN"] as const;
export const ALL_ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;

// GOOD - Zod schema as source of truth
// packages/api/src/schemas/roles.ts
import { z } from "zod";

export const ProjectRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
export type ProjectRole = z.infer<typeof ProjectRoleSchema>;

// Derive constants from schema
export const ADMIN_ROLES: readonly ProjectRole[] = ["OWNER", "ADMIN"];
export const ALL_ROLES: readonly ProjectRole[] = ProjectRoleSchema.options;

// Validation helper
export const isValidRole = (role: string): role is ProjectRole => {
  return ProjectRoleSchema.safeParse(role).success;
};

// Client component usage (avoids server-side deps)
import { WORKSPACE_ADMIN_ROLES } from "@cognobserve/api/schemas";
```

### Custom Hooks
- **Extract reusable logic into custom hooks** in `src/hooks/`
- Use hooks for: data fetching, form handling, subscriptions, complex state
- Name hooks with `use` prefix: `useProjects`, `useAuth`, `useDebounce`
- Keep components thin - business logic belongs in hooks
- **Optimize hook dependencies** - Use stable references, memoize objects/arrays passed to deps

```tsx
// src/hooks/use-projects.ts
export function useProjects(workspaceId: string) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.projects.list(workspaceId);
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch"));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return { projects, isLoading, error, refetch: fetchProjects };
}

// Component stays simple - no business logic
function ProjectsPage({ workspaceId }: Props) {
  const { projects, isLoading, error } = useProjects(workspaceId);

  if (error) return <ErrorState error={error} />;
  if (isLoading) return <ProjectsSkeleton />;
  return <ProjectList projects={projects} />;
}
```

## Frontend Engineering Best Practices

**Code like a senior frontend engineer.** Write maintainable, performant, and scalable code. Every component, hook, and utility should be crafted with care.

### Function Decomposition
- **Break large functions into smaller, focused functions** - Each function should do ONE thing well
- **Functions over 20-30 lines are candidates for splitting** - If you need to scroll, it's too long
- **Name functions by what they do, not how** - `validateEmail` not `checkStringForAtSymbol`
- **Pure functions are preferred** - Same input always produces same output, no side effects

```tsx
// BAD - Monolithic function doing too many things
function handleSubmit(data: FormData) {
  const errors: string[] = [];
  if (!data.email) errors.push("Email required");
  if (!data.email.includes("@")) errors.push("Invalid email");
  if (!data.password) errors.push("Password required");
  if (data.password.length < 8) errors.push("Password too short");
  if (!/[A-Z]/.test(data.password)) errors.push("Need uppercase");
  if (!/[0-9]/.test(data.password)) errors.push("Need number");
  if (errors.length > 0) {
    setErrors(errors);
    return;
  }
  setIsLoading(true);
  fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
    .then((res) => res.json())
    .then((result) => {
      if (result.success) {
        router.push("/dashboard");
      } else {
        setErrors([result.message]);
      }
    })
    .catch(() => setErrors(["Network error"]))
    .finally(() => setIsLoading(false));
}

// GOOD - Decomposed into focused, testable functions
// src/lib/validation/auth.ts
const validateEmail = (email: string): string | null => {
  if (!email) return "Email is required";
  if (!email.includes("@")) return "Invalid email format";
  return null;
};

const validatePassword = (password: string): string[] => {
  const errors: string[] = [];
  if (!password) return ["Password is required"];
  if (password.length < 8) errors.push("Password must be at least 8 characters");
  if (!/[A-Z]/.test(password)) errors.push("Password must contain uppercase letter");
  if (!/[0-9]/.test(password)) errors.push("Password must contain a number");
  return errors;
};

export const validateRegistration = (data: FormData): string[] => {
  const errors: string[] = [];
  const emailError = validateEmail(data.email);
  if (emailError) errors.push(emailError);
  errors.push(...validatePassword(data.password));
  return errors;
};

// src/hooks/use-registration.ts
export function useRegistration() {
  const router = useRouter();
  const [errors, setErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const register = useCallback(async (data: FormData) => {
    const validationErrors = validateRegistration(data);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);
    setErrors([]);

    try {
      const result = await authApi.register(data);
      router.push("/dashboard");
    } catch (error) {
      setErrors([getErrorMessage(error)]);
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  return { register, errors, isLoading };
}

// Component is minimal
function RegistrationForm() {
  const { register, errors, isLoading } = useRegistration();
  const handleSubmit = (data: FormData) => register(data);
  // ... render form
}
```

### Shared Utilities
- **Create reusable utilities in `src/lib/`** - Formatting, validation, API helpers
- **Cross-package utilities go in `packages/shared/`** - Used by multiple apps
- **Group utilities by domain** - `lib/format.ts`, `lib/date.ts`, `lib/validation.ts`
- **Utilities must be pure functions** - No React hooks, no side effects
- **Write utilities once, use everywhere** - DRY principle

```tsx
// BAD - Duplicated formatting logic across components
function TraceCard({ trace }: Props) {
  const duration = trace.endTime - trace.startTime;
  const formatted = duration < 1000
    ? `${duration}ms`
    : duration < 60000
    ? `${(duration / 1000).toFixed(2)}s`
    : `${(duration / 60000).toFixed(2)}m`;
  // ...
}

function SpanRow({ span }: Props) {
  const duration = span.endTime - span.startTime;
  const formatted = duration < 1000
    ? `${duration}ms`
    : duration < 60000
    ? `${(duration / 1000).toFixed(2)}s`
    : `${(duration / 60000).toFixed(2)}m`;  // Duplicated!
  // ...
}

// GOOD - Centralized utility functions
// src/lib/format.ts
export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat().format(num);
};

export const formatPercentage = (value: number, total: number): string => {
  if (total === 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
};

// Usage - clean and consistent
function TraceCard({ trace }: Props) {
  const duration = formatDuration(trace.endTime - trace.startTime);
  // ...
}

function SpanRow({ span }: Props) {
  const duration = formatDuration(span.endTime - span.startTime);
  // ...
}
```

### Component Optimization
- **Use React.memo for expensive pure components** - Prevents unnecessary re-renders
- **Use useMemo for expensive computations** - Cache calculated values
- **Use useCallback for stable function references** - Prevent child re-renders
- **Lazy load heavy components** - Code splitting with `React.lazy` and `next/dynamic`
- **Virtualize long lists** - Use `@tanstack/react-virtual` for 100+ items

```tsx
// BAD - Re-renders on every parent render, recalculates on every render
function TraceList({ traces, filter }: Props) {
  // Recalculated every render
  const filteredTraces = traces
    .filter((t) => t.status === filter)
    .sort((a, b) => b.timestamp - a.timestamp);

  // New function reference every render
  const handleTraceClick = (id: string) => {
    router.push(`/traces/${id}`);
  };

  return (
    <div>
      {filteredTraces.map((trace) => (
        <TraceRow
          key={trace.id}
          trace={trace}
          onClick={() => handleTraceClick(trace.id)}
        />
      ))}
    </div>
  );
}

// GOOD - Optimized with memoization and stable references
const TraceRow = memo(function TraceRow({ trace, onClick }: TraceRowProps) {
  return (
    <div onClick={onClick} className="trace-row">
      <span>{trace.name}</span>
      <span>{formatDuration(trace.duration)}</span>
    </div>
  );
});

function TraceList({ traces, filter }: Props) {
  const router = useRouter();

  // Memoize expensive computation
  const filteredTraces = useMemo(() => {
    return traces
      .filter((t) => t.status === filter)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [traces, filter]);

  // Stable function reference
  const handleTraceClick = useCallback((id: string) => {
    router.push(`/traces/${id}`);
  }, [router]);

  // Create stable onClick handlers
  const getClickHandler = useCallback(
    (id: string) => () => handleTraceClick(id),
    [handleTraceClick]
  );

  return (
    <div>
      {filteredTraces.map((trace) => (
        <TraceRow
          key={trace.id}
          trace={trace}
          onClick={getClickHandler(trace.id)}
        />
      ))}
    </div>
  );
}

// Lazy loading for heavy components
const TraceDetailPanel = dynamic(
  () => import("@/components/trace-detail-panel"),
  { loading: () => <Skeleton className="h-96" /> }
);
```

### Component Structure
- **One component per file** - Easier to find and maintain
- **Co-locate related files** - Component, styles, tests in same directory for complex components
- **Extract sub-components** - Break large components into smaller pieces
- **Props interface at top** - Define types before component

```tsx
// BAD - Everything in one massive component
function Dashboard() {
  // 50+ lines of hooks and state
  // 200+ lines of JSX with inline logic
  // Impossible to test individual parts
}

// GOOD - Structured component hierarchy
// src/components/dashboard/index.tsx
interface DashboardProps {
  workspaceId: string;
}

export function Dashboard({ workspaceId }: DashboardProps) {
  const { metrics, isLoading } = useDashboardMetrics(workspaceId);

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <DashboardHeader workspaceId={workspaceId} />
      <MetricsGrid metrics={metrics} />
      <RecentTraces workspaceId={workspaceId} />
      <UsageChart workspaceId={workspaceId} />
    </div>
  );
}

// src/components/dashboard/metrics-grid.tsx
interface MetricsGridProps {
  metrics: DashboardMetrics;
}

export function MetricsGrid({ metrics }: MetricsGridProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <MetricCard title="Total Traces" value={metrics.totalTraces} />
      <MetricCard title="Avg Latency" value={formatDuration(metrics.avgLatency)} />
      <MetricCard title="Error Rate" value={formatPercentage(metrics.errors, metrics.total)} />
      <MetricCard title="Token Usage" value={formatNumber(metrics.tokens)} />
    </div>
  );
}
```

### Performance Patterns
- **Avoid prop drilling** - Use context or composition for deeply nested data
- **Debounce user inputs** - Search, filters, form fields
- **Throttle scroll/resize handlers** - Prevent excessive calls
- **Use Suspense boundaries** - Graceful loading states
- **Preload critical data** - Use Next.js `prefetch` and React Query `prefetchQuery`

```tsx
// BAD - Uncontrolled re-fetching on every keystroke
function SearchInput({ onSearch }: Props) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onSearch(e.target.value);  // Fires on every keystroke!
  };
  return <Input onChange={handleChange} />;
}

// GOOD - Debounced search with custom hook
// src/hooks/use-debounce.ts
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// src/components/search-input.tsx
function SearchInput({ onSearch }: Props) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    onSearch(debouncedQuery);
  }, [debouncedQuery, onSearch]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  return <Input value={query} onChange={handleChange} />;
}
```

### Prevent Race Conditions
- **Never use check-then-act patterns** - Separate find/check + action calls create race conditions
- **Use atomic operations** - Single database call for conditional mutations
- **Use transactions** when multiple operations must succeed or fail together
- **Handle conflicts gracefully** - Catch `RecordNotFound` errors instead of pre-checking

```typescript
// BAD - Race condition between findFirst and delete
const record = await prisma.apiKey.findFirst({ where: { id, projectId } });
if (!record) throw new Error("Not found");
await prisma.apiKey.delete({ where: { id } });

// GOOD - Single atomic operation
try {
  await prisma.apiKey.delete({ where: { id, projectId } });
} catch (e) {
  if (e.code === "P2025") throw new TRPCError({ code: "NOT_FOUND" });
  throw e;
}

// GOOD - Transaction for multiple dependent operations
await prisma.$transaction(async (tx) => {
  const key = await tx.apiKey.findUniqueOrThrow({ where: { id } });
  await tx.auditLog.create({ data: { action: "delete", targetId: key.id } });
  await tx.apiKey.delete({ where: { id } });
});
```

**Go service patterns:**
```go
// BAD - Check then act
exists, _ := repo.Exists(ctx, id)
if !exists { return ErrNotFound }
repo.Delete(ctx, id)  // Another request could delete between check and delete

// GOOD - Atomic with row count check
result, err := repo.Delete(ctx, id)
if result.RowsAffected == 0 { return ErrNotFound }
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

## Toast & Error Handling (CRITICAL)

### Source of Truth - Two Unified Files
All toast notifications in the application MUST use these two centralized files:
- **Errors**: `apps/web/src/lib/errors.ts` - All error toasts, error extraction, and error messages
- **Success**: `apps/web/src/lib/success.ts` - All success, info, and warning toasts

### NEVER Import or Use `toast` from "sonner" Directly
This is a **strict rule**. Never import `toast` from "sonner" in components or hooks. Always use the centralized utilities.

```tsx
// ❌ BAD - Direct toast import (FORBIDDEN)
import { toast } from "sonner";

function MyComponent() {
  const handleSave = async () => {
    try {
      await saveData();
      toast.success("Saved!");  // ❌ NEVER do this
    } catch (error) {
      toast.error("Failed to save");  // ❌ NEVER do this
    }
  };
}

// ❌ BAD - Inline toast messages
toast.success("Project created", { description: "Your project is ready." });
toast.error("Something went wrong", { description: "Please try again." });
toast.info("Processing...");
toast.warning("This action cannot be undone");

// ✅ GOOD - Use centralized utilities
import { showError, projectError } from "@/lib/errors";
import { projectToast, showSuccess, showInfo, showWarning } from "@/lib/success";

function MyComponent() {
  const handleSave = async () => {
    try {
      await saveData();
      projectToast.created("My Project");  // ✅ Domain-specific
    } catch (error) {
      showError(error);  // ✅ Auto-extracts error info
    }
  };
}
```

### Complete Usage Examples

#### Handling tRPC/API Mutations
```tsx
import { showError } from "@/lib/errors";
import { projectToast } from "@/lib/success";

function CreateProjectForm() {
  const createProject = api.project.create.useMutation({
    onSuccess: (project) => {
      projectToast.created(project.name);  // ✅
      router.push(`/projects/${project.id}`);
    },
    onError: (error) => {
      showError(error);  // ✅ Handles tRPC errors automatically
    },
  });
}
```

#### Try-Catch Pattern
```tsx
import { showError, memberError } from "@/lib/errors";
import { memberToast } from "@/lib/success";

const handleAddMember = async (email: string) => {
  try {
    await addMember.mutateAsync({ email });
    memberToast.added(email);  // ✅
  } catch (error) {
    // Option 1: Generic error handling
    showError(error);  // ✅ Auto-extracts title & message

    // Option 2: Specific error based on code
    const errorInfo = extractErrorInfo(error);
    if (errorInfo.code === "USER_NOT_FOUND") {
      memberError.notFound(email);  // ✅ Domain-specific
    } else {
      showError(error);
    }
  }
};
```

#### Generic Toasts (Non-Domain-Specific)
```tsx
import { showSuccess, showInfo, showWarning } from "@/lib/success";
import { showErrorMessage } from "@/lib/errors";

// Success
showSuccess("Settings saved");
showSuccess("Changes applied", "Your preferences have been updated.");

// Info
showInfo("Processing", "This may take a moment.");

// Warning
showWarning("Rate limit approaching", "You've used 80% of your quota.");

// Error with custom message
showErrorMessage("Upload failed", "The file exceeds the 10MB limit.");
```

#### Clipboard Operations
```tsx
import { clipboardToast } from "@/lib/success";

const handleCopy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    clipboardToast.copied("API key");  // ✅
  } catch {
    clipboardToast.copyFailed();  // ✅ (Note: copyFailed is in success.ts)
  }
};
```

### Available Toast Utilities

**Success toasts** (`@/lib/success`):
| Object | Methods |
|--------|---------|
| `showSuccess(title, message?)` | Generic success toast |
| `showCreated(resource, details?)` | Resource created |
| `showUpdated(resource, details?)` | Resource updated |
| `showDeleted(resource, details?)` | Resource deleted |
| `showInfo(title, message?)` | Info toast |
| `showWarning(title, message?)` | Warning toast |
| `workspaceToast` | `.created(name)`, `.updated(name)`, `.deleted(name)` |
| `memberToast` | `.added(email)`, `.removed(email)`, `.roleUpdated(email, role)`, `.inviteSent(email)` |
| `domainToast` | `.added(domain)`, `.removed(domain)` |
| `projectToast` | `.created(name)`, `.updated(name)`, `.deleted(name)` |
| `apiKeyToast` | `.created(name)`, `.revoked(name)`, `.copied()` |
| `authToast` | `.signedIn()`, `.signedOut()`, `.passwordChanged()` |
| `clipboardToast` | `.copied(what?)`, `.copyFailed()` |
| `alertToast` | `.created(name)`, `.updated(name?)`, `.deleted(name?)`, `.channelAdded(provider)`, `.testSent()` |

**Error toasts** (`@/lib/errors`):
| Object | Methods |
|--------|---------|
| `showError(error)` | Auto-extracts and shows error (returns ErrorDisplay) |
| `showErrorMessage(title, message?)` | Custom error toast |
| `extractErrorInfo(error)` | Extract error info without showing toast |
| `memberError` | `.notFound(email?)`, `.alreadyMember(email?)`, `.cannotRemoveSelf()`, `.cannotRemoveOwner()` |
| `domainError` | `.alreadyExists(domain)`, `.invalidFormat()` |
| `workspaceError` | `.notFound()`, `.noAccess()`, `.slugTaken(slug)` |
| `projectError` | `.notFound()`, `.noAccess()` |
| `apiKeyError` | `.notFound()`, `.expired()` |
| `authError` | `.unauthorized()`, `.sessionExpired()`, `.invalidCredentials()` |
| `formError` | `.validation(message?)`, `.required(fieldName)` |
| `alertError` | `.notFound()`, `.testFailed(reason?)`, `.channelFailed(provider)` |

### Adding New Toast Messages
1. **Identify the domain** - Is it for workspace, member, project, alert, etc.?
2. **Add to the correct file**:
   - Success/info/warning → `apps/web/src/lib/success.ts`
   - Error → `apps/web/src/lib/errors.ts`
3. **Follow existing patterns**:
   ```tsx
   // In success.ts - add to existing object or create new
   export const newDomainToast = {
     created: (name: string) =>
       toast.success("Domain created", { description: `"${name}" is ready.` }),
   } as const;

   // In errors.ts - add to existing object or create new
   export const newDomainError = {
     notFound: () =>
       toast.error("Domain Not Found", { description: "This domain doesn't exist." }),
   } as const;
   ```
4. **Use consistent naming**: `{domain}Toast` for success, `{domain}Error` for errors
5. **Export from the file** so it can be imported elsewhere

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
- **Toasts (CRITICAL)**: NEVER import `toast` from "sonner" in components/hooks. ALWAYS use:
  - `@/lib/errors` for errors: `showError(error)`, `memberError.notFound()`, etc.
  - `@/lib/success` for success/info/warning: `projectToast.created()`, `showSuccess()`, etc.
  - See "Toast & Error Handling" section for complete API reference
