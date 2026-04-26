import { z } from "zod";
import { resolveToolAuth } from "../helpers";
import { safeHandler, typedResult, accountIdParam, READ_ANNOTATIONS, type ToolRegistrar } from "../types";
import { enforceRateLimit } from "../rate-limit";
import { runScriptInSandbox } from "./sandbox";
import { buildAdsHost } from "./ads-client";

const RUN_SCRIPT_DESCRIPTION = `Run a JavaScript orchestration script in a sandboxed QuickJS runtime. This is a REPLACEMENT for chaining individual tool calls, not a supplement — one runScript call does what would otherwise take 10+ sequential tool invocations.

── WHEN TO USE THIS ──

This is the DEFAULT tool for any open-ended analytical question about a Google Ads account. Reach for it first when you see:
- "How is my account doing?" / "What's working?" / "What's broken?" / "How did last week go?"
- "Audit my account" / "Find wasted spend" / "What should I change?" / "Any quick wins?"
- Any question where you would otherwise fire 3+ read tools back-to-back
- Any question that benefits from correlating surfaces (spend + search terms + quality scores + change events) in a single pass

runScript owns EVERY read of Google Ads data. There are no point-query read tools anymore — if the caller asks for spend, CPA, search terms, keywords, ads, impression share, or anything else expressible in GAQL, you write a runScript that queries it. The only non-runScript reads are for specialized services that aren't GAQL-expressible: searchGeoTargets, getRecommendations, getChanges (AdsAgent's own change log), reviewChangeImpact, getKeywordIdeas. For schema discovery before a query, use getResourceMetadata and listQueryableResources.

── BATCHING DISCIPLINE (read this first) ──

Prefer ONE runScript call that fans out with ads.gaqlParallel (up to 20 queries concurrently) and does the full analysis in-script. Each runScript invocation costs ~5–10s of model deliberation PLUS the max GAQL latency across its queries. Batching 15 queries in one call ≈ 1 round-trip; doing the same across 5 calls ≈ 5 round-trips (5x slower).

Rules of thumb:
- Cast a wide net on the first call. You have 20 parallel slots — use them even if you're not sure yet what you'll need. Filtering in-script is free.
- Do NOT make follow-up runScript calls just to pull one more surface you should have included. If you catch yourself about to call runScript a second time, ask: "could I have put this in the first batch?" (almost always yes).
- Return the finished analysis (rankings, top offenders, aggregates), not raw GaqlReport.rows arrays. The caller reads your return value into context — summarize first.

── API SURFACE (all on the \`ads\` namespace) ──

Async RPCs:
- ads.gaql(query, limit?, options?) -> GaqlReport — single GAQL query. THIS IS THE ENTRY POINT FOR AD-HOC QUERIES. For one-off data pulls, use \`return await ads.gaql('SELECT ...')\` — there is no separate runGaqlQuery tool.
- ads.gaqlParallel([{name, query, limit?}, ...], options?) -> { [name]: GaqlReport | { error } } — max 20 per call. USE THIS for multi-surface analysis.
- options.excludeRemovedParents defaults to true. Rows under REMOVED campaigns/ad groups are filtered out server-side because most audits need current serving state. Pass \`{ excludeRemovedParents: false }\` only for historical analysis.

Pre-built GAQL strings (sync, no RPC cost):
- Parameterless: ads.queries.accountInfo | geoTargeting | qualityScores | adGroups | conversionActions | audienceSegmentCheck | negativeKeywords | campaignAssets
- Date-windowed builders (call with YYYY-MM-DD): ads.queries.campaigns(start,end) | keywords | searchTerms | convertingSearchTerms | zeroConversionKeywords | ads | devicePerformance | networkSegmentation | landingPages | changeEvents | dailyCampaignMetrics

Sync helpers: ads.helpers.getDateRange(days), formatDate, micros, toMicros, normalizeCustomerId, daysBetween, extractChangedFields, generateBrandVariants
Constants: ads.constants.RESOURCE_CHANGE_OP, CHANGE_RESOURCE_TYPE, CHANGE_CLIENT_TYPE (numeric enum → label maps)

── DATE LITERALS (GAQL only supports a fixed set) ──

Valid \`DURING\` literals: TODAY, YESTERDAY, LAST_7_DAYS, LAST_14_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH, LAST_BUSINESS_WEEK, LAST_WEEK_MON_SUN, LAST_WEEK_SUN_SAT, THIS_WEEK_MON_TODAY, THIS_WEEK_SUN_TODAY. **There is no LAST_60_DAYS, LAST_90_DAYS, LAST_180_DAYS, THIS_YEAR, or LAST_YEAR.** For windows >30 days, use a custom range:

  const { start, end } = ads.helpers.getDateRange(90);
  const q = \`SELECT campaign.id, metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '\${start}' AND '\${end}'\`;

(As a backstop, the server auto-rewrites unsupported \`DURING LAST_N_DAYS\`/\`THIS_YEAR\`/\`LAST_YEAR\` to BETWEEN, but writing it correctly is faster and clearer.)

Note: \`change_event\` only supports the last 30 days regardless of how you express the range.

Rules: top-level await works; no fetch/require/process/fs; return value must be JSON-serializable; defaults are 30s timeout (max 45s), 500KB return cap, 100K log chars.

── CANONICAL AUDIT (one call, wide net, filter in-script) ──

  const { start, end } = ads.helpers.getDateRange(30);
  const r = await ads.gaqlParallel([
    { name: "acct",  query: ads.queries.accountInfo },
    { name: "camps", query: ads.queries.campaigns(start, end) },
    { name: "kws",   query: ads.queries.keywords(start, end), limit: 500 },
    { name: "st",    query: ads.queries.searchTerms(start, end), limit: 500 },
    { name: "zero",  query: ads.queries.zeroConversionKeywords(start, end) },
    { name: "lp",    query: ads.queries.landingPages(start, end) },
    { name: "qs",    query: ads.queries.qualityScores },
    { name: "ads",   query: ads.queries.ads(start, end) },
    { name: "neg",   query: ads.queries.negativeKeywords },
    { name: "chg",   query: ads.queries.changeEvents(start, end), limit: 200 },
  ]);
  const worstCampaigns = (r.camps.rows ?? [])
    .map(c => ({
      name: c.campaign.name,
      spend: c.metrics.cost_micros / 1e6,
      cpa: (c.metrics.cost_micros / 1e6) / (c.metrics.conversions || 1),
      convRate: c.metrics.conversions / (c.metrics.clicks || 1),
    }))
    .sort((a, b) => b.cpa - a.cpa).slice(0, 5);
  const topZeroConvKws = (r.zero.rows ?? []).slice(0, 10).map(k => ({
    text: k.ad_group_criterion.keyword.text,
    spend: k.metrics.cost_micros / 1e6,
  }));
  return { worstCampaigns, topZeroConvKws, /* ... aggregates only, not raw rows ... */ };

── ANTI-PATTERNS (don't) ──

- Calling runScript 5+ times in sequence to fetch different surfaces — that's exactly what gaqlParallel replaces.
- Using ads.gaql in a JS loop when the queries are independent — use gaqlParallel.
- Returning entire GaqlReport.rows arrays — summarize, rank, or aggregate first.`;

