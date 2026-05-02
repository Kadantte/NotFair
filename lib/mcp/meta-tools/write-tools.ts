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

async function setStatus(
  accessToken: string,
  entityId: string,
  status: StatusValue,
): Promise<Record<string, unknown>> {
  return metaGraph<Record<string, unknown>>(accessToken, {
    path: `/${entityId}`,
    method: "POST",
    params: { status },
  });
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
        await setStatus(targetAuth.refreshToken, campaignId, "PAUSED");
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
        await setStatus(targetAuth.refreshToken, campaignId, "ACTIVE");
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
          await setStatus(targetAuth.refreshToken, adSetId, "PAUSED");
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
          await setStatus(targetAuth.refreshToken, adSetId, "ACTIVE");
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
        "Pause a single ad (creative; status=PAUSED). Reversible via `enableAd`.",
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
          await setStatus(targetAuth.refreshToken, adId, "PAUSED");
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
          await setStatus(targetAuth.refreshToken, adId, "ACTIVE");
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
        await metaGraph(targetAuth.refreshToken, {
          path: `/${campaignId}`,
          method: "POST",
          params,
        });
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
        await metaGraph(targetAuth.refreshToken, {
          path: `/${adSetId}`,
          method: "POST",
          params,
        });
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
        await metaGraph(targetAuth.refreshToken, {
          path: `/${campaignId}`,
          method: "POST",
          params: { name },
        });
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
};
