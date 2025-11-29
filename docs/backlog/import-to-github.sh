#!/bin/bash

# CognObserve - Import Issues to GitHub
# Prerequisites: gh cli installed and authenticated (gh auth login)
# Usage: ./import-to-github.sh

set -e

REPO="ducnguyen67201/CognObserve"

echo "Creating labels..."
gh label create "epic" --color "6B21A8" --description "Epic/Feature" --repo $REPO 2>/dev/null || true
gh label create "mvp" --color "EAB308" --description "Required for MVP" --repo $REPO 2>/dev/null || true
gh label create "auth" --color "3B82F6" --description "Authentication" --repo $REPO 2>/dev/null || true
gh label create "dashboard" --color "10B981" --description "Dashboard UI" --repo $REPO 2>/dev/null || true
gh label create "visualization" --color "8B5CF6" --description "Trace visualization" --repo $REPO 2>/dev/null || true
gh label create "sdk" --color "F97316" --description "SDK development" --repo $REPO 2>/dev/null || true
gh label create "typescript" --color "3178C6" --description "TypeScript" --repo $REPO 2>/dev/null || true
gh label create "python" --color "3776AB" --description "Python" --repo $REPO 2>/dev/null || true
gh label create "users" --color "EC4899" --description "User management" --repo $REPO 2>/dev/null || true
gh label create "alerting" --color "EF4444" --description "Alerting system" --repo $REPO 2>/dev/null || true
gh label create "cost" --color "14B8A6" --description "Cost tracking" --repo $REPO 2>/dev/null || true
gh label create "infrastructure" --color "6B7280" --description "Infrastructure" --repo $REPO 2>/dev/null || true
gh label create "sprint-1" --color "FBCFE8" --repo $REPO 2>/dev/null || true
gh label create "sprint-2" --color "FBCFE8" --repo $REPO 2>/dev/null || true
gh label create "sprint-3" --color "FBCFE8" --repo $REPO 2>/dev/null || true
gh label create "sprint-4" --color "FBCFE8" --repo $REPO 2>/dev/null || true
gh label create "sprint-5" --color "FBCFE8" --repo $REPO 2>/dev/null || true
gh label create "sprint-6" --color "FBCFE8" --repo $REPO 2>/dev/null || true
gh label create "sprint-7" --color "FBCFE8" --repo $REPO 2>/dev/null || true
gh label create "sprint-8" --color "FBCFE8" --repo $REPO 2>/dev/null || true
gh label create "sprint-9" --color "FBCFE8" --repo $REPO 2>/dev/null || true
gh label create "sprint-10" --color "FBCFE8" --repo $REPO 2>/dev/null || true
gh label create "sprint-11" --color "FBCFE8" --repo $REPO 2>/dev/null || true
gh label create "sprint-12" --color "FBCFE8" --repo $REPO 2>/dev/null || true
gh label create "sprint-13" --color "FBCFE8" --repo $REPO 2>/dev/null || true
gh label create "sprint-14" --color "FBCFE8" --repo $REPO 2>/dev/null || true
gh label create "sprint-15" --color "FBCFE8" --repo $REPO 2>/dev/null || true
gh label create "sprint-16" --color "FBCFE8" --repo $REPO 2>/dev/null || true
gh label create "sprint-17" --color "FBCFE8" --repo $REPO 2>/dev/null || true

echo "Labels created!"
echo ""
echo "Creating Epics..."

# EPICS
gh issue create --title "[EPIC] Authentication & API Keys" --body "Enable secure API key-based authentication for trace ingestion. Users can create projects, generate API keys, and validate incoming traces." --label "epic,auth,mvp" --repo $REPO

gh issue create --title "[EPIC] Basic Dashboard" --body "Provide visibility into trace data through a web dashboard. Users can view projects, traces, and basic metrics." --label "epic,dashboard,mvp" --repo $REPO

gh issue create --title "[EPIC] Trace Visualization" --body "Enable debugging of LLM calls through visual trace exploration. Waterfall view, span details, and error highlighting." --label "epic,visualization,mvp" --repo $REPO

gh issue create --title "[EPIC] TypeScript SDK" --body "Official TypeScript SDK for instrumenting Node.js/Deno applications. Auto-tracing for OpenAI/Anthropic." --label "epic,sdk,typescript" --repo $REPO

gh issue create --title "[EPIC] Python SDK" --body "Official Python SDK for instrumenting Python applications. Auto-tracing for LangChain, LlamaIndex, OpenAI, Anthropic." --label "epic,sdk,python" --repo $REPO