export const registerCodeModeTools: ToolRegistrar = (server, currentAuth) => {
  server.registerTool(
    "runScript",
    {
      description: RUN_SCRIPT_DESCRIPTION,
      inputSchema: {
        accountId: accountIdParam,
        code: z
          .string()
          .min(1)
          .max(50_000)
          .describe("JavaScript source. Top-level await allowed. See tool description for the API surface."),
        timeoutMs: z
          .number()
          .int()
          .min(100)
          .max(45_000)
          .default(30_000)
          .describe("Wall-clock cap before the script is interrupted. Default 30s, max 45s. Raise to 45s when batching 15+ parallel queries."),
      },
      annotations: READ_ANNOTATIONS,
    },
    safeHandler(async ({ accountId, code, timeoutMs }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      // Gate sandbox execution at the handler level so a user already at their
      // monthly cap can't burn compute on empty/looping scripts that never
      // reach an execRead-wrapped ads.gaql call. Per-query enforceRateLimit
      // inside the host bindings still runs as defense-in-depth.
      await enforceRateLimit(targetAuth.userId);
      const { host, bootstrap } = buildAdsHost(targetAuth, targetId);
      const result = await runScriptInSandbox({ code, host, bootstrap, timeoutMs });
      return typedResult(result);
    }),
  );
};
