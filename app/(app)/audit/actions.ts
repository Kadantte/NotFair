"use server";

import { redirect } from "next/navigation";
import {
  getAccountInfo,
  getAccountSettings,
  listCampaigns,
  getConversionActions,
  getKeywords,
  getSearchTermReport,
  getImpressionShare,
  listAds,
  getNegativeKeywords,
  listAdGroups,
  pauseCampaign,
  addNegativeKeyword,
  pauseKeyword,
  invalidateCache,
} from "@/lib/google-ads";
import { getAuthContext, getSession } from "@/lib/session";
import { unsupportedFeatureRedirect } from "@/lib/onboarding-redirect";
import { computeAuditScore, type AuditInput, type AuditResult } from "@/lib/audit/scoring";
import { analyzeAdLandingPages } from "@/lib/audit/landing-page";
import { saveAuditSnapshot } from "@/lib/audit/persist";
import { saveAuditToHistory } from "@/lib/audit/shared-persist";

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

// ─── Types ───────────────────────────────────────────────────────────

export type AuditOverview = Awaited<ReturnType<typeof getAuditOverview>>;
export type AuditDetails = Awaited<ReturnType<typeof getAuditDetails>>;

// ─── Phase 1: Fast overview (~4 parallel API calls) ─────────────────

export async function getAuditOverview(days: number = 30) {
  return requireAuth(async () => {
    const { auth, session } = await getAuthContext();

    const [accountInfo, accountSettingsResult, campaigns, conversionActionsResult] =
      await Promise.all([
        getAccountInfo(auth),
        getAccountSettings(auth),
        listCampaigns(auth, { limit: 50, days }),
        getConversionActions(auth),
      ]);

    const enabledCampaigns = campaigns.filter(
      (c) => c.status === "ENABLED" || c.status === 2,
    );

    const totalSpend = campaigns.reduce((s, c) => s + c.cost, 0);
    const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
    const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
    const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);

    return {
      accountId: session.customerId,
      accountName: accountInfo.name,
      isEmpty: enabledCampaigns.length === 0 && totalSpend === 0,
      metrics: {
        totalSpend,
        totalConversions,
        totalClicks,
        totalImpressions,
        cpa: totalConversions > 0 ? totalSpend / totalConversions : null,
        campaignCount: enabledCampaigns.length,
      },
      accountSettings: {
        autoTaggingEnabled: accountSettingsResult.autoTaggingEnabled,
        conversionTrackingId: accountSettingsResult.conversionTrackingId,
        trackingUrlTemplate: accountSettingsResult.trackingUrlTemplate,
      },
      conversionActions: conversionActionsResult,
      campaigns: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        cost: c.cost,
        conversions: c.conversions,
        clicks: c.clicks,
        impressions: c.impressions,
        biddingStrategy: (c as any).biddingStrategy ?? undefined,
      })),
    };
  });
}

// ─── Phase 2: Detailed analysis (parallel per-campaign) ─────────────

