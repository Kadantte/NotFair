# Mixpanel REST API Reference

Use this when the Mixpanel MCP is unavailable, returns errors, or is slow. The REST API is always reliable.

## Authentication

Service account credentials (preferred — org-level, works across all projects):
```bash
curl -u "SERVICE_ACCOUNT_USERNAME:SERVICE_ACCOUNT_SECRET" "https://mixpanel.com/api/2.0/..."
```

If no service account is on hand, ask the user:
> "The Mixpanel MCP isn't responding. Can you share a service account username+secret from mixpanel.com → Org Settings → Service Accounts? I'll use it to pull the data directly."

**Never hardcode credentials.** Load them from `.env.local` in the project root:
```bash
source <(grep -E '^MIXPANEL_' /Users/tongchen/Documents/Projects/docheroai/.env.local | sed 's/ *= */=/')
MP="$MIXPANEL_SERVICE_ACCOUNT_USERNAME:$MIXPANEL_SERVICE_ACCOUNT_SECRET"
PID="$MIXPANEL_PROJECT_ID"
```

## Finding the project ID

The project ID is visible in the Mixpanel URL when you're in the project:
`https://mixpanel.com/project/XXXXXXX/...`

Or ask the user: "What's your Mixpanel project ID? It's in the URL when you open the project."

Always use the production project unless the user says otherwise.

---

## Segmentation API (most queries go here)

```
GET https://mixpanel.com/api/2.0/segmentation
```

| Param | Description | Example |
|-------|-------------|---------|
| `project_id` | Project ID | `2901165` |
| `event` | Event name | `GPTApiCall` |
| `from_date` | Start date | `2026-02-11` |
| `to_date` | End date | `2026-03-13` |
| `unit` | Bucket size | `day`, `week`, `month` |
| `type` | Aggregation | `general` (total), `unique` (distinct users), `average` |
| `where` | Filter expression (URL-encoded) | `properties["feature"] == "Rephrase"` |
| `on` | Breakdown property (URL-encoded) | `properties["feature"]` |

**Filter syntax:**
```
properties["feature"] == "Rephrase"
properties["source"] == "Web"
properties["is_paid"] == true
```

**Breakdown syntax (`on` param):**
```
properties["feature"]
properties["source"]
```
URL-encode brackets: `[` → `%5B`, `]` → `%5D`, `"` → `%22`, space → `%20`, `==` → `%20%3D%3D%20`

**Note on nested properties** like `AIParams.selectedMode`: the segmentation API cannot filter on nested objects. Use JQL instead (see below).

### Example: total calls by week with filter
```bash
curl -s -u "$MP" \
  "https://mixpanel.com/api/2.0/segmentation?project_id=2901165\
&event=GPTApiCall\
&from_date=2026-02-11&to_date=2026-03-13\
&unit=week\
&where=properties%5B%22feature%22%5D%20%3D%3D%20%22Rephrase%22\
&type=general"
```

### Example: breakdown by feature
```bash
curl -s -u "$MP" \
  "https://mixpanel.com/api/2.0/segmentation?project_id=2901165\
&event=GPTApiCall\
&from_date=2026-02-11&to_date=2026-03-13\
&unit=week\
&on=properties%5B%22feature%22%5D\
&type=general"
```

---

## JQL API (for nested properties, cross-event logic, custom aggregations)

```
POST https://mixpanel.com/api/2.0/jql
```

```bash
curl -s -u "$MP" \
  -X POST "https://mixpanel.com/api/2.0/jql?project_id=2901165" \
  --data-urlencode 'script=function main() {
    return Events({
      from_date: "2026-02-23",
      to_date: "2026-03-13",
      event_selectors: [{event: "GPTApiCall"}]
    })
    .filter(function(e) { return e.properties.feature === "Rephrase"; })
    .groupBy(
      [function(e) { return e.properties.AIParams ? e.properties.AIParams.selectedMode : "unknown"; }],
      mixpanel.reducer.count()
    );
  }'
```

**Important JQL syntax rules:**
- `groupBy` takes `[keyFunctions..., reducer]` — NOT `([reducer], keyFunction)` — that order causes a syntax error
- Use `function(e) { return ...; }` not arrow functions
- Key functions must be in the array before the reducer

---

## The #1 speed rule: run all queries in parallel — with rate limit awareness

