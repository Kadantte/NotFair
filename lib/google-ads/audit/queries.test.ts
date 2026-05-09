import { describe, expect, it } from "vitest";
import {
  queryAccountInfo,
  queryCampaigns,
  queryGeoTargeting,
  queryKeywords,
  queryQualityScores,
  querySearchTerms,
  queryConvertingSearchTerms,
  queryZeroConversionKeywords,
  queryAds,
  queryAdGroups,
  queryConversionActions,
  queryAudienceSegmentCheck,
  queryDevicePerformance,
  queryNegativeKeywords,
  queryNetworkSegmentation,
  queryCampaignAssets,
  queryAdGroupAssets,
  querySharedNegativeKeywordLists,
  querySharedNegativeKeywordMembers,
  queryPausedCampaigns,
  queryCustomerManagerLinks,
  queryLandingPages,
  queryChangeEvents,
  queryDailyCampaignMetrics,
} from "./queries";

// Snapshot each query's exact text so deliberate changes are reviewed
// explicitly and accidental edits fail CI.

describe("audit queries", () => {
  it("queryAccountInfo — matches snapshot", () => {
    expect(queryAccountInfo()).toMatchSnapshot();
  });

  it("queryCampaigns — substitutes date range", () => {
    expect(queryCampaigns("2026-01-01", "2026-01-30")).toMatchSnapshot();
  });

  it("queryGeoTargeting — matches snapshot", () => {
    expect(queryGeoTargeting()).toMatchSnapshot();
  });

  it("queryKeywords — date range + LIMIT 2000", () => {
    const q = queryKeywords("2026-01-01", "2026-01-30");
    expect(q).toMatchSnapshot();
    expect(q).toContain("LIMIT 2000");
    // keyword_view returns positives AND ad-group negatives — the audit must filter
    // to positives or it surfaces negatives as zombie keywords. See
    // docs/ads-api-landmines.md.
    expect(q).toContain("ad_group_criterion.negative = FALSE");
  });

  it("queryQualityScores — matches snapshot", () => {
    expect(queryQualityScores()).toMatchSnapshot();
  });

  it("querySearchTerms — date range + LIMIT 2000", () => {
    const q = querySearchTerms("2026-01-01", "2026-01-30");
    expect(q).toMatchSnapshot();
    expect(q).toContain("LIMIT 2000");
  });

  it("queryConvertingSearchTerms — LIMIT 500, conversions > 0", () => {
    const q = queryConvertingSearchTerms("2026-01-01", "2026-01-30");
    expect(q).toMatchSnapshot();
    expect(q).toContain("metrics.conversions > 0");
    expect(q).toContain("LIMIT 500");
  });

  it("queryZeroConversionKeywords — LIMIT 500, conversions = 0", () => {
    const q = queryZeroConversionKeywords("2026-01-01", "2026-01-30");
    expect(q).toMatchSnapshot();
    expect(q).toContain("metrics.conversions = 0");
    expect(q).toContain("LIMIT 500");
    // Without this predicate every ad-group negative would match conversions=0
    // (negatives block serving so accumulate 0 of every metric by definition).
    expect(q).toContain("ad_group_criterion.negative = FALSE");
  });

  it("queryAds — date range + LIMIT 1000", () => {
    expect(queryAds("2026-01-01", "2026-01-30")).toMatchSnapshot();
  });

  it("queryAdGroups — LIMIT 1000", () => {
    const q = queryAdGroups();
    expect(q).toMatchSnapshot();
    expect(q).toContain("LIMIT 1000");
  });

  it("queryConversionActions — ORDER BY name", () => {
    expect(queryConversionActions()).toMatchSnapshot();
  });

  it("queryAudienceSegmentCheck — LIMIT 1 (existence check only)", () => {
    const q = queryAudienceSegmentCheck();
    expect(q).toMatchSnapshot();
    expect(q).toContain("LIMIT 1");
  });

  it("queryDevicePerformance — date range", () => {
    expect(queryDevicePerformance("2026-01-01", "2026-01-30")).toMatchSnapshot();
  });

  it("queryNegativeKeywords — filters to negative = TRUE", () => {
    const q = queryNegativeKeywords();
    expect(q).toMatchSnapshot();
    expect(q).toContain("negative = TRUE");
  });

  it("queryNetworkSegmentation — date range", () => {
    expect(queryNetworkSegmentation("2026-01-01", "2026-01-30")).toMatchSnapshot();
  });

  it("queryCampaignAssets — matches snapshot", () => {
    expect(queryCampaignAssets()).toMatchSnapshot();
  });

  it("queryAdGroupAssets — matches snapshot", () => {
    expect(queryAdGroupAssets()).toMatchSnapshot();
  });

  it("querySharedNegativeKeywordLists — filters shared negative lists", () => {
    const q = querySharedNegativeKeywordLists();
    expect(q).toMatchSnapshot();
    expect(q).toContain("shared_set.type = 'NEGATIVE_KEYWORDS'");
  });

  it("querySharedNegativeKeywordMembers — reads shared negative keywords", () => {
    const q = querySharedNegativeKeywordMembers();
    expect(q).toMatchSnapshot();
    expect(q).toContain("FROM shared_criterion");
  });

  it("queryPausedCampaigns — exposes paused campaigns", () => {
    const q = queryPausedCampaigns();
    expect(q).toMatchSnapshot();
    expect(q).toContain("campaign.status = 'PAUSED'");
  });

  it("queryCustomerManagerLinks — exposes manager access", () => {
    const q = queryCustomerManagerLinks();
    expect(q).toMatchSnapshot();
    expect(q).toContain("FROM customer_manager_link");
  });

  it("queryLandingPages — LIMIT 200", () => {
    const q = queryLandingPages("2026-01-01", "2026-01-30");
    expect(q).toMatchSnapshot();
    expect(q).toContain("LIMIT 200");
  });

  it("queryChangeEvents — uses >= / <= (BETWEEN not supported), ORDER BY DESC, LIMIT 500", () => {
    const q = queryChangeEvents("2099-01-01", "2099-01-30");
    expect(q).toMatchSnapshot();
    expect(q).toContain("change_event.change_date_time >= '2099-01-01 00:00:00'");
    expect(q).toContain("change_event.change_date_time <= '2099-01-30 23:59:59'");
    expect(q).toContain("ORDER BY change_event.change_date_time DESC");
    expect(q).toContain("LIMIT 500");
    expect(q).not.toContain("LIMIT 10000");
    expect(q).not.toContain("BETWEEN");
  });

  it("queryChangeEvents — clamps old starts to Google's rolling 30-day window", () => {
    const q = queryChangeEvents("2026-01-01", "2099-01-30");
    expect(q).not.toContain("change_event.change_date_time >= '2026-01-01 00:00:00'");
    expect(q).toMatch(/change_event\.change_date_time >= '\d{4}-\d{2}-\d{2} 00:00:00'/);
  });

  it("queryDailyCampaignMetrics — date range", () => {
    expect(queryDailyCampaignMetrics("2026-01-01", "2026-01-30")).toMatchSnapshot();
  });
});
