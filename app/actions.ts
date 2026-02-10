"use server"
import { GoogleAdsApi, enums } from "google-ads-api";

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




