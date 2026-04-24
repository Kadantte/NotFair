import { z } from "zod";
import { resolveToolAuth } from "../helpers";
import { safeHandler, typedResult, accountIdParam, READ_ANNOTATIONS, type ToolRegistrar } from "../types";
import { runScriptInSandbox } from "./sandbox";
import { buildAdsHost } from "./ads-client";

const RUN_SCRIPT_DESCRIPTION = `Run a JavaScript orchestration script in a sandboxed QuickJS runtime. This is a REPLACEMENT for chaining individual tool calls, not a supplement — one runScript call does what would otherwise take 10+ sequential tool invocations.

── WHEN TO USE THIS ──

This is the DEFAULT tool for any open-ended analytical question about a Google Ads account. Reach for it first when you see:
- "How is my account doing?" / "What's working?" / "What's broken?" / "How did last week go?"
- "Audit my account" / "Find wasted spend" / "What should I change?" / "Any quick wins?"
- Any question where you would otherwise fire 3+ read tools back-to-back
- Any question that benefits from correlating surfaces (spend + search terms + quality scores + change events) in a single pass

Use individual read tools (getTimeseries, getSearchTermReport, getCampaignPerformance, etc.) ONLY when:
- The caller has explicitly named the surface they want ("pull the search term report", "show CPA daily for the last 30 days")
- You are drilling down on a specific finding from a prior runScript pass

Default bias: if in doubt between runScript and a point-query tool for an analytical question, pick runScript. The cost of one extra GAQL subquery inside a batch is negligible; the cost of a shallow answer is a whole second round-trip.

── BATCHING DISCIPLINE (read this first) ──

Prefer ONE runScript call that fans out with ads.gaqlParallel (up to 20 queries concurrently) and does the full analysis in-script. Each runScript invocation costs ~5–10s of model deliberation PLUS the max GAQL latency across its queries. Batching 15 queries in one call ≈ 1 round-trip; doing the same across 5 calls ≈ 5 round-trips (5x slower).

Rules of thumb:
- Cast a wide net on the first call. You have 20 parallel slots — use them even if you're not sure yet what you'll need. Filtering in-script is free.
- Do NOT make follow-up runScript calls just to pull one more surface you should have included. If you catch yourself about to call runScript a second time, ask: "could I have put this in the first batch?" (almost always yes).
- Return the finished analysis (rankings, top offenders, aggregates), not raw GaqlReport.rows arrays. The caller reads your return value into context — summarize first.

── API SURFACE (all on the \`ads\` namespace) ──

Async RPCs:
- ads.gaql(query, limit?) -> GaqlReport (same shape as runGaqlQuery)
- ads.gaqlParallel([{name, query, limit?}, ...]) -> { [name]: GaqlReport | { error } } — max 20 per call. USE THIS.

Pre-built GAQL strings (sync, no RPC cost):
- Parameterless: ads.queries.accountInfo | geoTargeting | qualityScores | adGroups | conversionActions | audienceSegmentCheck | negativeKeywords | campaignAssets
- Date-windowed builders (call with YYYY-MM-DD): ads.queries.campaigns(start,end) | keywords | searchTerms | convertingSearchTerms | zeroConversionKeywords | ads | devicePerformance | networkSegmentation | landingPages | changeEvents | dailyCampaignMetrics

Sync helpers: ads.helpers.getDateRange(days), formatDate, micros, toMicros, normalizeCustomerId, daysBetween, extractChangedFields, generateBrandVariants
Constants: ads.constants.RESOURCE_CHANGE_OP, CHANGE_RESOURCE_TYPE, CHANGE_CLIENT_TYPE (numeric enum → label maps)

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
      const { host, bootstrap } = buildAdsHost(targetAuth, targetId);
      const result = await runScriptInSandbox({ code, host, bootstrap, timeoutMs });
      return typedResult(result);
    }),
  );
};
