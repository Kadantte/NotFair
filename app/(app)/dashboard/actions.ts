"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import {
  listCampaigns,
  getKeywords,
  getSearchTermReport,
  getImpressionShare,
  getRecommendations,
  addNegativeKeyword,
  pauseKeyword,
  updateCampaignBudget,
  toMicros,
} from "@/lib/google-ads";
import { getAuthContext, getSession } from "@/lib/session";
import { unsupportedFeatureRedirect } from "@/lib/onboarding-redirect";
import { db, schema } from "@/lib/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { getChanges, getImpact, logChange, logRead } from "@/lib/db/tracking";
import { flushServerEvents } from "@/lib/analytics-server";
import { computeHealthScore, type HealthInput } from "@/lib/dashboard/health-score";
import { detectIssues, type SearchTermData, type KeywordData, type CampaignPerfData } from "@/lib/dashboard/issues";
import { detectOpportunities, type ImpressionShareData, type RecommendationData } from "@/lib/dashboard/opportunities";
import { isDemoCustomerId } from "@/lib/demo/constants";
import { demoSparklineData, demoWoWPerformance } from "@/lib/demo/reads";

async function requireAuth<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      const session = await getSession();
      redirect(unsupportedFeatureRedirect(session) ?? "/manage-ads-accounts");
    }
    throw err;
  }
}

async function logDashboardRead(opts: {
  accountId: string;
  userId: string | null | undefined;
  toolName: string;
  campaignId?: string | null;
}) {
  if (isDemoCustomerId(opts.accountId)) return;

  await logRead({
    ...opts,
    campaignId: opts.campaignId ?? null,
    clientSource: "dashboard",
  });
}

// ─── Dashboard Data Fetcher (two-phase for perceived performance) ───

export type DashboardOverview = Awaited<ReturnType<typeof getDashboardOverview>>;
export type DashboardDetails = Awaited<ReturnType<typeof getDashboardDetails>>;

/**
 * Phase 1: Fast overview — campaigns + metrics + health score + sparklines.
 * Single API call (listCampaigns) + local DB queries.
 */
export async function getDashboardOverview() {
  return requireAuth(async () => {
    const { auth, session } = await getAuthContext();

    const campaigns = await listCampaigns(auth, { limit: 50, days: 30 });
    await logDashboardRead({
      accountId: session.customerId,
      userId: session.userId,
      toolName: "list_campaigns",
    });
    after(flushServerEvents);

    const enabledCampaigns = campaigns.filter(
      (c) => c.status === "ENABLED" || c.status === 2,
    );

    if (enabledCampaigns.length === 0) {
      return {
        isEmpty: true as const,
        accountId: session.customerId,
        healthScore: null,
        metrics: null,
        sparklineData: null,
      };
    }

    const totalCost = campaigns.reduce((s, c) => s + c.cost, 0);
    const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
    const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
    const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);

    const healthInput: HealthInput = {
      campaigns: campaigns.map((c) => ({
        impressions: c.impressions,
        clicks: c.clicks,
        cost: c.cost,
        conversions: c.conversions,
      })),
      keywords: [],
      searchImpressionShare: null,
      wastedSpend: 0,
      totalSearchTermSpend: 0,
      positiveChanges: 0,
      totalChanges: 0,
    };
    const healthScore = computeHealthScore(healthInput);

    const sparklineData = await fetchSparklineData(session.customerId);

    return {
      isEmpty: false as const,
      accountId: session.customerId,
      healthScore,
      metrics: {
        totalCost,
        totalClicks,
        totalImpressions,
        totalConversions,
        avgImpressionShare: null as number | null,
        wastedSpend: 0,
        cpa: totalConversions > 0 ? totalCost / totalConversions : null,
      },
      sparklineData,
    };
  });
}

/**
 * Phase 2: Detailed analysis — issues, opportunities, impression share, recent changes.
 * Multiple per-campaign API calls. Loaded after overview is visible.
 */
