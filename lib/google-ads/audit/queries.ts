/**
 * Every GAQL string fired by the audit engine, extracted as named builder
 * functions so `runAudit` and narrow view tools share the exact same query
 * text. Shared query text means the Phase 5 cache coalesces across tools —
 * `getWasteFindings` and `runAudit` called in the same session hit one
 * upstream fetch per query, not two.
 *
 * Each function is pure — it takes date/window parameters and returns a
 * string. Snapshot-tested in `queries.test.ts` so any deliberate change is
 * reviewed explicitly.
 */

/** Q0: Account info + settings. */
export function queryAccountInfo(): string {
  return `
      SELECT
        customer.id, customer.descriptive_name, customer.currency_code,
        customer.time_zone, customer.auto_tagging_enabled,
        customer.tracking_url_template
      FROM customer LIMIT 1
    `;
}

/** Q1: All campaigns with IS, budget, network, bid strategy, values. */
export function queryCampaigns(start: string, end: string): string {
  return `
      SELECT
        campaign.id, campaign.name, campaign.status,
        campaign.advertising_channel_type, campaign.bidding_strategy_type,
        campaign.target_cpa.target_cpa_micros,
        campaign.network_settings.target_search_network,
        campaign.network_settings.target_content_network,
        campaign.geo_target_type_setting.positive_geo_target_type,
        campaign_budget.amount_micros,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions, metrics.conversions_value, metrics.all_conversions,
        metrics.search_impression_share,
        metrics.search_budget_lost_impression_share,
        metrics.search_rank_lost_impression_share
      FROM campaign
      WHERE campaign.status != 'REMOVED'
        AND segments.date BETWEEN '${start}' AND '${end}'
      ORDER BY metrics.cost_micros DESC
    `;
}

/** Q2: Geo targeting criteria (LOCATION + PROXIMITY). */
export function queryGeoTargeting(): string {
  return `
      SELECT
        campaign.id, campaign.name, campaign.status,
        campaign_criterion.type, campaign_criterion.negative,
        campaign_criterion.location.geo_target_constant,
        campaign_criterion.proximity.radius,
        campaign_criterion.proximity.radius_units
      FROM campaign_criterion
      WHERE campaign.status = 'ENABLED'
        AND campaign_criterion.type IN ('LOCATION', 'PROXIMITY')
    `;
}

/** Q3: Top keywords by spend (with metrics). */
export function queryKeywords(start: string, end: string): string {
  return `
      SELECT
        campaign.id, campaign.name, campaign.status,
        ad_group.id, ad_group.name,
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        metrics.impressions, metrics.clicks, metrics.ctr,
        metrics.cost_micros, metrics.average_cpc, metrics.conversions
      FROM keyword_view
      WHERE segments.date BETWEEN '${start}' AND '${end}'
        AND campaign.status = 'ENABLED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 2000
    `;
}

/** Q4: Quality score lookup table for all active keywords. */
export function queryQualityScores(): string {
  return `
      SELECT
        campaign.status,
        ad_group_criterion.criterion_id,
        ad_group_criterion.quality_info.quality_score,
        ad_group_criterion.quality_info.creative_quality_score,
        ad_group_criterion.quality_info.post_click_quality_score,
        ad_group_criterion.quality_info.search_predicted_ctr
      FROM ad_group_criterion
      WHERE campaign.status = 'ENABLED'
        AND ad_group_criterion.type = 'KEYWORD'
        AND ad_group_criterion.status != 'REMOVED'
    `;
}

/** Q5: Top search terms by spend. */
export function querySearchTerms(start: string, end: string): string {
  return `
      SELECT
        campaign.id, campaign.name, campaign.status,
        ad_group.id, ad_group.name,
        search_term_view.search_term, search_term_view.status,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions
      FROM search_term_view
      WHERE segments.date BETWEEN '${start}' AND '${end}'
        AND campaign.status = 'ENABLED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 2000
    `;
}

/** Q6: Converting search terms (used for mining + negative-conflict detection). */
export function queryConvertingSearchTerms(start: string, end: string): string {
  return `
      SELECT
        campaign.id, campaign.name, campaign.status,
        ad_group.id, ad_group.name,
        search_term_view.search_term,
        metrics.conversions, metrics.cost_micros, metrics.clicks
      FROM search_term_view
      WHERE segments.date BETWEEN '${start}' AND '${end}'
        AND campaign.status = 'ENABLED'
        AND metrics.conversions > 0
      ORDER BY metrics.conversions DESC
      LIMIT 500
    `;
}

/** Q7: Zero-conversion keywords (candidate waste). */
export function queryZeroConversionKeywords(start: string, end: string): string {
  return `
      SELECT
        campaign.id, campaign.name, campaign.status,
        ad_group.id, ad_group.name,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.criterion_id,
        metrics.clicks, metrics.cost_micros
      FROM keyword_view
      WHERE segments.date BETWEEN '${start}' AND '${end}'
        AND campaign.status = 'ENABLED'
        AND metrics.conversions = 0
      ORDER BY metrics.cost_micros DESC
      LIMIT 500
    `;
}

