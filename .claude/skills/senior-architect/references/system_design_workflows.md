# System Design Workflows for Startups

## Philosophy

> "Design for 10x your current scale, build for 1x."

This workflow guide helps you ship fast without accumulating debt you can't pay back.

---

## The System Design Process

### Phase 1: Problem Discovery (30 min - 2 hours)

**Step 1: Clarify Requirements**

```markdown
## Requirements Template

### Functional Requirements
- [ ] What does the system need to DO?
- [ ] Who are the users/actors?
- [ ] What are the core use cases?

### Non-Functional Requirements
- [ ] Expected scale (users, requests/sec, data volume)
- [ ] Latency requirements (p50, p95, p99)
- [ ] Availability target (99.9%? 99.99%?)
- [ ] Consistency requirements (strong vs eventual)
- [ ] Compliance/regulatory constraints

### Constraints
- [ ] Timeline (MVP? Production-ready?)
- [ ] Team size and expertise
- [ ] Budget constraints
- [ ] Existing infrastructure to integrate with
```

**Step 2: Define Success Metrics**

```markdown
## Success Metrics Template

### Performance Targets
| Metric | Target | Measurement |
|--------|--------|-------------|
| API Latency (p95) | < 200ms | DataDog APM |
| Throughput | 10k req/sec | Load test |
| Error Rate | < 0.1% | Prometheus |
| Availability | 99.9% | Uptime monitor |

### Business Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first byte | < 100ms | RUM |
| User-perceived latency | < 500ms | Lighthouse |
| Data freshness | < 1 min | Custom metric |
```

---

### Phase 2: High-Level Design (1-2 hours)

**Step 1: Identify Components**

```
┌──────────────────────────────────────────────────────────────┐
│                        System Boundary                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│  │  Entry  │───▶│ Business│───▶│  Data   │───▶│ External│  │
│  │  Points │    │  Logic  │    │  Layer  │    │ Services│  │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘  │
│                                                              │
│  Entry Points: API Gateway, WebSocket, SDK                   │
│  Business Logic: Core services, Domain logic                 │
│  Data Layer: Database, Cache, Queue                          │
│  External: Third-party APIs, Cloud services                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Step 2: Data Flow Diagram**

```markdown
## Data Flow Template

### Happy Path
1. Request enters at [entry point]
2. Authentication/Authorization at [component]
3. Business logic processed at [service]
4. Data persisted to [storage]
5. Response returned to [client]

### Error Path
1. Validation failure → 400 response
2. Auth failure → 401/403 response
3. Business rule violation → 422 response
4. System failure → 500 response + alert

### Async Path (if applicable)
1. Request acknowledged immediately (202)
2. Job queued to [queue]
3. Worker processes job
4. Result stored/notified via [channel]
```

**Step 3: API Contract Definition**

```yaml
# OpenAPI-style contract definition
paths:
  /v1/traces:
    post:
      summary: Ingest a trace
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TraceInput'
      responses:
        '202':
          description: Accepted for processing
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                    format: uuid
        '400':
          $ref: '#/components/responses/ValidationError'
        '401':
          $ref: '#/components/responses/Unauthorized'
```

---

### Phase 3: Deep Dive Design (2-4 hours)

**Step 1: Database Schema Design**

```sql
-- Schema design checklist
-- [ ] Primary keys (UUID vs auto-increment)
-- [ ] Foreign keys and relationships
-- [ ] Indexes for query patterns
-- [ ] Constraints (NOT NULL, UNIQUE, CHECK)
-- [ ] Timestamps (created_at, updated_at)
-- [ ] Soft delete support (deleted_at)

-- Example: Trace storage schema
CREATE TABLE traces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id),
    name VARCHAR(255) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'running',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- Indexes for common queries
    CONSTRAINT traces_status_check CHECK (status IN ('running', 'completed', 'error'))
);

CREATE INDEX idx_traces_project_created ON traces(project_id, created_at DESC);
CREATE INDEX idx_traces_status ON traces(status) WHERE deleted_at IS NULL;
```

**Step 2: Service Interface Design**

```typescript
// Service interface design template
interface TraceService {
  // Commands (mutations)
  createTrace(input: CreateTraceInput): Promise<Trace>;
  updateTrace(id: string, input: UpdateTraceInput): Promise<Trace>;
  deleteTrace(id: string): Promise<void>;

  // Queries (reads)
  getTrace(id: string): Promise<Trace | null>;
  listTraces(filter: TraceFilter, pagination: Pagination): Promise<PaginatedResult<Trace>>;
  getTraceStats(projectId: string, range: TimeRange): Promise<TraceStats>;
}

// Input/Output types with validation schemas
const CreateTraceInputSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(255),
  metadata: z.record(z.unknown()).optional(),
});