Never run queries sequentially. But also don't blast 15 queries at once — Mixpanel's API rate-limits at ~60 req/min per service account, and simultaneous bursts of 10+ can trigger 429s.

**The pattern:**
- 1–5 queries → fire all in parallel, no batching needed
- 6–15 queries → batch into groups of 5, add `sleep 1` between batches
- 16+ queries → groups of 5 with `sleep 2` between batches

**Always check for rate limit errors** — a 429 response returns JSON like `{"error": "rate limit exceeded"}` not the data you expect. Retry with backoff if you get one.

**Prefer breakdowns over separate filters** — one query with `on=properties%5B%22feature%22%5D` replaces N separate queries, one per feature value. This is the biggest speedup available: instead of 5 queries (one per feature), run 1 breakdown query.

### Retry wrapper function

Define this at the top of your bash block and use it instead of bare `curl`:

```bash
mp_query() {
  local url="$1"
  local out="$2"
  local max_retries=3
  local delay=2
  for i in $(seq 1 $max_retries); do
    curl -s -u "$MP" "$url" > "$out"
    # Check for rate limit (429 or error in JSON)
    if python3 -c "import json,sys; d=json.load(open('$out')); sys.exit(0 if 'data' in d or isinstance(d,list) else 1)" 2>/dev/null; then
      return 0
    fi
    echo "Query attempt $i failed for $url, retrying in ${delay}s..." >&2
    sleep $delay
    delay=$((delay * 2))
  done
  echo "WARNING: query failed after $max_retries attempts: $url" >&2
}
```

### Small batch (≤5 queries) — fire all at once

```bash
source <(grep -E '^MIXPANEL_' /Users/tongchen/Documents/Projects/docheroai/.env.local | sed 's/ *= */=/')
MP="$MIXPANEL_SERVICE_ACCOUNT_USERNAME:$MIXPANEL_SERVICE_ACCOUNT_SECRET"
PID="$MIXPANEL_PROJECT_ID"
FROM="2026-02-11"
TO="2026-03-13"

mp_query() {
  local url="$1"; local out="$2"; local delay=2
  for i in 1 2 3; do
    curl -s -u "$MP" "$url" > "$out"
    python3 -c "import json,sys; d=json.load(open('$out')); sys.exit(0 if 'data' in d or isinstance(d,list) else 1)" 2>/dev/null && return 0
    sleep $delay; delay=$((delay * 2))
  done
  echo "WARNING: failed after 3 attempts: $url" >&2
}

# Launch all queries in background — up to 5 at a time is safe
mp_query "https://mixpanel.com/api/2.0/segmentation?project_id=$PID&event=PageVisit&from_date=$FROM&to_date=$TO&unit=week&where=properties%5B%22action%22%5D%20%3D%3D%20%22Rephrase%22&type=general" /tmp/mp_pagevisit.json &
mp_query "https://mixpanel.com/api/2.0/segmentation?project_id=$PID&event=PageVisit&from_date=$FROM&to_date=$TO&unit=week&where=properties%5B%22action%22%5D%20%3D%3D%20%22Rephrase%22&type=unique" /tmp/mp_pagevisit_unique.json &
mp_query "https://mixpanel.com/api/2.0/segmentation?project_id=$PID&event=GPTApiCall&from_date=$FROM&to_date=$TO&unit=week&where=properties%5B%22feature%22%5D%20%3D%3D%20%22Rephrase%22&type=general" /tmp/mp_gptcall.json &
mp_query "https://mixpanel.com/api/2.0/segmentation?project_id=$PID&event=GPTApiCall&from_date=$FROM&to_date=$TO&unit=week&where=properties%5B%22feature%22%5D%20%3D%3D%20%22Rephrase%22&type=unique" /tmp/mp_gptcall_unique.json &
mp_query "https://mixpanel.com/api/2.0/segmentation?project_id=$PID&event=result_copied&from_date=$FROM&to_date=$TO&unit=week&where=properties%5B%22feature%22%5D%20%3D%3D%20%22Rephrase%22&type=general" /tmp/mp_copied.json &
wait

# Second batch (if more queries needed — 1s gap prevents rate limit)
sleep 1
mp_query "https://mixpanel.com/api/2.0/segmentation?project_id=$PID&event=upgrade_clicked&from_date=$FROM&to_date=$TO&unit=week&where=properties%5B%22feature%22%5D%20%3D%3D%20%22Rephrase%22&type=general" /tmp/mp_upgrade.json &
wait

# Parse results
python3 -c "
import json, sys

def load(f):
    try:
        d = json.load(open(f))
        vals = d.get('data',{}).get('values',{})
        if not vals: return {}
        return list(vals.values())[0]  # first series
    except: return {}

pv = load('/tmp/mp_pagevisit.json')
pv_u = load('/tmp/mp_pagevisit_unique.json')
gpt = load('/tmp/mp_gptcall.json')
gpt_u = load('/tmp/mp_gptcall_unique.json')
cop = load('/tmp/mp_copied.json')
upg = load('/tmp/mp_upgrade.json')

print('Week | Visits(total) | Visits(uniq) | GPT(total) | GPT(uniq) | Activation% | Copied | Upgrade')
for week in sorted(set(list(pv.keys())+list(gpt.keys()))):
    v = pv.get(week,0); vu = pv_u.get(week,0)
    g = gpt.get(week,0); gu = gpt_u.get(week,0)
    act = f'{gu/vu*100:.1f}%' if vu else '-'
    c = cop.get(week,0); u = upg.get(week,0)
    print(f'{week} | {v} | {vu} | {g} | {gu} | {act} | {c} | {u}')
"
```

