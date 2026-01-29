"use server"
import { GoogleAdsApi, enums } from "google-ads-api";

export async function listAccessibleCustomersAction(refreshToken: string): Promise<{ id: string, name: string }[]> {
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

        const response = await client.listAccessibleCustomers(refreshToken) as any;
        const resourceNames = response.resource_names as string[] || [];

        // Fetch details for each customer
        const customers = await Promise.all(resourceNames.map(async (resourceName) => {
            try {
                const customerId = resourceName.replace("customers/", "");
                const customer = client.Customer({
                    customer_id: customerId,
                    refresh_token: refreshToken,
                });

                // Query for customer name
                const result = await customer.query(`
                    SELECT customer.id, customer.descriptive_name 
                    FROM customer 
                    LIMIT 1
                `);

                const name = result[0]?.customer?.descriptive_name || "Unknown Account";
                return { id: resourceName, name };
            } catch (e) {
                console.warn(`Failed to fetch details for ${resourceName}`, e);
                return { id: resourceName, name: "Unknown (Access Error)" };
            }
        }));

        return customers;
    } catch (error) {
        console.error("List Customers Error:", error);
        throw new Error("Failed to list accessible customers.");
    }
}