type CreateTraceInput = z.infer<typeof CreateTraceInputSchema>;
```

**Step 3: Error Handling Strategy**

```typescript
// Centralized error handling
enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public statusCode: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }

  static notFound(resource: string, id: string): AppError {
    return new AppError(
      ErrorCode.NOT_FOUND,
      `${resource} with id ${id} not found`,
      404
    );
  }

  static validation(errors: ValidationError[]): AppError {
    return new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Validation failed',
      400,
      { errors }
    );
  }
}
```

---

### Phase 4: Capacity Planning

**Step 1: Estimate Load**

```markdown
## Capacity Planning Template

### Traffic Estimates
| Metric | Current | 6 months | 12 months |
|--------|---------|----------|-----------|
| Daily Active Users | 1,000 | 10,000 | 50,000 |
| Requests/second (avg) | 10 | 100 | 500 |
| Requests/second (peak) | 50 | 500 | 2,500 |
| Data ingested/day | 1 GB | 10 GB | 50 GB |

### Storage Estimates
| Data Type | Size/Record | Records/Day | 30-Day Storage |
|-----------|-------------|-------------|----------------|
| Traces | 2 KB | 100,000 | 6 GB |
| Spans | 500 B | 1,000,000 | 15 GB |
| Metrics | 100 B | 10,000,000 | 30 GB |

### Resource Requirements
| Resource | Current | 6 months | 12 months |
|----------|---------|----------|-----------|
| API Servers | 2x small | 4x medium | 8x large |
| Database | 1x 100GB | 1x 500GB | 2x 1TB (primary + read replica) |
| Redis | 1x 1GB | 1x 5GB | 1x 25GB |
| Queue Workers | 2 | 8 | 20 |
```

**Step 2: Identify Bottlenecks**

```markdown
## Bottleneck Analysis

### Potential Bottlenecks
1. **Database writes** - High-volume trace ingestion
   - Mitigation: Batch inserts, write buffering, partitioning

2. **Complex queries** - Timeline visualization
   - Mitigation: Materialized views, read replicas, caching

3. **Memory** - Large trace processing
   - Mitigation: Streaming processing, pagination

4. **Network** - High payload sizes
   - Mitigation: Compression, CDN for static assets

### Scaling Strategy
| Bottleneck | Short-term | Long-term |
|------------|------------|-----------|
| Write throughput | Batch inserts | Time-series DB |
| Read latency | Redis cache | Read replicas |
| CPU | Horizontal scaling | Go service migration |
| Storage | Compression | Cold storage tiering |
```

---

### Phase 5: Architecture Decision Records (ADRs)

**ADR Template:**

```markdown
# ADR-001: Use PostgreSQL for Primary Storage

## Status
Accepted

## Context
We need a primary database for storing traces, spans, and project metadata.
Requirements:
- ACID transactions for data integrity
- JSON support for flexible metadata
- Strong ecosystem and tooling
- Team familiarity

## Decision
Use PostgreSQL as the primary database with Prisma as the ORM.

## Alternatives Considered

### MongoDB
- Pros: Flexible schema, good for documents
- Cons: Weaker consistency guarantees, team unfamiliar
- Rejected: ACID transactions more important than schema flexibility

### MySQL
- Pros: Mature, team familiar
- Cons: Weaker JSON support, less advanced features
- Rejected: PostgreSQL's JSON support and features win

## Consequences

### Positive
- Strong data integrity with ACID
- Excellent JSON support with JSONB
- Rich indexing capabilities
- Large ecosystem (extensions, tools)

### Negative
- Need to manage schema migrations
- Connection pooling required at scale
- May need read replicas for read-heavy workloads

### Risks
- Connection limits under high load
  - Mitigation: Use PgBouncer for connection pooling

## References
- PostgreSQL docs: https://www.postgresql.org/docs/
- Prisma docs: https://www.prisma.io/docs/
```

---

## Design Review Checklist

### Before Review

```markdown
## Pre-Review Checklist

### Documentation
- [ ] Requirements documented
- [ ] High-level architecture diagram
- [ ] API contracts defined
- [ ] Database schema designed
- [ ] ADRs written for key decisions

### Technical
- [ ] Security considerations addressed
- [ ] Error handling strategy defined
- [ ] Monitoring/observability planned
- [ ] Scaling strategy identified
- [ ] Rollback plan documented

### Validation
- [ ] Edge cases identified
- [ ] Failure modes analyzed
- [ ] Performance estimates made
- [ ] Load testing plan defined
```

### During Review

```markdown
## Review Discussion Points

1. **Does this solve the right problem?**
   - Validate requirements understanding
   - Check for scope creep

2. **Is this the simplest solution?**
   - Can we remove complexity?
   - Are we over-engineering?

3. **What could go wrong?**
   - Failure modes
   - Security vulnerabilities
   - Performance issues

4. **How do we know it's working?**
   - Metrics and monitoring
   - Alerting strategy
   - Success criteria

