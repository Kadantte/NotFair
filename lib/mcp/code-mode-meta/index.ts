import { z } from "zod";
import { resolveToolAuth } from "@/lib/mcp/helpers";
import {
  safeHandler,
  typedResult,
  accountIdParam,
  runScriptTimeoutMsParam,
  READ_ANNOTATIONS,
  type ToolRegistrar,
} from "@/lib/mcp/types";
import { enforceRateLimit } from "@/lib/mcp/rate-limit";
import { runScriptInSandbox } from "@/lib/mcp/code-mode/sandbox";
import { buildMetaAdsHost } from "./meta-host";

const RUN_SCRIPT_DESCRIPTION = `Run a JavaScript orchestration script in a sandboxed QuickJS runtime against the Meta Marketing API (Facebook + Instagram Ads). One runScript call can replace 10+ sequential Graph API tool invocations.

── WHEN TO USE THIS ──

Default tool for any open-ended analytical question about a Meta ad account. Reach for it first when you see:
- "How is my campaign doing?" / "What's working?" / "Find ad sets with bad ROAS" / "Why did CPM spike last week"
- "Audit my account" / "Rank ad sets by spend efficiency" / "Compare creatives"
- Any question where you'd otherwise call 3+ Graph endpoints in sequence
- Any question that benefits from correlating insights + delivery info + recent edits in a single pass

runScript owns reads — there are no per-surface read tools. Use \`getInsights\` only for the dedicated 1-account-1-window pull when you don't need to correlate.

── BATCHING DISCIPLINE ──

Prefer ONE runScript call that fans out via \`ads.graphParallel\` (up to 20 calls concurrently). Cast a wide net on the first call; filter in-script for free.

── API SURFACE (all on the \`ads\` namespace) ──

Async RPCs:
- ads.graph(path, params?, method?) -> JSON — single Graph API call. Path may use the \`{accountId}\` template token (replaced with the active \`act_<id>\`). Default method: GET.
- ads.graphParallel([{ name, path, params?, method?, paged?, limit? }]) -> { [name]: { ok, data } | { ok: false, error } } — fan-out, max 20.
  - Set \`paged: true\` to follow paging.next (capped at 20 pages). \`limit\` trims the final list to N rows.
- ads.insights(adAccountId?, options?) -> rows — wrapper over /{accountId}/insights with sensible defaults. Pass \`null\` for the active account.
  - options: { level: "account"|"campaign"|"adset"|"ad", date_preset, time_range:{since,until}, time_increment, fields, breakdowns, action_breakdowns, limit }
- ads.batch([{ method, relative_url, body? }]) -> [{ code, body }] — Graph API /batch endpoint. Up to 50 sub-requests.
- ads.pagedAll(path, params?, maxPages?) -> [...] — read every page of a paged endpoint.

Sync helpers:
- ads.helpers.getDateRange(days) -> { since, until }   — YYYY-MM-DD strings, UTC.
- ads.helpers.formatDate(date) | daysBetween(a,b) | withActPrefix(id) | stripActPrefix(id)

Constants:
- ads.activeAccountId — the active ad-account numeric id (no act_ prefix).
- ads.fields.* — comma-joined field-list strings: campaign, adset, ad, adAccount, insightsAudit, insightsLite. Drop into params.fields.
- ads.datePresets — array of preset strings accepted by /insights date_preset.

Path templates:
- "/{accountId}/campaigns"  →  "/act_<active-id>/campaigns"
- "/{accountId}/insights"   →  "/act_<active-id>/insights"
- Plain ids like "/me/adaccounts" are untouched.

── COMMON PATTERNS ──

Single insights pull:
\`\`\`js
return await ads.insights(null, {
  level: "campaign",
  date_preset: "last_30d",
  fields: ads.fields.insightsAudit.split(","),
});
\`\`\`

Audit fan-out — campaigns + ad sets + ads + last 30d insights, in one call:
\`\`\`js
const r = await ads.graphParallel([
  { name: "campaigns", path: "/{accountId}/campaigns", params: { fields: ads.fields.campaign }, paged: true },
  { name: "adsets",    path: "/{accountId}/adsets",    params: { fields: ads.fields.adset }, paged: true },
  { name: "ads",       path: "/{accountId}/ads",       params: { fields: ads.fields.ad }, paged: true, limit: 200 },
  { name: "insights",  path: "/{accountId}/insights",  params: { level: "campaign", date_preset: "last_30d", fields: ads.fields.insightsAudit }, paged: true },
]);
const worst = (r.insights.ok ? r.insights.data : []).filter(x => Number(x.spend) > 100 && Number(x.ctr) < 0.5);
return { worstCampaigns: worst, totals: { campaigns: r.campaigns.rowCount, adsets: r.adsets.rowCount } };
\`\`\`

── RULES ──
- Top-level await works. No fetch / require / process / fs reachable.
- Return value must be JSON-serializable. Limits: 30000ms (30s) timeout, max 45000ms (45s), 500KB return cap, 100K log chars.
- Mutations (pause/enable/budget) go through dedicated tools (\`pauseCampaign\`, \`pauseAdSet\`, \`pauseAd\`, ...). Never write through runScript.

── ANTI-PATTERNS ──
- Calling runScript 5+ times to fetch different surfaces — that's what graphParallel replaces.
- Returning entire data arrays — summarize, rank, or aggregate first.
- Manually computing dates with new Date() math — use ads.helpers.getDateRange / formatDate.`;

export const registerMetaCodeModeTools: ToolRegistrar = (server, currentAuth) => {
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
          .describe(
            "JavaScript source. Top-level await allowed. See tool description for the API surface.",
          ),
        timeoutMs: runScriptTimeoutMsParam(
          "Raise to 45000 when batching 15+ parallel calls via graphParallel.",
        ),
      },
      annotations: READ_ANNOTATIONS,
    },
    safeHandler(async ({ accountId, code, timeoutMs }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      // Hard rate-limit gate before sandbox spin-up so empty/looping scripts
      // don't burn compute when the user is already at their cap.
      await enforceRateLimit(targetAuth.userId);
      const { host, bootstrap } = buildMetaAdsHost(targetAuth, targetId);
      const result = await runScriptInSandbox({ code, host, bootstrap, timeoutMs });
      return typedResult(result);
    }),
  );
};
