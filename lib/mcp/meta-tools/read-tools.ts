/**
 * Dedicated read tools for the Meta Ads MCP. Use runScript for ad-hoc Graph
 * API exploration; these tools cover the common point-queries that benefit
 * from a typed schema and a description that the agent can match a user
 * intent against.
 */

import { z } from "zod";
import {
  safeTypedHandler,
  accountIdParam,
  READ_ANNOTATIONS,
  type ToolRegistrar,
} from "@/lib/mcp/types";
import { resolveToolAuth } from "@/lib/mcp/helpers";
import { enforceRateLimit } from "@/lib/mcp/rate-limit";
import {
  metaGraph,
  metaGraphAllPages,
  metaInsights,
  withActPrefix,
  type InsightsLevel,
} from "@/lib/meta-ads/client";

const InsightsLevelSchema = z
  .enum(["account", "campaign", "adset", "ad"])
  .default("campaign");

const StatusFilterSchema = z
  .array(z.enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"]))
  .optional();

export const registerMetaReadTools: ToolRegistrar = (server, currentAuth) => {
  // ─── listAdAccounts ──────────────────────────────────────────────────────
  server.registerTool(
    "listAdAccounts",
    {
      description:
        "List Meta ad accounts connected to this session. Returns the active account id plus every selected account (id, name, currency, timezone, business_id when routed through a Business Manager). Use the returned ids as `accountId` for other tools.",
      inputSchema: {},
      annotations: READ_ANNOTATIONS,
    },
    safeTypedHandler(async () => {
      const auth = currentAuth();
      const accounts = (auth.customerIds ?? []).map((a) => ({
        id: a.id,
        name: a.name || "Unknown Account",
      }));
      return {
        accounts,
        activeAccountId: auth.customerId,
        totalAccounts: accounts.length,
      };
    }),
  );

  // ─── getInsights ─────────────────────────────────────────────────────────
  server.registerTool(
    "getInsights",
    {
      description:
        "Pull performance insights for the active (or specified) ad account. Wraps `/{accountId}/insights` with sensible defaults: campaign-level rows over the last 30 days, audit-friendly field set. Override `level`, `date_preset` or `time_range`, `fields`, `breakdowns`, etc. for narrower questions. Use `runScript` when you need to correlate insights with delivery info, recent edits, or cross-account joins.",
      inputSchema: {
        accountId: accountIdParam,
        level: InsightsLevelSchema.describe(
          "Aggregation level: account, campaign, adset, or ad. Default: campaign.",
        ),
        date_preset: z
          .string()
          .optional()
          .describe(
            "Predefined window (e.g. last_7d, last_30d, last_90d, this_month, lifetime). Mutually exclusive with time_range.",
          ),
        time_range: z
          .object({
            since: z.string().describe("YYYY-MM-DD"),
            until: z.string().describe("YYYY-MM-DD"),
          })
          .optional()
          .describe("Custom date range. Mutually exclusive with date_preset."),
        time_increment: z
          .union([z.string(), z.number()])
          .optional()
          .describe("Bucket granularity, e.g. 1 (daily), 7 (weekly), 'monthly'."),
        fields: z
          .array(z.string())
          .optional()
          .describe(
            "Insight fields to fetch. Defaults to a sensible audit set (spend, impressions, clicks, ctr, cpc, cpm, reach, frequency, actions).",
          ),
        breakdowns: z
          .array(z.string())
          .optional()
          .describe("Breakdowns (e.g. ['country'], ['age,gender'], ['publisher_platform'])."),
        action_breakdowns: z
          .array(z.string())
          .optional()
          .describe("Action breakdowns (e.g. ['action_type'])."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100)
          .describe("Max rows per page; the tool follows paging up to ~20 pages."),
      },
      annotations: READ_ANNOTATIONS,
    },
    safeTypedHandler(
      async ({
        accountId,
        level,
        date_preset,
        time_range,
        time_increment,
        fields,
        breakdowns,
        action_breakdowns,
        limit,
      }) => {
        const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
        await enforceRateLimit(targetAuth.userId);
        const rows = await metaInsights(targetAuth.refreshToken, targetId, {
          level: level as InsightsLevel,
          date_preset,
          time_range,
          time_increment,
          fields,
          breakdowns,
          action_breakdowns,
          limit,
        });
        return {
          accountId: targetId,
          level,
          rowCount: rows.length,
          rows,
        };
      },
    ),
  );

  // ─── listCampaigns ───────────────────────────────────────────────────────
  server.registerTool(
    "listCampaigns",
    {
      description:
        "List campaigns under the active (or specified) ad account. Returns id, name, status, objective, budget fields, bid strategy, schedule, and timestamps. For richer cross-surface analysis (campaigns × insights × ads in one pass), use runScript instead.",
      inputSchema: {
        accountId: accountIdParam,
        statuses: StatusFilterSchema.describe(
          "Filter by effective_status. Default: returns all (ACTIVE, PAUSED, ARCHIVED, DELETED).",
        ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100)
          .describe("Max campaigns to return (after paging)."),
      },
      annotations: READ_ANNOTATIONS,
    },
    safeTypedHandler(async ({ accountId, statuses, limit }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      await enforceRateLimit(targetAuth.userId);
      const params: Record<string, string | number> = {
        fields:
          "id,name,status,effective_status,objective,daily_budget,lifetime_budget,bid_strategy,start_time,stop_time,buying_type,special_ad_categories,created_time,updated_time",
      };
      if (statuses && statuses.length > 0) {
        params.effective_status = JSON.stringify(statuses);
      }
      const rows = await metaGraphAllPages<Record<string, unknown>>(
        targetAuth.refreshToken,
        { path: `/${withActPrefix(targetId)}/campaigns`, params },
      );
      return {
        accountId: targetId,
        rowCount: Math.min(rows.length, limit),
        campaigns: rows.slice(0, limit),
      };
    }),
  );

  // ─── listAdSets ─────────────────────────────────────────────────────────
  server.registerTool(
    "listAdSets",
    {
      description:
        "List ad sets, scoped to an account by default or to a specific campaign when `campaignId` is provided. Returns id, name, status, optimization goal, billing event, bid amount/strategy, daily/lifetime budget, schedule, targeting summary, and promoted_object.",
      inputSchema: {
        accountId: accountIdParam,
        campaignId: z
          .string()
          .optional()
          .describe(
            "Filter to ad sets under this campaign. Omit to list every ad set in the account.",
          ),
        statuses: StatusFilterSchema,
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100),
      },
      annotations: READ_ANNOTATIONS,
    },
    safeTypedHandler(async ({ accountId, campaignId, statuses, limit }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      await enforceRateLimit(targetAuth.userId);
      const path = campaignId
        ? `/${campaignId}/adsets`
        : `/${withActPrefix(targetId)}/adsets`;
      const params: Record<string, string | number> = {
        fields:
          "id,name,status,effective_status,campaign_id,optimization_goal,billing_event,bid_amount,bid_strategy,daily_budget,lifetime_budget,start_time,end_time,targeting,promoted_object,created_time,updated_time",
      };
      if (statuses && statuses.length > 0) {
        params.effective_status = JSON.stringify(statuses);
      }
      const rows = await metaGraphAllPages<Record<string, unknown>>(
        targetAuth.refreshToken,
        { path, params },
      );
      return {
        accountId: targetId,
        campaignId: campaignId ?? null,
        rowCount: Math.min(rows.length, limit),
        adSets: rows.slice(0, limit),
      };
    }),
  );

  // ─── listAds ────────────────────────────────────────────────────────────
  server.registerTool(
    "listAds",
    {
      description:
        "List ads, scoped to an account by default or to a specific ad set when `adSetId` is provided. Returns id, name, status, the parent ad set / campaign ids, the creative envelope, and timestamps. Use `runScript` for richer creative inspection (asset feed details, etc.).",
      inputSchema: {
        accountId: accountIdParam,
        adSetId: z
          .string()
          .optional()
          .describe("Filter to ads under this ad set. Omit to list across the whole account."),
        statuses: StatusFilterSchema,
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100),
      },
      annotations: READ_ANNOTATIONS,
    },
    safeTypedHandler(async ({ accountId, adSetId, statuses, limit }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      await enforceRateLimit(targetAuth.userId);
      const path = adSetId
        ? `/${adSetId}/ads`
        : `/${withActPrefix(targetId)}/ads`;
      const params: Record<string, string | number> = {
        fields:
          "id,name,status,effective_status,adset_id,campaign_id,creative,configured_status,created_time,updated_time",
      };
      if (statuses && statuses.length > 0) {
        params.effective_status = JSON.stringify(statuses);
      }
      const rows = await metaGraphAllPages<Record<string, unknown>>(
        targetAuth.refreshToken,
        { path, params },
      );
      return {
        accountId: targetId,
        adSetId: adSetId ?? null,
        rowCount: Math.min(rows.length, limit),
        ads: rows.slice(0, limit),
      };
    }),
  );

  // ─── getAdAccount ───────────────────────────────────────────────────────
  server.registerTool(
    "getAdAccount",
    {
      description:
        "Snapshot of the ad account itself: id, name, currency, timezone, status, balance, amount_spent, spend_cap, disable_reason, owning Business Manager. Cheap one-call summary; pair with `getInsights` for performance.",
      inputSchema: {
        accountId: accountIdParam,
      },
      annotations: READ_ANNOTATIONS,
    },
    safeTypedHandler(async ({ accountId }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      await enforceRateLimit(targetAuth.userId);
      const data = await metaGraph<Record<string, unknown>>(
        targetAuth.refreshToken,
        {
          path: `/${withActPrefix(targetId)}`,
          params: {
            fields:
              "id,account_id,name,currency,timezone_name,account_status,balance,amount_spent,spend_cap,disable_reason,business",
          },
        },
      );
      return data;
    }),
  );
};
