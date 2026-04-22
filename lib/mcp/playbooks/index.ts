/**
 * Playbooks shipped as MCP resources so Claude can fetch the canonical
 * tool-call sequences for common dashboard tasks instead of re-deriving
 * them every conversation.
 *
 * Markdown is inlined as TS string constants so the bundler picks it up
 * with zero configuration (no outputFileTracing tweaks, no webpack loader).
 * Backticks inside the markdown are escaped as `\`` in the template literals.
 */

export interface Playbook {
  /** MCP resource URI — `adsagent://playbooks/<slug>`. */
  uri: string;
  /** Short human name surfaced in `resources/list`. */
  name: string;
  /** One-line hook shown in the resource list. */
  description: string;
  /** Full markdown content served at `resources/read`. */
  content: string;
}

const BUILD_DAILY_DASHBOARD = `# Build a daily Google Ads dashboard

Use this when the user says "show me my dashboard", "how's my account today", "give me a daily recap", or similar. The goal is a compact, scannable overview they can check in under 10 seconds.

## Tool-call sequence

Call these tools **in parallel** — they share query primitives so the MCP cache coalesces duplicate upstream calls:

1. \`getAccountInfo\` — account name, currency, timezone. One call, free (cached aggressively).
2. \`listCampaigns\` with \`limit: 10\` — top-spend campaigns with their impression share and cost.
3. \`getWasteFindings\` with \`days: 7\` — anything wasting money right now. \`wasteRate\` + top 3–5 wasted keywords/search terms.
4. \`getAccountChanges\` with \`days: 7, limit: 10\` — who changed what in the last week. Set context for anomalies.
5. \`getTimeseries\` with \`granularity: "day", metrics: ["spend", "conversions", "cpa"], groupBy: "account", comparePreviousPeriod: true\` — the spark chart.

That's five parallel tool calls. Cache coalescing means only ~7 unique upstream queries fire, not 5 × N.

## Dashboard composition (what to render, in this order)

1. **Header** — account name, date range, currency, pulse.
   - \`<accountInfo.name> · last 7 days · <currency>\`
   - Pulse line: \`Spend $X (Δ vs prev 7d), <totalConversions> conversions, CPA $Y\`
2. **Top campaigns** (from \`listCampaigns\`) — 5 rows max: name, spend, CPA, impression share. Flag any with \`impressionShare < 0.5\` and \`budgetLostIS > 0.15\` as budget-constrained.
3. **Waste panel** (from \`getWasteFindings\`) — only render if \`wasteRate > 5%\`. Show \`totalWaste\` USD, then the top 3 wasted keywords/search terms. Each row must show its \`recentChange.daysAgo\` if non-null — that means the issue may already be fixed.
4. **Changes feed** (from \`getAccountChanges.changes.items\`) — last 5, newest first. Each: \`<daysAgo>d ago · <userEmail or client> · <resourceType> · <changedFields[0]>\`.
5. **Timeseries** (from \`getTimeseries\`) — one chart, spend + conversions on a dual axis, with the previous-period overlay from \`response.comparison.series\` as dashed lines.

## How to present it

- Use tables for campaigns and changes. Charts drop \`response.structuredContent.series\` directly into Recharts — **no reshape code**.
- Every monetary value formatted with \`accountInfo.currency\`.
- If any tool returned \`errors\`, include a collapsed "Partial failures (N)" note at the bottom. Don't fail the whole render.

## Common follow-ups

- "What should I pause?" → drill into \`getWasteFindings.wastedKeywords\` and \`wastedSearchTerms\`; recommend pauses where \`recentChange\` is null (meaning nothing's been done yet). See \`drill-down\` playbook.
- "Why did CPA go up?" → switch to the \`explain-regression\` playbook.
- "Show me only last 3 days" → see \`customize-dashboard\` playbook.
- "Show me only campaign X" → call \`getCampaignPerformance(campaignId, days, comparePreviousPeriod: true)\` and replace the timeseries panel.

## Don't over-call

- Do **not** call \`audit\` here — that's 19 queries for a view that needs 7.
- Do **not** call \`getCampaignPerformance\` per-campaign to build the top-campaigns table; \`listCampaigns\` already has the data.
- Do **not** call \`runGaqlQuery\` unless drilling into specifics the view tools don't cover.
`;

