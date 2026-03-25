import { GoogleAdsApi } from "google-ads-api";

type AuthContext = {
  refreshToken: string;
  customerId: string;
};

type CampaignRecord = {
  id: string;
  name: string;
  status: string;
  channelType: string;
  impressions: number;
  clicks: number;
  cost: number;
};

type CampaignQueryRow = {
  campaign: {
    id?: string | number;
    name?: string;
    status?: string;
    advertising_channel_type?: string;
  };
  metrics: {
    impressions?: number;
    clicks?: number;
    cost_micros?: number;
  };
};

type CampaignPerformanceRow = {
  campaign?: {
    name?: string;
  };
  segments: {
    date: string;
  };
  metrics: {
    impressions?: number;
    clicks?: number;
    cost_micros?: number;
    conversions?: number;
    conversions_value?: number;
    ctr?: number;
    average_cpc?: number;
  };
};

type CampaignKeywordRow = {
  ad_group?: {
    name?: string;
  };
  ad_group_criterion: {
    criterion_id?: string | number;
    keyword?: {
      text?: string;
    };
    status?: string;
    quality_info?: {
      quality_score?: number;
    };
  };
  metrics: {
    impressions?: number;
    clicks?: number;
    ctr?: number;
    cost_micros?: number;
    average_cpc?: number;
    conversions?: number;
  };
};

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeCustomerId(customerId: string) {
  return customerId.replace(/-/g, "").trim();
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getDateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - Math.max(days - 1, 0));

  return {
    start: formatDate(start),
    end: formatDate(end),
  };
}

export function createGoogleAdsCustomer({ refreshToken, customerId }: AuthContext) {
  const client = new GoogleAdsApi({
    client_id: requiredEnv("GOOGLE_ADS_CLIENT_ID"),
    client_secret: requiredEnv("GOOGLE_ADS_CLIENT_SECRET"),
    developer_token: requiredEnv("GOOGLE_ADS_DEVELOPER_TOKEN"),
  });

  return client.Customer({
    customer_id: normalizeCustomerId(customerId),
    refresh_token: refreshToken,
  });
}

