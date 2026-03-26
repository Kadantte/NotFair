"use server"
import { GoogleAdsApi, enums } from "google-ads-api";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function hasLinkedAdsAccount(): Promise<boolean> {
    try {
        const supabase = await createSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;

        const [session] = await db()
            .select({ id: schema.mcpSessions.id })
            .from(schema.mcpSessions)
            .where(eq(schema.mcpSessions.userId, user.id))
            .limit(1);

        return !!session;
    } catch {
        return false;
    }
}

export async function listAccessibleCustomersAction(refreshToken: string) {
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

    if (!clientId || !clientSecret || !developerToken) {
        throw new Error("Missing Server Google Ads Configuration");
    }

    try {
        const client = new GoogleAdsApi({
            client_id: clientId,
            client_secret: clientSecret,
            developer_token: developerToken,
        });

        // 1. List accessible customers (resource names only)
        const response = await client.listAccessibleCustomers(refreshToken) as any;
        const resourceNames = response.resource_names as string[] || [];

        // 2. Fetch details for each customer
        const customers = await Promise.all(resourceNames.map(async (resourceName) => {
            let info = {
                id: resourceName,
                name: "Unknown Account",
                status: "ACCESSIBLE",
                error: null as string | null,
                isTest: false
            };

            try {
                const customerId = resourceName.replace("customers/", "");
                const customer = client.Customer({
                    customer_id: customerId,
                    refresh_token: refreshToken,
                });

                // Query for customer name and test status
                const result = await customer.query(`
                    SELECT customer.id, customer.descriptive_name, customer.test_account 
                    FROM customer 
                    LIMIT 1
                `);

                if (result[0]?.customer) {
                    info.name = result[0].customer.descriptive_name || "Untitled Account";
                    info.isTest = result[0].customer.test_account || false;
                }
            } catch (e: any) {
                console.warn(`Failed to fetch details for ${resourceName}`, e?.message || e);
                info.status = "ERROR";

                // Check specifically for the test account error
                const msg = e?.message || JSON.stringify(e);
                if (msg.includes("developer token is only approved for use with test accounts")) {
                    info.error = "Production account not accessible with Test Developer Token. PLEASE USE A TEST MANAGER ACCOUNT.";
                    info.isTest = false; // It's definitely not a test account if this error occurs
                } else {
                    info.error = "Access Error";
                }
            }
            return info;
        }));

        return customers;
    } catch (error) {
        console.error("List Customers Error:", error);
        throw new Error("Failed to list accessible customers.");
    }
}

export async function listCampaignsAction(refreshToken: string, customerId: string) {
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

    if (!clientId || !clientSecret || !developerToken) {
        throw new Error("Missing Server Google Ads Configuration");
    }

    try {
        const client = new GoogleAdsApi({
            client_id: clientId,
            client_secret: clientSecret,
            developer_token: developerToken,
        });

        const customer = client.Customer({
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

export async function getCampaignHistoryAction(refreshToken: string, customerId: string, campaignId: string, startDate?: string, endDate?: string) {
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

    // Default to a wide range if not provided (All Time)
    const effectiveStartDate = startDate || '2000-01-01';
    const effectiveEndDate = endDate || '2030-12-31';

    if (!clientId || !clientSecret || !developerToken) {
        throw new Error("Missing Server Google Ads Configuration");
    }

    try {
        const client = new GoogleAdsApi({
            client_id: clientId,
            client_secret: clientSecret,
            developer_token: developerToken,
        });

        const customer = client.Customer({
            customer_id: customerId,
            refresh_token: refreshToken,
        });

        // Query daily metrics for the specified date range
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

export async function getCampaignKeywordsAction(refreshToken: string, customerId: string, campaignId: string, startDate?: string, endDate?: string) {
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

    // Default to a wide range if not provided (All Time)
    const effectiveStartDate = startDate || '2000-01-01';
    const effectiveEndDate = endDate || '2030-12-31';

    if (!clientId || !clientSecret || !developerToken) {
        throw new Error("Missing Server Google Ads Configuration");
    }

    try {
        const client = new GoogleAdsApi({
            client_id: clientId,
            client_secret: clientSecret,
            developer_token: developerToken,
        });

        const customer = client.Customer({
            customer_id: customerId,
            refresh_token: refreshToken,
        });

        // Query keyword performance for the specified date range
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
    // Build a concise data summary for the prompt
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
