import { getCachedCustomer } from "../client";
import { micros, safeEntityId } from "../helpers";
import type { AuthContext } from "../types";

/** Fetch Smart campaign ads (basic fields only).
 *  Per Google Ads API docs, Smart campaign ad copy (headlines/descriptions) is NOT
 *  available through GAQL reporting — only campaign-level metrics and
 *  smart_campaign_search_term_view are supported for Smart campaigns.
 *  We still query ad_group_ad for basic info (id, status, final_urls). */
export async function getSmartCampaignAds(
  auth: AuthContext,
  campaignId: string,
) {
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);

  const result = await customer.query(`
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.status,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad.type,
      ad_group.id,
      ad_group.name
    FROM ad_group_ad
    WHERE campaign.id = ${id}
      AND ad_group_ad.status != 'REMOVED'
    LIMIT 50
  `);

  return (result as any[]).map((row) => {
    const ad = row.ad_group_ad?.ad ?? {};
    return {
      adId: String(ad.id ?? ""),
      adName: ad.name ?? null,
      status: row.ad_group_ad?.status ?? "UNKNOWN",
      type: "SMART_CAMPAIGN_AD",
      adGroupId: String(row.ad_group?.id ?? ""),
      adGroupName: row.ad_group?.name ?? "",
      finalUrls: ad.final_urls ?? [],
      headlines: [] as string[],
      descriptions: [] as string[],
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
    };
  });
}

/** Fetch search terms that triggered a Smart campaign's ads.
 *  Uses smart_campaign_search_term_view (not standard search_term_view). */
export async function getSmartCampaignSearchTerms(
  auth: AuthContext,
  campaignId: string,
) {
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);

  const result = await customer.query(`
    SELECT
      smart_campaign_search_term_view.search_term,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros
    FROM smart_campaign_search_term_view
    WHERE campaign.id = ${id}
      AND segments.date DURING LAST_30_DAYS
    ORDER BY metrics.impressions DESC
    LIMIT 50
  `);

  return (result as any[]).map((row) => ({
    searchTerm: row.smart_campaign_search_term_view?.search_term ?? "",
    impressions: row.metrics?.impressions ?? 0,
    clicks: row.metrics?.clicks ?? 0,
    cost: micros(row.metrics?.cost_micros),
  }));
}

export async function getSmartCampaignKeywordThemes(
  auth: AuthContext,
  campaignId: string,
) {
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);

  const result = await customer.query(`
    SELECT
      campaign_criterion.criterion_id,
      campaign_criterion.keyword_theme.free_form_keyword_theme,
      campaign_criterion.keyword_theme.keyword_theme_constant,
      campaign_criterion.status
    FROM campaign_criterion
    WHERE campaign.id = ${id}
      AND campaign_criterion.type = 'KEYWORD_THEME'
      AND campaign_criterion.status != 'REMOVED'
    ORDER BY campaign_criterion.criterion_id ASC
  `);

  return (result as any[]).map((row) => {
    const cc = row.campaign_criterion ?? {};
    const theme = cc.keyword_theme ?? {};
    // Prefer free-form text; fall back to the last segment of the constant resource name
    const text = theme.free_form_keyword_theme
      || (theme.keyword_theme_constant
          ? String(theme.keyword_theme_constant).split("/").pop() ?? "Unknown theme"
          : "Unknown theme");
    return {
      criterionId: String(cc.criterion_id ?? ""),
      text,
      isFreeForm: Boolean(theme.free_form_keyword_theme),
      status: cc.status ?? "UNKNOWN",
    };
  });
}

export async function getSmartCampaignSetting(
  auth: AuthContext,
  campaignId: string,
) {
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);

  const result = await customer.query(`
    SELECT
      smart_campaign_setting.final_url,
      smart_campaign_setting.business_name,
      smart_campaign_setting.phone_number.phone_number,
      smart_campaign_setting.phone_number.country_code
    FROM smart_campaign_setting
    WHERE campaign.id = ${id}
    LIMIT 1
  `);

  const row = (result as any[])[0];
  if (!row) return null;
  const s = row.smart_campaign_setting ?? {};
  return {
    finalUrl: s.final_url ?? null,
    businessName: s.business_name ?? null,
    phoneNumber: s.phone_number?.phone_number ?? null,
  };
}
