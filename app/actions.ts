"use server"
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getClient, parseCustomerIds } from "@/lib/google-ads";
import { getSessionAuth } from "@/lib/session";
import { getChanges, getUndoableChange, markRolledBack, logChange } from "@/lib/db/tracking";
import { executeUndoForChange } from "@/lib/mcp/write-tools";

export async function getChangesAction(options: { limit?: number; campaignId?: string } = {}) {
    const { customerId } = await getSessionAuth();
    return getChanges(customerId, options);
}

export async function undoChangeAction(changeId: number) {
    const { refreshToken, customerId, customerIds } = await getSessionAuth();

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
    await logChange(customerId, check.change.campaignId ?? null, undoResult, `Undo of change #${changeId} (${check.change.toolName})`);

    return { success: true, changeId };
}

export async function listCampaignsAction() {
    try {
        const { refreshToken, customerId } = await getSessionAuth();
        const customer = getClient().Customer({
            customer_id: customerId,
            refresh_token: refreshToken,
        });

        const response = await customer.query(`
            SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.advertising_channel_type,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros
            FROM campaign
            WHERE campaign.status != 'REMOVED'
            ORDER BY campaign.name ASC
        `);

        return response.map((row: any) => ({
            id: row.campaign.id,
            name: row.campaign.name || 'Untitled Campaign',
            status: row.campaign.status,
            type: row.campaign.advertising_channel_type || 'UNKNOWN',
            impressions: row.metrics.impressions || 0,
            clicks: row.metrics.clicks || 0,
            cost: row.metrics.cost_micros ? (row.metrics.cost_micros / 1000000) : 0
        }));
    } catch (error) {
        console.error("List Campaigns Error:", error);
        throw new Error("Failed to list campaigns.");
    }
}

export async function getCampaignHistoryAction(campaignId: string, startDate?: string, endDate?: string) {
    const effectiveStartDate = startDate || '2000-01-01';
    const effectiveEndDate = endDate || '2030-12-31';

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
                metrics.average_cpc
            FROM campaign
            WHERE campaign.id = ${campaignId}
              AND segments.date BETWEEN '${effectiveStartDate}' AND '${effectiveEndDate}'
            ORDER BY segments.date ASC
        `);

        return response.map((row: any) => ({
            date: row.segments.date,
            impressions: row.metrics.impressions || 0,
            clicks: row.metrics.clicks || 0,
            cost: row.metrics.cost_micros ? (row.metrics.cost_micros / 1000000) : 0,
            ctr: row.metrics.ctr || 0,
            averageCpc: row.metrics.average_cpc ? (row.metrics.average_cpc / 1000000) : 0
        }));
    } catch (error) {
        console.error("Get Campaign History Error:", error);
        throw new Error("Failed to fetch campaign history.");
    }
}

export async function getCampaignKeywordsAction(campaignId: string, startDate?: string, endDate?: string) {
    const effectiveStartDate = startDate || '2000-01-01';
    const effectiveEndDate = endDate || '2030-12-31';

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

        return response.map((row: any) => ({
            id: row.ad_group_criterion.criterion_id,
            text: row.ad_group_criterion.keyword.text,
            status: row.ad_group_criterion.status,
            qualityScore: row.ad_group_criterion.quality_info?.quality_score || 0,
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