const CUSTOMIZE_DASHBOARD = `# Customize a dashboard based on user feedback

Use this when the user has a dashboard open and says "change the date range", "add X", "remove Y", "show only active", or similar. The goal is to update the specific slice they asked about without regenerating the whole artifact.

## Translation table

| User says… | Tool(s) to call |
|---|---|
| "Last 7 / 14 / 30 / 90 days" | Re-call the tools in \`build-daily-dashboard\` with updated \`days\`. Cache will coalesce shared queries. |
| "Only campaign X" | Re-call \`getTimeseries\` with \`campaignIds: [X]\`. Keep the rest of the dashboard unless user says otherwise. |
| "Weekly, not daily" | Re-call \`getTimeseries\` with \`granularity: "week"\`. Other panels unaffected. |
| "Monthly for the year" | \`getTimeseries\` with \`granularity: "month"\`, \`startDate: <one year ago>\`, \`endDate: <today>\`. |
| "Hide paused campaigns" | Filter \`listCampaigns\` output client-side on \`status === "ENABLED"\` — no new call. |
| "Show ROAS instead of CPA" | \`getTimeseries\` with \`metrics: ["spend", "conversion_value", "roas"]\`. |
| "Compare to last year" | \`getTimeseries\` with a longer range + \`comparePreviousPeriod: true\`. Note: prev period is same-length immediately preceding, not YoY. For true YoY, make two calls with shifted ranges. |
| "Who changed X recently" | \`getAccountChanges\` with a tight \`days\`; filter \`changes.items\` client-side by \`resourceType\` or \`campaignName\`. |
| "Drill into this finding" | See \`drill-down\` playbook. |

## Rules of thumb

1. **Never regenerate the entire artifact** — identify the specific panel the user referenced and update only that one.
2. **Re-use cached queries** — the MCP cache keeps data warm for 45 seconds. A dashboard refresh within that window pays almost nothing.
3. **Tell the user what you updated** — "Updated the timeseries to weekly granularity. Other panels unchanged." One short confirmation, not a full re-summary.
4. **When in doubt about scope, ask once** — "Just the chart, or the whole dashboard?" Don't guess wide.

## Common missteps to avoid

- Don't call \`audit\` when the user asks for a narrower slice — use a view tool.
- Don't reshape \`getTimeseries\` output client-side; it's already chart-ready. If you're writing reshape code, stop and re-read the response shape.
- Don't re-render panels whose data hasn't changed. Touching the DOM unnecessarily is jarring.
`;

const DRILL_DOWN = `# Drill from a finding to supporting detail

Use this when the user points at a specific item in a dashboard — "tell me more about that", "why is this keyword wasting", "what search terms triggered this". The goal is to answer the specific question with the narrowest tool call that gets the data, without firing the full audit again.

## Decision tree

**User points at a campaign finding** (budget-constrained winner, low IS, bad CPA):
1. Read the finding's \`campaignId\` from the item.
2. Call \`getCampaignPerformance(campaignId, days, comparePreviousPeriod: true)\` for the day-by-day metrics.
3. Call \`getKeywords(campaignId, days, limit: 50)\` for top keywords with QS.
4. Call \`getSearchTermReport(campaignId, days, limit: 50)\` if they ask "what queries are triggering this".
5. If the finding has \`recentChange\`, surface it — the metrics may reflect a window that pre-dates a fix.

**User points at a wasted keyword:**
1. \`pauseKeyword(accountId, campaignId, adGroupId, criterionId)\` is the obvious next action. Before recommending, check the item's \`recentChange\` — if non-null, the keyword was touched recently; re-evaluate before pausing.
2. If they want more context: \`getKeywords(campaignId, days, limit: 100)\` to compare to other keywords in the ad group.

**User points at a wasted search term:**
1. Convert it to a negative: \`addNegativeKeyword(accountId, campaignId, term, matchType)\`. Match type defaults to PHRASE for multi-word terms; recommend BROAD for single words.
2. Before recommending, check the campaign's \`recentChange\` — if a negative was just added, the term may already be blocked.

**User points at a recent change:**
1. Read the \`resourceName\`, \`changedFields\`, \`operation\`, \`daysAgo\` from the change.
2. Call \`reviewChangeImpact(days, limit)\` to pull the pre/post metrics for the change and see if it actually helped.
3. If they ask "undo this": \`undoChange(accountId, changeId)\` — only works within 7 days AND if the entity hasn't been re-modified since.

## Tools to reach for, by need

| Need | Tool |
|---|---|
| Exact GAQL slice we don't have a view for | \`runGaqlQuery\` — but try a view tool first |
| A specific field on a specific entity | \`getResourceMetadata(resourceName)\` to discover valid fields before querying |
| Change history for one entity | Filter \`getAccountChanges.changes.items\` by resourceName or campaignName |
| Before/after of a specific change | \`reviewChangeImpact\` or \`getChanges\` with specific changeId |

## Don't

- Don't call \`audit\` to drill. The full audit is 19 queries. Drill calls are 1–3.
- Don't \`runGaqlQuery\` before trying a view tool — the view tools cover most drill patterns and are cached.
- Don't guess field names — use \`getResourceMetadata(resourceName)\` first.
`;

