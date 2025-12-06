# Alerting System - Operations Guide

This guide covers how to run, configure, and troubleshoot the CognObserve alerting system.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ALERT EVALUATION LOOP                        │
└─────────────────────────────────────────────────────────────────────┘

  Worker starts
         │
         ▼
  ┌──────────────────┐
  │  AlertEvaluator  │  ◄── Runs every 60 seconds (setInterval)
  │     .start()     │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────────────────────────┐
  │  1. Fetch eligible alerts from DB    │
  │     - enabled = true                 │
  │     - not in cooldown period         │
  └────────┬─────────────────────────────┘
           │
           ▼
  ┌──────────────────────────────────────┐
  │  2. For each alert:                  │
  │     - Calculate metric (ERROR_RATE,  │
  │       LATENCY_P50/P95/P99)           │
  │     - Compare: value vs threshold    │
  └────────┬─────────────────────────────┘
           │
           ▼ (if threshold exceeded)
  ┌──────────────────────────────────────┐
  │  3. Send notifications               │
  │     - Loop through alert.channels    │
  │     - Call adapter.send() for each   │
  │     - Discord: POST to webhook URL   │
  │     - Gmail: Send via SMTP           │
  └────────┬─────────────────────────────┘
           │
           ▼
  ┌──────────────────────────────────────┐
  │  4. Record to database               │
  │     - Create AlertHistory entry      │
  │     - Update alert.lastTriggeredAt   │
  └──────────────────────────────────────┘
```

---

## Running the Worker

### Prerequisites

1. **Database & Redis running:**
   ```bash
   make docker-up
   ```

2. **Environment variables configured** (see Configuration section)

### Start the Worker

```bash
# From project root
pnpm --filter=@cognobserve/worker dev
```

### Expected Output

```
Starting CognObserve Worker v0.1.0
Initializing alerting adapters...
Registered AlertingAdapter: DISCORD
Gmail adapter not registered: SMTP_USER, SMTP_PASS not configured
Alerting adapters initialized: DISCORD
AlertEvaluator started
AlertEvaluator: Starting evaluation cycle
Connected to Redis, consuming from cognobserve:traces
AlertEvaluator: Found 4 eligible alerts
AlertEvaluator: Cycle completed in 45ms
Worker initialized and consuming from queue
```

---

## Configuration

### Environment Variables

Add these to your `.env` file in the project root:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection string |
| `SMTP_HOST` | No | `smtp.gmail.com` | SMTP server host |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `SMTP_USER` | No | - | SMTP username (email) |
| `SMTP_PASS` | No | - | SMTP password or app password |
| `SMTP_FROM` | No | - | From email address |

### Example .env

```bash
# Database (required)
DATABASE_URL="postgresql://cognobserve:cognobserve@localhost:5432/cognobserve"

# Redis
REDIS_URL="redis://localhost:6379"

# Gmail SMTP (optional - for email notifications)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM="alerts@yourdomain.com"
```

### Gmail App Password Setup

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable 2-Step Verification if not already enabled
3. Go to App Passwords
4. Generate a new app password for "Mail"
5. Use this 16-character password as `SMTP_PASS`

---

## Discord Integration

### Creating a Discord Webhook

1. Open Discord and go to your server
2. Right-click on a channel → **Edit Channel**
3. Go to **Integrations** → **Webhooks**
4. Click **New Webhook**
5. Copy the webhook URL

### Adding to an Alert

1. Create an alert in the UI (Project Settings → Alerts)
2. Click **Add Channel**
3. Select **Discord**
4. Paste the webhook URL
5. Click **Add Channel**

### Discord Notification Format

```
🚨 Alert: High Error Rate
Alert triggered for **My Project**

┌─────────────┬─────────────┬─────────────┐
│ Error Rate  │ Threshold   │ Project     │
│ **7.5%**    │ > 5%        │ My Project  │
└─────────────┴─────────────┴─────────────┘

                    CognObserve Alerting
```

---

## Alert Types

| Type | Description | Unit | Example |
|------|-------------|------|---------|
| `ERROR_RATE` | Percentage of spans with ERROR level | % | 5.2% |
| `LATENCY_P50` | 50th percentile latency | ms | 150ms |
| `LATENCY_P95` | 95th percentile latency | ms | 850ms |
| `LATENCY_P99` | 99th percentile latency | ms | 2500ms |

### How Metrics Are Calculated

**Error Rate:**
```sql
SELECT
  COUNT(*) FILTER (WHERE level = 'ERROR') / COUNT(*) * 100
