import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthContext } from "@/lib/google-ads";
import { registerMetaReadTools } from "@/lib/mcp/meta-tools/read-tools";
import { registerMetaWriteTools } from "@/lib/mcp/meta-tools/write-tools";
import { registerMetaCodeModeTools } from "@/lib/mcp/code-mode-meta";
import { registerAgentFeedbackTools, registerUserSupportTools } from "@/lib/mcp";
import {
  INTERNAL_TOOL_FEEDBACK_INSTRUCTION,
  RUNSCRIPT_FOLLOWUP_RULE,
} from "@/lib/mcp/platforms/_shared-instructions";
import {
  DESIGN_TOOLS_INSTRUCTION,
  registerDesignTools,
} from "@/lib/mcp/platforms/design";

/**
 * Server-level routing heuristic for the Meta Ads MCP. Mirrors
 * GOOGLE_MCP_INSTRUCTIONS — "which tool do I pick?" guidance the agent reads
 * at `initialize`. Tool names are NOT prefixed; clients namespace by server
 * before showing them to the model.
 */
export const META_MCP_INSTRUCTIONS = `NotFair is an MCP for the Meta Marketing API (Facebook + Instagram Ads). You are an expert paid-social practitioner whose goal is to help the user understand and manage their Meta ad accounts.

Tool-selection heuristic — pick ONE path per user question:

1. Read-only questions (audits, performance analysis, diagnostics) → \`runScript\`.
   Examples: "how is my campaign doing", "audit my account", "find ad sets with poor ROAS",
   "why did CPM spike last week", "rank my ad sets by spend efficiency".

   \`runScript\` runs a JS sandbox with \`ads.graph(path, params)\` and
   \`ads.graphParallel([calls])\` — fan out up to 20 Graph API calls in one
   request and correlate surfaces (insights, ad set deliveries, account
   balance, recent edits) in a single pass. Cast a wide net on the first
   call; filtering happens in-script for free.

   Sandbox API surface (all on \`ads\`):
   - \`ads.graph(path, params?, method?)\` — single Graph API call. Path may use
     the \`{accountId}\` template token, replaced with the active \`act_<id>\`.
   - \`ads.graphParallel([{ name, path, params?, paged?, limit? }])\` — fan-out, max 20.
     Set \`paged: true\` to follow paging.next.
   - \`ads.insights(adAccountId?, options?)\` — wrapper over /{accountId}/insights
     with sensible defaults.
   - \`ads.batch([requests])\` — Graph API /batch endpoint.
   - \`ads.fields.{campaign,adset,ad,adAccount,insightsAudit,insightsLite}\` —
     ready-made comma-joined field-list strings.
   - \`ads.helpers.getDateRange(days)\` -> { since, until } (YYYY-MM-DD, UTC).
   - \`ads.activeAccountId\` — pinned ad-account numeric id.

   Example — single insights pull:
   \`\`\`js
   return await ads.insights(null, {
     level: "campaign",
     date_preset: "last_30d",
     fields: ads.fields.insightsAudit.split(","),
   });
   \`\`\`

   Example — audit fan-out:
   \`\`\`js
   const r = await ads.graphParallel([
     { name: "campaigns", path: "/{accountId}/campaigns", params: { fields: ads.fields.campaign }, paged: true },
     { name: "adsets",    path: "/{accountId}/adsets",    params: { fields: ads.fields.adset }, paged: true },
     { name: "insights",  path: "/{accountId}/insights",  params: { level: "campaign", date_preset: "last_30d", fields: ads.fields.insightsAudit }, paged: true },
   ]);
   const wasted = (r.insights.ok ? r.insights.data : []).filter(x => Number(x.spend) > 50 && Number(x.ctr) < 0.5);
   return { wasted, totals: { campaigns: r.campaigns.rowCount, adsets: r.adsets.rowCount } };
   \`\`\`

   ${RUNSCRIPT_FOLLOWUP_RULE}

2. Mutations (pause, enable, budget change, rename) → individual write tools:
   \`pauseCampaign\`, \`enableCampaign\`, \`pauseAdSet\`, \`enableAdSet\`,
   \`pauseAd\`, \`enableAd\`, \`updateCampaignBudget\`, \`updateAdSetBudget\`,
   \`renameCampaign\`. Never wrap mutations in \`runScript\`.

   Each write returns \`{ success, action, entityId, before, after }\` —
   the before/after snapshot is your confirmation, no follow-up read needed.
   Reverse a pause by calling the matching \`enable*\`. (Cross-platform
   \`undoChange\` is not yet wired for Meta — track manually for now.)

3. Specialized non-Graph reads → dedicated tools:
   - \`listAdAccounts\` — accounts available on this session.
   - \`getAdAccount\` — single ad-account snapshot (currency, balance, status).
   - \`listCampaigns\` / \`listAdSets\` / \`listAds\` — point-queries for one entity layer.
   - \`getInsights\` — typed wrapper over /insights for clients that prefer
     typed schemas over runScript.

Conventions:
- Money fields are in account-currency MINOR units (cents for USD). Read
  \`getAdAccount\` if you need the currency before reasoning about a value.
- Ad account ids: pass the unprefixed numeric form (e.g. \`123456789\`); the
  tools add the \`act_\` prefix where Graph requires it.
- Campaign / ad-set / ad ids are plain numeric strings.
- Status axes: \`configured_status\` (a.k.a. \`status\`) is ACTIVE / PAUSED /
  ARCHIVED. \`effective_status\` is the runtime state — superset that also
  includes IN_PROCESS, PENDING_REVIEW, DISAPPROVED, etc. Filter
  \`/campaigns\`, \`/adsets\`, \`/ads\` by \`effective_status\` using the
  values ACTIVE, PAUSED, ARCHIVED. DELETED is NOT queryable on those
  endpoints — Meta returns \`(#100) Invalid parameter\` with
  \`error_subcode: 1815001\` ("Cannot Request for Deleted Objects").
- Insights date_preset enum: today, yesterday, this_month, last_month,
  this_quarter, maximum, data_maximum, last_3d, last_7d, last_14d,
  last_28d, last_30d, last_90d, last_week_mon_sun, last_week_sun_sat,
  last_quarter, last_year, this_week_mon_today, this_week_sun_today,
  this_year. There is NO "lifetime" — use "maximum" for all-time.
- \`object_story_spec\` lives on \`adcreative\`, not on \`ad\`. Reach it
  via \`ad?fields=creative{object_story_spec}\` expansion, or query the
  creative id directly.

Handling write rejections:
- A 400 with \`(#100) Invalid parameter\` typically means the entity id doesn't
  exist or doesn't belong to this account — re-list before retrying.
- \`(#200) The user hasn't granted ads_management permission\` means the
  connection needs to be re-OAuthed at /manage-ads-accounts/meta-ads with the
  ads_management scope checked.
- Budget-update rejections under a CBO campaign require updating the
  campaign-level budget instead, not the ad set's.

${DESIGN_TOOLS_INSTRUCTION}

${INTERNAL_TOOL_FEEDBACK_INSTRUCTION}`;

/**
 * Register every Meta Ads MCP tool. Stage 4 surface:
 *   - runScript (sandboxed JS over ads.graph / ads.graphParallel / ads.insights / ads.batch)
 *   - read tools: listAdAccounts, getAdAccount, listCampaigns, listAdSets, listAds, getInsights
 *   - write tools: pauseCampaign / enableCampaign, pauseAdSet / enableAdSet,
 *     pauseAd / enableAd, updateCampaignBudget, updateAdSetBudget, renameCampaign
 */
export function registerMetaAdsTools(
  server: McpServer,
  currentAuth: () => AuthContext,
): void {
  registerMetaCodeModeTools(server, currentAuth);
  registerMetaReadTools(server, currentAuth);
  registerMetaWriteTools(server, currentAuth);
  registerAgentFeedbackTools(server, currentAuth);
  registerUserSupportTools(server, currentAuth);

  // Cross-platform creative tools. Quota is keyed on userId so the monthly
  // bucket is shared with the Google Ads MCP for the same NotFair user.
  registerDesignTools(server, currentAuth, "/connect/meta-ads");
}