export async function getDashboardDetails() {
  return requireAuth(async () => {
    const { auth, session } = await getAuthContext();

    const campaigns = await listCampaigns(auth, { limit: 50, days: 30 });
    await logDashboardRead({
      accountId: session.customerId,
      userId: session.userId,
      toolName: "list_campaigns",
    });

    const enabledCampaigns = campaigns.filter(
      (c) => c.status === "ENABLED" || c.status === 2,
    );

    if (enabledCampaigns.length === 0) {
      return {
        issues: [],
        opportunities: [],
        recentChanges: { items: [], total: 0 },
        impressionShareData: [] as ImpressionShareData[],
        refinedHealthScore: null as ReturnType<typeof computeHealthScore> | null,
        refinedMetrics: null as { avgImpressionShare: number | null; wastedSpend: number } | null,
      };
    }

    const topCampaigns = enabledCampaigns
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5);

    const [
      searchTermResults,
      keywordResults,
      impressionShareResults,
      recommendationsResult,
      recentChanges,
    ] = await Promise.all([
      Promise.all(
        topCampaigns.map(async (c) => {
          try {
            const result = await getSearchTermReport(auth, c.id, 30, 50);
            await logDashboardRead({
              accountId: session.customerId,
              userId: session.userId,
              campaignId: c.id,
              toolName: "get_search_term_report",
            });
            return { campaignId: c.id, campaignName: c.name, terms: result.searchTerms as SearchTermData[] };
          } catch {
            return { campaignId: c.id, campaignName: c.name, terms: [] };
          }
        }),
      ),
      Promise.all(
        topCampaigns.map(async (c) => {
          try {
            const result = await getKeywords(auth, c.id, 30, 50);
            await logDashboardRead({
              accountId: session.customerId,
              userId: session.userId,
              campaignId: c.id,
              toolName: "get_keywords",
            });
            return { campaignId: c.id, keywords: result.keywords as KeywordData[] };
          } catch {
            return { campaignId: c.id, keywords: [] };
          }
        }),
      ),
      Promise.all(
        topCampaigns.map(async (c) => {
          try {
            const result = await getImpressionShare(auth, c.id, 30);
            await logDashboardRead({
              accountId: session.customerId,
              userId: session.userId,
              campaignId: c.id,
              toolName: "get_impression_share",
            });
            return {
              campaignId: c.id,
              campaignName: c.name,
              impressionShare: result.impressionShare,
              budgetLostIS: result.budgetLostImpressionShare,
              rankLostIS: result.rankLostImpressionShare,
              totalImpressions: result.totalImpressions,
              totalCost: result.totalCost,
            } as ImpressionShareData;
          } catch {
            return {
              campaignId: c.id,
              campaignName: c.name,
              impressionShare: null,
              budgetLostIS: null,
              rankLostIS: null,
              totalImpressions: 0,
              totalCost: 0,
            } as ImpressionShareData;
          }
        }),
      ),
      getRecommendations(auth)
        .then(async (result) => {
          await logDashboardRead({
            accountId: session.customerId,
            userId: session.userId,
            toolName: "get_recommendations",
          });
          return result;
        })
        .catch(() => ({ recommendations: [] })),
      getChanges(session.customerId, { limit: 10 }),
    ]);

    const allKeywords = keywordResults.flatMap((r) => r.keywords);
    const allSearchTerms = searchTermResults.flatMap((r) => r.terms);
    const wastedSpend = allSearchTerms
      .filter((t) => t.conversions === 0)
      .reduce((s, t) => s + t.cost, 0);
    const totalSearchTermSpend = allSearchTerms.reduce((s, t) => s + t.cost, 0);

    const totalIS = impressionShareResults.reduce((s, r) => {
      if (r.impressionShare === null) return s;
      return s + r.impressionShare * r.totalImpressions;
    }, 0);
    const totalISImpressions = impressionShareResults.reduce((s, r) => {
      if (r.impressionShare === null) return s;
      return s + r.totalImpressions;
    }, 0);
    const avgImpressionShare = totalISImpressions > 0 ? totalIS / totalISImpressions : null;

    const impactResults = await Promise.all(
      recentChanges.items
        .filter((c) => !c.rolledBack)
        .map((c) => getImpact(session.customerId, c.id).catch(() => null)),
    );
    const positiveChanges = impactResults.filter(
      (r) => r?.impact?.cpaDelta !== null && r?.impact?.cpaDelta !== undefined && r.impact.cpaDelta < 0,
    ).length;

    const refinedHealthInput: HealthInput = {
      campaigns: campaigns.map((c) => ({
        impressions: c.impressions,
        clicks: c.clicks,
        cost: c.cost,
        conversions: c.conversions,
      })),
      keywords: allKeywords.map((k) => ({
        qualityScore: k.qualityScore,
        impressions: k.impressions,
      })),
      searchImpressionShare: avgImpressionShare,
      wastedSpend,
      totalSearchTermSpend,
      positiveChanges,
      totalChanges: recentChanges.total,
    };
    const refinedHealthScore = computeHealthScore(refinedHealthInput);

    const campaignPerf = await computeWoWPerformance(session.customerId, enabledCampaigns);
    const issues = detectIssues({
      searchTermsByCampaign: searchTermResults,
      keywordsByCampaign: keywordResults,
      campaignPerf,
      days: 30,
    });

    const opportunities = detectOpportunities({
      impressionShare: impressionShareResults,
      recommendations: (recommendationsResult.recommendations ?? []) as RecommendationData[],
    });

    after(flushServerEvents);

    return {
      issues,
      opportunities,
      recentChanges,
      impressionShareData: impressionShareResults,
      refinedHealthScore,
      refinedMetrics: { avgImpressionShare, wastedSpend },
    };
  });
}

