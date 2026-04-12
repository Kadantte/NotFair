"use server"
import { redirect } from "next/navigation";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getClient, parseCustomerIds, pauseCampaign, enableCampaign, removeCampaign, listCampaigns, listAds, getConversionActions, getSmartCampaignKeywordThemes, getSmartCampaignSetting, getSmartCampaignAds, getSmartCampaignSearchTerms, getImpressionShare, getSearchTermReport, micros } from "@/lib/google-ads";
import { getSessionAuth } from "@/lib/session";
import { getChanges, getUndoableChange, markRolledBack, logChange } from "@/lib/db/tracking";
import { executeUndoForChange } from "@/lib/mcp/write-tools";
import { getUsageInfo, getHourlyUsage } from "@/lib/mcp/rate-limit";
import { trackServerEvent } from "@/lib/analytics-server";

type CampaignHistoryRow = {
    segments: {
        date: string;
    };
    metrics: {
        impressions?: number | null;
        clicks?: number | null;
        cost_micros?: number | null;
        ctr?: number | null;
        average_cpc?: number | null;
        conversions?: number | null;
    };
};

type CampaignKeywordRow = {
    ad_group_criterion: {
        criterion_id?: number | string | null;
        status?: string | null;
        keyword?: {
            text?: string | null;
        } | null;
        quality_info?: {
            quality_score?: number | null;
        } | null;
    } | null;
    metrics: {
        impressions?: number | null;
        clicks?: number | null;
        ctr?: number | null;
        cost_micros?: number | null;
        average_cpc?: number | null;
    };
};

function normalizeCampaignStatus(status: string | number | null | undefined): string {
    const value = String(status ?? "UNKNOWN").toUpperCase();

    switch (value) {
        case "2":
            return "ENABLED";
        case "3":
            return "PAUSED";
        case "4":
            return "REMOVED";
        default:
            return value;
    }
}

function normalizeChannelType(type: string | number | null | undefined): string {
    const value = String(type ?? "UNKNOWN").toUpperCase();

    switch (value) {
        case "2":
            return "SEARCH";
        case "3":
            return "DISPLAY";
        case "6":
            return "SHOPPING";
        case "7":
            return "VIDEO";
        case "8":
            return "MULTI_CHANNEL";
        case "9":
            return "LOCAL";
        case "10":
            return "SMART";
        case "11":
            return "PERFORMANCE_MAX";
        case "12":
            return "LOCAL_SERVICES";
        case "13":
            return "DISCOVERY";
        case "14":
            return "TRAVEL";
        case "15":
            return "DEMAND_GEN";
        default:
            return value;
    }
}

function normalizeBiddingStrategy(strategy: string | number | null | undefined): string {
    const value = String(strategy ?? "UNKNOWN").toUpperCase();

    switch (value) {
        case "2":
            return "MANUAL_CPC";
        case "3":
            return "MANUAL_CPV";
        case "4":
            return "MANUAL_CPM";
        case "5":
            return "MAXIMIZE_CONVERSIONS";
        case "6":
            return "MAXIMIZE_CONVERSION_VALUE";
        case "7":
            return "TARGET_CPA";
        case "8":
            return "TARGET_IMPRESSION_SHARE";
        case "9":
            return "TARGET_ROAS";
        case "10":
            return "TARGET_SPEND";
        case "11":
            return "ENHANCED_CPC";
        case "12":
            return "TARGET_CPM";
        default:
            return value;
    }
}

function requireAuth<T>(fn: () => Promise<T>): Promise<T> {
    return fn().catch((err) => {
        if (err instanceof Error && err.message === "Not authenticated") {
            redirect("/connect");
        }
        throw err;
    });
}

export async function getChangesAction(options: { limit?: number; offset?: number; campaignId?: string } = {}) {
    return requireAuth(async () => {
        const { customerId } = await getSessionAuth();
        return getChanges(customerId, options);
    });
}

