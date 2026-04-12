import { getSession } from "@/lib/session";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import {
  listCampaigns,
  getAccountSettings,
  getConversionActions,
  getKeywords,
  getSearchTermReport,
  getImpressionShare,
  listAds,
  getNegativeKeywords,
  listAdGroups,
  parseCustomerIds,
  type AuthContext,
} from "@/lib/google-ads";
import { computeAuditScore, type AuditInput } from "@/lib/audit/scoring";
import { analyzeAdLandingPages } from "@/lib/audit/landing-page";
import { saveAuditSnapshot } from "@/lib/audit/persist";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  // Auth: must be a logged-in dev user
  const session = await getSession();
  if (!session.connected || !session.isDev) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { accountId } = await params;

  // Look up the most recent session that has this customerId
  const [sessionRow] = await db()
    .select({
      refreshToken: schema.mcpSessions.refreshToken,
      customerId: schema.mcpSessions.customerId,
      customerIds: schema.mcpSessions.customerIds,
      loginCustomerId: schema.mcpSessions.loginCustomerId,
      userId: schema.mcpSessions.userId,
      googleEmail: schema.mcpSessions.googleEmail,
    })
    .from(schema.mcpSessions)
    .where(eq(schema.mcpSessions.customerId, accountId))
    .orderBy(desc(schema.mcpSessions.createdAt))
    .limit(1);

  if (!sessionRow) {
    return Response.json(
      { error: `No session found for account ${accountId}` },
      { status: 404 },
    );
  }

  if (!sessionRow.refreshToken) {
    return Response.json(
      { error: `No refresh token for account ${accountId}` },
      { status: 400 },
    );
  }

  // Build auth context matching what Google Ads functions expect
  const auth: AuthContext = {
    refreshToken: sessionRow.refreshToken,
    customerId: sessionRow.customerId,
    customerIds: parseCustomerIds(sessionRow.customerIds),
    loginCustomerId: sessionRow.loginCustomerId ?? undefined,
  };

  try {
    // Phase 1: campaigns + account settings + conversion actions
    const [campaigns, accountSettingsResult, conversionActionsResult] =
      await Promise.all([
        listCampaigns(auth, { limit: 50, days: 30 }),
        getAccountSettings(auth),
        getConversionActions(auth),
      ]);

    const enabledCampaigns = campaigns.filter(
      (c) => c.status === "ENABLED" || c.status === 2,
    );
    const totalSpend = campaigns.reduce((s, c) => s + c.cost, 0);

    // For empty accounts, save a minimal snapshot
    if (enabledCampaigns.length === 0 && totalSpend === 0) {
      const emptyInput: AuditInput = {
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
        keywords: [],
        searchTerms: [],
        ads: [],
        landingPages: [],
        impressionShare: [],
        negativeKeywords: [],
        adGroupCount: 0,
      };

      const auditResult = computeAuditScore(emptyInput);
      await saveAuditSnapshot(
        accountId,
        sessionRow.userId ?? null,
        auditResult,
        emptyInput,
      );

      return Response.json({ accountId, auditResult, empty: true });
    }

    // Phase 2: detailed per-campaign data (top 5 by impressions)
    const topCampaigns = [...enabledCampaigns]
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5);
    const campaignIds = topCampaigns.map((c) => c.id);

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
            const r = await getKeywords(auth, id, 30, 100);
            return r.keywords;
          } catch {
            return [];
          }
        }),
      ),
      Promise.all(
        campaignIds.map(async (id) => {
          try {
            const r = await getSearchTermReport(auth, id, 30, 100);
            return r.searchTerms;
          } catch {
            return [];
          }
        }),
      ),
      Promise.all(
        campaignIds.map(async (id, idx) => {
          try {
            const r = await getImpressionShare(auth, id, 30);
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
            const r = await listAds(auth, id, undefined, 30, 50);
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

    // Flatten results (same logic as audit actions)
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
      campaignName: "",
      campaignId: "",
      adGroupName: k.adGroupName ?? "",
      averageCpc: k.averageCpc ?? 0,
      ctr: k.ctr ?? 0,
    }));

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

    const allSearchTerms = searchTermResults.flat().map((t: any) => {
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

    // Landing pages analysis
    const landingPages = await analyzeAdLandingPages(allAds, 10);

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

    await saveAuditSnapshot(
      accountId,
      sessionRow.userId ?? null,
      auditResult,
      auditInput,
    );

    return Response.json({ accountId, auditResult });
  } catch (err) {
    console.error(`Audit failed for account ${accountId}:`, err);
    const message =
      err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: `Audit failed: ${message}` },
      { status: 500 },
    );
  }
}