// ─── Sparkline Data (7-day daily snapshots) ─────────────────────────

async function fetchSparklineData(accountId: string) {
  if (isDemoCustomerId(accountId)) return demoSparklineData(7);
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    const snapshots = await db()
      .select()
      .from(schema.performanceSnapshots)
      .where(
        and(
          eq(schema.performanceSnapshots.accountId, accountId),
          gte(schema.performanceSnapshots.snapshotDate, sevenDaysAgo),
          lte(schema.performanceSnapshots.snapshotDate, today),
        ),
      );

    const byDate = new Map<string, { cost: number; clicks: number; impressions: number; conversions: number }>();
    for (const s of snapshots) {
      const existing = byDate.get(s.snapshotDate) ?? { cost: 0, clicks: 0, impressions: 0, conversions: 0 };
      existing.cost += (s.costMicros ?? 0) / 1_000_000;
      existing.clicks += s.clicks ?? 0;
      existing.impressions += s.impressions ?? 0;
      existing.conversions += s.conversions ?? 0;
      byDate.set(s.snapshotDate, existing);
    }

    const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    return {
      cost: sorted.map(([, d]) => d.cost),
      clicks: sorted.map(([, d]) => d.clicks),
      impressions: sorted.map(([, d]) => d.impressions),
      cpa: sorted.map(([, d]) => d.conversions > 0 ? d.cost / d.conversions : 0),
    };
  } catch {
    return { cost: [], clicks: [], impressions: [], cpa: [] };
  }
}

// ─── Week-over-Week Performance ─────────────────────────────────────

