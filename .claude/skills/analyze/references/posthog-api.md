# PostHog API Reference

Use the PostHog API to query events, trends, funnels, and retention directly.

## Authentication

PostHog uses a personal API key (not the project API key used for event ingestion).

```bash
source <(grep -E '^POSTHOG_' /Users/tongchen/Documents/Projects/pawsvip-app/.env.local | sed 's/^/export /' | tr -d '"')
PH_HOST="$POSTHOG_HOST"
PH_KEY="$POSTHOG_PERSONAL_API_KEY"
PH_PROJECT_ID="$POSTHOG_PROD_PROJECT_ID"  # prod project (150987); use $POSTHOG_PROJECT_ID for dev (363583)
```

**If no key is available, ask:**
> "Can you share a PostHog personal API key? Go to PostHog → Settings → Personal API Keys → Create. I need the key and your PostHog host URL (app.posthog.com if cloud)."

---

## Trends (event counts over time)

This is the most common query — equivalent to Mixpanel's segmentation endpoint.

```bash
curl -s -X POST "$PH_HOST/api/projects/$PH_PROJECT_ID/insights/trend/" \
  -H "Authorization: Bearer $PH_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{"id": "page_view", "math": "total"}],
    "date_from": "-30d",
    "date_to": "now",
    "interval": "week"
  }' > /tmp/ph_trend.json
```

### Math types (aggregation)
| `math` value | Meaning |
|---|---|
| `"total"` | Total event count |
| `"dau"` | Unique users per interval |
| `"weekly_active"` | Weekly active users |
| `"monthly_active"` | Monthly active users |
| `"unique_group"` | Unique groups (requires `math_group_type_index`) |
| `"sum"` | Sum of a property (requires `math_property`) |
| `"avg"` | Average of a property (requires `math_property`) |
| `"min"` / `"max"` / `"median"` | Property aggregations |

### Filtering

```json
{
  "events": [{
    "id": "feature_used",
    "math": "dau",
    "properties": [
      {"key": "feature_name", "value": "rephrase", "operator": "exact", "type": "event"}
    ]
  }],
  "date_from": "-30d",
  "interval": "day"
}
```

**Filter operators:** `exact`, `is_not`, `icontains`, `not_icontains`, `regex`, `not_regex`, `gt`, `lt`, `gte`, `lte`, `is_set`, `is_not_set`

**Property types:** `event` (event property), `person` (user property), `cohort` (cohort membership)

### Breakdowns

```json
{
  "events": [{"id": "feature_used", "math": "total"}],
  "breakdown": "feature_name",
  "breakdown_type": "event",
  "date_from": "-30d",
  "interval": "week"
}
```

**Breakdown types:** `event`, `person`, `cohort`, `group`, `session`

### Multiple events in one query

Query multiple events simultaneously — much better than separate requests:

```json
{
  "events": [
    {"id": "page_view", "math": "dau", "name": "Visitors"},
    {"id": "feature_used", "math": "dau", "name": "Active Users"},
    {"id": "purchase", "math": "total", "name": "Purchases"}
  ],
  "date_from": "-30d",
  "interval": "week"
}
```

---

## Funnels

```bash
curl -s -X POST "$PH_HOST/api/projects/$PH_PROJECT_ID/insights/funnel/" \
  -H "Authorization: Bearer $PH_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {"id": "page_view", "order": 0},
      {"id": "sign_up_started", "order": 1},
      {"id": "sign_up_completed", "order": 2}
    ],
    "date_from": "-30d",
    "funnel_window_days": 7,
    "breakdown": "referring_domain",
    "breakdown_type": "event"
  }' > /tmp/ph_funnel.json
```

---

## Retention

```bash
curl -s -X POST "$PH_HOST/api/projects/$PH_PROJECT_ID/insights/retention/" \
  -H "Authorization: Bearer $PH_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "target_entity": {"id": "feature_used", "type": "events"},
    "returning_entity": {"id": "feature_used", "type": "events"},
    "date_from": "-30d",
    "period": "Week",
    "total_intervals": 4
  }' > /tmp/ph_retention.json
```

---

## HogQL (SQL queries on PostHog data)

For complex queries that the insight APIs can't handle:

```bash
curl -s -X POST "$PH_HOST/api/projects/$PH_PROJECT_ID/query/" \
  -H "Authorization: Bearer $PH_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT properties.feature_name, count() as cnt, uniq(distinct_id) as users FROM events WHERE event = '\''feature_used'\'' AND timestamp > now() - interval 30 day GROUP BY properties.feature_name ORDER BY cnt DESC LIMIT 20"
    }
  }' > /tmp/ph_hogql.json
```

HogQL is ClickHouse SQL — supports `uniq()`, `countIf()`, `sumIf()`, `toStartOfWeek()`, etc.

---

## Event and property discovery

### List events
```bash
curl -s "$PH_HOST/api/projects/$PH_PROJECT_ID/event_definitions/?limit=50&ordering=-last_seen_at" \
  -H "Authorization: Bearer $PH_KEY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for e in data['results']:
    print(f\"{e['name']:40s}  last_seen: {e.get('last_seen_at','?')[:10]}  volume: {e.get('volume_30_day', '?')}\")
"
```

### List properties for an event
```bash
curl -s "$PH_HOST/api/projects/$PH_PROJECT_ID/property_definitions/?event_names=%5B%22feature_used%22%5D&limit=50" \
  -H "Authorization: Bearer $PH_KEY" | python3 -c "
import json, sys
for p in json.load(sys.stdin)['results']:
    print(f\"{p['name']:40s}  type: {p.get('property_type','?')}\")
"
```

---

## Parsing responses

Trend responses return a `result` array with one entry per series:

```python
import json

data = json.load(open('/tmp/ph_trend.json'))
for series in data['result']:
    label = series['label']
    for date, count in zip(series['days'], series['data']):
        print(f"{label}  {date}  {count}")
```

Funnel responses return steps with `count` and `conversion_rate`.

---

## Rate limits

PostHog Cloud: 240 requests/minute for insights, 120/minute for HogQL. Self-hosted: no limits.

Use the same batching pattern as Mixpanel:
- Up to 5 parallel requests is safe
- Batch larger sets with `sleep 1` between groups of 5
- Check for HTTP 429 and retry with backoff

---

## Speed rules

1. **Use multi-event queries** — one trend request can include multiple events, reducing N queries to 1
2. **Use breakdowns** — one query with `breakdown` replaces N per-value queries
3. **Use HogQL for complex logic** — when you need joins, conditional aggregation, or cross-event analysis, one HogQL query replaces many insight queries
