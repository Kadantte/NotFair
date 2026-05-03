/**
 * Write tools for the Meta Ads MCP. Each tool maps to a single, idempotent
 * Graph API mutation.
 *
 * Stage 4 (this slice) returns the canonical
 * `{ success, action, entityId, before, after }` envelope so the agent can
 * confirm the write landed without reaching for a follow-up read. We do NOT
 * yet log to the `operations` table or return a `changeId`/`undoChange`
 * handle the way the Google tools do — that requires `operations.platform`
 * + a Meta-aware undo dispatcher and is deferred to a follow-up slice.
 *
 * Reversibility: every status change here is itself a status change in the
 * other direction (pause ↔ enable), so the agent can manually unwind by
 * calling the inverse tool.
 */

import { z } from "zod";
import {
  safeTypedHandler,
  accountIdParam,
  WRITE_ANNOTATIONS,
  type ToolRegistrar,
} from "@/lib/mcp/types";
import { resolveToolAuth } from "@/lib/mcp/helpers";
import { execMetaWrite } from "@/lib/mcp/meta-tools/exec";
import { metaGraph, withActPrefix } from "@/lib/meta-ads/client";
import type { AuthContext } from "@/lib/google-ads";

type StatusValue = "ACTIVE" | "PAUSED";

type WriteEnvelope = {
  success: boolean;
  action: string;
  entityType: "campaign" | "adset" | "ad" | "account";
  entityId: string;
  accountId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

async function fetchEntitySnapshot(
  accessToken: string,
  entityId: string,
  fields: string,
): Promise<Record<string, unknown> | null> {
  try {
    return await metaGraph<Record<string, unknown>>(accessToken, {
      path: `/${entityId}`,
      params: { fields },
    });
  } catch {
    // A 404 / permission error here shouldn't block the write — surface as null
    // so the envelope is still useful.
    return null;
  }
}

/**
 * Single chokepoint for every Meta write POST. Auto-applies validate-only mode
 * when the caller's auth came from an integration-test token. Customer-facing
 * tokens never have testMode set, so this is a no-op for prod traffic.
 */
async function metaWritePost(
  auth: AuthContext,
  path: string,
  params: Record<string, string | number | boolean | undefined>,
): Promise<Record<string, unknown>> {
  return metaGraph<Record<string, unknown>>(auth.refreshToken, {
    path,
    method: "POST",
    params,
    validateOnly: !!auth.testMode,
  });
}

async function setStatus(
  auth: AuthContext,
  entityId: string,
  status: StatusValue,
): Promise<Record<string, unknown>> {
  return metaWritePost(auth, `/${entityId}`, { status });
}

const CAMPAIGN_FIELDS =
  "id,name,status,effective_status,objective,daily_budget,lifetime_budget,bid_strategy";
const ADSET_FIELDS =
  "id,name,status,effective_status,campaign_id,optimization_goal,billing_event,daily_budget,lifetime_budget";
const AD_FIELDS =
  "id,name,status,effective_status,adset_id,campaign_id,creative";

export const registerMetaWriteTools: ToolRegistrar = (server, currentAuth) => {
  // ─── pauseCampaign ───────────────────────────────────────────────────────
  server.registerTool(
    "pauseCampaign",
    {
      description:
        "Pause a Meta campaign by setting status=PAUSED. Reversible via `enableCampaign`. Returns before/after status snapshots so the agent can confirm the change.",
      inputSchema: {
        accountId: accountIdParam,
        campaignId: z.string().describe("Campaign id (numeric, no prefix)."),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    safeTypedHandler<
      { accountId?: string; campaignId: string },
      WriteEnvelope
    >(async ({ accountId, campaignId }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      return execMetaWrite(targetAuth, async () => {
        const before = await fetchEntitySnapshot(targetAuth.refreshToken, campaignId, CAMPAIGN_FIELDS);
        await setStatus(targetAuth, campaignId, "PAUSED");
        const after = await fetchEntitySnapshot(targetAuth.refreshToken, campaignId, CAMPAIGN_FIELDS);
        return {
          success: true,
          action: "pauseCampaign",
          entityType: "campaign",
          entityId: campaignId,
          accountId: targetId,
          before,
          after,
        };
      });
    }),
  );

  // ─── enableCampaign ──────────────────────────────────────────────────────
  server.registerTool(
    "enableCampaign",
    {
      description:
        "Re-enable a paused Meta campaign (status=ACTIVE). Note: Meta still requires that any underlying ad sets / ads be active for delivery to resume.",
      inputSchema: {
        accountId: accountIdParam,
        campaignId: z.string(),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    safeTypedHandler<
      { accountId?: string; campaignId: string },
      WriteEnvelope
    >(async ({ accountId, campaignId }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      return execMetaWrite(targetAuth, async () => {
        const before = await fetchEntitySnapshot(targetAuth.refreshToken, campaignId, CAMPAIGN_FIELDS);
        await setStatus(targetAuth, campaignId, "ACTIVE");
        const after = await fetchEntitySnapshot(targetAuth.refreshToken, campaignId, CAMPAIGN_FIELDS);
        return {
          success: true,
          action: "enableCampaign",
          entityType: "campaign",
          entityId: campaignId,
          accountId: targetId,
          before,
          after,
        };
      });
    }),
  );

  // ─── pauseAdSet ──────────────────────────────────────────────────────────
  server.registerTool(
    "pauseAdSet",
    {
      description:
        "Pause a Meta ad set (status=PAUSED). Pausing an ad set leaves the parent campaign untouched. Reversible via `enableAdSet`.",
      inputSchema: {
        accountId: accountIdParam,
        adSetId: z.string(),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    safeTypedHandler<{ accountId?: string; adSetId: string }, WriteEnvelope>(
      async ({ accountId, adSetId }) => {
        const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
        return execMetaWrite(targetAuth, async () => {
          const before = await fetchEntitySnapshot(targetAuth.refreshToken, adSetId, ADSET_FIELDS);
          await setStatus(targetAuth, adSetId, "PAUSED");
          const after = await fetchEntitySnapshot(targetAuth.refreshToken, adSetId, ADSET_FIELDS);
          return {
            success: true,
            action: "pauseAdSet",
            entityType: "adset",
            entityId: adSetId,
            accountId: targetId,
            before,
            after,
          };
        });
      },
    ),
  );

  // ─── enableAdSet ─────────────────────────────────────────────────────────
  server.registerTool(
    "enableAdSet",
    {
      description:
        "Re-activate a paused Meta ad set (status=ACTIVE). The parent campaign must also be ACTIVE for delivery to resume.",
      inputSchema: {
        accountId: accountIdParam,
        adSetId: z.string(),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    safeTypedHandler<{ accountId?: string; adSetId: string }, WriteEnvelope>(
      async ({ accountId, adSetId }) => {
        const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
        return execMetaWrite(targetAuth, async () => {
          const before = await fetchEntitySnapshot(targetAuth.refreshToken, adSetId, ADSET_FIELDS);
          await setStatus(targetAuth, adSetId, "ACTIVE");
          const after = await fetchEntitySnapshot(targetAuth.refreshToken, adSetId, ADSET_FIELDS);
          return {
            success: true,
            action: "enableAdSet",
            entityType: "adset",
            entityId: adSetId,
            accountId: targetId,
            before,
            after,
          };
        });
      },
    ),
  );

  // ─── pauseAd ─────────────────────────────────────────────────────────────
  server.registerTool(
    "pauseAd",
    {
      description:
        "Pause a single ad (sets the ad's status=PAUSED — does not modify its creative). Reversible via `enableAd`.",
      inputSchema: {
        accountId: accountIdParam,
        adId: z.string(),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    safeTypedHandler<{ accountId?: string; adId: string }, WriteEnvelope>(
      async ({ accountId, adId }) => {
        const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
        return execMetaWrite(targetAuth, async () => {
          const before = await fetchEntitySnapshot(targetAuth.refreshToken, adId, AD_FIELDS);
          await setStatus(targetAuth, adId, "PAUSED");
          const after = await fetchEntitySnapshot(targetAuth.refreshToken, adId, AD_FIELDS);
          return {
            success: true,
            action: "pauseAd",
            entityType: "ad",
            entityId: adId,
            accountId: targetId,
            before,
            after,
          };
        });
      },
    ),
  );

  // ─── enableAd ────────────────────────────────────────────────────────────
  server.registerTool(
    "enableAd",
    {
      description:
        "Re-activate a paused ad (status=ACTIVE). Both the parent ad set and campaign must also be ACTIVE for the ad to deliver.",
      inputSchema: {
        accountId: accountIdParam,
        adId: z.string(),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    safeTypedHandler<{ accountId?: string; adId: string }, WriteEnvelope>(
      async ({ accountId, adId }) => {
        const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
        return execMetaWrite(targetAuth, async () => {
          const before = await fetchEntitySnapshot(targetAuth.refreshToken, adId, AD_FIELDS);
          await setStatus(targetAuth, adId, "ACTIVE");
          const after = await fetchEntitySnapshot(targetAuth.refreshToken, adId, AD_FIELDS);
          return {
            success: true,
            action: "enableAd",
            entityType: "ad",
            entityId: adId,
            accountId: targetId,
            before,
            after,
          };
        });
      },
    ),
  );

  // ─── updateCampaignBudget ────────────────────────────────────────────────
  server.registerTool(
    "updateCampaignBudget",
    {
      description:
        "Update a campaign's daily or lifetime budget. Pass exactly one of `dailyBudget` or `lifetimeBudget`. Values are in the ad account's currency MINOR units (cents for USD, etc.) — Meta's native unit, no conversion done. Use `getAdAccount` if you need the currency first.",
      inputSchema: {
        accountId: accountIdParam,
        campaignId: z.string(),
        dailyBudget: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "New daily budget in account currency MINOR units (e.g. 5000 = $50.00 USD). Mutually exclusive with lifetimeBudget.",
          ),
        lifetimeBudget: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "New lifetime budget in account currency MINOR units. Mutually exclusive with dailyBudget.",
          ),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    safeTypedHandler<
      {
        accountId?: string;
        campaignId: string;
        dailyBudget?: number;
        lifetimeBudget?: number;
      },
      WriteEnvelope
    >(async ({ accountId, campaignId, dailyBudget, lifetimeBudget }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      if (
        (dailyBudget && lifetimeBudget) ||
        (!dailyBudget && !lifetimeBudget)
      ) {
        throw new Error(
          "updateCampaignBudget: pass exactly one of `dailyBudget` or `lifetimeBudget`.",
        );
      }
      return execMetaWrite(targetAuth, async () => {
        const before = await fetchEntitySnapshot(targetAuth.refreshToken, campaignId, CAMPAIGN_FIELDS);
        const params: Record<string, string | number> = {};
        if (dailyBudget) params.daily_budget = dailyBudget;
        if (lifetimeBudget) params.lifetime_budget = lifetimeBudget;
        await metaWritePost(targetAuth, `/${campaignId}`, params);
        const after = await fetchEntitySnapshot(targetAuth.refreshToken, campaignId, CAMPAIGN_FIELDS);
        return {
          success: true,
          action: "updateCampaignBudget",
          entityType: "campaign",
          entityId: campaignId,
          accountId: targetId,
          before,
          after,
        };
      });
    }),
  );

  // ─── updateAdSetBudget ───────────────────────────────────────────────────
  server.registerTool(
    "updateAdSetBudget",
    {
      description:
        "Update an ad set's daily or lifetime budget. Pass exactly one of `dailyBudget` or `lifetimeBudget`, in account-currency MINOR units. Note: Meta blocks this when the parent campaign uses Campaign Budget Optimization (CBO).",
      inputSchema: {
        accountId: accountIdParam,
        adSetId: z.string(),
        dailyBudget: z.number().int().positive().optional(),
        lifetimeBudget: z.number().int().positive().optional(),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    safeTypedHandler<
      {
        accountId?: string;
        adSetId: string;
        dailyBudget?: number;
        lifetimeBudget?: number;
      },
      WriteEnvelope
    >(async ({ accountId, adSetId, dailyBudget, lifetimeBudget }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      if (
        (dailyBudget && lifetimeBudget) ||
        (!dailyBudget && !lifetimeBudget)
      ) {
        throw new Error(
          "updateAdSetBudget: pass exactly one of `dailyBudget` or `lifetimeBudget`.",
        );
      }
      return execMetaWrite(targetAuth, async () => {
        const before = await fetchEntitySnapshot(targetAuth.refreshToken, adSetId, ADSET_FIELDS);
        const params: Record<string, string | number> = {};
        if (dailyBudget) params.daily_budget = dailyBudget;
        if (lifetimeBudget) params.lifetime_budget = lifetimeBudget;
        await metaWritePost(targetAuth, `/${adSetId}`, params);
        const after = await fetchEntitySnapshot(targetAuth.refreshToken, adSetId, ADSET_FIELDS);
        return {
          success: true,
          action: "updateAdSetBudget",
          entityType: "adset",
          entityId: adSetId,
          accountId: targetId,
          before,
          after,
        };
      });
    }),
  );

  // ─── renameCampaign ──────────────────────────────────────────────────────
  server.registerTool(
    "renameCampaign",
    {
      description: "Rename a campaign (sets the `name` field).",
      inputSchema: {
        accountId: accountIdParam,
        campaignId: z.string(),
        name: z.string().min(1).max(400),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    safeTypedHandler<
      { accountId?: string; campaignId: string; name: string },
      WriteEnvelope
    >(async ({ accountId, campaignId, name }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      return execMetaWrite(targetAuth, async () => {
        const before = await fetchEntitySnapshot(targetAuth.refreshToken, campaignId, CAMPAIGN_FIELDS);
        await metaWritePost(targetAuth, `/${campaignId}`, { name });
        const after = await fetchEntitySnapshot(targetAuth.refreshToken, campaignId, CAMPAIGN_FIELDS);
        return {
          success: true,
          action: "renameCampaign",
          entityType: "campaign",
          entityId: campaignId,
          accountId: targetId,
          before,
          after,
        };
      });
    }),
  );

  // ─── renameAd ──────────────────────────────────────────────────────────
  // POST `/{ad_id}` with a `name` update — gated on `ads_management`.
  // Verified empirically that `name` writes succeed on every ad type the
  // user has rights to, including boosted-Page-post ads where the `status`
  // field is blocked (code 100). Useful for organizing accounts where the
  // user wants to rename ads without touching their lifecycle state.
  server.registerTool(
    "renameAd",
    {
      description:
        "Rename an ad (set its `name` field). Works on every ad type the user has rights to, including boosted-Page-post ads where status writes are blocked.",
      inputSchema: {
        accountId: accountIdParam,
        adId: z.string().describe("Numeric ad id."),
        name: z.string().min(1).max(400),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    safeTypedHandler<
      { accountId?: string; adId: string; name: string },
      WriteEnvelope
    >(async ({ accountId, adId, name }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      return execMetaWrite(targetAuth, async () => {
        const before = await fetchEntitySnapshot(targetAuth.refreshToken, adId, AD_FIELDS);
        await metaWritePost(targetAuth, `/${adId}`, { name });
        const after = await fetchEntitySnapshot(targetAuth.refreshToken, adId, AD_FIELDS);
        return {
          success: true,
          action: "renameAd",
          entityType: "ad",
          entityId: adId,
          accountId: targetId,
          before,
          after,
        };
      });
    }),
  );

  // ─── createCampaign ─────────────────────────────────────────────────────
  // POST /act_{id}/campaigns. `special_ad_categories` is required by Meta —
  // pass `["NONE"]` for a regular ad. Default `status=PAUSED` so the agent
  // can show the user the new campaign before it spends.
  server.registerTool(
    "createCampaign",
    {
      description:
        "Create a new campaign on the active (or specified) ad account. Returns the new campaign id and a snapshot of its fields. Defaults to status=PAUSED so the user can review before launching. Budgets are in account-currency MINOR units (cents for USD). `special_ad_categories` is required by Meta — pass `[\"NONE\"]` for a standard commercial ad, or one of EMPLOYMENT, HOUSING, CREDIT, ISSUES_ELECTIONS_POLITICS, ONLINE_GAMBLING_AND_GAMING, FINANCIAL_PRODUCTS_SERVICES for restricted categories.",
      inputSchema: {
        accountId: accountIdParam,
        name: z.string().min(1).max(400),
        objective: z
          .string()
          .describe(
            "Campaign objective. Common values: OUTCOME_TRAFFIC, OUTCOME_AWARENESS, OUTCOME_ENGAGEMENT, OUTCOME_LEADS, OUTCOME_SALES, OUTCOME_APP_PROMOTION.",
          ),
        status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
        special_ad_categories: z
          .array(z.string())
          .default(["NONE"])
          .describe(
            "Required by Meta. Use [\"NONE\"] for standard ads.",
          ),
        daily_budget: z.number().int().positive().optional(),
        lifetime_budget: z.number().int().positive().optional(),
        bid_strategy: z
          .string()
          .optional()
          .describe(
            "LOWEST_COST_WITHOUT_CAP | LOWEST_COST_WITH_BID_CAP | COST_CAP | LOWEST_COST_WITH_MIN_ROAS. Required for some objectives when using Campaign Budget Optimization.",
          ),
        start_time: z.string().optional().describe("ISO 8601 start time (campaign-level CBO only)."),
        stop_time: z.string().optional().describe("ISO 8601 stop time (campaign-level CBO only)."),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    safeTypedHandler<
      {
        accountId?: string;
        name: string;
        objective: string;
        status: "ACTIVE" | "PAUSED";
        special_ad_categories: string[];
        daily_budget?: number;
        lifetime_budget?: number;
        bid_strategy?: string;
        start_time?: string;
        stop_time?: string;
      },
      WriteEnvelope
    >(async ({
      accountId,
      name,
      objective,
      status,
      special_ad_categories,
      daily_budget,
      lifetime_budget,
      bid_strategy,
      start_time,
      stop_time,
    }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      return execMetaWrite(targetAuth, async () => {
        const params: Record<string, string | number | undefined> = {
          name,
          objective,
          status,
          special_ad_categories: JSON.stringify(special_ad_categories),
        };
        if (daily_budget !== undefined) params.daily_budget = daily_budget;
        if (lifetime_budget !== undefined) params.lifetime_budget = lifetime_budget;
        if (bid_strategy) params.bid_strategy = bid_strategy;
        if (start_time) params.start_time = start_time;
        if (stop_time) params.stop_time = stop_time;
        const res = await metaWritePost(
          targetAuth,
          `/${withActPrefix(targetId)}/campaigns`,
          params,
        );
        const newId = String((res as { id?: string }).id ?? "");
        const after = newId
          ? await fetchEntitySnapshot(targetAuth.refreshToken, newId, CAMPAIGN_FIELDS)
          : null;
        return {
          success: true,
          action: "createCampaign",
          entityType: "campaign",
          entityId: newId,
          accountId: targetId,
          before: null,
          after,
        };
      });
    }),
  );

  // ─── createAdSet ────────────────────────────────────────────────────────
  // POST /act_{id}/adsets. Targeting is a complex JSON spec — passed through
  // as an object and stringified for the form-encoded body. Ad sets must
  // either set their own budget or live under a CBO campaign that owns the
  // budget.
  server.registerTool(
    "createAdSet",
    {
      description:
        "Create a new ad set under an existing campaign. Targeting is a JSON spec (geo_locations, age_min, age_max, genders, interests, etc.). Either set a budget here or rely on the parent campaign's CBO. Defaults to status=PAUSED.",
      inputSchema: {
        accountId: accountIdParam,
        name: z.string().min(1).max(400),
        campaign_id: z.string(),
        billing_event: z
          .string()
          .describe(
            "IMPRESSIONS | LINK_CLICKS | THRUPLAY | PURCHASE | etc. Determines how Meta charges.",
          ),
        optimization_goal: z
          .string()
          .describe(
            "REACH | IMPRESSIONS | LINK_CLICKS | LANDING_PAGE_VIEWS | OFFSITE_CONVERSIONS | THRUPLAY | etc.",
          ),
        targeting: z
          .record(z.string(), z.unknown())
          .describe(
            "Meta targeting spec. Minimum: { geo_locations: { countries: [\"US\"] } }. Add age_min, age_max, genders, interests, custom_audiences, behaviors, locales, publisher_platforms etc. as needed.",
          ),
        status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
        daily_budget: z.number().int().positive().optional(),
        lifetime_budget: z.number().int().positive().optional(),
        bid_amount: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Bid cap or cost cap in account-currency MINOR units."),
        bid_strategy: z.string().optional(),
        start_time: z.string().optional().describe("ISO 8601."),
        end_time: z.string().optional().describe("ISO 8601."),
        promoted_object: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Required for some objectives (e.g. { page_id, application_id, pixel_id, custom_event_type }). Pass as JSON object.",
          ),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    safeTypedHandler<
      {
        accountId?: string;
        name: string;
        campaign_id: string;
        billing_event: string;
        optimization_goal: string;
        targeting: Record<string, unknown>;
        status: "ACTIVE" | "PAUSED";
        daily_budget?: number;
        lifetime_budget?: number;
        bid_amount?: number;
        bid_strategy?: string;
        start_time?: string;
        end_time?: string;
        promoted_object?: Record<string, unknown>;
      },
      WriteEnvelope
    >(async ({
      accountId,
      name,
      campaign_id,
      billing_event,
      optimization_goal,
      targeting,
      status,
      daily_budget,
      lifetime_budget,
      bid_amount,
      bid_strategy,
      start_time,
      end_time,
      promoted_object,
    }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      return execMetaWrite(targetAuth, async () => {
        const params: Record<string, string | number | undefined> = {
          name,
          campaign_id,
          billing_event,
          optimization_goal,
          status,
          targeting: JSON.stringify(targeting),
        };
        if (daily_budget !== undefined) params.daily_budget = daily_budget;
        if (lifetime_budget !== undefined) params.lifetime_budget = lifetime_budget;
        if (bid_amount !== undefined) params.bid_amount = bid_amount;
        if (bid_strategy) params.bid_strategy = bid_strategy;
        if (start_time) params.start_time = start_time;
        if (end_time) params.end_time = end_time;
        if (promoted_object) params.promoted_object = JSON.stringify(promoted_object);
        const res = await metaWritePost(
          targetAuth,
          `/${withActPrefix(targetId)}/adsets`,
          params,
        );
        const newId = String((res as { id?: string }).id ?? "");
        const after = newId
          ? await fetchEntitySnapshot(targetAuth.refreshToken, newId, ADSET_FIELDS)
          : null;
        return {
          success: true,
          action: "createAdSet",
          entityType: "adset",
          entityId: newId,
          accountId: targetId,
          before: null,
          after,
        };
      });
    }),
  );

  // ─── createAdCreative ───────────────────────────────────────────────────
  // POST /act_{id}/adcreatives. The simplest form is an object_story_spec
  // with link_data — but Meta accepts many shapes (photo_data, video_data,
  // template_data) so we pass the spec through as JSON.
  server.registerTool(
    "createAdCreative",
    {
      description:
        "Create an ad creative on the ad account. Pass `object_story_spec` as a JSON object with `page_id` plus one of link_data / photo_data / video_data / template_data. Returns the new creative id, which is then used in createAd's `creative_id`. Use `listPages` to get a valid page_id for object_story_spec.",
      inputSchema: {
        accountId: accountIdParam,
        name: z.string().min(1).max(400),
        object_story_spec: z
          .record(z.string(), z.unknown())
          .describe(
            "{ page_id: string, link_data?: {...}, photo_data?: {...}, video_data?: {...} }. page_id is required.",
          ),
        degrees_of_freedom_spec: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Optional Advantage+ creative degrees-of-freedom spec for AI-driven creative variation.",
          ),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    safeTypedHandler<
      {
        accountId?: string;
        name: string;
        object_story_spec: Record<string, unknown>;
        degrees_of_freedom_spec?: Record<string, unknown>;
      },
      WriteEnvelope
    >(async ({ accountId, name, object_story_spec, degrees_of_freedom_spec }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      return execMetaWrite(targetAuth, async () => {
        const params: Record<string, string | undefined> = {
          name,
          object_story_spec: JSON.stringify(object_story_spec),
        };
        if (degrees_of_freedom_spec) {
          params.degrees_of_freedom_spec = JSON.stringify(degrees_of_freedom_spec);
        }
        const res = await metaWritePost(
          targetAuth,
          `/${withActPrefix(targetId)}/adcreatives`,
          params,
        );
        const newId = String((res as { id?: string }).id ?? "");
        const after = newId
          ? await fetchEntitySnapshot(
              targetAuth.refreshToken,
              newId,
              "id,name,object_story_spec,effective_object_story_id,thumbnail_url",
            )
          : null;
        return {
          success: true,
          action: "createAdCreative",
          entityType: "ad",
          entityId: newId,
          accountId: targetId,
          before: null,
          after,
        };
      });
    }),
  );

  // ─── createAd ───────────────────────────────────────────────────────────
  // POST /act_{id}/ads. Requires an existing ad set + creative — caller must
  // have called createAdSet and createAdCreative first (or be reusing
  // existing ones).
  server.registerTool(
    "createAd",
    {
      description:
        "Create a new ad inside an existing ad set, attaching an existing creative by id. Defaults to status=PAUSED. Call createAdCreative first to get a creative_id.",
      inputSchema: {
        accountId: accountIdParam,
        name: z.string().min(1).max(400),
        adset_id: z.string(),
        creative_id: z.string().describe("Id of an existing ad creative."),
        status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    safeTypedHandler<
      {
        accountId?: string;
        name: string;
        adset_id: string;
        creative_id: string;
        status: "ACTIVE" | "PAUSED";
      },
      WriteEnvelope
    >(async ({ accountId, name, adset_id, creative_id, status }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      return execMetaWrite(targetAuth, async () => {
        const params: Record<string, string> = {
          name,
          adset_id,
          status,
          creative: JSON.stringify({ creative_id }),
        };
        const res = await metaWritePost(
          targetAuth,
          `/${withActPrefix(targetId)}/ads`,
          params,
        );
        const newId = String((res as { id?: string }).id ?? "");
        const after = newId
          ? await fetchEntitySnapshot(targetAuth.refreshToken, newId, AD_FIELDS)
          : null;
        return {
          success: true,
          action: "createAd",
          entityType: "ad",
          entityId: newId,
          accountId: targetId,
          before: null,
          after,
        };
      });
    }),
  );

  // ─── updateCampaign ─────────────────────────────────────────────────────
  // Comprehensive campaign update — bid strategy, schedule, and special-ad-
  // category fields not covered by the focused pause/enable/budget/rename
  // tools. All fields optional (except campaignId); pass only what's
  // changing.
  server.registerTool(
    "updateCampaign",
    {
      description:
        "Update one or more campaign fields beyond status / budget / name. Use this for bid strategy, start/stop time, or special_ad_categories changes. For simpler edits prefer pauseCampaign / enableCampaign / updateCampaignBudget / renameCampaign.",
      inputSchema: {
        accountId: accountIdParam,
        campaignId: z.string(),
        bid_strategy: z.string().optional(),
        special_ad_categories: z.array(z.string()).optional(),
        start_time: z.string().optional().describe("ISO 8601."),
        stop_time: z.string().optional().describe("ISO 8601."),
        daily_budget: z.number().int().positive().optional(),
        lifetime_budget: z.number().int().positive().optional(),
        name: z.string().min(1).max(400).optional(),
        status: z.enum(["ACTIVE", "PAUSED"]).optional(),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    safeTypedHandler<
      {
        accountId?: string;
        campaignId: string;
        bid_strategy?: string;
        special_ad_categories?: string[];
        start_time?: string;
        stop_time?: string;
        daily_budget?: number;
        lifetime_budget?: number;
        name?: string;
        status?: "ACTIVE" | "PAUSED";
      },
      WriteEnvelope
    >(async ({
      accountId,
      campaignId,
      bid_strategy,
      special_ad_categories,
      start_time,
      stop_time,
      daily_budget,
      lifetime_budget,
      name,
      status,
    }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      const params: Record<string, string | number | undefined> = {};
      if (bid_strategy) params.bid_strategy = bid_strategy;
      if (special_ad_categories)
        params.special_ad_categories = JSON.stringify(special_ad_categories);
      if (start_time) params.start_time = start_time;
      if (stop_time) params.stop_time = stop_time;
      if (daily_budget !== undefined) params.daily_budget = daily_budget;
      if (lifetime_budget !== undefined) params.lifetime_budget = lifetime_budget;
      if (name) params.name = name;
      if (status) params.status = status;
      if (Object.keys(params).length === 0) {
        throw new Error("updateCampaign: pass at least one field to update.");
      }
      return execMetaWrite(targetAuth, async () => {
        const before = await fetchEntitySnapshot(
          targetAuth.refreshToken,
          campaignId,
          CAMPAIGN_FIELDS,
        );
        await metaWritePost(targetAuth, `/${campaignId}`, params);
        const after = await fetchEntitySnapshot(
          targetAuth.refreshToken,
          campaignId,
          CAMPAIGN_FIELDS,
        );
        return {
          success: true,
          action: "updateCampaign",
          entityType: "campaign",
          entityId: campaignId,
          accountId: targetId,
          before,
          after,
        };
      });
    }),
  );

  // ─── updateAdSet ────────────────────────────────────────────────────────
  // Comprehensive ad-set update — covers targeting, optimization goal,
  // billing event, bid, schedule, and budget. All fields optional except
  // adSetId. For simple status / budget changes, prefer the focused tools.
  server.registerTool(
    "updateAdSet",
    {
      description:
        "Update one or more ad-set fields beyond status / budget. Covers targeting, optimization_goal, billing_event, bid_amount/bid_strategy, schedule (start_time/end_time), and Advantage+ promoted_object. Pass only the fields that are changing. For simpler edits, prefer pauseAdSet / enableAdSet / updateAdSetBudget.",
      inputSchema: {
        accountId: accountIdParam,
        adSetId: z.string(),
        name: z.string().min(1).max(400).optional(),
        status: z.enum(["ACTIVE", "PAUSED"]).optional(),
        targeting: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Replaces the entire targeting spec. Provide the full object — Meta does not merge.",
          ),
        optimization_goal: z.string().optional(),
        billing_event: z.string().optional(),
        bid_amount: z.number().int().positive().optional(),
        bid_strategy: z.string().optional(),
        start_time: z.string().optional().describe("ISO 8601."),
        end_time: z.string().optional().describe("ISO 8601."),
        daily_budget: z.number().int().positive().optional(),
        lifetime_budget: z.number().int().positive().optional(),
        promoted_object: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    safeTypedHandler<
      {
        accountId?: string;
        adSetId: string;
        name?: string;
        status?: "ACTIVE" | "PAUSED";
        targeting?: Record<string, unknown>;
        optimization_goal?: string;
        billing_event?: string;
        bid_amount?: number;
        bid_strategy?: string;
        start_time?: string;
        end_time?: string;
        daily_budget?: number;
        lifetime_budget?: number;
        promoted_object?: Record<string, unknown>;
      },
      WriteEnvelope
    >(async ({
      accountId,
      adSetId,
      name,
      status,
      targeting,
      optimization_goal,
      billing_event,
      bid_amount,
      bid_strategy,
      start_time,
      end_time,
      daily_budget,
      lifetime_budget,
      promoted_object,
    }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      const params: Record<string, string | number | undefined> = {};
      if (name) params.name = name;
      if (status) params.status = status;
      if (targeting) params.targeting = JSON.stringify(targeting);
      if (optimization_goal) params.optimization_goal = optimization_goal;
      if (billing_event) params.billing_event = billing_event;
      if (bid_amount !== undefined) params.bid_amount = bid_amount;
      if (bid_strategy) params.bid_strategy = bid_strategy;
      if (start_time) params.start_time = start_time;
      if (end_time) params.end_time = end_time;
      if (daily_budget !== undefined) params.daily_budget = daily_budget;
      if (lifetime_budget !== undefined) params.lifetime_budget = lifetime_budget;
      if (promoted_object) params.promoted_object = JSON.stringify(promoted_object);
      if (Object.keys(params).length === 0) {
        throw new Error("updateAdSet: pass at least one field to update.");
      }
      return execMetaWrite(targetAuth, async () => {
        const before = await fetchEntitySnapshot(
          targetAuth.refreshToken,
          adSetId,
          ADSET_FIELDS,
        );
        await metaWritePost(targetAuth, `/${adSetId}`, params);
        const after = await fetchEntitySnapshot(
          targetAuth.refreshToken,
          adSetId,
          ADSET_FIELDS,
        );
        return {
          success: true,
          action: "updateAdSet",
          entityType: "adset",
          entityId: adSetId,
          accountId: targetId,
          before,
          after,
        };
      });
    }),
  );

  // ─── updateAdCreative ───────────────────────────────────────────────────
  // Swap the creative on an existing ad. Meta accepts only `creative.creative_id`
  // — the new creative must already exist (use createAdCreative first).
  server.registerTool(
    "updateAdCreative",
    {
      description:
        "Swap the creative on an existing ad to a different creative. The new creative must already exist (call createAdCreative first to mint one). Useful for A/B testing or refreshing fatigued creative without rebuilding the ad set.",
      inputSchema: {
        accountId: accountIdParam,
        adId: z.string(),
        creative_id: z.string(),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    safeTypedHandler<
      { accountId?: string; adId: string; creative_id: string },
      WriteEnvelope
    >(async ({ accountId, adId, creative_id }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      return execMetaWrite(targetAuth, async () => {
        const before = await fetchEntitySnapshot(
          targetAuth.refreshToken,
          adId,
          AD_FIELDS,
        );
        await metaWritePost(targetAuth, `/${adId}`, {
          creative: JSON.stringify({ creative_id }),
        });
        const after = await fetchEntitySnapshot(
          targetAuth.refreshToken,
          adId,
          AD_FIELDS,
        );
        return {
          success: true,
          action: "updateAdCreative",
          entityType: "ad",
          entityId: adId,
          accountId: targetId,
          before,
          after,
        };
      });
    }),
  );
};
