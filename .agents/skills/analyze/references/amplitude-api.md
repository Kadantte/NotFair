# Amplitude API Reference

Use the Amplitude API to query events, user activity, funnels, and retention.

## Authentication

Amplitude uses API key + secret key pair (not the SDK API key used for event ingestion).

```bash
AMP_KEY="your_api_key"
AMP_SECRET="your_secret_key"
AMP_HOST="https://amplitude.com"  # or EU: https://analytics.eu.amplitude.com
```

**If no credentials are available, ask:**
> "Can you share your Amplitude API key and secret key? Go to Amplitude → Settings → Projects → your project → General → API Key / Secret Key."

Authentication is via HTTP Basic Auth: `-u "$AMP_KEY:$AMP_SECRET"`

---

## Event Segmentation (event counts over time)

The primary query endpoint — equivalent to Mixpanel's segmentation API.

```bash
curl -s -u "$AMP_KEY:$AMP_SECRET" \
  "$AMP_HOST/api/2/events/segmentation?e=%7B%22event_type%22%3A%22page_view%22%7D&start=20260211&end=20260313&m=uniques&i=7" \
  > /tmp/amp_seg.json
```

### Parameters

| Param | Description | Example |
|---|---|---|
| `e` | Event JSON (URL-encoded) | `{"event_type":"page_view"}` |
| `start` | Start date | `20260211` (YYYYMMDD) |
| `end` | End date | `20260313` |
| `m` | Metric | `uniques`, `totals`, `avg`, `pctdau` |
| `i` | Interval | `1` (daily), `7` (weekly), `30` (monthly) |
| `s` | Segment/breakdown (URL-encoded) | `[{"prop":"feature","op":"is","values":["rephrase"]}]` |
| `g` | Group by (URL-encoded) | `{"prop":"feature"}` → breakdown by feature |

### Filtering (via the `e` parameter)

```json
{
  "event_type": "feature_used",
  "filters": [
    {"subprop_key": "feature_name", "subprop_op": "is", "subprop_value": ["rephrase"]}
  ]
}
```

URL-encode the entire JSON and pass as `e=`.

**Filter operators:** `is`, `is not`, `contains`, `does not contain`, `starts with`, `ends with`, `is set`, `is not set`, `greater than`, `less than`, `between`

### Breakdowns (via the `g` parameter)

```bash
# Breakdown by feature property
G='{"type":"event","value":"feature_name"}'
curl -s -u "$AMP_KEY:$AMP_SECRET" \
  "$AMP_HOST/api/2/events/segmentation?e=%7B%22event_type%22%3A%22feature_used%22%7D&start=20260211&end=20260313&m=totals&i=7&g=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$G'))")" \
  > /tmp/amp_breakdown.json
```

**Breakdown types:**
- `{"type":"event","value":"prop_name"}` — event property
- `{"type":"user","value":"prop_name"}` — user property

---

## User Activity

### Active/new user counts
```bash
curl -s -u "$AMP_KEY:$AMP_SECRET" \
  "$AMP_HOST/api/2/users/activities?user=USER_ID" \
  > /tmp/amp_user.json
```

### Daily/weekly/monthly active users
```bash
curl -s -u "$AMP_KEY:$AMP_SECRET" \
  "$AMP_HOST/api/2/users/dauwau?start=20260211&end=20260313" \
  > /tmp/amp_dau.json
```

---

## Funnel Analysis

```bash
FUNNEL_E='[{"event_type":"page_view"},{"event_type":"sign_up_started"},{"event_type":"sign_up_completed"}]'
curl -s -u "$AMP_KEY:$AMP_SECRET" \
  "$AMP_HOST/api/2/funnels?e=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$FUNNEL_E'))")&start=20260211&end=20260313&n=new" \
  > /tmp/amp_funnel.json
```

### Funnel parameters
| Param | Description |
|---|---|
| `e` | Array of events in funnel order (URL-encoded) |
| `n` | User type: `new`, `active`, `any` |
| `cs` | Conversion window in seconds (default: 2592000 = 30 days) |

---

## Retention Analysis

```bash
curl -s -u "$AMP_KEY:$AMP_SECRET" \
  "$AMP_HOST/api/2/retention?se=%7B%22event_type%22%3A%22sign_up_completed%22%7D&re=%7B%22event_type%22%3A%22feature_used%22%7D&start=20260211&end=20260313&rm=bracket&rb=1,3,7,14,30" \
  > /tmp/amp_retention.json
```

| Param | Description |
|---|---|
| `se` | Start event (URL-encoded JSON) |
| `re` | Return event (URL-encoded JSON) |
| `rm` | Retention mode: `bracket` or `n-day` |
| `rb` | Retention brackets (for bracket mode) |

---

## Event and property discovery

### List events (taxonomy API)
```bash
curl -s -u "$AMP_KEY:$AMP_SECRET" \
  "$AMP_HOST/api/2/taxonomy/event" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
for e in data.get('data', []):
    print(f\"{e['event_type']:40s}  {e.get('description', '')}\")
" | head -50
```

### List properties for an event
```bash
curl -s -u "$AMP_KEY:$AMP_SECRET" \
  "$AMP_HOST/api/2/taxonomy/event-property?event_type=feature_used" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
for p in data.get('data', []):
    print(f\"{p['event_property']:40s}  type: {p.get('type', '?')}\")
"
```

---

## Parsing responses

Segmentation responses have `data.series` and `data.seriesLabels`:

```python
import json

data = json.load(open('/tmp/amp_seg.json'))
series = data['data']['series']
labels = data['data']['seriesLabels']

# series is a list of lists — one per breakdown value (or one if no breakdown)
for i, values in enumerate(series):
    label = labels[i] if i < len(labels) else f"series_{i}"
    for j, val in enumerate(values):
        print(f"{label}  period_{j}  {val}")
```

For xValues (dates), check `data['data']['xValues']`.

---

## Rate limits

Amplitude: org-level rate limit, typically 360 requests/hour for the dashboard API, 60/hour for export APIs. Behavioral cohort APIs have lower limits.

**Batching rules:**
- Up to 3 parallel requests is safe
- `sleep 2` between batches of 3 for larger sets
- Check for HTTP 429 and retry with exponential backoff (same pattern as Mixpanel's `mp_query`)

**Retry wrapper:**
```bash
amp_query() {
  local url="$1"; local out="$2"; local delay=3
  for i in 1 2 3; do
    curl -s -u "$AMP_KEY:$AMP_SECRET" "$url" > "$out"
    if python3 -c "import json,sys; d=json.load(open('$out')); sys.exit(0 if 'data' in d else 1)" 2>/dev/null; then
      return 0
    fi
    echo "Amplitude query attempt $i failed, retrying in ${delay}s..." >&2
    sleep $delay; delay=$((delay * 2))
  done
  echo "WARNING: failed after 3 attempts: $url" >&2
}
```

---

## Speed rules

1. **Use breakdowns (`g` param)** — one query with group-by replaces N per-value queries
2. **Use multi-event segmentation** — segment multiple events by passing an array
3. **Batch conservatively** — Amplitude has tighter rate limits than Mixpanel; keep parallel requests to 3
4. **Prefer segmentation over export** — the export API is slow and rate-limited; segmentation gives you aggregated data instantly