export async function undoChangeAction(changeId: number) {
    return requireAuth(async () => {
        const { refreshToken, customerId, customerIds, userId } = await getSessionAuth();

        const check = await getUndoableChange(customerId, changeId);
        if ("error" in check) {
            throw new Error(check.error);
        }

        const auth = {
            refreshToken,
            customerId,
            customerIds: parseCustomerIds(customerIds),
        };

        const undoResult = await executeUndoForChange(auth, check.change);
        if (!undoResult.success) {
            throw new Error(undoResult.error ?? "Undo failed");
        }

        await markRolledBack(changeId);
        await logChange(customerId, userId, check.change.campaignId ?? null, undoResult, `Undo of change #${changeId} (${check.change.toolName})`);

        const changeAge = Date.now() - check.change.createdAt.getTime();
        trackServerEvent(userId, "ai_change_undone", {
            tool_name: check.change.toolName,
            minutes_since_change: Math.round(changeAge / 60_000),
        });

        return { success: true, changeId };
    });
}

const campaignsCache = new Map<string, { data: ReturnType<typeof mapCampaigns>; ts: number }>();
const CAMPAIGNS_CACHE_TTL = 60_000; // 60 seconds

function mapCampaigns(response: Awaited<ReturnType<typeof listCampaigns>>) {
    return response.map((campaign) => ({
        id: campaign.id,
        name: campaign.name || 'Untitled Campaign',
        status: normalizeCampaignStatus(campaign.status),
        type: normalizeChannelType(campaign.channelType),
        impressions: campaign.impressions || 0,
        clicks: campaign.clicks || 0,
        cost: campaign.cost || 0,
        conversions: campaign.conversions || 0,
        biddingStrategy: normalizeBiddingStrategy(campaign.biddingStrategy),
        networkDisplayEnabled: campaign.networkDisplayEnabled ?? false,
        trackingTemplate: campaign.trackingTemplate ?? null,
    }));
}

export async function listCampaignsAction(options?: { skipCache?: boolean }) {
    return requireAuth(async () => {
    try {
        const { refreshToken, customerId, customerIds } = await getSessionAuth();

        if (!options?.skipCache) {
            const cached = campaignsCache.get(customerId);
            if (cached && Date.now() - cached.ts < CAMPAIGNS_CACHE_TTL) {
                return cached.data;
            }
        } else {
            campaignsCache.delete(customerId);
        }

        const auth = {
            refreshToken,
            customerId,
            customerIds: parseCustomerIds(customerIds),
        };

        const response = await listCampaigns(auth, { limit: 100 });
        const campaigns = mapCampaigns(response);

        campaignsCache.set(customerId, { data: campaigns, ts: Date.now() });

        return campaigns;
    } catch (error) {
        console.error("List Campaigns Error:", error);
        throw new Error("Failed to list campaigns.");
    }
    });
}

export async function invalidateCampaignsCache() {
    campaignsCache.clear();
}

export async function getConversionActionsAction() {
    return requireAuth(async () => {
    try {
        const { refreshToken, customerId, customerIds } = await getSessionAuth();
        const auth = {
            refreshToken,
            customerId,
            customerIds: parseCustomerIds(customerIds),
        };
        return await getConversionActions(auth);
    } catch (error) {
        console.error("Get Conversion Actions Error:", error);
        return [];
    }
    });
}

export async function getImpressionShareAction(campaignId: string) {
    return requireAuth(async () => {
    try {
        const { refreshToken, customerId, customerIds } = await getSessionAuth();
        const auth = {
            refreshToken,
            customerId,
            customerIds: parseCustomerIds(customerIds),
        };
        return await getImpressionShare(auth, campaignId, 30);
    } catch (error) {
        console.error("Get Impression Share Error:", error);
        return null;
    }
    });
}

