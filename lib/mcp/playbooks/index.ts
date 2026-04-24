/**
 * Playbooks shipped as MCP resources — canonical `runScript` recipes for the
 * most common user asks. Clients that surface resources to the model can fetch
 * these to shortcut the "what GAQL do I write" step.
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

const AUDIT_ACCOUNT = `# Audit a Google Ads account with runScript

Use this when the user asks anything like "audit my account", "how is my Google Ads doing", "what's working and what's not", "find wasted spend", "what should I fix today". The answer is almost always a single \`runScript\` call that fans out GAQL queries in parallel.

## The one-call pattern

\`ads.gaqlParallel\` takes \`[{name, query, limit?}, ...]\` and returns
\`{ [name]: GaqlReport | { error } }\`. Destructure by name, read \`.rows\`.

\`\`\`js
const r = await ads.gaqlParallel([
  // 1. Account performance by campaign
  { name: "campaigns", query: \`
    SELECT campaign.id, campaign.name, campaign.status,
           metrics.cost_micros, metrics.conversions, metrics.clicks,
           metrics.impressions, metrics.ctr, metrics.average_cpc
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
      ORDER BY metrics.cost_micros DESC\` },
  // 2. Search terms for wasted-spend detection
  { name: "searchTerms", query: \`
    SELECT search_term_view.search_term, campaign.name, ad_group.name,
           metrics.cost_micros, metrics.clicks, metrics.conversions
      FROM search_term_view
      WHERE segments.date DURING LAST_30_DAYS
        AND metrics.clicks > 5
      ORDER BY metrics.cost_micros DESC\`, limit: 200 },
  // 3. Zero-conversion keywords burning spend
  { name: "zeroConvKw", query: \`
    SELECT ad_group_criterion.keyword.text, campaign.name, ad_group.name,
           metrics.cost_micros, metrics.clicks,
           ad_group_criterion.quality_info.quality_score
      FROM keyword_view
      WHERE segments.date DURING LAST_30_DAYS
        AND metrics.conversions = 0
        AND metrics.cost_micros > 0
      ORDER BY metrics.cost_micros DESC\`, limit: 100 },
  // 4. Recent account changes (Google's change_event, capped at 30 days)
  { name: "changes", query: \`
    SELECT change_event.resource_name, change_event.change_date_time,
           change_event.changed_fields, change_event.user_email,
           change_event.resource_type, change_event.client_type,
           change_event.change_resource_type
      FROM change_event
      WHERE change_event.change_date_time DURING LAST_30_DAYS
      ORDER BY change_event.change_date_time DESC\`, limit: 50 }
]);

const campaigns = r.campaigns.rows ?? [];
const searchTerms = r.searchTerms.rows ?? [];
const zeroConvKw = r.zeroConvKw.rows ?? [];
const changes = r.changes.rows ?? [];

// Compute account CPA and flag wasted spend at 2x that threshold
const toDollars = (micros) => (micros || 0) / 1_000_000;
const totalSpend = campaigns.reduce((s, row) => s + toDollars(row.metrics.cost_micros), 0);
const totalConv = campaigns.reduce((s, row) => s + (row.metrics.conversions || 0), 0);
const accountCpa = totalConv > 0 ? totalSpend / totalConv : null;
const threshold = accountCpa ? accountCpa * 2 : Infinity;

const wastedKeywords = zeroConvKw
  .filter(row => toDollars(row.metrics.cost_micros) > threshold)
  .slice(0, 10);
const wastedSearchTerms = searchTerms
  .filter(row => row.metrics.conversions === 0 && row.metrics.clicks >= 10)
  .slice(0, 10);

return {
  accountCpa,
  totalSpend,
  totalConversions: totalConv,
  campaigns: campaigns.slice(0, 20),
  wastedKeywords,
  wastedSearchTerms,
  recentChanges: changes.slice(0, 20),
};
\`\`\`

One tool call. ~4 upstream queries. Everything correlated in-script. The agent then narrates the findings with real numbers.

## Rules of thumb

1. **Always fan out with \`ads.gaqlParallel\`** when you need more than one surface. Sequential \`ads.gaql\` calls inside the same runScript are wasteful.
2. **Filter in-script, not with SELECT *** — GAQL doesn't support \`SELECT *\`. List the fields you actually need.
3. **Cast a wide net on the first call.** If the user says "audit my account", assume they also want to see wasted spend, recent changes, and quality-score laggards — correlating them is free once the queries have run.
4. **One \`runScript\` call per user question.** If you catch yourself about to call runScript a second time for a related surface, stop and combine them.
5. **Use \`LAST_N_DAYS\`, \`LAST_7_DAYS\`, \`LAST_30_DAYS\`, \`THIS_MONTH\`, etc.** — the date literal shorthand is faster to write and read than computing bounds.

## Before you query an unfamiliar resource

Call \`getResourceMetadata('<resource_name>')\` once to see valid fields — saves a round-trip on "unknown field" errors. \`listQueryableResources\` returns every resource you can query.

## For targeted asks

Even when the user asks something narrow like "show me CPA by campaign for last 30 days", still use \`runScript\` — it's ONE call, ONE GAQL query, and the response is typed JSON the agent can format however it wants. No bespoke point-query tool needed.
`;

const EXPLAIN_REGRESSION = `# Explain a metric regression with runScript

Use this when the user asks "why did my CPA go up", "what happened to conversions last week", "ROAS tanked, what broke", or any "X is worse than it was" pattern. One \`runScript\` call correlates the timeseries + change events + waste surfaces in a single pass.

## The one-call pattern

\`ads.gaqlParallel\` takes \`[{name, query, limit?}, ...]\` and returns
\`{ [name]: GaqlReport | { error } }\`. Destructure by name, read \`.rows\`.

\`\`\`js
const r = await ads.gaqlParallel([
  // 1. Account-wide daily timeseries (the shape of the regression)
  { name: "daily", query: \`
    SELECT segments.date, metrics.cost_micros, metrics.conversions,
           metrics.clicks, metrics.impressions
      FROM customer
      WHERE segments.date DURING LAST_30_DAYS\` },
  // 2. Per-campaign daily timeseries (which campaign moved)
  { name: "byCampaign", query: \`
    SELECT campaign.id, campaign.name, segments.date,
           metrics.cost_micros, metrics.conversions
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
      ORDER BY segments.date DESC\` },
  // 3. Recent changes — what was edited around the regression window
  { name: "changes", query: \`
    SELECT change_event.resource_name, change_event.change_date_time,
           change_event.changed_fields, change_event.user_email,
           change_event.resource_type, change_event.change_resource_type,
           change_event.old_resource, change_event.new_resource
      FROM change_event
      WHERE change_event.change_date_time DURING LAST_30_DAYS
      ORDER BY change_event.change_date_time DESC\` },
  // 4. New wasted search terms that emerged in the window
  { name: "wastedTerms", query: \`
    SELECT search_term_view.search_term, campaign.name,
           metrics.cost_micros, metrics.clicks, metrics.conversions
      FROM search_term_view
      WHERE segments.date DURING LAST_14_DAYS
        AND metrics.conversions = 0
        AND metrics.clicks >= 10
      ORDER BY metrics.cost_micros DESC\`, limit: 50 }
]);

const daily = r.daily.rows ?? [];
const byCampaign = r.byCampaign.rows ?? [];
const changes = r.changes.rows ?? [];
const wastedTerms = r.wastedTerms.rows ?? [];

const toDollars = (m) => (m || 0) / 1_000_000;

// Split the account timeseries into two halves and compare CPA
const sorted = daily.slice().sort((a, b) => a.segments.date.localeCompare(b.segments.date));
const mid = Math.floor(sorted.length / 2);
const older = sorted.slice(0, mid);
const newer = sorted.slice(mid);
const cpa = (rows) => {
  const spend = rows.reduce((s, row) => s + toDollars(row.metrics.cost_micros), 0);
  const conv = rows.reduce((s, row) => s + (row.metrics.conversions || 0), 0);
  return conv > 0 ? spend / conv : null;
};

return {
  cpaOlder: cpa(older),
  cpaNewer: cpa(newer),
  dailyCounts: { older: older.length, newer: newer.length },
  byCampaign, // Agent sorts these client-side by delta
  recentChanges: changes.slice(0, 25),
  emergentWasteTerms: wastedTerms,
};
\`\`\`

Then the agent answers: (1) when the shift happened, (2) which campaigns moved the most, (3) which changes correlate with the cliff date, (4) whether new wasted spend explains it. One call, ~4 queries, complete diagnosis.

## How to present the finding

Lead with **when** and **how much**, then **what changed**, then **next action**. Example: "CPA doubled on 2026-04-18, driven by Campaign Brand (80% of the delta). That day, the bidding strategy flipped from TARGET_CPA to MAXIMIZE_CONVERSIONS — user alice@example.com. Revert with \`updateCampaignBidding\`."

If no changes correlate with the cliff date, say so plainly: "No account edits correlate with the shift. Likely external — check competitor bids, seasonality, or landing-page issues."

## Don't

- Don't blame the first change you see. Always check correlation with the cliff date.
- Don't call \`runScript\` multiple times for related surfaces — the fan-out above already covers them. Combining them IS the point.
`;

export const PLAYBOOKS: readonly Playbook[] = [
  {
    uri: "adsagent://playbooks/audit-account",
    name: "Audit a Google Ads account with runScript",
    description:
      "One runScript call that fans out 4 GAQL queries in parallel: campaigns, search terms, zero-conversion keywords, recent changes. Correlates them in-script to return a ranked audit.",
    content: AUDIT_ACCOUNT,
  },
  {
    uri: "adsagent://playbooks/explain-regression",
    name: "Explain a metric regression with runScript",
    description:
      "One runScript call that correlates the timeseries, per-campaign breakdown, change events, and emergent wasted search terms. Answers 'why did CPA go up' in a single pass.",
    content: EXPLAIN_REGRESSION,
  },
];

/** Look up a playbook by URI. Returns undefined if not found. */
export function findPlaybook(uri: string): Playbook | undefined {
  return PLAYBOOKS.find((p) => p.uri === uri);
}
