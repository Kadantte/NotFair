# Report Data Schema

Pass structured data to `generate_report.py` to produce a professional HTML report.

## Workflow

```bash
# 1. Write data JSON to temp file (avoids shell quoting issues)
cat > /tmp/analysis.json << 'EOF'
{ ...your data... }
EOF

# 2. Generate HTML
python3 /Users/tongchen/.claude/skills/analyze/scripts/generate_report.py \
  --data /tmp/analysis.json \
  --output docs/analysis/2026-03-13_14-30_topic-slug.html

# 3. Open in browser
open docs/analysis/2026-03-13_14-30_topic-slug.html
```

## Full Schema

```json
{
  "title": "Short descriptive title (shown as page heading)",
  "question": "The original user question (shown in italics under the title)",
  "date": "2026-03-13 14:30 PST",
  "verdict": "One sentence conclusion. Leads with the cause, not just the number.",

  "data_quality_notes": "Any tracking gaps, instrumentation issues, or sample concerns. Omit if data is clean.",

  "kpis": [
    {
      "label": "Total uploads",
      "value": "1,950",
      "change": "+85% vs last week",
      "trend": "up"
    }
  ],

  "findings": [
    {
      "label": "What this metric is",
      "value": "The number (e.g. '1,950 uploads')",
      "note": "Context note (e.g. '+85% vs last week')",
      "trend": "up | down | flat | positive | negative",
      "confidence": "High | Medium | Low | Data quality concern"
    }
  ],

  "vs_last_analysis": "Only include if a prior analysis exists. Show what changed vs the prior run.",

  "charts": [
    {
      "type": "line | bar | horizontal_bar | doughnut",
      "title": "ASSERTION — state the insight, not just the topic. E.g. 'Tuesday spike drove 35% of weekly uploads' not 'Daily uploads'",
      "subtitle": "Data context: period, metric, unit. E.g. 'Daily uploads, Mar 7–13 vs Mar 1–6'",
      "insight": "Optional one-line annotation reinforcing the key takeaway from this chart",
      "reference_line": { "value": 278, "label": "Daily avg" },
      "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      "datasets": [
        {
          "label": "This week",
          "data": [200, 691, 350, 320, 200, 100, 89],
          "color": "#2563EB"
        },
        {
          "label": "Last week",
          "data": [120, 300, 250, 150, 100, 80, 54]
        }
      ]
    }
  ],

  "tables": [
    {
      "title": "Table title",
      "headers": ["Column A", "Column B", "Column C"],
      "rows": [
        ["Row 1 A", "Row 1 B", "Row 1 C"],
        ["Row 2 A", "Row 2 B", "Row 2 C"]
      ]
    }
  ],

  "so_what": [
    "Recommended action 1 — include the specific data that justifies this as the top priority",
    "Recommended action 2 — be specific about what to change and why"
  ],

  "data_sources": "Statsig: event_name, last 30d | Supabase: table_name, last 7d"
}
```

## Field reference

| Field | Required | Notes |
|-------|----------|-------|
| `verdict` | Yes | One sentence. State the *why*, not just the what. This is the big blue headline. |
| `kpis` | No | 2–4 headline numbers. Displayed as large tiles before the detail. Use for the most important figures the user needs at a glance. |
| `findings` | Yes | 2–5 bullets. Each needs a number AND an explanation. Add `confidence` when it matters. |
| `charts` | No | Include when time series or breakdown data is available. |
| `tables` | No | Use for ranked lists or multi-column breakdowns. |
| `vs_last_analysis` | No | Only include when a prior analysis file exists on the same topic. |
| `so_what` | Yes | 1–3 actionable recommendations. Numbered by priority. |
| `data_quality_notes` | No | Any data reliability concerns. If clean, omit entirely. |

## Chart design rules

### Chart title must be an assertion, not a topic label

This is the single most important chart rule. Consulting-grade charts use the title to state the conclusion. The reader should understand the insight before reading the data.

| Bad (topic label) | Good (assertion) |
|---|---|
| "Daily uploads" | "Tuesday spike drove 35% of weekly volume" |
| "Activation by platform" | "Mobile activates at half the rate of desktop — 18% vs 41%" |
| "Weekly signups" | "Signups flat for 3 weeks before recovering in week of Mar 10" |
| "Revenue by segment" | "Enterprise drove 78% of new revenue despite being 23% of customers" |

### Reference lines — use them to provide context

Add a `reference_line` to show the average, a target, or a prior-period benchmark. This gives the reader an instant "is this good or bad?" anchor without requiring mental arithmetic.

```json
"reference_line": { "value": 278, "label": "Daily avg" }
"reference_line": { "value": 1000, "label": "Target" }
```

### Second dataset = grey by default

The second series in a chart auto-renders in slate grey. This is intentional: the primary series (current period) gets the blue accent, the comparison (prior period, benchmark) recedes to grey. This is standard consulting chart practice — it focuses the eye on the change, not on both lines equally.

To override, specify `"color"` explicitly in the dataset.

### Data labels

