import { z } from "zod";
import { resolveToolAuth } from "../helpers";
import { safeHandler, typedResult, accountIdParam, READ_ANNOTATIONS, type ToolRegistrar } from "../types";
import { enforceRateLimit } from "../rate-limit";
import { runScriptInSandbox, type RunScriptResult } from "./sandbox";
import { buildAdsHost } from "./ads-client";
import { buildGoogleAdsReconnectError, isGoogleAdsReconnectRequired } from "../auth-error-response";

const RUN_SCRIPT_DESCRIPTION = `Run a JavaScript orchestration script in a sandboxed QuickJS runtime. This is a REPLACEMENT for chaining individual tool calls, not a supplement — one runScript call does what would otherwise take 10+ sequential tool invocations.

── READ-ONLY (analytics and reporting only) ──

runScript is a READ-ONLY analytics sandbox. ads.gaql() and ads.gaqlParallel() only execute SELECT GAQL queries — they cannot pause, update, create, or delete anything. To mutate the account (pause keywords, update bids, create campaigns, add negatives, etc.), call the dedicated mutation tools (pauseKeyword, updateBid, bulkPauseKeywords, pauseCampaign, createCampaign, addNegativeKeyword, etc.) directly. Never try to perform mutations inside a runScript call.

── WHEN TO USE THIS ──

This is the DEFAULT tool for any open-ended analytical question about a Google Ads account. Reach for it first when you see:
- "How is my account doing?" / "What's working?" / "What's broken?" / "How did last week go?"
- "Audit my account" / "Find wasted spend" / "What should I change?" / "Any quick wins?"
- Any question where you would otherwise fire 3+ read tools back-to-back
- Any question that benefits from correlating surfaces (spend + search terms + quality scores + change events) in a single pass

runScript owns EVERY read of Google Ads data. There are no point-query read tools anymore — if the caller asks for spend, CPA, search terms, keywords, ads, impression share, or anything else expressible in GAQL, you write a runScript that queries it. The only non-runScript reads are for specialized services that aren't GAQL-expressible: searchGeoTargets, getChanges (NotFair's own change log), reviewChangeImpact, getKeywordIdeas. For schema discovery before a query, use getResourceMetadata and listQueryableResources.

── BATCHING DISCIPLINE (read this first) ──

Prefer ONE runScript call that fans out with ads.gaqlParallel (up to 20 queries concurrently) and does the full analysis in-script. Each runScript invocation costs ~5–10s of model deliberation PLUS the max GAQL latency across its queries. Batching 15 queries in one call ≈ 1 round-trip; doing the same across 5 calls ≈ 5 round-trips (5x slower).

Rules of thumb:
- Cast a wide net on the first call. You have 20 parallel slots — use them even if you're not sure yet what you'll need. Filtering in-script is free.
- Do NOT make follow-up runScript calls just to pull one more surface you should have included. If you catch yourself about to call runScript a second time, ask: "could I have put this in the first batch?" (almost always yes).
- Return the finished analysis (rankings, top offenders, aggregates), not raw GaqlReport.rows arrays. The caller reads your return value into context — summarize first.

── API SURFACE (all on the \`ads\` namespace) ──

Async RPCs:
- ads.gaql(query, limit?, options?) -> GaqlReport — single GAQL query. THIS IS THE ENTRY POINT FOR AD-HOC QUERIES. For one-off data pulls, use \`return await ads.gaql('SELECT ...')\` — there is no separate runGaqlQuery tool.
- ads.gaqlParallel([{name, query, limit?}, ...], options?) -> { [name]: GaqlReport } — max 20 per call. USE THIS for multi-surface analysis. Fails the whole call if any subquery errors; pass \`{ partial: true }\` only when you explicitly want \`{ error }\` entries mixed with successful reports.
- options.excludeRemovedParents defaults to true. Rows under REMOVED campaigns/ad groups are filtered out server-side because most audits need current serving state. Pass \`{ excludeRemovedParents: false }\` only for historical analysis.

Canonical gaqlParallel shape:

  const r = await ads.gaqlParallel([
    { name: "campaigns", query: \`SELECT campaign.id, campaign.name, metrics.cost_micros FROM campaign WHERE segments.date DURING LAST_30_DAYS\`, limit: 50 },
    { name: "searchTerms", query: \`SELECT search_term_view.search_term, metrics.clicks, metrics.conversions FROM search_term_view WHERE segments.date DURING LAST_30_DAYS\`, limit: 100 },
  ]);
  const campaigns = r.campaigns.rows ?? [];

For intentional partial success:

  const r = await ads.gaqlParallel([...], { partial: true });
  const rows = "error" in r.searchTerms ? [] : r.searchTerms.rows;

Pre-built GAQL strings (sync, no RPC cost):
- Parameterless: ads.queries.accountInfo | geoTargeting | qualityScores | adGroups | conversionActions | audienceSegmentCheck | negativeKeywords | campaignAssets | adGroupAssets | sharedNegativeKeywordLists | sharedNegativeKeywordMembers | pausedCampaigns | customerManagerLinks
- Date-windowed builders (call with YYYY-MM-DD): ads.queries.campaigns(start,end) | keywords | searchTerms | convertingSearchTerms | zeroConversionKeywords | ads | devicePerformance | networkSegmentation | landingPages | changeEvents | dailyCampaignMetrics
- Canonical audit pack: ads.queries.auditPack(start,end) -> 20 named queries covering setup, campaigns, keywords, search terms, ads/assets, negatives, conversion actions, paused campaigns, manager links, and recent Google-side change events. Prefer this for account audits instead of hand-selecting a narrow subset.

Sync helpers: ads.helpers.getDateRange(days), formatDate, micros, toMicros, normalizeCustomerId, daysBetween, extractChangedFields, generateBrandVariants
Constants: ads.constants.RESOURCE_CHANGE_OP, CHANGE_RESOURCE_TYPE, CHANGE_CLIENT_TYPE (numeric enum → label maps)

── HUMANIZED RESPONSES + REPORT METADATA ──

Every GaqlReport includes meta: asOf, resource, dateRange/days, currencyCode/timeZone when selected, reportingLagDays, row limits/truncation, removed-parent behavior, campaign/ad-group status filters, campaign type filters, and data-completeness warnings. Read meta before making freshness/exhaustiveness claims.

Rows are augmented post-fetch so you can read the LLM-friendly form directly:
- Enum integer fields get a sibling \`<field>_name\` (canonical Google Ads enum name). Read \`bidding_strategy_type_name === "MAXIMIZE_CONVERSIONS"\`, not the integer 10. Avoids the BiddingStrategyType landmines (10=MAX_CONVERSIONS, 11=MAX_CONVERSION_VALUE, 9=TARGET_SPEND/MaxClicks, 15=TARGET_IMPRESSION_SHARE).
- Money fields ending \`_micros\` get a sibling \`<base>_value\` in major units (\`cost_micros: 11_000_000\` ⇒ \`cost_value: 11\`). Currency-agnostic — works for USD/EUR/JPY. Raw \`_micros\` is preserved.
⚠ IMPORTANT: \`_name\` / \`_value\` siblings are NOT GAQL fields — do NOT put them in SELECT or WHERE. They appear automatically in result rows when the corresponding raw field is selected (\`_name\` → base enum field; \`_value\` → the \`_micros\` field).

── DATE LITERALS (GAQL only supports a fixed set) ──

Valid \`DURING\` literals: TODAY, YESTERDAY, LAST_7_DAYS, LAST_14_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH, LAST_BUSINESS_WEEK, LAST_WEEK_MON_SUN, LAST_WEEK_SUN_SAT, THIS_WEEK_MON_TODAY, THIS_WEEK_SUN_TODAY. **There is no LAST_60_DAYS, LAST_90_DAYS, LAST_180_DAYS, THIS_YEAR, or LAST_YEAR.** For windows >30 days, use a custom range:

  const { start, end } = ads.helpers.getDateRange(90);
  const q = \`SELECT campaign.id, metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '\${start}' AND '\${end}'\`;

(As a backstop, the server auto-rewrites unsupported \`DURING LAST_N_DAYS\`/\`THIS_YEAR\`/\`LAST_YEAR\` to BETWEEN, but writing it correctly is faster and clearer.)

Note: \`change_event\` only supports the last 30 days regardless of how you express the range.

── COMMON GOTCHAS (the validator will reject these before they reach Google) ──

- **change_event REQUIRES \`change_event.change_date_time\` in WHERE.** \`segments.date DURING ...\` does NOT work for this resource (Google rejects with change_event_error=3). Window cap is 30 rolling days. Easiest: \`ads.queries.changeEvents(start, end)\` builds the right shape.
- **Enums in WHERE are STRING names, not numbers.** Write \`WHERE campaign.status = 'PAUSED'\`, never \`= 3\`. Same for \`ad_group.status\`, \`ad_group_ad.status\`, \`ad_group_criterion.status\`, \`conversion_action.status\`, \`asset_group.status\`. Valid status values: ENABLED, PAUSED, REMOVED. For other enums (advertising_channel_type, bidding_strategy_type, etc.), call \`getResourceMetadata\` with the query's FROM resource, e.g. \`getResourceMetadata('campaign')\`.
- **\`metrics.*\` is NOT selectable from \`FROM conversion_action\`.** That resource carries dimensional fields only (name, type, status, counting). To break down metric counts by conversion action: query \`FROM campaign\` (or \`ad_group\`) and SELECT \`segments.conversion_action_name\`. To list configured actions: drop the metrics and keep only \`conversion_action.*\` fields.
- **Local Services conversion actions are often segment-only.** LSA / \`local_services_*\` conversion names can appear in \`segments.conversion_action_name\` but not as mutable rows in \`FROM conversion_action\`. Before calling \`updateConversionAction\` / \`removeConversionAction\`, check \`conversion_action.type\` and \`conversion_action.owner_customer\` (e.g. via \`ads.gaql(ads.queries.conversionActions)\`); if the type is GA4/UA/Floodlight/Firebase/Salesforce/SA360 imports, Smart Campaign auto-actions, Store Visits, app-store actions, or the owner_customer points at a different customer (manager-inherited), treat as Google-managed/read-only.
- **\`segments.conversion_action_name\` and friends don't pair with \`metrics.cost_micros\`.** Google reports cost at the campaign/ad_group level, not per conversion action — pick one or the other (query_error=53). For per-action cost-per-conversion, divide \`cost_micros\` (campaign-total) by per-action \`metrics.conversions\` in-script.
- **Fields used in WHERE must also be in SELECT** (query_error=16). The server auto-injects \`campaign.status\`/\`ad_group.status\` for REMOVED-parent filters and promotes non-date \`segments.*\` predicate fields into SELECT automatically. Date segments are left unselected to avoid changing row granularity.
- **\`segments.date BETWEEN\` takes explicit ISO dates only.** Do not write \`BETWEEN 'LAST_30_DAYS' AND 'undefined'\`; use \`segments.date DURING LAST_30_DAYS\`, or use \`ads.helpers.getDateRange(days)\` and interpolate \`YYYY-MM-DD\` dates.
- **\`search_term_view\` requires a finite \`segments.date\` filter.** Include \`segments.date DURING LAST_30_DAYS\` or a \`BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'\` clause.
- **\`keyword_view\` includes ad-group-level NEGATIVES.** Filter \`ad_group_criterion.negative = FALSE\` for positives only — and add \`ad_group_criterion.negative\` to your SELECT (predicate-fields-must-be-in-SELECT applies). Negatives have 0 impressions/clicks/cost/conversions by definition (they block serving), so any \`metrics.* = 0\` filter without this predicate sweeps up every negative in the account.
- **Known hallucinated fields:** there is no \`metrics.average_cpc_micros\`, \`metrics.cost_per_conversion_micros\`, \`metrics.impression_share\`, \`metrics.conversion_rate\`, \`asset.sitelink_asset.final_urls\`, \`campaign.url_expansion_opt_out\`, \`campaign.budget_amount_micros\`, \`campaign_criterion.audience.audience\`, \`recommendation.impact.base_metrics.*\`, \`recommendation.keyword_match_type\`, \`auction_insight.domain\`, or bare \`resource_name\`. Use \`metrics.average_cpc\`; use \`metrics.cost_per_conversion\`; for Search campaigns use \`metrics.search_impression_share\`; calculate conversion rate from \`metrics.conversions / metrics.clicks\`; budget lives on \`campaign_budget.amount_micros\`; replace \`resource_name\` with \`<resource>.resource_name\`; call \`getResourceMetadata(<resource>)\` for the rest.

Rules: top-level await works; no fetch/require/process/fs; return value must be JSON-serializable; defaults are 30s timeout (max 45s), 500KB return cap, 100K log chars.

── CANONICAL AUDIT (one call, wide net, filter in-script) ──

  const { start, end } = ads.helpers.getDateRange(30);
  const r = await ads.gaqlParallel(ads.queries.auditPack(start, end));
  // Inspect r.campaigns.meta / r.searchTerms.meta for freshness, filters, and truncation before concluding.
  const worstCampaigns = (r.campaigns.rows ?? [])
    .map(c => ({
      name: c.campaign.name,
      spend: c.metrics.cost_micros / 1e6,
      cpa: (c.metrics.cost_micros / 1e6) / (c.metrics.conversions || 1),
      convRate: c.metrics.conversions / (c.metrics.clicks || 1),
    }))
    .sort((a, b) => b.cpa - a.cpa).slice(0, 5);
  const topZeroConvKws = (r.zeroConversionKeywords.rows ?? []).slice(0, 10).map(k => ({
    text: k.ad_group_criterion.keyword.text,
    spend: k.metrics.cost_micros / 1e6,
  }));
  return { worstCampaigns, topZeroConvKws, /* ... aggregates only, not raw rows ... */ };

── ANTI-PATTERNS (don't) ──

- Calling runScript 5+ times in sequence to fetch different surfaces — that's exactly what gaqlParallel replaces.
- Using ads.gaql in a JS loop when the queries are independent — use gaqlParallel.
- Returning entire GaqlReport.rows arrays — summarize, rank, or aggregate first.
- Passing non-SELECT statements to ads.gaql() — GAQL is read-only, the call will throw immediately. Mutations go through dedicated tools, not runScript.`;

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
      const startedAt = Date.now();
      try {
        const { host, bootstrap } = buildAdsHost(targetAuth, targetId);
        const result = await runScriptInSandbox({ code, host, bootstrap, timeoutMs });
        return typedResult(enrichRunScriptResult(result));
      } catch (error) {
        return typedResult(handlerFailureResult(error, Date.now() - startedAt));
      }
    }),
  );
};

function handlerFailureResult(error: unknown, elapsedMs: number): RunScriptResult {
  const err = error instanceof Error ? error : new Error(String(error));
  return enrichRunScriptResult({
    ok: false,
    resultTruncated: false,
    logs: [],
    logsTruncated: false,
    error: {
      message: err.message,
      name: err.name,
      stack: err.stack,
    },
    timedOut: false,
    elapsedMs,
  });
}

function enrichRunScriptResult(result: RunScriptResult): RunScriptResult {
  const message = result.error?.message;
  if (!message || !isGoogleAdsReconnectRequired(message)) return result;
  return {
    ...result,
    error: {
      ...result.error,
      ...buildGoogleAdsReconnectError(message),
    },
  };
}