FROM spans
WHERE projectId = ? AND startTime >= NOW() - INTERVAL 'X minutes'
```

**Latency Percentiles:**
```sql
SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (
  ORDER BY EXTRACT(EPOCH FROM (endTime - startTime)) * 1000
)
FROM spans
WHERE projectId = ? AND startTime >= NOW() - INTERVAL 'X minutes'
```

---

## Alert Lifecycle

### States

1. **Enabled** - Alert is active and being evaluated every 60 seconds
2. **Disabled** - Alert exists but is not evaluated
3. **In Cooldown** - Alert triggered recently, waiting for cooldown period

### Cooldown Period

After an alert triggers, it enters a cooldown period (configurable per alert, default 60 minutes). During cooldown:
- The alert is NOT re-evaluated
- This prevents notification spam
- Use shorter cooldowns (15 min) for critical alerts
- Use longer cooldowns (60+ min) for informational alerts

---

## Testing

### Test a Channel

1. Go to Project Settings → Alerts
2. Find the alert with the channel
3. Click the **Test** button next to the channel
4. Verify you receive the notification

### Create a Test Alert

1. Create an alert with a very low threshold:
   - Type: `ERROR_RATE`
   - Threshold: `0.1` (0.1%)
   - Window: `5` minutes
   - Cooldown: `1` minute
2. Add a Discord channel
3. Ingest some spans with errors
4. Wait for the next evaluation cycle (up to 60 seconds)
5. Check Discord for the notification

### Seed Test Data

```bash
cd packages/db
pnpm tsx src/seed-alert-history.ts
```

This creates mock alerts and history entries for UI testing.

---

## Troubleshooting

### Worker Not Starting

**Error:** `DATABASE_URL environment variable is not set`

**Solution:** Run from project root to load `.env`:
```bash
pnpm --filter=@cognobserve/worker dev
```

### Gmail Not Working

**Error:** `Gmail adapter not registered: SMTP_USER, SMTP_PASS not configured`

**Solution:** Add SMTP credentials to `.env`:
```bash
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
```

**Error:** `Invalid login` or `Authentication failed`

**Solution:**
1. Use an App Password, not your regular password
2. Ensure 2FA is enabled on your Google account
3. Check that the email matches `SMTP_USER`

### Discord Not Working

**Error:** `Discord API error: 404`

**Solution:** The webhook URL is invalid or deleted. Create a new webhook.

**Error:** `Discord API error: 429`

**Solution:** Rate limited. Wait a few minutes and try again.

### Alerts Not Triggering

1. **Check alert is enabled** - Toggle in UI
2. **Check cooldown** - Wait for cooldown period to expire
3. **Check data exists** - Ensure spans exist in the time window
4. **Check threshold** - Lower threshold to verify triggering works
5. **Check worker logs** - Look for evaluation cycle output

### View Worker Logs

```bash
# Watch logs in real-time
pnpm --filter=@cognobserve/worker dev

# You should see:
# AlertEvaluator: Starting evaluation cycle
# AlertEvaluator: Found X eligible alerts
# AlertEvaluator: Alert "Name" triggered - value=X, threshold=Y
# AlertEvaluator: Sent notification via DISCORD
```

---

## Key Files

| File | Purpose |
|------|---------|
| `apps/worker/src/index.ts` | Worker entry point, starts AlertEvaluator |
| `apps/worker/src/jobs/alert-evaluator.ts` | Alert evaluation logic |
| `apps/worker/src/lib/env.ts` | Environment variable validation |
| `packages/api/src/lib/alerting/adapters/discord.ts` | Discord webhook adapter |
| `packages/api/src/lib/alerting/adapters/gmail.ts` | Gmail SMTP adapter |
| `packages/api/src/lib/alerting/metrics-service.ts` | Metric calculations |
| `packages/api/src/routers/alerts.ts` | tRPC API endpoints |

---

## Future Improvements

- [ ] Slack adapter
- [ ] PagerDuty adapter
- [ ] Generic webhook adapter
- [ ] Alert resolution tracking
- [ ] Dashboard alert indicators
- [ ] Retry logic for failed notifications
- [ ] Metrics caching