gh issue create --title "[EPIC] User Management" --body "Team collaboration features. Sign up, login, invitations, and role-based access control." --label "epic,users" --repo $REPO

gh issue create --title "[EPIC] Alerting System" --body "Proactive notifications for error rates, latency thresholds, and anomalies." --label "epic,alerting" --repo $REPO

gh issue create --title "[EPIC] Cost Tracking" --body "Visibility into LLM spending. Token usage, cost estimation, budgets, and trends." --label "epic,cost" --repo $REPO

gh issue create --title "[EPIC] Infrastructure Scale" --body "Queue and database evolution for higher throughput. Redis Streams, Redpanda, ClickHouse." --label "epic,infrastructure" --repo $REPO

echo ""
echo "Creating Sprint 1-2: Authentication stories..."

gh issue create --title "Create project and receive API key" --body "As a user, I can create a project and receive an API key so that I can authenticate my trace ingestion.

## Acceptance Criteria
- User can create a new project with name and description
- API key is generated using secure random bytes
- API key is displayed once upon creation (not retrievable later)
- API key is stored as hashed value in database
- Project appears in user's project list

**Story Points:** 5" --label "auth,mvp,sprint-1" --repo $REPO

gh issue create --title "Validate API keys on incoming traces" --body "As the ingest service, I can validate API keys on incoming traces so that only authorized requests are processed.

## Acceptance Criteria
- Ingest service extracts API key from Authorization header
- Invalid or missing key returns 401 Unauthorized
- Valid key associates trace with correct project
- Validation is performant (<1ms overhead)

**Story Points:** 3" --label "auth,mvp,sprint-1" --repo $REPO

gh issue create --title "Revoke and regenerate API keys" --body "As a user, I can revoke and regenerate API keys so that I can rotate credentials when needed.

## Acceptance Criteria
- User can revoke existing API key
- Revoked key immediately stops working
- User can generate new API key
- UI shows key creation/revocation history

**Story Points:** 3" --label "auth,sprint-2" --repo $REPO

gh issue create --title "View API key usage stats" --body "As a user, I can view my project's API key usage stats so that I can monitor my integration.

## Acceptance Criteria
- Dashboard shows request count per API key
- Shows success vs. error rate
- Shows last used timestamp
- Time range filter (24h, 7d, 30d)

**Story Points:** 2" --label "auth,dashboard,sprint-2" --repo $REPO

echo ""
echo "Creating Sprint 3-4: Dashboard stories..."

gh issue create --title "View list of projects" --body "As a user, I can see a list of my projects so that I can navigate to each one.

## Acceptance Criteria
- Projects page shows all user's projects
- Each project shows: name, created date, trace count
- Projects are sorted by most recent activity
- Empty state for new users

**Story Points:** 3" --label "dashboard,mvp,sprint-3" --repo $REPO

gh issue create --title "View recent traces for a project" --body "As a user, I can view recent traces for a project so that I can see what's happening.

## Acceptance Criteria
- Trace list page with pagination (20 per page)
- Each trace shows: timestamp, name, status, duration
- Color coding for success/error status
- Click to view trace details

**Story Points:** 5" --label "dashboard,mvp,sprint-3" --repo $REPO

gh issue create --title "View basic metrics dashboard" --body "As a user, I can see basic metrics (trace count, error rate) so that I can understand system health.

## Acceptance Criteria
- Dashboard cards showing key metrics
- Total traces (24h, 7d, 30d)
- Error rate percentage
- Average latency (P50, P95, P99)
- Token usage summary

**Story Points:** 5" --label "dashboard,mvp,sprint-4" --repo $REPO

gh issue create --title "Filter traces by date range" --body "As a user, I can filter traces by date range so that I can investigate specific time periods.

## Acceptance Criteria
- Date range picker component
- Preset options: Last hour, 24h, 7d, 30d, Custom
- Custom range with start and end datetime
- URL reflects selected range (shareable)

**Story Points:** 3" --label "dashboard,sprint-4" --repo $REPO

echo ""
echo "Creating Sprint 5-6: Visualization stories..."

gh issue create --title "View trace span hierarchy (waterfall)" --body "As a user, I can view a trace's span hierarchy in a waterfall view so that I can understand the execution flow.

