# Statsig Console API — Verified Patterns

Base URL: `https://statsigapi.net/console/v1`
Auth header: `STATSIG-API-KEY: <STATSIG_CONSOLE_API_KEY>`

## Use the bundled script — don't write curl loops

For event data, run the bundled script from the project root. It handles pagination,
filtering, and aggregation in one shot — much faster than sequential curl calls.

```bash
# Basic: total event count + trend for last 30 days
python3 /Users/tongchen/.claude/skills/analyze/scripts/fetch_statsig.py \
  --event tool_opened --days 30

# With property breakdown
python3 /Users/tongchen/.claude/skills/analyze/scripts/fetch_statsig.py \
  --event tool_opened --days 30 --breakdown tool_name

# Last 7 days
python3 /Users/tongchen/.claude/skills/analyze/scripts/fetch_statsig.py \
  --event tool_opened --days 7

# See all available pre-computed metrics
python3 /Users/tongchen/.claude/skills/analyze/scripts/fetch_statsig.py --list-metrics

# See all event names seen recently (useful for discovery)
python3 /Users/tongchen/.claude/skills/analyze/scripts/fetch_statsig.py --list-events
```

## What the script returns

```json
{
  "event": "tool_opened",
  "window_days": 30,
  "total_events": 142,
  "unique_users": 11,
  "trend": "up",
  "first_half_count": 54,
  "second_half_count": 88,
  "daily_counts": { "2026-02-20": 8, "2026-02-21": 12, ... },
  "breakdown": { "/shift-tasks": 45, "/pet-update": 38, ... },
  "pages_fetched": 2,
  "stopped_reason": "past_window"
}
```

## Direct API endpoints (verified working as of 2026-03-13)

### List all events (raw log, newest-first, paginated)
```
GET /events?page=1&limit=100
```
Response: `{ data: [...events], pagination: { totalItems, nextPage } }`
Each event has: `timestamp` (unix ms), `name`, `value`, `userID`, `metadata` (object with custom props)

**Important:** There is no server-side filter by event name. The script filters client-side.

### List pre-computed metrics
```
GET /metrics/list?limit=100
```
Returns metric IDs in format `<name>::<type>` (e.g. `auto_capture::click::event_count`)

### Query a specific pre-computed metric
```
GET /metrics?id=<metric_id>::<type>&date=YYYY-MM-DD
```
Only works for metrics that have been pre-computed (shown in `/metrics/list`).
Custom events like `tool_opened` won't appear here unless you create a metric for them in the Statsig dashboard.

## Environment gotcha

If the script returns 0 events for a custom event that IS implemented in code, check:
1. What is `NEXT_PUBLIC_STATSIG_ENVIRONMENT` set to in the **production deployment** (Vercel)?
   - If `development`, staff app events are tagged dev and may not appear in the Console API's main event stream
   - Should be `production` or unset in prod
2. Confirm the Statsig client is initializing without errors on `app.pawsvip.com` (check browser console)

## Notes

- `STATSIG_CONSOLE_API_KEY` ≠ `STATSIG_SERVER_KEY`. Get Console key from: Statsig Dashboard → Project Settings → Console API Keys → Create (Read scope).
- Timestamps are Unix milliseconds (UTC). PawsVIP operates PST/PDT (UTC-8 / UTC-7).
- Events API only stores the most recent ~300 events in the raw log endpoint. For older data or high-volume events, use the Statsig dashboard or set up a data export.
