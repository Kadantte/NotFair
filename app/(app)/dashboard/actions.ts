"use server";

import { redirect } from "next/navigation";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
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
  parseCustomerIds,
  type AuthContext,
} from "@/lib/google-ads";
import { getSessionAuth } from "@/lib/session";
import { db, schema } from "@/lib/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { getChanges, getImpact, logChange } from "@/lib/db/tracking";
import { computeHealthScore, type HealthInput } from "@/lib/dashboard/health-score";
import { detectIssues, type SearchTermData, type KeywordData, type CampaignPerfData } from "@/lib/dashboard/issues";
import { detectOpportunities, type ImpressionShareData, type RecommendationData } from "@/lib/dashboard/opportunities";

function requireAuth<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((err) => {
    if (err instanceof Error && err.message === "Not authenticated") {
      redirect("/connect");
    }
    throw err;
  });
}

// ─── Dashboard Data Fetcher ─────────────────────────────────��─────────

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

export async function getDashboardData() {
  return requireAuth(async () => {
    const session = await getSessionAuth();
    const auth: AuthContext = {
      refreshToken: session.refreshToken,
      customerId: session.customerId,
      customerIds: parseCustomerIds(session.customerIds),
    };

    // Fetch campaigns first (needed to fan out per-campaign queries)
    const campaigns = await listCampaigns(auth, { limit: 50 });
    const enabledCampaigns = campaigns.filter(
      (c) => c.status === "ENABLED" || c.status === 2,
    );

    if (enabledCampaigns.length === 0) {
      return {
        isEmpty: true as const,
        healthScore: null,
        issues: [],
        opportunities: [],
        recentChanges: { items: [], total: 0 },
        metrics: null,
        impressionShareData: [],
      };
    }

    // Parallel fetch per-campaign data (limit to top 5 campaigns by impressions)
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
      // Search terms for each top campaign
      Promise.all(
        topCampaigns.map(async (c) => {
          try {
            const result = await getSearchTermReport(auth, c.id, 30, 50);
            return { campaignId: c.id, campaignName: c.name, terms: result.searchTerms as SearchTermData[] };
          } catch {
            return { campaignId: c.id, campaignName: c.name, terms: [] };
          }
        }),
      ),
      // Keywords for each top campaign
      Promise.all(
        topCampaigns.map(async (c) => {
          try {
            const result = await getKeywords(auth, c.id, 30, 50);
            return { campaignId: c.id, keywords: result.keywords as KeywordData[] };
          } catch {
            return { campaignId: c.id, keywords: [] };
          }
        }),
      ),
      // Impression share for each top campaign
      Promise.all(
        topCampaigns.map(async (c) => {
          try {
            const result = await getImpressionShare(auth, c.id, 30);
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
      // Recommendations (account-wide)
      getRecommendations(auth).catch(() => ({ recommendations: [] })),
      // Recent changes
      getChanges(session.customerId, { limit: 10 }),
    ]);

    // Compute aggregated metrics for health score
    const totalCost = campaigns.reduce((s, c) => s + c.cost, 0);
    const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
    const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
    const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);

    // Flatten all keywords for health score
    const allKeywords = keywordResults.flatMap((r) => r.keywords);

    // Compute wasted spend
    const allSearchTerms = searchTermResults.flatMap((r) => r.terms);
    const wastedSpend = allSearchTerms
      .filter((t) => t.conversions === 0)
      .reduce((s, t) => s + t.cost, 0);
    const totalSearchTermSpend = allSearchTerms.reduce((s, t) => s + t.cost, 0);

    // Aggregate impression share (weighted by impressions)
    const totalIS = impressionShareResults.reduce((s, r) => {
      if (r.impressionShare === null) return s;
      return s + r.impressionShare * r.totalImpressions;
    }, 0);
    const totalISImpressions = impressionShareResults.reduce((s, r) => {
      if (r.impressionShare === null) return s;
      return s + r.totalImpressions;
    }, 0);
    const avgImpressionShare = totalISImpressions > 0 ? totalIS / totalISImpressions : null;

    // Compute positive changes from impact data (parallel)
    const impactResults = await Promise.all(
      recentChanges.items
        .filter((c) => !c.rolledBack)
        .map((c) => getImpact(session.customerId, c.id).catch(() => null)),
    );
    const positiveChanges = impactResults.filter(
      (r) => r?.impact?.cpaDelta !== null && r?.impact?.cpaDelta !== undefined && r.impact.cpaDelta < 0,
    ).length;

    // Health score
    const healthInput: HealthInput = {
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

    const healthScore = computeHealthScore(healthInput);

    // Compute week-over-week CPA from performance snapshots
    const campaignPerf = await computeWoWPerformance(session.customerId, enabledCampaigns);
    const issues = detectIssues({
      searchTermsByCampaign: searchTermResults,
      keywordsByCampaign: keywordResults,
      campaignPerf,
      days: 30,
    });

    // Detect opportunities
    const opportunities = detectOpportunities({
      impressionShare: impressionShareResults,
      recommendations: (recommendationsResult.recommendations ?? []) as RecommendationData[],
    });

    // Fetch 7-day daily snapshots for sparklines
    const sparklineData = await fetchSparklineData(session.customerId);

    return {
      isEmpty: false as const,
      healthScore,
      issues,
      opportunities,
      recentChanges,
      metrics: {
        totalCost,
        totalClicks,
        totalImpressions,
        totalConversions,
        avgImpressionShare,
        wastedSpend,
        cpa: totalConversions > 0 ? totalCost / totalConversions : null,
      },
      impressionShareData: impressionShareResults,
      sparklineData,
    };
  });
}

// ─── Sparkline Data (7-day daily snapshots) ─────────────────────────

async function fetchSparklineData(accountId: string) {
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

    // Group by date, sum across campaigns
    const byDate = new Map<string, { cost: number; clicks: number; impressions: number; conversions: number }>();
    for (const s of snapshots) {
      const existing = byDate.get(s.snapshotDate) ?? { cost: 0, clicks: 0, impressions: 0, conversions: 0 };
      existing.cost += (s.costMicros ?? 0) / 1_000_000;
      existing.clicks += s.clicks ?? 0;
      existing.impressions += s.impressions ?? 0;
      existing.conversions += s.conversions ?? 0;
      byDate.set(s.snapshotDate, existing);
    }

    // Sort by date
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
    const session = await getSessionAuth();
    const auth: AuthContext = {
      refreshToken: session.refreshToken,
      customerId: session.customerId,
      customerIds: parseCustomerIds(session.customerIds),
    };

    const results: Array<{ term: string; success: boolean; error?: string }> = [];

    // Execute sequentially to avoid rate limits
    for (const term of terms) {
      const result = await addNegativeKeyword(auth, campaignId, term);
      if (result.success) {
        await logChange(session.customerId, session.userId, campaignId, result, `Added negative from dashboard: "${term}"`);
      }
      results.push({ term, success: result.success, error: result.error });
    }

    const succeeded = results.filter((r) => r.success).length;
    return { succeeded, total: terms.length, results };
  });
}

