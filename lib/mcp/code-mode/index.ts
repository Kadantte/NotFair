import { z } from "zod";
import { resolveToolAuth } from "../helpers";
import { safeHandler, typedResult, accountIdParam, READ_ANNOTATIONS, type ToolRegistrar } from "../types";
import { runScriptInSandbox } from "./sandbox";
import { buildAdsHost } from "./ads-client";

const RUN_SCRIPT_DESCRIPTION = `Run a short JavaScript orchestration script in a sandboxed QuickJS runtime. Use for composing multi-query workflows (audit-shape aggregations, filter-before-return, join across GAQL result sets) instead of chaining 10+ individual tool calls. Intermediate data stays in the sandbox; only the returned value + console.log output come back.

Inside the script (all on the ads namespace):

Async RPCs:
- ads.gaql(query, limit?) -> GaqlReport (same shape as runGaqlQuery)
- ads.gaqlParallel([{name, query, limit?}, ...]) -> { [name]: GaqlReport | { error } } — max 20 per call

Pre-built GAQL (sync, no RPC):
- ads.queries.accountInfo | geoTargeting | qualityScores | adGroups | conversionActions | audienceSegmentCheck | negativeKeywords | campaignAssets (plain strings)
- ads.queries.campaigns(start,end) | keywords | searchTerms | convertingSearchTerms | zeroConversionKeywords | ads | devicePerformance | networkSegmentation | landingPages | changeEvents | dailyCampaignMetrics (call with YYYY-MM-DD dates)

Sync helpers: ads.helpers.getDateRange(days), formatDate, micros, toMicros, normalizeCustomerId, daysBetween, extractChangedFields, generateBrandVariants

Constants: ads.constants.RESOURCE_CHANGE_OP, CHANGE_RESOURCE_TYPE, CHANGE_CLIENT_TYPE (numeric enum → label maps)

Rules: top-level await works; no fetch/require/process/fs; return value must be JSON-serializable; defaults are 15s timeout, 500KB return cap, 100K log chars.

Example — budget-constrained PMax with recent edits:
  const { start, end } = ads.helpers.getDateRange(30);
  const r = await ads.gaqlParallel([
    { name: "c", query: ads.queries.campaigns(start, end) },
    { name: "e", query: ads.queries.changeEvents(start, end), limit: 500 },
  ]);
  const ids = new Set((r.c.rows ?? []).filter(x => x.campaign?.advertising_channel_type === "PERFORMANCE_MAX" && (x.metrics?.search_budget_lost_impression_share ?? 0) > 0.1).map(x => x.campaign.id));
  return (r.e.rows ?? []).filter(c => ids.has(c.change_event.campaign?.split("/").pop())).slice(0, 20);`;

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