export async function getAuditDetails(days: number = 30) {
  return requireAuth(async () => {
    const { auth, session } = await getAuthContext();

    const campaigns = await listCampaigns(auth, { limit: 50, days });
    const enabledCampaigns = campaigns.filter(
      (c) => c.status === "ENABLED" || c.status === 2,
    );

    if (enabledCampaigns.length === 0 && campaigns.reduce((s, c) => s + c.cost, 0) === 0) {
      return { auditResult: null };
    }

    // Top 5 campaigns by impressions
    const topCampaigns = [...enabledCampaigns]
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5);

    const campaignIds = topCampaigns.map((c) => c.id);

    // Parallel fetch per campaign
    const [
      keywordResults,
      searchTermResults,
      impressionShareResults,
      adResults,
      negativeResults,
      adGroupResults,
    ] = await Promise.all([
      Promise.all(
        campaignIds.map(async (id) => {
          try {
            const r = await getKeywords(auth, id, days, 100);
            return r.keywords;
          } catch {
            return [];
          }
        }),
      ),
      Promise.all(
        campaignIds.map(async (id) => {
          try {
            const r = await getSearchTermReport(auth, id, days, 100);
            return r.searchTerms;
          } catch {
            return [];
          }
        }),
      ),
      Promise.all(
        campaignIds.map(async (id, idx) => {
          try {
            const r = await getImpressionShare(auth, id, days);
            return {
              campaignName: topCampaigns[idx].name,
              impressionShare: r.impressionShare,
              budgetLostIS: r.budgetLostImpressionShare,
              rankLostIS: r.rankLostImpressionShare,
              totalImpressions: r.totalImpressions,
              totalCost: r.totalCost ?? 0,
            };
          } catch {
            return {
              campaignName: topCampaigns[idx].name,
              impressionShare: null as number | null,
              budgetLostIS: null as number | null,
              rankLostIS: null as number | null,
              totalImpressions: 0,
              totalCost: 0,
            };
          }
        }),
      ),
      Promise.all(
        campaignIds.map(async (id) => {
          try {
            const r = await listAds(auth, id, undefined, days, 50);
            return r.ads;
          } catch {
            return [];
          }
        }),
      ),
      Promise.all(
        campaignIds.map(async (id) => {
          try {
            return await getNegativeKeywords(auth, id, 500);
          } catch {
            return [];
          }
        }),
      ),
      Promise.all(
        campaignIds.map(async (id) => {
          try {
            return await listAdGroups(auth, id, 100);
          } catch {
            return [];
          }
        }),
      ),
    ]);

    // Flatten results
    const allKeywords = keywordResults.flat().map((k: any) => ({
      criterionId: String(k.criterionId ?? ""),
      adGroupId: String(k.adGroupId ?? ""),
      text: k.text ?? "",
      qualityScore: k.qualityScore ?? null,
      creativeQuality: k.creativeQuality ?? null,
      postClickQuality: k.postClickQuality ?? null,
      searchPredictedCtr: k.searchPredictedCtr ?? null,
      impressions: k.impressions ?? 0,
      clicks: k.clicks ?? 0,
      cost: k.cost ?? 0,
      conversions: k.conversions ?? 0,
      status: k.status ?? "UNKNOWN",
      matchType: k.matchType ?? "UNKNOWN",
      campaignName: k.adGroupName ? topCampaigns.find((c) => keywordResults.some((kr, i) => kr.includes(k) && campaignIds[i] === c.id))?.name ?? "" : "",
      campaignId: "",
      adGroupName: k.adGroupName ?? "",
      averageCpc: k.averageCpc ?? 0,
      ctr: k.ctr ?? 0,
    }));

    // Fix campaignId/campaignName mapping
    for (let i = 0; i < campaignIds.length; i++) {
      for (const kw of keywordResults[i] as any[]) {
        const match = allKeywords.find(
          (ak) => ak.criterionId === String(kw.criterionId ?? ""),
        );
        if (match) {
          match.campaignId = campaignIds[i];
          match.campaignName = topCampaigns[i].name;
        }
      }
    }

    const allSearchTerms = searchTermResults.flat().map((t: any, _idx: number) => {
      // Find which campaign this search term belongs to
      let campaignId = "";
      let campaignName = "";
      for (let i = 0; i < campaignIds.length; i++) {
        if ((searchTermResults[i] as any[]).includes(t)) {
          campaignId = campaignIds[i];
          campaignName = topCampaigns[i].name;
          break;
        }
      }
      return {
        searchTerm: t.searchTerm ?? "",
        impressions: t.impressions ?? 0,
        clicks: t.clicks ?? 0,
        cost: t.cost ?? 0,
        conversions: t.conversions ?? 0,
        campaignName,
        campaignId,
        adGroupName: t.adGroupName ?? "",
      };
    });

    const allAds = adResults.flat().map((a: any) => ({
      adId: String(a.adId ?? ""),
      type: a.type ?? "UNKNOWN",
      headlines: a.headlines ?? [],
      descriptions: a.descriptions ?? [],
      finalUrls: a.finalUrls ?? [],
      impressions: a.impressions ?? 0,
      clicks: a.clicks ?? 0,
      cost: a.cost ?? 0,
      conversions: a.conversions ?? 0,
      adGroupId: String(a.adGroupId ?? ""),
      adGroupName: a.adGroupName ?? "",
      status: a.status ?? "UNKNOWN",
      adStrength: a.adStrength ?? null,
    }));

    const allNegatives = negativeResults.flat().map((n: any) => ({
      text: n.text ?? "",
      campaignId: "",
    }));

    const totalAdGroups = adGroupResults.flat().length;

    // Fetch landing pages, account settings, and conversion actions in parallel
    const [landingPages, accountSettingsResult, conversionActionsResult] = await Promise.all([
      analyzeAdLandingPages(allAds, 10),
      getAccountSettings(auth),
      getConversionActions(auth),
    ]);

    const auditInput: AuditInput = {
      accountSettings: {
        autoTaggingEnabled: accountSettingsResult.autoTaggingEnabled,
        conversionTrackingId: accountSettingsResult.conversionTrackingId,
        trackingUrlTemplate: accountSettingsResult.trackingUrlTemplate,
      },
      conversionActions: conversionActionsResult,
      campaigns: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        cost: c.cost,
        conversions: c.conversions,
        clicks: c.clicks,
        impressions: c.impressions,
        biddingStrategy: (c as any).biddingStrategy ?? undefined,
      })),
      keywords: allKeywords,
      searchTerms: allSearchTerms,
      ads: allAds,
      landingPages,
      impressionShare: impressionShareResults,
      negativeKeywords: allNegatives,
      adGroupCount: totalAdGroups,
    };

    const auditResult = computeAuditScore(auditInput);

    // Persist snapshot AND get its id back so the audit page can wire Apply
    // buttons to the new /api/chat/recommendations/apply route. ~50ms over
    // the cold path; cheap relative to the surrounding GAQL fan-out. If the
    // insert fails the audit still renders — Apply buttons just won't appear.
    const snapshotResult = await saveAuditSnapshot(
      session.customerId,
      session.userId ?? null,
      auditResult,
      auditInput,
    ).catch((e) => {
      console.error("audit snapshot save failed", e);
      return { snapshotId: null as number | null };
    });

    // Fire-and-forget: save an anonymized copy to the user's audit history
    // (private by default — Phase 1 of shareable audits). Never blocks the
    // audit response; dedup and auth guards live inside saveAuditToHistory.
    saveAuditToHistory({
      userId: session.userId ?? null,
      accountId: session.customerId,
      result: auditResult,
      source: "web",
    }).catch((e) => {
      console.error("audit history save failed", e);
    });

    // applyEnabled mirrors FEATURE_AUDIT_APPLY (the same env var the apply
    // route gates on) so the client can render text-only fallback when the
    // feature is disabled, without a separate runtime probe.
    return {
      auditResult,
      snapshotId: snapshotResult.snapshotId,
      applyEnabled: (process.env.FEATURE_AUDIT_APPLY ?? "").toLowerCase() === "true",
    };
  });
}

// ─── Mutation actions ────────────────────────────────────────────────

type MutationResult = { success: boolean; error?: string };

async function mutateWithAuth(
  fn: (auth: Awaited<ReturnType<typeof getAuthContext>>["auth"]) => Promise<MutationResult>,
): Promise<MutationResult> {
  return requireAuth(async () => {
    const { auth } = await getAuthContext();
    const result = await fn(auth);
    if (result.success) invalidateCache(auth.customerId);
    return result;
  });
}

export async function pauseCampaignAction(campaignId: string): Promise<MutationResult> {
  return mutateWithAuth((auth) => pauseCampaign(auth, campaignId));
}

export async function addNegativeKeywordAction(
  searchTerm: string,
  campaignId: string,
): Promise<MutationResult> {
  return mutateWithAuth((auth) => addNegativeKeyword(auth, campaignId, searchTerm, "BROAD"));
}

export async function pauseKeywordAction(
  campaignId: string,
  adGroupId: string,
  criterionId: string,
): Promise<MutationResult> {
  return mutateWithAuth((auth) => pauseKeyword(auth, campaignId, adGroupId, criterionId));
}

export async function clearAuditCache(): Promise<void> {
  const { session } = await getAuthContext();
  invalidateCache(session.customerId);
}