5. **How do we roll back?**
   - Feature flags
   - Database migrations
   - Deployment strategy
```

---

## Rapid Prototyping Workflow

For when you need to validate ideas fast:

```markdown
## 1-Day Prototype Workflow

### Hour 1-2: Define Scope
- [ ] What's the ONE thing we're validating?
- [ ] What's the minimum functionality needed?
- [ ] What can we fake/mock?

### Hour 3-4: Build Core
- [ ] Set up basic project structure
- [ ] Implement happy path only
- [ ] Use existing libraries liberally

### Hour 5-6: Integration
- [ ] Connect components
- [ ] Add minimal error handling
- [ ] Deploy to staging

### Hour 7-8: Validate
- [ ] Manual testing
- [ ] Gather feedback
- [ ] Document learnings

### Output
- Working prototype
- List of validated assumptions
- List of unknowns discovered
- Go/no-go decision
```

---

## Implementation Workflow

### Sprint Planning Integration

```markdown
## Technical Task Breakdown Template

### Epic: Implement Trace Visualization

#### Story 1: API Endpoints (3 points)
Tasks:
- [ ] Define API contract in OpenAPI
- [ ] Implement GET /traces/:id endpoint
- [ ] Implement GET /traces/:id/timeline endpoint
- [ ] Add request validation
- [ ] Add error handling
- [ ] Write integration tests

#### Story 2: Database Schema (2 points)
Tasks:
- [ ] Design schema additions
- [ ] Write migration
- [ ] Update Prisma schema
- [ ] Add indexes for query patterns
- [ ] Test migration rollback

#### Story 3: Frontend Components (5 points)
Tasks:
- [ ] Build timeline view component
- [ ] Implement span detail panel
- [ ] Add loading states
- [ ] Add error states
- [ ] Write component tests
```

### Code Review Guidelines

```markdown
## Architecture Review Checklist

### Structure
- [ ] Follows established patterns
- [ ] Clear separation of concerns
- [ ] No circular dependencies
- [ ] Appropriate abstraction level

### Performance
- [ ] N+1 queries avoided
- [ ] Appropriate indexing
- [ ] Caching where needed
- [ ] No blocking operations in hot path

### Security
- [ ] Input validation
- [ ] Authorization checks
- [ ] No sensitive data exposure
- [ ] SQL injection prevention

### Maintainability
- [ ] Self-documenting code
- [ ] Appropriate error handling
- [ ] Testable design
- [ ] Clear naming conventions
```

---

## Post-Launch Workflow

### Monitoring Setup

```markdown
## Observability Checklist

### Metrics (Prometheus/DataDog)
- [ ] Request rate
- [ ] Error rate
- [ ] Latency percentiles (p50, p95, p99)
- [ ] Queue depth
- [ ] Database connection pool
- [ ] Memory/CPU utilization

### Logs (Structured JSON)
- [ ] Request ID correlation
- [ ] User/project context
- [ ] Error stack traces
- [ ] Performance timing

### Traces (OpenTelemetry)
- [ ] End-to-end request tracing
- [ ] Database query spans
- [ ] External API call spans
- [ ] Queue job spans

### Alerts
- [ ] Error rate > threshold
- [ ] Latency > SLA
- [ ] Queue backing up
- [ ] Database connections exhausted
- [ ] Disk space low
```

### Incident Response

```markdown
## Incident Workflow

### Detection
1. Alert fires or user report
2. Acknowledge incident
3. Create incident channel

### Triage (5 min)
1. Assess severity (P1-P4)
2. Identify affected users
3. Communicate status

### Mitigation (ASAP)
1. Can we rollback?
2. Can we feature flag?
3. Can we scale up?
4. Can we failover?

### Resolution
1. Fix root cause
2. Deploy fix
3. Verify resolution

### Post-mortem
1. Timeline of events
2. Root cause analysis
3. Action items
4. Lessons learned
```

---

## Quick Reference

### Time Allocation Guide

| Phase | Startup Speed | Production Quality |
|-------|---------------|-------------------|
| Requirements | 30 min | 2 hours |
| High-level design | 1 hour | 2 hours |
| Deep dive | 2 hours | 4 hours |
| Review | 30 min | 1 hour |
| Documentation | 30 min | 2 hours |
| **Total** | **4.5 hours** | **11 hours** |

### Decision Speed Guide

| Decision Type | Time Box | Reversible? |
|--------------|----------|-------------|
| Library choice | 30 min | Yes |
| API design | 2 hours | Mostly |
| Database schema | 4 hours | Somewhat |
| Architecture pattern | 1 day | No |
| Technology stack | 2 days | No |

---

## References

- Google's Design Docs: https://www.industrialempathy.com/posts/design-docs-at-google/
- ADR GitHub: https://adr.github.io/
- The System Design Primer: https://github.com/donnemartin/system-design-primer
- Designing Data-Intensive Applications by Martin Kleppmann