export async function listAccessibleCustomers(refreshToken: string) {
  const client = new GoogleAdsApi({
    client_id: requiredEnv("GOOGLE_ADS_CLIENT_ID"),
    client_secret: requiredEnv("GOOGLE_ADS_CLIENT_SECRET"),
    developer_token: requiredEnv("GOOGLE_ADS_DEVELOPER_TOKEN"),
  });

  const response = (await client.listAccessibleCustomers(refreshToken)) as {
    resource_names?: string[];
  };

  const customers = await Promise.all(
    (response.resource_names ?? []).map(async resourceName => {
      const customerId = resourceName.replace("customers/", "");
      const customer = client.Customer({
        customer_id: customerId,
        refresh_token: refreshToken,
      });

      try {
        const result = await customer.query(`
          SELECT
            customer.id,
            customer.descriptive_name,
            customer.currency_code,
            customer.time_zone,
            customer.test_account,
            customer.manager
          FROM customer
          LIMIT 1
        `);

        const row = result[0]?.customer;

        return {
          id: customerId,
          name: row?.descriptive_name ?? "Untitled account",
          currencyCode: row?.currency_code ?? null,
          timeZone: row?.time_zone ?? null,
          isTestAccount: Boolean(row?.test_account),
          isManager: Boolean(row?.manager),
        };
      } catch (error) {
        return {
          id: customerId,
          name: "Unavailable",
          currencyCode: null,
          timeZone: null,
          isTestAccount: false,
          isManager: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),
  );

  return customers;
}

export async function getCustomerOverview(auth: AuthContext) {
  const customer = createGoogleAdsCustomer(auth);
  const result = await customer.query(`
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.time_zone,
      customer.test_account,
      customer.manager
    FROM customer
    LIMIT 1
  `);

  const row = result[0]?.customer;

  return {
    id: String(row?.id ?? normalizeCustomerId(auth.customerId)),
    name: row?.descriptive_name ?? "Untitled account",
    currencyCode: row?.currency_code ?? null,
    timeZone: row?.time_zone ?? null,
    isTestAccount: Boolean(row?.test_account),
    isManager: Boolean(row?.manager),
  };
}

export async function listCampaigns(
  auth: AuthContext,
  options: {
    limit?: number;
    includeRemoved?: boolean;
  } = {},
) {
  const customer = createGoogleAdsCustomer(auth);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const whereClause = options.includeRemoved
    ? ""
    : "WHERE campaign.status != 'REMOVED'";

  const result = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros
    FROM campaign
    ${whereClause}
    ORDER BY metrics.impressions DESC
    LIMIT ${limit}
  `);

  return (result as CampaignQueryRow[]).map((row): CampaignRecord => ({
    id: String(row.campaign.id),
    name: row.campaign.name ?? "Untitled campaign",
    status: row.campaign.status ?? "UNKNOWN",
    channelType: row.campaign.advertising_channel_type ?? "UNKNOWN",
    impressions: row.metrics.impressions ?? 0,
    clicks: row.metrics.clicks ?? 0,
    cost: row.metrics.cost_micros ? row.metrics.cost_micros / 1_000_000 : 0,
  }));
}

export async function getCampaignPerformance(
  auth: AuthContext,
  campaignId: string,
  days: number,
) {
  const customer = createGoogleAdsCustomer(auth);
  const boundedDays = Math.min(Math.max(days, 1), 365);
  const { start, end } = getDateRange(boundedDays);

  const result = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc
    FROM campaign
    WHERE campaign.id = ${Number(campaignId)}
      AND segments.date BETWEEN '${start}' AND '${end}'
    ORDER BY segments.date ASC
  `);

  const rows = (result as CampaignPerformanceRow[]).map(row => ({
    date: row.segments.date,
    impressions: row.metrics.impressions ?? 0,
    clicks: row.metrics.clicks ?? 0,
    cost: row.metrics.cost_micros ? row.metrics.cost_micros / 1_000_000 : 0,
    conversions: row.metrics.conversions ?? 0,
    conversionValue: row.metrics.conversions_value ?? 0,
    ctr: row.metrics.ctr ?? 0,
    averageCpc: row.metrics.average_cpc
      ? row.metrics.average_cpc / 1_000_000
      : 0,
  }));

  const totals = rows.reduce(
    (acc, row) => ({
      impressions: acc.impressions + row.impressions,
      clicks: acc.clicks + row.clicks,
      cost: acc.cost + row.cost,
      conversions: acc.conversions + row.conversions,
      conversionValue: acc.conversionValue + row.conversionValue,
    }),
    {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      conversionValue: 0,
    },
  );

  return {
    campaignId,
    campaignName: (result as CampaignPerformanceRow[])[0]?.campaign?.name ?? "Unknown campaign",
    dateRange: { start, end, days: boundedDays },
    totals: {
      ...totals,
      ctr: totals.impressions > 0 ? totals.clicks / totals.impressions : 0,
      averageCpc: totals.clicks > 0 ? totals.cost / totals.clicks : 0,
      roas: totals.cost > 0 ? totals.conversionValue / totals.cost : null,
    },
    daily: rows,
  };
}

export async function getCampaignKeywords(
  auth: AuthContext,
  campaignId: string,
  days: number,
  limit: number,
) {
  const customer = createGoogleAdsCustomer(auth);
  const boundedDays = Math.min(Math.max(days, 1), 365);
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  const { start, end } = getDateRange(boundedDays);

  const result = await customer.query(`
    SELECT
      ad_group.name,
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.status,
      ad_group_criterion.quality_info.quality_score,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.cost_micros,
      metrics.average_cpc,
      metrics.conversions
    FROM keyword_view
    WHERE campaign.id = ${Number(campaignId)}
      AND segments.date BETWEEN '${start}' AND '${end}'
    ORDER BY metrics.impressions DESC
    LIMIT ${boundedLimit}
  `);

  return {
    campaignId,
    dateRange: { start, end, days: boundedDays },
    keywords: (result as CampaignKeywordRow[]).map(row => ({
      id: String(row.ad_group_criterion.criterion_id),
      adGroupName: row.ad_group?.name ?? "Unknown ad group",
      text: row.ad_group_criterion.keyword?.text ?? "",
      status: row.ad_group_criterion.status ?? "UNKNOWN",
      qualityScore:
        row.ad_group_criterion.quality_info?.quality_score ?? null,
      impressions: row.metrics.impressions ?? 0,
      clicks: row.metrics.clicks ?? 0,
      ctr: row.metrics.ctr ?? 0,
      cost: row.metrics.cost_micros ? row.metrics.cost_micros / 1_000_000 : 0,
      averageCpc: row.metrics.average_cpc
        ? row.metrics.average_cpc / 1_000_000
        : 0,
      conversions: row.metrics.conversions ?? 0,
    })),
  };
}

export async function runSafeGaqlReport(auth: AuthContext, rawQuery: string) {
  const query = rawQuery.trim();
  const normalized = query.toUpperCase();

  if (!normalized.startsWith("SELECT ")) {
    throw new Error("Only read-only SELECT GAQL queries are allowed.");
  }

  if (query.includes(";")) {
    throw new Error("Semicolons are not allowed in GAQL queries.");
  }

  const forbiddenTerms = [
    " INSERT ",
    " UPDATE ",
    " DELETE ",
    " CREATE ",
    " ALTER ",
    " DROP ",
    " TRUNCATE ",
  ];

  if (forbiddenTerms.some(term => ` ${normalized} `.includes(term))) {
    throw new Error("The query contains forbidden keywords.");
  }

  const customer = createGoogleAdsCustomer(auth);
  const rows = await customer.query(query);

  return {
    rowCount: rows.length,
    rows: rows.slice(0, 50),
  };
}