export async function getSearchTermReportAction(campaignId: string) {
    return requireAuth(async () => {
    try {
        const { refreshToken, customerId, customerIds } = await getSessionAuth();
        const auth = {
            refreshToken,
            customerId,
            customerIds: parseCustomerIds(customerIds),
        };
        const result = await getSearchTermReport(auth, campaignId, 30, 20);
        return result.searchTerms;
    } catch (error) {
        console.error("Get Search Term Report Error:", error);
        return [];
    }
    });
}

export async function pauseCampaignAction(campaignId: string) {
    return requireAuth(async () => {
    try {
        const { refreshToken, customerId, customerIds, userId } = await getSessionAuth();
        const auth = {
            refreshToken,
            customerId,
            customerIds: parseCustomerIds(customerIds),
        };

        const result = await pauseCampaign(auth, campaignId);
        if (!result.success) {
            throw new Error(result.error ?? "Failed to pause campaign.");
        }

        campaignsCache.delete(customerId);
        await logChange(customerId, userId, campaignId, result, "Paused from campaigns page");
        return { success: true, campaignId, afterValue: result.afterValue ?? null };
    } catch (error) {
        console.error("Pause Campaign Error:", error);
        throw new Error("Failed to pause campaign.");
    }
    });
}

export async function enableCampaignAction(campaignId: string) {
    return requireAuth(async () => {
    try {
        const { refreshToken, customerId, customerIds, userId } = await getSessionAuth();
        const auth = {
            refreshToken,
            customerId,
            customerIds: parseCustomerIds(customerIds),
        };

        const result = await enableCampaign(auth, campaignId);
        if (!result.success) {
            throw new Error(result.error ?? "Failed to enable campaign.");
        }

        campaignsCache.delete(customerId);
        await logChange(customerId, userId, campaignId, result, "Enabled from campaigns page");
        return { success: true, campaignId, afterValue: result.afterValue ?? null };
    } catch (error) {
        console.error("Enable Campaign Error:", error);
        throw new Error("Failed to enable campaign.");
    }
    });
}

export async function removeCampaignAction(campaignId: string) {
    return requireAuth(async () => {
    try {
        const { refreshToken, customerId, customerIds, userId } = await getSessionAuth();
        const auth = {
            refreshToken,
            customerId,
            customerIds: parseCustomerIds(customerIds),
        };

        const result = await removeCampaign(auth, campaignId);
        if (!result.success) {
            throw new Error(result.error ?? "Failed to delete campaign.");
        }

        campaignsCache.delete(customerId);
        await logChange(customerId, userId, campaignId, result, "Deleted from campaigns page");
        return { success: true, campaignId };
    } catch (error) {
        console.error("Remove Campaign Error:", error);
        throw new Error("Failed to delete campaign.");
    }
    });
}

export async function getCampaignHistoryAction(campaignId: string, startDate?: string, endDate?: string) {
    const effectiveStartDate = startDate || '2000-01-01';
    const effectiveEndDate = endDate || '2030-12-31';

    return requireAuth(async () => {
    try {
        const { refreshToken, customerId } = await getSessionAuth();
        const customer = getClient().Customer({
            customer_id: customerId,
            refresh_token: refreshToken,
        });

        const response = await customer.query(`
            SELECT
                segments.date,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.ctr,
                metrics.average_cpc,
                metrics.conversions
            FROM campaign
            WHERE campaign.id = ${campaignId}
              AND segments.date BETWEEN '${effectiveStartDate}' AND '${effectiveEndDate}'
            ORDER BY segments.date ASC
        `);

        return (response as CampaignHistoryRow[]).map((row) => ({
            date: row.segments.date,
            impressions: row.metrics.impressions || 0,
            clicks: row.metrics.clicks || 0,
            cost: micros(row.metrics.cost_micros ?? undefined),
            ctr: row.metrics.ctr || 0,
            averageCpc: micros(row.metrics.average_cpc ?? undefined),
            conversions: row.metrics.conversions || 0,
        }));
    } catch (error) {
        console.error("Get Campaign History Error:", error);
        throw new Error("Failed to fetch campaign history.");
    }
    });
}

