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
import { execMetaRead } from "@/lib/mcp/meta-tools/exec";
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
        "List Meta ad accounts connected to this session. Returns the active account id plus every selected account (id, name). Use the returned ids as `accountId` for other tools. For per-account currency, timezone, and Business Manager info, call `getAdAccount` with the id.",
      inputSchema: {},
      annotations: READ_ANNOTATIONS,
    },
    safeTypedHandler(async () => {
      const auth = currentAuth();
      return execMetaRead(auth, auth.customerId, "listAdAccounts", async () => {
        const accounts = (auth.customerIds ?? []).map((a) => ({
          id: a.id,
          name: a.name || "Unknown Account",
        }));
        return {
          accounts,
          activeAccountId: auth.customerId,
          totalAccounts: accounts.length,
        };
      });
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
          .describe("Max total rows returned. The tool stops paginating once it has this many."),
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
        return execMetaRead(targetAuth, targetId, "getInsights", async () => {
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
        });
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
          "Filter by effective_status. Default (unset): Meta returns ACTIVE + PAUSED only — pass `['ACTIVE','PAUSED','ARCHIVED','DELETED']` to include archived and deleted campaigns.",
        ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100)
          .describe("Max total campaigns returned. The tool stops paginating once it has this many."),
      },
      annotations: READ_ANNOTATIONS,
    },
    safeTypedHandler(async ({ accountId, statuses, limit }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      return execMetaRead(targetAuth, targetId, "listCampaigns", async () => {
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
          { maxRows: limit },
        );
        return {
          accountId: targetId,
          rowCount: rows.length,
          campaigns: rows,
        };
      });
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
        statuses: StatusFilterSchema.describe(
          "Filter by effective_status. Default (unset): Meta returns ACTIVE + PAUSED only.",
        ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100)
          .describe("Max total ad sets returned. The tool stops paginating once it has this many."),
      },
      annotations: READ_ANNOTATIONS,
    },
    safeTypedHandler(async ({ accountId, campaignId, statuses, limit }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      return execMetaRead(targetAuth, targetId, "listAdSets", async () => {
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
          { maxRows: limit },
        );
        return {
          accountId: targetId,
          campaignId: campaignId ?? null,
          rowCount: rows.length,
          adSets: rows,
        };
      });
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
        statuses: StatusFilterSchema.describe(
          "Filter by effective_status. Default (unset): Meta returns ACTIVE + PAUSED only.",
        ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100)
          .describe("Max total ads returned. The tool stops paginating once it has this many."),
      },
      annotations: READ_ANNOTATIONS,
    },
    safeTypedHandler(async ({ accountId, adSetId, statuses, limit }) => {
      const { targetAuth, targetId } = resolveToolAuth(currentAuth, accountId);
      return execMetaRead(targetAuth, targetId, "listAds", async () => {
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
          { maxRows: limit },
        );
        return {
          accountId: targetId,
          adSetId: adSetId ?? null,
          rowCount: rows.length,
          ads: rows,
        };
      });
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
      return execMetaRead(targetAuth, targetId, "getAdAccount", async () => {
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
      });
    }),
  );

  // ─── listPages ──────────────────────────────────────────────────────────
  // Surfaces the Pages a user manages so the agent can pick a `page_id` for
  // ad-creative `object_story_spec`. Reads `/me/accounts` (directly-managed
  // Pages) and, when a `businessId` is provided, also `/{businessId}/owned_pages`
  // so business-managed Pages are reachable. Requires `pages_show_list`.
  server.registerTool(
    "listPages",
    {
      description:
        "List the Facebook Pages the connected user manages, so the agent can pick a Page identity for ad creatives (every ad's `object_story_spec.page_id` requires a Page the user has rights to). Returns id + name only — does NOT read Page content, posts, comments, or engagement. Optional `businessId` also includes Pages owned by that Business Manager.",
      inputSchema: {
        businessId: z
          .string()
          .optional()
          .describe(
            "Business Manager id (numeric, no prefix). When set, also returns Pages owned by that business.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe("Max total Pages returned across both sources."),
      },
      annotations: READ_ANNOTATIONS,
    },
    safeTypedHandler(async ({ businessId, limit }) => {
      const auth = currentAuth();
      return execMetaRead(auth, auth.customerId, "listPages", async () => {
        const direct = await metaGraphAllPages<{ id: string; name?: string }>(
          auth.refreshToken,
          { path: "/me/accounts", params: { fields: "id,name" } },
          { maxRows: limit },
        );
        let owned: Array<{ id: string; name?: string }> = [];
        if (businessId) {
          try {
            owned = await metaGraphAllPages<{ id: string; name?: string }>(
              auth.refreshToken,
              { path: `/${businessId}/owned_pages`, params: { fields: "id,name" } },
              { maxRows: limit },
            );
          } catch {
            // Permissions / business-membership errors shouldn't tank the
            // direct-managed list — return what we have.
            owned = [];
          }
        }
        // Deduplicate by id; preserve direct-managed first.
        const seen = new Set<string>();
        const merged: Array<{ id: string; name: string }> = [];
        for (const p of [...direct, ...owned]) {
          if (!p?.id || seen.has(p.id)) continue;
          seen.add(p.id);
          merged.push({ id: p.id, name: p.name ?? "" });
          if (merged.length >= limit) break;
        }
        return {
          rowCount: merged.length,
          pages: merged,
        };
      });
    }),
  );

  // ─── listPageAds ────────────────────────────────────────────────────────
  // The canonical endpoint that exercises `pages_manage_ads` — Meta docs
  // describe this scope as "manage ads for your Page," and `/{pageId}/ads_posts`
  // is literally the list of ad-promoting posts on a Page. Using this as the
  // pages_manage_ads test call is more reliable than `leadgen_forms`, which
  // Meta's tracker may classify under `leads_retrieval` instead.
  server.registerTool(
    "listPageAds",
    {
      description:
        "List ad-promoting posts on a Page (the posts that have been or are being run as paid ads). Includes id, message, created_time, and any boost/promotion metadata Meta surfaces. Requires `pages_manage_ads` and a Page Access Token (resolved from `/me/accounts`).",
      inputSchema: {
        pageId: z
          .string()
          .describe("Page id (numeric). Must be a Page the connected user manages."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(25)
          .describe("Max ad-posts to return."),
      },
      annotations: READ_ANNOTATIONS,
    },
    safeTypedHandler(async ({ pageId, limit }) => {
      const auth = currentAuth();
      return execMetaRead(auth, auth.customerId, "listPageAds", async () => {
        const accountsRes = await metaGraph<{
          data: Array<{ id: string; access_token?: string; name?: string }>;
        }>(auth.refreshToken, {
          path: "/me/accounts",
          params: { fields: "id,access_token,name" },
        });
        const page = (accountsRes?.data ?? []).find((p) => p.id === pageId);
        const pageToken = page?.access_token;
        if (!pageToken) {
          throw new Error(
            `listPageAds: no Page Access Token for page ${pageId} — the connected user must manage that Page.`,
          );
        }
        const adsRes = await metaGraph<{ data: Array<Record<string, unknown>> }>(
          pageToken,
          {
            path: `/${pageId}/ads_posts`,
            params: { fields: "id,message,created_time,permalink_url", limit },
          },
        );
        return {
          pageId,
          pageName: page?.name ?? null,
          rowCount: (adsRes?.data ?? []).length,
          ads: adsRes?.data ?? [],
        };
      });
    }),
  );

  // ─── listLeadGenForms ───────────────────────────────────────────────────
  // Lead-Gen Forms are part of Page Ads management — they're the lead-capture
  // forms attached to Lead Ads. Reading them through `/{pageId}/leadgen_forms`
  // is gated on `pages_manage_ads`, which makes this the cleanest tool to
  // (a) demonstrate the scope to Meta App Review with a successful API call
  // and (b) actually surface useful data for advertisers ("which lead forms
  // do I have on each Page?"). Requires a Page Access Token, fetched via
  // `/me/accounts` like getPagePostInsights does.
  server.registerTool(
    "listLeadGenForms",
    {
      description:
        "List Lead-Gen Forms attached to a Page (used by Lead Ads to capture sign-ups, demo requests, etc.). Returns id + name per form. Requires `pages_manage_ads` because lead forms are part of Page-level ad management.",
      inputSchema: {
        pageId: z
          .string()
          .describe(
            "Page id (numeric). Must be a Page the connected user manages.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(25)
          .describe("Max forms to return."),
      },
      annotations: READ_ANNOTATIONS,
    },
    safeTypedHandler(async ({ pageId, limit }) => {
      const auth = currentAuth();
      return execMetaRead(auth, auth.customerId, "listLeadGenForms", async () => {
        const accountsRes = await metaGraph<{
          data: Array<{ id: string; access_token?: string; name?: string }>;
        }>(auth.refreshToken, {
          path: "/me/accounts",
          params: { fields: "id,access_token,name" },
        });
        const page = (accountsRes?.data ?? []).find((p) => p.id === pageId);
        const pageToken = page?.access_token;
        if (!pageToken) {
          throw new Error(
            `listLeadGenForms: no Page Access Token for page ${pageId} — the connected user must manage that Page.`,
          );
        }
        const formsRes = await metaGraph<{ data: Array<Record<string, unknown>> }>(
          pageToken,
          {
            path: `/${pageId}/leadgen_forms`,
            params: { fields: "id,name,status,created_time,leads_count", limit },
          },
        );
        return {
          pageId,
          pageName: page?.name ?? null,
          rowCount: (formsRes?.data ?? []).length,
          forms: formsRes?.data ?? [],
        };
      });
    }),
  );

  // ─── getPagePostInsights ────────────────────────────────────────────────
  // Aggregate engagement on a Page post backing a boosted-post ad — needed
  // when the user asks "how is my boosted post performing organically?" The
  // standard Ads Insights API only returns ad-level metrics; the underlying
  // post's organic engagement requires `pages_read_engagement`.
  //
  // Implementation note: Meta requires a Page Access Token (not the User
  // token) for `/{post_id}/insights`, even when the user has
  // `pages_read_engagement` granted. We fetch the Page token via
  // `/me/accounts` (filtered to the post's owning page_id) and use it for
  // both the /insights call and the summary fetch.
  server.registerTool(
    "getPagePostInsights",
    {
      description:
        "Aggregate engagement metrics for a Page post (typically the post backing a boosted-post ad). Returns impressions, reach, reactions, comments_count, shares_count — aggregate counts only, never individual user data. Pair with `getInsights` to compare paid + organic performance on a boosted post.",
      inputSchema: {
        postId: z
          .string()
          .describe(
            "Page post id in `<page_id>_<post_id>` form (matches `effective_object_story_id` on a boosted-post ad's creative).",
          ),
        metrics: z
          .array(z.string())
          .optional()
          .describe(
            "Insight metric names. Defaults to a sensible set: post_impressions, post_impressions_unique, post_engaged_users, post_reactions_by_type_total, post_clicks.",
          ),
      },
      annotations: READ_ANNOTATIONS,
    },
    safeTypedHandler(async ({ postId, metrics }) => {
      const auth = currentAuth();
      return execMetaRead(auth, auth.customerId, "getPagePostInsights", async () => {
        // Extract page_id from the post id (format: <page_id>_<post_id>) and
        // resolve a Page Access Token. /insights rejects User tokens with
        // code 190 even when pages_read_engagement is granted.
        const pageId = postId.split("_")[0];
        if (!pageId) {
          throw new Error(
            `getPagePostInsights: invalid postId "${postId}" — expected <page_id>_<post_id> format.`,
          );
        }
        const accountsRes = await metaGraph<{
          data: Array<{ id: string; access_token?: string; name?: string }>;
        }>(auth.refreshToken, {
          path: "/me/accounts",
          params: { fields: "id,access_token,name" },
        });
        const page = (accountsRes?.data ?? []).find((p) => p.id === pageId);
        const pageToken = page?.access_token;
        if (!pageToken) {
          throw new Error(
            `getPagePostInsights: no Page Access Token for page ${pageId} — the connected user must manage that Page.`,
          );
        }

        // Default metric set verified against Graph API v21.0. Meta pruned
        // many post-insight metrics in 2024 — the non-`_unique` impression
        // variants (post_impressions, post_impressions_paid, etc.),
        // post_engaged_users, post_clicks_unique, post_negative_feedback,
        // and post_activity are all "Invalid metric." The set below all
        // resolved against a real Page post on v21.0.
        const metricList = (metrics && metrics.length > 0
          ? metrics
          : [
              "post_impressions_unique",
              "post_impressions_paid_unique",
              "post_impressions_organic_unique",
              "post_clicks",
              "post_reactions_by_type_total",
            ]
        ).join(",");
        // Two parallel calls. The summary call (likes/comments/shares) goes
        // through the `Page Public Content Access` feature gate; until that
        // feature clears App Review the call fails with code 10 even on a
        // Page Access Token. Catch its failure separately so the user still
        // gets the insights row even when the summary is blocked.
        const [insightsRes, summaryRes] = await Promise.allSettled([
          metaGraph<{ data: unknown[] }>(pageToken, {
            path: `/${postId}/insights`,
            // `period=lifetime` is required for these metrics (Meta rejects
            // them as "invalid" without a period set, even though some docs
            // imply the default is lifetime).
            params: { metric: metricList, period: "lifetime" },
          }),
          metaGraph<Record<string, unknown>>(pageToken, {
            path: `/${postId}`,
            params: {
              fields:
                "id,created_time,permalink_url,likes.summary(true).limit(0),comments.summary(true).limit(0),shares",
            },
          }),
        ]);

        // Insights is the primary signal — if it failed, surface the error
        // to the agent rather than returning a misleading empty envelope.
        if (insightsRes.status === "rejected") throw insightsRes.reason;
        const insightsData = insightsRes.value?.data ?? [];

        // Summary is best-effort. When blocked, return nulls so the tool
        // still resolves with the insights data the user actually got.
        const summary = summaryRes.status === "fulfilled"
          ? (summaryRes.value as {
              id?: string;
              created_time?: string;
              permalink_url?: string;
              likes?: { summary?: { total_count?: number } };
              comments?: { summary?: { total_count?: number } };
              shares?: { count?: number };
            })
          : null;

        return {
          postId: summary?.id ?? postId,
          pageId,
          pageName: page?.name ?? null,
          createdTime: summary?.created_time ?? null,
          permalinkUrl: summary?.permalink_url ?? null,
          likeCount: summary?.likes?.summary?.total_count ?? null,
          commentCount: summary?.comments?.summary?.total_count ?? null,
          shareCount: summary?.shares?.count ?? null,
          summaryError: summaryRes.status === "rejected"
            ? (summaryRes.reason as Error)?.message ?? "summary fetch failed"
            : null,
          insights: insightsData,
        };
      });
    }),
  );
};