const EXPLAIN_REGRESSION = `# Explain a metric regression

Use this when the user asks "why did my CPA go up", "what happened to conversions last week", "ROAS tanked, what broke", or any "X is worse than it was" pattern. The goal is to identify the cause quickly and concretely, and to surface whether it's already being fixed.

## Tool-call sequence

1. \`getTimeseries\` with the regressed window + comparePreviousPeriod, \`granularity: "day"\`, \`groupBy: "campaign"\` — pinpoints which day(s) the metric shifted and which campaigns drove it.
2. \`getAccountChanges\` with \`days: <lookback covering the shift>\` — surfaces every edit that could have caused it.
3. \`getWasteFindings\` with \`days: <window>\` — confirms whether the regression correlates with new waste.

These run in parallel. Cache coalesces \`campaigns\` + \`change_event\` across tools 2 and 3.

## Diagnostic questions to answer, in order

**1. When exactly did it shift?**
- Inspect \`getTimeseries.series\` day-by-day. Find the date the metric moved.
- If the shift is gradual: likely a bidding/budget/seasonality issue.
- If the shift is a cliff: likely a configuration change. Go to Q2.

**2. What changed around that date?**
- Filter \`getAccountChanges.changes.items\` to the 3 days around the cliff date.
- Look at \`resourceType\` + \`changedFields\`. Common culprits:
  - \`CAMPAIGN\` · \`status\` → campaign paused
  - \`CAMPAIGN_BUDGET\` · \`amount_micros\` → budget raised/lowered
  - \`CAMPAIGN\` · \`bidding_strategy_type\` → bidding flipped
  - \`AD_GROUP_CRITERION\` · \`status\` → keyword paused/enabled
  - \`CAMPAIGN_CRITERION\` · \`negative=true\` → negative added (usually good, but may have been too aggressive)

**3. Which campaigns moved the most?**
- Sort \`getTimeseries.series\` by delta between main window and comparison window. Top 3 are your explanation.
- For each, check \`recentChange\` on related findings in \`getWasteFindings\` — sometimes the fix is already in flight.

**4. Is it just noise?**
- Compare the delta to the variance in the comparison window's daily values. If the regression is within the normal day-to-day band, it may not be real.
- Watch for zero-conversion days. A single day's drop can skew week-over-week CPA unfairly.

## How to present the finding

- Lead with **when** and **how much**, then **what changed**, then **next action**.
  - "CPA doubled on 2026-04-18, driven by Campaign Brand (80% of the delta). That day, the bidding strategy flipped from TARGET_CPA to MAXIMIZE_CONVERSIONS — the change is logged at getAccountChanges, author was alice@example.com. Revert with \`updateCampaignBidding\`."
- If the change is already being reversed (check \`recentChange\` on the finding), say so: "A correction is already in flight — the bidding strategy changed back yesterday. Spend should normalize over the next 24–48 hours."
- If no changes explain it: surface that plainly. "No account edits correlate with the shift. Likely external — check for competitor bid changes, seasonality, or landing-page issues."

## Don't

- Don't blame the first change you see. Always check correlation with the cliff date.
- Don't recommend an undo without checking \`recentChange\` — a fix may already be in flight.
- Don't fall back to \`audit\` for this. The three view tools above cover it.
`;

export const PLAYBOOKS: readonly Playbook[] = [
  {
    uri: "adsagent://playbooks/build-daily-dashboard",
    name: "Build a daily Google Ads dashboard",
    description:
      "Parallel tool-call sequence and panel composition for a compact daily dashboard. Uses the Phase 4 view tools so queries stay narrow and cached.",
    content: BUILD_DAILY_DASHBOARD,
  },
  {
    uri: "adsagent://playbooks/customize-dashboard",
    name: "Customize a dashboard",
    description:
      "Translation table from user feedback (date range, filter, granularity) to the exact tool calls. Avoids regenerating the entire artifact.",
    content: CUSTOMIZE_DASHBOARD,
  },
  {
    uri: "adsagent://playbooks/drill-down",
    name: "Drill from a finding to detail",
    description:
      "How to answer 'tell me more about that' by picking the narrowest tool that gets the data, without firing the full audit again.",
    content: DRILL_DOWN,
  },
  {
    uri: "adsagent://playbooks/explain-regression",
    name: "Explain a metric regression",
    description:
      "Diagnostic flow for 'why did my CPA go up'. Composes getTimeseries + getAccountChanges + getWasteFindings to isolate the cause.",
    content: EXPLAIN_REGRESSION,
  },
];

/** Look up a playbook by URI. Returns undefined if not found. */
export function findPlaybook(uri: string): Playbook | undefined {
  return PLAYBOOKS.find((p) => p.uri === uri);
}