export async function getCampaignKeywordsAction(campaignId: string, startDate?: string, endDate?: string) {
    const effectiveStartDate = startDate || '2000-01-01';
    const effectiveEndDate = endDate || '2030-12-31';

    return requireAuth(async () => {
    try {
        const { refreshToken, customerId } = await getSessionAuth();
        const customer = getClient().Customer({
            customer_id: customerId,
            refresh_token: refreshToken,
        });

        const response = await customer.query(`
            SELECT
                ad_group_criterion.criterion_id,
                ad_group_criterion.keyword.text,
                ad_group_criterion.status,
                ad_group_criterion.quality_info.quality_score,
                metrics.impressions,
                metrics.clicks,
                metrics.ctr,
                metrics.cost_micros,
                metrics.average_cpc
            FROM keyword_view
            WHERE campaign.id = ${campaignId}
              AND segments.date BETWEEN '${effectiveStartDate}' AND '${effectiveEndDate}'
            ORDER BY metrics.impressions DESC
            LIMIT 50
        `);

        return (response as unknown as CampaignKeywordRow[]).map((row) => ({
            id: String(row.ad_group_criterion?.criterion_id ?? ""),
            text: row.ad_group_criterion?.keyword?.text ?? "",
            status: row.ad_group_criterion?.status ?? "UNKNOWN",
            qualityScore: row.ad_group_criterion?.quality_info?.quality_score || 0,
            impressions: row.metrics.impressions || 0,
            clicks: row.metrics.clicks || 0,
            ctr: row.metrics.ctr || 0,
            cost: row.metrics.cost_micros ? (row.metrics.cost_micros / 1000000) : 0,
            averageCpc: row.metrics.average_cpc ? (row.metrics.average_cpc / 1000000) : 0
        }));
    } catch (error) {
        console.error("Get Campaign Keywords Error:", error);
        throw new Error("Failed to fetch campaign keywords.");
    }
    });
}

export async function getCampaignAdsAction(campaignId: string) {
    return requireAuth(async () => {
    try {
        const { refreshToken, customerId, customerIds } = await getSessionAuth();
        const auth = {
            refreshToken,
            customerId,
            customerIds: parseCustomerIds(customerIds),
        };
        const result = await listAds(auth, campaignId);
        return result.ads.map((ad) => ({
            adId: ad.adId,
            status: ad.status,
            type: ad.type,
            adGroupName: ad.adGroupName,
            finalUrls: ad.finalUrls,
            headlines: ad.headlines,
            descriptions: ad.descriptions,
            impressions: ad.impressions,
            clicks: ad.clicks,
            cost: ad.cost,
            conversions: ad.conversions,
        }));
    } catch (error) {
        console.error("Get Campaign Ads Error:", error);
        throw new Error("Failed to fetch campaign ads.");
    }
    });
}