## Acceptance Criteria
- Visual tree showing parent-child span relationships
- Timeline bar showing duration of each span
- Span name, type, and status visible
- Zoom and pan controls
- Color coding by span type (LLM, tool, chain)

**Story Points:** 8" --label "visualization,mvp,sprint-5" --repo $REPO

gh issue create --title "View span details panel" --body "As a user, I can see span details (tokens, latency, model) so that I can debug specific operations.

## Acceptance Criteria
- Click span to open detail panel
- Shows: duration, start time, span type
- Shows: model name, provider
- Shows: token counts (input, output, total)
- Copy button for values

**Story Points:** 5" --label "visualization,mvp,sprint-5" --repo $REPO

gh issue create --title "View span input/output content" --body "As a user, I can view input/output of each span so that I can see what was sent and received.

## Acceptance Criteria
- Collapsible input section
- Collapsible output section
- JSON syntax highlighting
- Long text truncation with expand
- Copy to clipboard button

**Story Points:** 5" --label "visualization,mvp,sprint-6" --repo $REPO

gh issue create --title "View error details on failed spans" --body "As a user, I can see error details on failed spans so that I can diagnose issues.

## Acceptance Criteria
- Red highlight on error spans
- Error icon in waterfall view
- Error message displayed prominently
- Stack trace if available
- Error type/code shown

**Story Points:** 3" --label "visualization,sprint-6" --repo $REPO

echo ""
echo "Creating Sprint 7-8: TypeScript SDK stories..."

gh issue create --title "Install SDK via npm" --body "As a developer, I can install the SDK via npm so that I can add it to my project.

## Acceptance Criteria
- Package published to npm as @cognobserve/sdk
- npm install @cognobserve/sdk works
- TypeScript types included
- ESM and CJS builds
- Package size < 50KB

**Story Points:** 2" --label "sdk,typescript,sprint-7" --repo $REPO

gh issue create --title "Initialize SDK with API key" --body "As a developer, I can initialize the SDK with my API key so that traces are authenticated.

## Acceptance Criteria
- CognObserve.init({ apiKey }) configures client
- Environment variable fallback (COGNOBSERVE_API_KEY)
- Validates API key format
- Configurable endpoint URL

**Story Points:** 3" --label "sdk,typescript,sprint-7" --repo $REPO

gh issue create --title "Create traces and spans manually" --body "As a developer, I can create traces and spans programmatically so that I can instrument custom code.

## Acceptance Criteria
- startTrace({ name }) returns trace object
- trace.startSpan({ name }) returns span
- span.end() completes the span
- trace.end() sends to server
- Nested spans supported

**Story Points:** 5" --label "sdk,typescript,sprint-7" --repo $REPO

gh issue create --title "Auto-trace OpenAI/Anthropic calls (TypeScript)" --body "As a developer, I can wrap OpenAI/Anthropic clients for automatic tracing so that LLM calls are captured.

## Acceptance Criteria
- wrapOpenAI(client) returns instrumented client
- wrapAnthropic(client) returns instrumented client
- All API methods traced automatically
- Token usage captured
- Streaming responses supported

**Story Points:** 8" --label "sdk,typescript,sprint-8" --repo $REPO

gh issue create --title "TypeScript SDK documentation and examples" --body "As a developer, I can read SDK documentation so that I can integrate quickly.

## Acceptance Criteria
- README with quick start guide
- API reference documentation
- Code examples for common use cases
- TypeScript examples
- Troubleshooting section

**Story Points:** 3" --label "sdk,typescript,sprint-8" --repo $REPO

echo ""
echo "Creating Sprint 9-11: Python SDK stories..."

gh issue create --title "Install Python SDK via pip" --body "As a Python developer, I can install the SDK via pip so that I can add it to my project.

## Acceptance Criteria
- Package published to PyPI as cognobserve
- pip install cognobserve works
- Python 3.9+ supported
- Type hints included (py.typed)
- Minimal dependencies

**Story Points:** 2" --label "sdk,python,sprint-9" --repo $REPO

gh issue create --title "Initialize Python SDK with API key" --body "As a Python developer, I can initialize the SDK with my API key so that traces are authenticated.

## Acceptance Criteria
- cognobserve.init(api_key=...) configures client
- Environment variable fallback (COGNOBSERVE_API_KEY)
- Validates API key format
- Configurable endpoint URL

**Story Points:** 3" --label "sdk,python,sprint-9" --repo $REPO

gh issue create --title "Create traces and spans in Python" --body "As a Python developer, I can create traces and spans programmatically so that I can instrument custom code.

