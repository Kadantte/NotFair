import { z } from "zod";
import { resolveToolAuth } from "../helpers";
import { safeHandler, typedResult, accountIdParam, READ_ANNOTATIONS, type ToolRegistrar } from "../types";
import { runScriptInSandbox } from "./sandbox";
import { buildAdsHost } from "./ads-client";

const RUN_SCRIPT_DESCRIPTION = `Run a short JavaScript orchestration script in a sandboxed QuickJS runtime.

Use this when a task needs to compose multiple GAQL queries, join results in code, or filter large datasets before returning — instead of chaining 10+ individual tool calls. Intermediate rows stay in the sandbox; only what you \`return\` (or \`console.log\`) comes back. One call replaces patterns like \`runAudit\` or arbitrary dashboards you'd otherwise add as bespoke tools.

## API surface (no imports needed — all methods are on \`ads\`)

### Async RPCs to Google Ads
\`\`\`ts
// Run one GAQL SELECT. Returns same shape as the runGaqlQuery tool
// (rows, truncated, truncationReason, fetchedRowCount, summary?, continuationHint?).
ads.gaql(query: string, limit?: number): Promise<GaqlReport>;

// Fan out up to 20 GAQL queries in parallel. Each entry gets a stable name;
// results come back as { [name]: GaqlReport | { error: string } }.
// Use for audit-style aggregations — one round trip, per-query graceful degradation.
ads.gaqlParallel(queries: { name: string; query: string; limit?: number }[]):
  Promise<Record<string, GaqlReport | { error: string }>>;
\`\`\`

### Pre-built GAQL (sync — no RPC, free to use)
\`ads.queries\` mirrors the query builders \`runAudit\` uses. Reusing them means cache-coalesced hits with the audit pipeline when both run in the same session.

Parameterless (plain strings):
- \`ads.queries.accountInfo\` — customer table, currency, timezone
- \`ads.queries.geoTargeting\` — campaign geo criteria
- \`ads.queries.qualityScores\` — keyword QS + components
- \`ads.queries.adGroups\` — ad group tree
- \`ads.queries.conversionActions\` — conversion action configs
- \`ads.queries.audienceSegmentCheck\` — audience targeting status
- \`ads.queries.negativeKeywords\` — campaign-level negatives
- \`ads.queries.campaignAssets\` — extension assets linked per campaign

Date-windowed (call with \`(start, end)\` as YYYY-MM-DD strings):
- \`ads.queries.campaigns(start, end)\` — campaigns with IS + budget + metrics
- \`ads.queries.keywords(start, end)\` — keyword performance
- \`ads.queries.searchTerms(start, end)\` — search term report
- \`ads.queries.convertingSearchTerms(start, end)\` / \`ads.queries.zeroConversionKeywords(start, end)\`
- \`ads.queries.ads(start, end)\` / \`ads.queries.adGroups\` / \`ads.queries.devicePerformance(start, end)\`
- \`ads.queries.networkSegmentation(start, end)\` — search/display/partner split
- \`ads.queries.landingPages(start, end)\` — expanded final URL performance
- \`ads.queries.changeEvents(start, end)\` — every account edit in the window
- \`ads.queries.dailyCampaignMetrics(start, end)\` — per-day rollup

### Pure helpers (sync)
- \`ads.helpers.getDateRange(days) -> { start, end }\` — lookback window as YYYY-MM-DD
- \`ads.helpers.formatDate(jsDate) -> "YYYY-MM-DD"\`
- \`ads.helpers.micros(v)\` / \`ads.helpers.toMicros(dollars)\` — cost_micros ↔ dollars
- \`ads.helpers.normalizeCustomerId(id)\` — strip hyphens
- \`ads.helpers.daysBetween(iso, referenceIso) -> number\`
- \`ads.helpers.extractChangedFields(change_event.changed_fields) -> string[]\`
- \`ads.helpers.generateBrandVariants(businessName) -> string[]\` — for brand-term detection

### Constants (sync) — \`change_event\` enum maps (numeric code → label):
- \`ads.constants.RESOURCE_CHANGE_OP\`
- \`ads.constants.CHANGE_RESOURCE_TYPE\`
- \`ads.constants.CHANGE_CLIENT_TYPE\`

### Output
- \`console.log(...)\` captured in result.logs
- \`return\`ed value must be JSON-serializable (functions stripped, BigInt → string)

## Rules
- Top-level \`await\` works; IIFE wrap is handled.
- No \`fetch\`, no \`require\`, no \`process\`, no filesystem. \`ads.gaql\` / \`ads.gaqlParallel\` are the only network.
- Rate limits and telemetry apply per underlying GAQL call, same as runGaqlQuery.
- Defaults: 15s timeout, 500KB return cap, 100K chars of logs.

## Example — "budget-constrained PMax campaigns edited in the last 14 days"
\`\`\`js
const { start, end } = ads.helpers.getDateRange(30);
const { campaigns, changes } = await ads.gaqlParallel([
  { name: "campaigns", query: ads.queries.campaigns(start, end) },
  { name: "changes",   query: ads.queries.changeEvents(start, end), limit: 500 },
]);
const pmaxBudgetConstrained = new Map(
  (campaigns.rows ?? [])
    .filter(r =>
      r.campaign?.advertising_channel_type === "PERFORMANCE_MAX" &&
      (r.metrics?.search_budget_lost_impression_share ?? 0) > 0.1,
    )
    .map(r => [r.campaign.id, r]),
);
const recent = (changes.rows ?? [])
  .map(c => ({
    campaignId: c.change_event.campaign?.split("/").pop(),
    daysAgo: ads.helpers.daysBetween(c.change_event.change_date_time, end),
    fields: ads.helpers.extractChangedFields(c.change_event.changed_fields),
  }))
  .filter(c => c.daysAgo <= 14 && pmaxBudgetConstrained.has(c.campaignId))
  .slice(0, 20);
return { totalConstrained: pmaxBudgetConstrained.size, recentlyEdited: recent };
\`\`\``;

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
          .default(15_000)
          .describe("Wall-clock cap before the script is interrupted. Default 15s, max 45s."),
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