export async function generateCampaignSummaryAction(
    history: Array<{
        date: string;
        impressions: number;
        clicks: number;
        cost: number;
        ctr: number;
        averageCpc: number;
    }>,
    keywords: Array<{
        text: string;
        status: string;
        qualityScore: number;
        impressions: number;
        clicks: number;
        ctr: number;
        cost: number;
        averageCpc: number;
    }>,
    campaignId: string
) {
    const totalImpressions = history.reduce((sum, d) => sum + d.impressions, 0);
    const totalClicks = history.reduce((sum, d) => sum + d.clicks, 0);
    const totalCost = history.reduce((sum, d) => sum + d.cost, 0);
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) : 0;
    const avgCpc = totalClicks > 0 ? (totalCost / totalClicks) : 0;
    const dateRange = history.length > 0
        ? `${history[0].date} to ${history[history.length - 1].date}`
        : 'No data';

    const topKeywords = keywords
        .slice(0, 10)
        .map(k => `- "${k.text}": ${k.impressions.toLocaleString()} impressions, ${k.clicks} clicks, CTR ${(k.ctr * 100).toFixed(2)}%, CPC $${k.averageCpc.toFixed(2)}, QS ${k.qualityScore || 'N/A'}`)
        .join('\n');

    const prompt = `You are a Google Ads performance analyst. Analyze this campaign data and provide a concise, actionable summary.

Campaign ID: ${campaignId}
Date Range: ${dateRange}
Days of Data: ${history.length}

Overall Metrics:
- Total Impressions: ${totalImpressions.toLocaleString()}
- Total Clicks: ${totalClicks.toLocaleString()}
- Total Cost: $${totalCost.toFixed(2)}
- Average CTR: ${(avgCtr * 100).toFixed(2)}%
- Average CPC: $${avgCpc.toFixed(2)}

Top Keywords:
${topKeywords || 'No keyword data available'}

Daily Trend (last 7 days):
${history.slice(-7).map(d => `${d.date}: ${d.impressions} imp, ${d.clicks} clicks, $${d.cost.toFixed(2)} cost`).join('\n')}

Provide a summary with these sections:
1. **Performance Overview** - Brief overall assessment
2. **Key Trends** - What's improving or declining
3. **Top Performers** - Best keywords and why
4. **Cost Efficiency** - Analysis of spend effectiveness
5. **Recommendations** - 2-3 specific, actionable next steps

Keep it concise and data-driven. Use specific numbers from the data.`;

    try {
        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            prompt,
        });

        return text || 'No summary generated.';
    } catch (error) {
        console.error("Generate Campaign Summary Error:", error);
        throw new Error("Failed to generate AI summary.");
    }
}

// ─── Smart Campaign ──────────────────────────────────────────────────

export async function getSmartCampaignAdsAction(campaignId: string) {
    return requireAuth(async () => {
        try {
            const { refreshToken, customerId, customerIds } = await getSessionAuth();
            const auth = { refreshToken, customerId, customerIds: parseCustomerIds(customerIds) };
            const result = await getSmartCampaignAds(auth, campaignId);
            console.log("[getSmartCampaignAdsAction] returned", result.length, "ads");
            return result;
        } catch (error: any) {
            console.error("[getSmartCampaignAdsAction] FAILED:", error?.message ?? error);
            return [];
        }
    });
}

export async function getCampaignKeywordThemesAction(campaignId: string) {
    return requireAuth(async () => {
        try {
            const { refreshToken, customerId, customerIds } = await getSessionAuth();
            const auth = { refreshToken, customerId, customerIds: parseCustomerIds(customerIds) };
            return await getSmartCampaignKeywordThemes(auth, campaignId);
        } catch (error) {
            console.error("Get Smart Campaign Keyword Themes Error:", error);
            return [];
        }
    });
}

export async function getSmartCampaignSearchTermsAction(campaignId: string) {
    return requireAuth(async () => {
        try {
            const { refreshToken, customerId, customerIds } = await getSessionAuth();
            const auth = { refreshToken, customerId, customerIds: parseCustomerIds(customerIds) };
            return await getSmartCampaignSearchTerms(auth, campaignId);
        } catch (error) {
            console.error("Get Smart Campaign Search Terms Error:", error);
            return [];
        }
    });
}

export async function getSmartCampaignSettingAction(campaignId: string) {
    return requireAuth(async () => {
        try {
            const { refreshToken, customerId, customerIds } = await getSessionAuth();
            const auth = { refreshToken, customerId, customerIds: parseCustomerIds(customerIds) };
            return await getSmartCampaignSetting(auth, campaignId);
        } catch (error) {
            console.error("Get Smart Campaign Setting Error:", error);
            return null;
        }
    });
}

// ─── Usage / Rate Limit ─────────────────────────────────────────────

export async function getUsageAction() {
    const auth = await getSessionAuth();
    const [info, hourly] = await Promise.all([
        getUsageInfo(auth.userId),
        getHourlyUsage(auth.userId),
    ]);
    return { ...info, hourly };
}
