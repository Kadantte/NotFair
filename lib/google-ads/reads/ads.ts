import { getCachedCustomer } from "../client";
import { getDateRange, micros, safeEntityId } from "../helpers";
import type { AuthContext } from "../types";
import { isDemoAuth } from "@/lib/demo/constants";
import {
  demoListAdGroups,
  demoListAds,
} from "@/lib/demo/reads";

export async function listAdGroups(
  auth: AuthContext,
  campaignId: string,
  limit = 50,
) {
  if (isDemoAuth(auth)) return demoListAdGroups(campaignId, limit);
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);
  const bounded = Math.min(Math.max(limit, 1), 100);

  const result = await customer.query(`
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group.status,
      ad_group.type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM ad_group
    WHERE campaign.id = ${id}
      AND ad_group.status != 'REMOVED'
    ORDER BY metrics.impressions DESC
    LIMIT ${bounded}
  `);

  return (result as any[]).map((row) => ({
    id: String(row.ad_group.id),
    name: row.ad_group.name ?? "Untitled ad group",
    status: row.ad_group.status ?? "UNKNOWN",
    type: row.ad_group.type ?? "UNKNOWN",
    impressions: row.metrics?.impressions ?? 0,
    clicks: row.metrics?.clicks ?? 0,
    cost: micros(row.metrics?.cost_micros),
    conversions: row.metrics?.conversions ?? 0,
  }));
}

export async function listAds(
  auth: AuthContext,
  campaignId: string,
  adGroupId?: string,
  days = 30,
  limit = 50,
) {
  if (isDemoAuth(auth)) return demoListAds(campaignId, adGroupId, days, limit);
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);
  const boundedDays = Math.min(Math.max(days, 1), 365);
  const bounded = Math.min(Math.max(limit, 1), 100);
  const { start, end } = getDateRange(boundedDays);

  const adGroupIdNum = adGroupId ? safeEntityId(adGroupId, "ad group") : null;
  const adGroupFilter = adGroupIdNum ? `AND ad_group.id = ${adGroupIdNum}` : "";

  const result = await customer.query(`
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.status,
      ad_group_ad.ad.type,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group_ad.ad_strength,
      ad_group.id,
      ad_group.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM ad_group_ad
    WHERE campaign.id = ${id}
      AND ad_group_ad.status != 'REMOVED'
      AND segments.date BETWEEN '${start}' AND '${end}'
      ${adGroupFilter}
    ORDER BY metrics.impressions DESC
    LIMIT ${bounded}
  `);

  return {
    campaignId,
    dateRange: { start, end, days: boundedDays },
    ads: (result as any[]).map((row) => {
      const ad = row.ad_group_ad?.ad ?? {};
      const rsa = ad.responsive_search_ad ?? {};
      return {
        adId: String(ad.id ?? ""),
        adName: ad.name ?? null,
        status: row.ad_group_ad?.status ?? "UNKNOWN",
        type: ad.type ?? "UNKNOWN",
        adGroupId: String(row.ad_group?.id ?? ""),
        adGroupName: row.ad_group?.name ?? "",
        finalUrls: ad.final_urls ?? [],
        headlines: (rsa.headlines ?? []).map((h: any) => h.text ?? ""),
        descriptions: (rsa.descriptions ?? []).map((d: any) => d.text ?? ""),
        adStrength: row.ad_group_ad?.ad_strength ?? null,
        impressions: row.metrics?.impressions ?? 0,
        clicks: row.metrics?.clicks ?? 0,
        cost: micros(row.metrics?.cost_micros),
        conversions: row.metrics?.conversions ?? 0,
      };
    }),
  };
}
