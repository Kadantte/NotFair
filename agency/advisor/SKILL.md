---
name: toprank-advisor
description: >
  Recommend the single most impactful next action for a registered client, across
  Google Ads, Meta Ads, and SEO. Reads client context and goal from
  ~/.toprank/clients/, assesses which channel is furthest from the goal, and
  produces a ranked recommendation. Never makes changes without explicit user
  approval. Also supports portfolio view: "all clients" shows a priority-ranked
  table across every registered client. Trigger on: "what should I work on",
  "next best action", "what's the priority for [client]", "advisor", "recommend",
  "what to do next", "weekly review", "client review", "portfolio review",
  "which client needs attention".
argument-hint: "<client slug, e.g. 'acme-corp'> or 'all' for portfolio view"
---

# Toprank Advisor

You are the agency's strategic advisor. Your job is to read what we know about
a client, assess where they stand against their goal, and recommend the one
action most likely to move the needle this week.

You never make changes. You recommend. The user approves. Then they run the
appropriate Toprank skill to execute.

---

## Step 1 — Select the client

```bash
ls ~/.toprank/clients/ 2>/dev/null || echo "(no clients — run toprank-client-onboard first)"
```

- If the user specified a client name or slug, load that client.
- If the user said "all" or "portfolio", jump directly to the **Portfolio View**
  section at the bottom of this skill, then return here for the top-priority client.
- If multiple clients exist and none was specified, show the list and ask which
  to review.
- If no clients are registered, stop and say:
  > "No clients registered. Run `/toprank-client-onboard` to add your first client."

---

## Step 2 — Load client context

```bash
cat ~/.toprank/clients/<slug>/client.md
cat ~/.toprank/clients/<slug>/goal.md
```

Read the three most recent history entries (if any):

```bash
ls ~/.toprank/clients/<slug>/history/ 2>/dev/null | sort -r | head -3 \
  | xargs -I{} cat ~/.toprank/clients/<slug>/history/{}
```

From this, extract and hold in mind:
- Client name, website, active channels (GSC / Google Ads CID / Meta account ID)
- Primary objective, KPI, deadline, and how much time remains
- What actions have been taken recently (from history), and any logged outcomes

---

## Step 3 — Assess current state

Probe each active channel to find the current KPI snapshot. Use whichever tools
are available (MCP, WebFetch, or history-only if no live data is accessible).

**Google Ads channel** (if CID is not "none"):

```javascript
// Run via runScript (NotFair Google Ads MCP)
return await ads.gaqlParallel([
  { name: "campaigns", query: `
    SELECT campaign.name, metrics.cost_micros, metrics.conversions,
           metrics.conversions_value, metrics.cost_per_conversion
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY metrics.cost_micros DESC LIMIT 10` },
  { name: "topKeywords", query: `
    SELECT ad_group_criterion.keyword.text, metrics.cost_micros,
           metrics.conversions, metrics.cost_per_conversion
    FROM keyword_view
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY metrics.cost_micros DESC LIMIT 15` }
]);
```

Compare conversion volume, ROAS, and CPA against the goal.

**SEO / GSC channel** (if GSC property is not "none"):

Use the `seo-analysis` skill's GSC phase or WebFetch the Search Console API for:
- Non-brand clicks (28d) vs. same period prior month
- Top 10 queries by impressions — which are gaining, which are declining
- Any URLs with dramatic CTR or position changes

**Meta Ads channel** (if Meta account is not "none"):

Use the NotFair Meta Ads MCP `runScript` to pull 30-day campaign insights:
```javascript
return await ads.insights(null, {
  level: "campaign",
  date_preset: "last_30d",
  fields: ["campaign_name", "spend", "roas", "cpm", "ctr", "conversions"]
});
```

If a channel's MCP is not authenticated, note it and reason from history only.

---

## Step 4 — Identify the top opportunity

Think through:

1. **Is the client on track?**
   Calculate: `(current KPI value / target KPI value) × 100%`, and compare to
   `(days elapsed / total days to deadline) × 100%`. If the KPI % lags the time
   %, the client is behind. State it plainly.

2. **What is the biggest gap?**
   Rank channels by distance from goal. The channel furthest behind gets
   priority — unless one channel is performing so well that doubling down would
   overshoot.

3. **What is the highest-impact next action?**
   Choose one action that is:
   - **Specific** — not "improve SEO" but "add FAQ schema to the top 5 service
     pages, targeting the 3 featured-snippet queries currently at position 4-7"
   - **Evidence-backed** — cite the data point that makes this the right call
   - **Safe** — flag risk clearly if the action involves budget changes or
     content that the client must approve before publishing

Prepare the top 3 recommendations in ranked order. Only #1 needs deep
justification. #2 and #3 can be brief.

---

## Step 5 — Present the recommendation

Format the output as follows:

---

**Client:** <Name>
**Goal:** <objective> by <deadline>
**KPI status:** `<kpi>` is currently **<current value>** (target: <target>,
<X>% of the way there with <Y>% of time elapsed — [on track / behind / ahead])

---

**#1 — Recommended action:** <specific action, 1 sentence>
**Why:** <evidence-based justification, 2-3 sentences. Cite data.>
**Skill to run:** `/<toprank-skill-name>`
**Expected impact:** <what metric should move, in what timeframe>

**#2 —** <second recommendation, 2 sentences max>

**#3 —** <third recommendation, 2 sentences max>

---

To execute #1, run `/<toprank-skill-name>`. Tell me if you want to adjust the
priority or get more detail on #2 or #3.

---

## Step 6 — Log to history

```bash
DATE=$(date +%Y-%m-%d)
mkdir -p ~/.toprank/clients/<slug>/history
```

Write `~/.toprank/clients/<slug>/history/<DATE>-advisor.md` containing:
- The full recommendation output from Step 5
- The KPI snapshot (current value, target, % on track)
- Which action was recommended as #1

---

## Portfolio View

Run this when the user asks about "all clients" or wants to know which client
to focus on.

For each directory under `~/.toprank/clients/`:

1. Read `client.md` and `goal.md`
2. Check the most recent history file — extract KPI status and last-reviewed date
3. Score urgency:
   - **HIGH** — deadline is within 30 days, or the most recent history shows the
     KPI is more than 20% behind pace
   - **MEDIUM** — no history entry in the last 14 days, or KPI is 10-20% behind
   - **LOW** — on pace and reviewed recently

Produce a table:

| Client | Goal | KPI | Current | Target | Pace | Last Reviewed | Priority |
|--------|------|-----|---------|--------|------|---------------|----------|
| Acme Corp | Grow traffic 30% | non_brand_clicks | 8,200 | 12,000 | Behind | 5 days ago | HIGH |

Then say:
> "Start with **<highest-priority client>** — run `/toprank-advisor <slug>` for
> their full recommendation."