/** Q8: Ad copy + strength. */
export function queryAds(start: string, end: string): string {
  return `
      SELECT
        campaign.id, campaign.status,
        ad_group.name,
        ad_group_ad.ad.final_urls,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions,
        ad_group_ad.ad_strength, ad_group_ad.status,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions
      FROM ad_group_ad
      WHERE campaign.status = 'ENABLED'
        AND ad_group_ad.status != 'REMOVED'
        AND segments.date BETWEEN '${start}' AND '${end}'
      ORDER BY metrics.cost_micros DESC
      LIMIT 1000
    `;
}

/** Q9: Ad groups with per-group metrics. */
export function queryAdGroups(): string {
  return `
      SELECT
        campaign.id, campaign.status,
        ad_group.id, ad_group.name, ad_group.status,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions
      FROM ad_group
      WHERE campaign.status = 'ENABLED'
        AND ad_group.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 1000
    `;
}

/** Q10: Conversion actions. */
export function queryConversionActions(): string {
  // owner_customer + type let agents filter out read-only actions before
  // calling updateConversionAction. GA4-imported, Floodlight, Firebase, and
  // manager-owned actions return mutate_error=9 if mutated; selecting them
  // here lets a script skip them client-side instead of probing one at a time.
  return `
      SELECT
        conversion_action.id, conversion_action.name,
        conversion_action.category, conversion_action.type,
        conversion_action.status, conversion_action.counting_type,
        conversion_action.include_in_conversions_metric,
        conversion_action.primary_for_goal,
        conversion_action.owner_customer,
        conversion_action.value_settings.default_value
      FROM conversion_action
      WHERE conversion_action.status != 'REMOVED'
      ORDER BY conversion_action.name ASC
    `;
}

/** Q11: Audience segments (existence check only — LIMIT 1). */
export function queryAudienceSegmentCheck(): string {
  return `
      SELECT campaign.id, campaign.status, ad_group.id, ad_group_criterion.type
      FROM ad_group_criterion
      WHERE campaign.status = 'ENABLED'
        AND ad_group_criterion.type IN ('USER_LIST', 'CUSTOM_AUDIENCE', 'COMBINED_AUDIENCE')
      LIMIT 1
    `;
}

/** Q12: Device performance segmentation. */
export function queryDevicePerformance(start: string, end: string): string {
  return `
      SELECT
        campaign.id, campaign.status, segments.device,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions, metrics.conversions_value
      FROM campaign
      WHERE campaign.status = 'ENABLED'
        AND segments.date BETWEEN '${start}' AND '${end}'
      ORDER BY metrics.cost_micros DESC
    `;
}

/** Q13: Negative keywords per campaign. */
export function queryNegativeKeywords(): string {
  return `
      SELECT
        campaign.id, campaign.name, campaign.status,
        campaign_criterion.keyword.text,
        campaign_criterion.keyword.match_type
      FROM campaign_criterion
      WHERE campaign.status = 'ENABLED'
        AND campaign_criterion.type = 'KEYWORD'
        AND campaign_criterion.negative = TRUE
    `;
}

/** Q14: Network type segmentation (Search vs Search Partners vs Display). */
export function queryNetworkSegmentation(start: string, end: string): string {
  return `
      SELECT
        campaign.id, campaign.status, segments.ad_network_type,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions
      FROM campaign
      WHERE campaign.status = 'ENABLED'
        AND segments.date BETWEEN '${start}' AND '${end}'
    `;
}

/** Q15: Campaign assets / extensions. */
export function queryCampaignAssets(): string {
  return `
      SELECT
        campaign.id, campaign.name, campaign.status,
        campaign_asset.field_type
      FROM campaign_asset
      WHERE campaign.status = 'ENABLED'
    `;
}

/** Q16: Landing page performance. */
export function queryLandingPages(start: string, end: string): string {
  return `
      SELECT
        campaign.status,
        landing_page_view.unexpanded_final_url,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions
      FROM landing_page_view
      WHERE segments.date BETWEEN '${start}' AND '${end}'
        AND campaign.status = 'ENABLED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 200
    `;
}

/**
 * Q17: Account changes via `change_event`. Google Ads caps this at 30 rolling
 * days; callers must tighten `start` to the window they want inside that cap.
 * Filter uses `>=`/`<=` (BETWEEN is not supported for change_date_time) and
 * requires `ORDER BY change_date_time DESC`.
 */
export function queryChangeEvents(start: string, end: string): string {
  return `
      SELECT
        change_event.change_date_time,
        change_event.change_resource_type,
        change_event.resource_name,
        change_event.client_type,
        change_event.user_email,
        change_event.changed_fields,
        change_event.resource_change_operation,
        change_event.campaign,
        change_event.ad_group
      FROM change_event
      WHERE change_event.change_date_time >= '${start} 00:00:00'
        AND change_event.change_date_time <= '${end} 23:59:59'
      ORDER BY change_event.change_date_time DESC
      LIMIT 10000
    `;
}

/** Q18: Per-day per-campaign metrics for pre/post-change splits. */
export function queryDailyCampaignMetrics(start: string, end: string): string {
  return `
      SELECT
        campaign.id, segments.date,
        metrics.cost_micros, metrics.clicks, metrics.conversions
      FROM campaign
      WHERE campaign.status != 'REMOVED'
        AND segments.date BETWEEN '${start}' AND '${end}'
    `;
}