## Acceptance Criteria
- start_trace(name=...) returns trace object
- trace.start_span(name=...) returns span
- span.end() completes the span
- Context manager support (with trace.span(...))
- Async/await support

**Story Points:** 5" --label "sdk,python,sprint-9" --repo $REPO

gh issue create --title "Python decorator for tracing" --body "As a Python developer, I can use decorators for tracing so that instrumentation is clean.

## Acceptance Criteria
- @cognobserve.trace decorator for functions
- @cognobserve.span decorator for nested spans
- Works with sync and async functions
- Captures function arguments (configurable)
- Exception tracking

**Story Points:** 3" --label "sdk,python,sprint-10" --repo $REPO

gh issue create --title "Auto-trace OpenAI Python SDK" --body "As a Python developer, I can wrap OpenAI client for automatic tracing so that LLM calls are captured.

## Acceptance Criteria
- wrap_openai(client) returns instrumented client
- chat.completions.create traced automatically
- Streaming responses supported
- Token usage captured from response
- Model name captured

**Story Points:** 5" --label "sdk,python,sprint-10" --repo $REPO

gh issue create --title "Auto-trace Anthropic Python SDK" --body "As a Python developer, I can wrap Anthropic client for automatic tracing so that Claude calls are captured.

## Acceptance Criteria
- wrap_anthropic(client) returns instrumented client
- messages.create traced automatically
- Streaming responses supported
- Token usage captured
- Model name captured

**Story Points:** 5" --label "sdk,python,sprint-10" --repo $REPO

gh issue create --title "Auto-trace LangChain" --body "As a Python developer, I can integrate with LangChain for automatic tracing so that chains and agents are captured.

## Acceptance Criteria
- CognObserveCallbackHandler for LangChain
- Traces LLM calls, chains, tools, agents
- Captures intermediate steps
- Works with LCEL (LangChain Expression Language)

**Story Points:** 8" --label "sdk,python,sprint-11" --repo $REPO

gh issue create --title "Auto-trace LlamaIndex" --body "As a Python developer, I can integrate with LlamaIndex for automatic tracing so that queries are captured.

## Acceptance Criteria
- CognObserveSpanHandler for LlamaIndex
- Traces query engines, retrievers, synthesizers
- Captures retrieved documents
- Works with async operations

**Story Points:** 5" --label "sdk,python,sprint-11" --repo $REPO

gh issue create --title "Python SDK documentation" --body "As a Python developer, I can read SDK documentation so that I can integrate quickly.

## Acceptance Criteria
- README with quick start guide
- API reference (Sphinx/MkDocs)
- Code examples for common use cases
- Framework integration guides (LangChain, LlamaIndex)

**Story Points:** 3" --label "sdk,python,sprint-11" --repo $REPO

echo ""
echo "Creating Sprint 12-13: User Management stories..."

gh issue create --title "User signup and login" --body "As a user, I can sign up and log in so that I can access my account.

## Acceptance Criteria
- Email/password signup form
- Email verification (optional for MVP)
- Login with email/password
- Password reset flow
- Session management

**Story Points:** 5" --label "users,sprint-12" --repo $REPO

gh issue create --title "Invite team members to project" --body "As a project owner, I can invite team members so that we can collaborate.

## Acceptance Criteria
- Invite by email address
- Email invitation sent with link
- Invitee can accept and join project
- Pending invitations visible
- Can cancel pending invitation

**Story Points:** 5" --label "users,sprint-12" --repo $REPO

gh issue create --title "Assign roles to team members" --body "As an admin, I can assign roles so that permissions are controlled.

## Acceptance Criteria
- Roles: Owner, Admin, Member, Viewer
- Owner: full access, can delete project
- Admin: manage members, settings
- Member: view and create traces
- Viewer: read-only access

**Story Points:** 3" --label "users,sprint-13" --repo $REPO

gh issue create --title "Manage user profile settings" --body "As a user, I can manage my profile so that my information is current.

## Acceptance Criteria
- Update display name
- Change password (requires current password)
- Profile picture upload (optional)
- Email preferences
- Delete account option

**Story Points:** 2" --label "users,sprint-13" --repo $REPO

echo ""
echo "Creating Sprint 14-15: Alerting stories..."

gh issue create --title "Create error rate threshold alerts" --body "As a user, I can create alerts for error rate thresholds so that I'm notified of issues.