async function computeWoWPerformance(
  accountId: string,
  campaigns: Array<{ id: string; name: string }>,
): Promise<CampaignPerfData[]> {
  if (isDemoCustomerId(accountId)) {
    const allowed = new Set(campaigns.map((c) => c.id));
    return demoWoWPerformance().filter((r) => allowed.has(r.campaignId));
  }
  const now = new Date();
  const thisWeekEnd = now.toISOString().slice(0, 10);
  const thisWeekStart = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
  const lastWeekEnd = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const lastWeekStart = new Date(now.getTime() - 13 * 86400000).toISOString().slice(0, 10);

  const results: CampaignPerfData[] = [];

  for (const campaign of campaigns.slice(0, 5)) {
    try {
      const [thisWeek, lastWeek] = await Promise.all([
        db()
          .select()
          .from(schema.performanceSnapshots)
          .where(
            and(
              eq(schema.performanceSnapshots.accountId, accountId),
              eq(schema.performanceSnapshots.campaignId, campaign.id),
              gte(schema.performanceSnapshots.snapshotDate, thisWeekStart),
              lte(schema.performanceSnapshots.snapshotDate, thisWeekEnd),
            ),
          ),
        db()
          .select()
          .from(schema.performanceSnapshots)
          .where(
            and(
              eq(schema.performanceSnapshots.accountId, accountId),
              eq(schema.performanceSnapshots.campaignId, campaign.id),
              gte(schema.performanceSnapshots.snapshotDate, lastWeekStart),
              lte(schema.performanceSnapshots.snapshotDate, lastWeekEnd),
            ),
          ),
      ]);

      if (thisWeek.length === 0 || lastWeek.length === 0) continue;

      const thisWeekCost = thisWeek.reduce((s, r) => s + (r.costMicros ?? 0), 0) / 1_000_000;
      const thisWeekConv = thisWeek.reduce((s, r) => s + (r.conversions ?? 0), 0);
      const lastWeekCost = lastWeek.reduce((s, r) => s + (r.costMicros ?? 0), 0) / 1_000_000;
      const lastWeekConv = lastWeek.reduce((s, r) => s + (r.conversions ?? 0), 0);

      results.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        currentWeekCpa: thisWeekConv > 0 ? thisWeekCost / thisWeekConv : null,
        previousWeekCpa: lastWeekConv > 0 ? lastWeekCost / lastWeekConv : null,
        currentWeekCost: thisWeekCost,
      });
    } catch {
      // Skip campaigns with no snapshot data
    }
  }

  return results;
}

// ─── Action Handlers ────────────────────────────────────────────────

export async function addNegativesAction(campaignId: string, terms: string[]) {
  return requireAuth(async () => {
    const { auth, session } = await getAuthContext();

    const results: Array<{ term: string; success: boolean; error?: string }> = [];

    for (const term of terms) {
      const result = await addNegativeKeyword(auth, campaignId, term);
      if (result.success) {
        await logChange({ accountId: session.customerId, userId: session.userId, campaignId, writeResult: result, reasoning: `Added negative from dashboard: "${term}"` });
      }
      results.push({ term, success: result.success, error: result.error });
    }

    const succeeded = results.filter((r) => r.success).length;
    after(flushServerEvents);
    return { succeeded, total: terms.length, results };
  });
}

export async function pauseKeywordAction(
  campaignId: string,
  adGroupId: string,
  criterionId: string,
) {
  return requireAuth(async () => {
    const { auth, session } = await getAuthContext();

    const result = await pauseKeyword(auth, campaignId, adGroupId, criterionId);
    if (result.success) {
      await logChange({ accountId: session.customerId, userId: session.userId, campaignId, writeResult: result, reasoning: "Paused from dashboard issue card" });
    }
    after(flushServerEvents);
    return result;
  });
}

export async function adjustBudgetAction(campaignId: string, newBudgetDollars: number) {
  return requireAuth(async () => {
    const { auth, session } = await getAuthContext();

    const result = await updateCampaignBudget(auth, campaignId, toMicros(newBudgetDollars));
    if (result.success) {
      await logChange({ accountId: session.customerId, userId: session.userId, campaignId, writeResult: result, reasoning: "Budget adjusted from dashboard opportunity card" });
    }
    after(flushServerEvents);
    return result;
  });
}