export async function pauseKeywordAction(
  campaignId: string,
  adGroupId: string,
  criterionId: string,
) {
  return requireAuth(async () => {
    const session = await getSessionAuth();
    const auth: AuthContext = {
      refreshToken: session.refreshToken,
      customerId: session.customerId,
      customerIds: parseCustomerIds(session.customerIds),
    };

    const result = await pauseKeyword(auth, campaignId, adGroupId, criterionId);
    if (result.success) {
      await logChange(session.customerId, session.userId, campaignId, result, "Paused from dashboard issue card");
    }
    return result;
  });
}

export async function adjustBudgetAction(campaignId: string, newBudgetDollars: number) {
  return requireAuth(async () => {
    const session = await getSessionAuth();
    const auth: AuthContext = {
      refreshToken: session.refreshToken,
      customerId: session.customerId,
      customerIds: parseCustomerIds(session.customerIds),
    };

    const result = await updateCampaignBudget(auth, campaignId, toMicros(newBudgetDollars));
    if (result.success) {
      await logChange(session.customerId, session.userId, campaignId, result, "Budget adjusted from dashboard opportunity card");
    }
    return result;
  });
}

export async function generateBriefingAction(data: {
  totalCost: number;
  totalClicks: number;
  totalImpressions: number;
  totalConversions: number;
  issueCount: number;
  opportunityCount: number;
  topIssue: string | null;
  topOpportunity: string | null;
  recentChangeCount: number;
}) {
  // Auth gate: ensure user is authenticated before spending LLM tokens
  await getSessionAuth();

  const prompt = `You are AdsAgent, an AI Google Ads analyst for a small business owner. Generate a 2-3 sentence briefing about their ads performance. Be direct, specific with numbers, and actionable. Do not use jargon.

Account metrics (last 30 days):
- Total spend: $${data.totalCost.toFixed(2)}
- Impressions: ${data.totalImpressions.toLocaleString()}
- Clicks: ${data.totalClicks.toLocaleString()}
- Conversions: ${data.totalConversions}
- CPA: ${data.totalConversions > 0 ? `$${(data.totalCost / data.totalConversions).toFixed(2)}` : "No conversions"}
- Issues found: ${data.issueCount}
- Opportunities found: ${data.opportunityCount}
- Recent changes: ${data.recentChangeCount}
${data.topIssue ? `- Top issue: ${data.topIssue}` : ""}
${data.topOpportunity ? `- Top opportunity: ${data.topOpportunity}` : ""}

Write a brief, personalized summary. Start with overall status (good/needs attention/urgent). Mention the most important issue or opportunity. Be honest — if things are bad, say so.`;

  try {
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt,
    });
    return text || null;
  } catch {
    return null;
  }
}