Bar charts automatically show data labels above each bar. This is intentional — readers should be able to read exact values without hovering. You don't need to configure this.

Line charts do not show data labels by default (too cluttered for time series). Use tooltips for line chart values.

## Chart type guide

| Type | When to use |
|------|-------------|
| `line` | Daily/weekly trends; comparing this period vs last period; continuous data where the shape matters |
| `bar` | Comparing discrete categories side by side; emphasizing magnitude differences |
| `horizontal_bar` | Rankings with long labels; when bar count > 6; feature/segment breakdowns |
| `doughnut` | Part-of-whole composition (e.g. upload type breakdown) — use sparingly, max 5 segments |

## KPI tiles — when to use

Use `kpis` when you have 2–4 top-level numbers the reader needs at a glance before reading the detail. Good candidates:

- Total count this period (with change vs prior)
- A rate (activation %, error rate)
- Growth or change figure
- A headline comparison (this week vs last week)

Don't use `kpis` for every number — just the 2–4 that are most decision-relevant.

## Confidence tags — when to include

Add `"confidence"` to findings where it materially affects interpretation:

| Level | When to use |
|---|---|
| `High` | Multiple independent data points confirm the same conclusion |
| `Medium` | Data supports conclusion but alternative explanations exist |
| `Low` | Directional only — small sample, single data point, or conflicting signals |
| `Data quality concern` | The number itself may not be reliable |

Skip the confidence tag on findings where certainty is obvious from context.

---

## Minimal example (no charts)

```json
{
  "title": "Tool Usage — Mar 13",
  "question": "which tools are staff using most?",
  "date": "2026-03-13 14:30 PST",
  "verdict": "Tool usage is untrackable — Statsig environment misconfiguration is blocking all staff app events from reaching the API.",
  "data_quality_notes": "All tool_opened events return 0. Root cause: NEXT_PUBLIC_STATSIG_ENVIRONMENT=development in Vercel production environment.",
  "findings": [
    { "label": "tool_opened events (last 30d)", "value": "0", "note": "should be >100 if tracking correctly", "trend": "down", "confidence": "Data quality concern" },
    { "label": "Root cause identified", "value": "Wrong Statsig environment in Vercel" }
  ],
  "so_what": [
    "Set NEXT_PUBLIC_STATSIG_ENVIRONMENT=production in Vercel for app.pawsvip.com, then re-deploy",
    "Re-run this analysis after deploying to get actual tool rankings"
  ],
  "data_sources": "Statsig: tool_opened, last 30d (0 events — environment issue)"
}
```

---

## Rich example (KPIs + charts + table)

```json
{
  "title": "Photo Uploads — Week of Mar 10",
  "question": "how many photos were uploaded this week?",
  "date": "2026-03-13 14:30 PST",
  "verdict": "Uploads accelerated 85% this week, with Tuesday's spike alone accounting for 35% of total volume — driven by a grooming event at the Westside location.",
  "kpis": [
    { "label": "Uploads this week", "value": "1,950", "change": "+85% vs last week", "trend": "up" },
    { "label": "Staff uploading", "value": "7 / 8", "change": "88% adoption", "trend": "up" },
    { "label": "Peak day", "value": "Tue Mar 10", "change": "691 uploads" }
  ],
  "findings": [
    { "label": "Uploads this week (Mon–Thu)", "value": "1,950", "note": "+85% vs last week (1,054)", "trend": "up", "confidence": "High" },
    { "label": "Tuesday spike (Mar 10)", "value": "691 uploads", "note": "2.2× the weekly daily avg of 320", "trend": "up", "confidence": "High" },
    { "label": "Staff participation", "value": "7 of 8 active (88%)", "confidence": "High" }
  ],
  "charts": [
    {
      "type": "bar",
      "title": "Tuesday spike drove 35% of weekly volume",
      "subtitle": "Daily uploads, Mon–Thu, This week vs Last week",
      "insight": "Mar 10 had 2.2× the weekly daily average — consistent with the Westside grooming event log.",
      "reference_line": { "value": 320, "label": "Daily avg" },
      "labels": ["Mon", "Tue", "Wed", "Thu"],
      "datasets": [
        { "label": "This week", "data": [320, 691, 490, 449] },
        { "label": "Last week", "data": [201, 310, 280, 263] }
      ]
    }
  ],
  "tables": [
    {
      "title": "Uploads by Staff Member",
      "headers": ["Staff", "Uploads", "% of Total"],
      "rows": [
        ["Alice", "450", "23%"],
        ["Bob", "380", "19%"],
        ["Carlos", "340", "17%"],
        ["Dana", "290", "15%"],
        ["Evan", "220", "11%"],
        ["Fiona", "200", "10%"],
        ["Grace", "70", "4%"]
      ]
    }
  ],
  "so_what": [
    "No action needed — PawsDrop adoption is strong and accelerating. Monitor for sustained growth past this week to confirm the trend isn't event-driven.",
    "Follow up with Grace (4% of uploads despite full-time status) — may indicate a workflow or device issue."
  ],
  "data_sources": "Supabase: media table, last 7d"
}
```