## Acceptance Criteria
- Create alert with error rate threshold (e.g., >5%)
- Select time window (5min, 15min, 1hr)
- Choose projects to monitor
- Enable/disable alert
- Test alert button

**Story Points:** 5" --label "alerting,sprint-14" --repo $REPO

gh issue create --title "Create latency threshold alerts" --body "As a user, I can create alerts for latency thresholds so that I know about performance issues.

## Acceptance Criteria
- Create alert for P99 latency threshold
- Configurable percentile (P50, P95, P99)
- Time window selection
- Project/trace name filter
- Severity levels

**Story Points:** 5" --label "alerting,sprint-14" --repo $REPO

gh issue create --title "Receive alerts via email/webhook" --body "As a user, I can receive alerts via email or webhook so that I'm notified through my preferred channel.

## Acceptance Criteria
- Email notifications with alert details
- Webhook POST with JSON payload
- Configure notification channels per alert
- Multiple channels per alert
- Webhook retry on failure

**Story Points:** 5" --label "alerting,sprint-15" --repo $REPO

gh issue create --title "View alert history" --body "As a user, I can view alert history so that I can see past incidents.

## Acceptance Criteria
- List of triggered alerts
- Timestamp, alert name, severity
- Triggered value vs. threshold
- Resolution status
- Filter by date range

**Story Points:** 3" --label "alerting,sprint-15" --repo $REPO

echo ""
echo "Creating Sprint 16-17: Cost Tracking stories..."

gh issue create --title "View token usage per project" --body "As a user, I can see token usage per project so that I understand consumption.

## Acceptance Criteria
- Dashboard showing input/output tokens
- Breakdown by model
- Daily/weekly/monthly views
- Comparison to previous period
- Export data option

**Story Points:** 5" --label "cost,sprint-16" --repo $REPO

gh issue create --title "View estimated costs by model" --body "As a user, I can see estimated costs by model so that I understand spending.

## Acceptance Criteria
- Cost calculated using model pricing table
- Configurable pricing overrides
- Cost by model breakdown
- Cost by project breakdown
- Currency selection

**Story Points:** 5" --label "cost,sprint-16" --repo $REPO

gh issue create --title "Set cost budgets with alerts" --body "As a user, I can set cost budgets so that I don't overspend.

## Acceptance Criteria
- Set monthly budget per project
- Alert at threshold (50%, 80%, 100%)
- Email notification on threshold
- Budget reset on month start
- Budget history tracking

**Story Points:** 5" --label "cost,sprint-17" --repo $REPO

gh issue create --title "View cost trends over time" --body "As a user, I can view cost trends so that I can forecast spending.

## Acceptance Criteria
- Line chart showing daily costs
- Compare to previous periods
- Trend line projection
- Filter by project/model
- Anomaly highlighting

**Story Points:** 3" --label "cost,sprint-17" --repo $REPO

echo ""
echo "Creating Backlog: Infrastructure stories..."

gh issue create --title "Upgrade to Redis Streams" --body "Migrate from Redis LPUSH/BRPOP to Redis Streams for higher throughput.

## Technical Requirements
- Implement Redis Streams producer in Go
- Update worker to use XREADGROUP
- Consumer group management
- Message acknowledgment
- Performance benchmarks

**Story Points:** 5" --label "infrastructure" --repo $REPO

gh issue create --title "Add Redpanda to infrastructure" --body "Set up Redpanda (Kafka-compatible) for production scale.

## Technical Requirements
- Docker Compose configuration
- Topic creation and configuration
- Partition strategy (by project_id)
- Retention policy configuration
- Monitoring setup

**Story Points:** 3" --label "infrastructure" --repo $REPO

gh issue create --title "Implement Kafka producer in ingest" --body "Add Kafka/Redpanda producer to Go ingest service.

## Technical Requirements
- Implement Producer interface for Kafka
- Configuration-based driver selection
- Batch publishing for efficiency
- Graceful shutdown

**Story Points:** 5" --label "infrastructure" --repo $REPO

gh issue create --title "Add ClickHouse for analytics" --body "Set up ClickHouse for high-performance analytics queries.

## Technical Requirements
- Docker Compose configuration
- Schema design for traces/spans
- Dual-write from worker
- Migration of analytics queries

**Story Points:** 8" --label "infrastructure" --repo $REPO

echo ""
echo "✅ Done! Created 51 issues in GitHub."
echo ""
echo "View issues at: https://github.com/$REPO/issues"