This runs ~6 queries in ~1 second instead of ~6 seconds sequential, without triggering rate limits.

### Large batch (6+ queries) — use breakdown queries to reduce count

Instead of one query per feature value, use a single breakdown query:

```bash
# BAD: 5 separate queries (one per feature)
curl ... "&event=GPTApiCall&where=feature=='Rephrase'" > /tmp/rephrase.json &
curl ... "&event=GPTApiCall&where=feature=='Translate'" > /tmp/translate.json &
curl ... "&event=GPTApiCall&where=feature=='Scholar'" > /tmp/scholar.json &
# ... etc

# GOOD: 1 breakdown query returns all features at once
mp_query "https://mixpanel.com/api/2.0/segmentation?project_id=$PID&event=GPTApiCall&from_date=$FROM&to_date=$TO&unit=week&on=properties%5B%22feature%22%5D&type=general" /tmp/mp_by_feature.json

# Parse breakdown result (multiple series)
python3 -c "
import json
d = json.load(open('/tmp/mp_by_feature.json'))
for feature, weeks in d['data']['values'].items():
    total = sum(weeks.values())
    print(f'{feature}: {total} total')
"
```

Use breakdowns aggressively — they're the biggest single speedup available. For N features, you go from N queries to 1.

---

## Discovering events for an unfamiliar project

If there's no `docs/event-registry.md`, discover what's tracked by fetching the top events:

```bash
# Get the most common events in the last 30 days (no filter)
curl -s -u "$MP" \
  "https://mixpanel.com/api/2.0/events/names?project_id=$PID&type=general&limit=50" \
  | python3 -m json.tool
```

Then check what properties a specific event carries:

```bash
curl -s -u "$MP" \
  "https://mixpanel.com/api/2.0/events/properties?project_id=$PID&event=<EventName>&limit=30" \
  | python3 -m json.tool
```

Use these to understand the schema before writing queries, rather than guessing property names.

---

## Common URL-encoded filters

| Filter | URL-encoded `where` value |
|--------|--------------------------|
| `feature == "Rephrase"` | `properties%5B%22feature%22%5D%20%3D%3D%20%22Rephrase%22` |
| `feature == "Translate"` | `properties%5B%22feature%22%5D%20%3D%3D%20%22Translate%22` |
| `action == "Rephrase"` | `properties%5B%22action%22%5D%20%3D%3D%20%22Rephrase%22` |
| `source == "Web"` | `properties%5B%22source%22%5D%20%3D%3D%20%22Web%22` |
| `is_paid == true` | `properties%5B%22is_paid%22%5D%20%3D%3D%20true` |

## Common URL-encoded breakdowns

| Breakdown | URL-encoded `on` value |
|-----------|----------------------|
| `feature` | `properties%5B%22feature%22%5D` |
| `source` | `properties%5B%22source%22%5D` |
| `mode` | `properties%5B%22mode%22%5D` |
| `model` | `properties%5B%22model%22%5D` |
| `action` | `properties%5B%22action%22%5D` |
