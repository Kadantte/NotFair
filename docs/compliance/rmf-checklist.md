# Google Ads RMF Compliance Checklist — NotFair

**Tool classification:** Full-Service Tool (creates and manages Google Ads campaigns for third-party advertisers via the MCP-driven chat agent).

**Access level targeted:** Standard (RMF only applies to Standard Access).

**As-of commit:** `9e3be69` + reporting-field fixes (pending commit) · last reviewed 2026-04-14.

**Legend:** ✅ implemented · ⚠️ partial (see note) · ❌ not implemented · n/a not applicable to our tool.

---

## Summary

| Category | Implemented | Partial | Missing |
|---|---|---|---|
| Creation (C.*) | 13 / 13 | 0 | 0 |
| Management (M.*) | 7 / 7 | 0 | 0 |
| Reporting (R.*) | 7 / 7 | 0 | 0 |
| Cross-cutting policies | 4 / 5 | 1 | 0 |

**Outstanding items:** only the bid review-before-apply UX verification (cross-cutting ⚠️) remains. All Creation / Management / Reporting items are fully implemented.

---

## Creation Functionality

| Item | Functionality | API resource / field | Status | Implementation |
|---|---|---|---|---|
| **C.10** | Create campaign | `campaign` | ✅ | `createCampaign` MCP tool → `lib/google-ads/campaign-ops.ts:createSearchCampaign` |
| **C.20** | Geo targeting | `campaign_criterion.location` / Location Targeting | ✅ | `createCampaign(geoTargetIds)` at create time; `updateCampaignSettings.locationTargeting` at edit time |
| **C.30** | Language targeting | `campaign_criterion.language` / `language_constant` | ✅ | `createCampaign(languageIds)` at create time; `updateCampaignLanguages` at edit time |
| **C.65** | Conversion tracking | Conversion Tracking (`conversion_action`) | ✅ | `createConversionAction` MCP tool |
| **C.75** | Callout extensions (account level) | `asset.callout_asset` + `customer_asset` | ✅ | `createCalloutAsset`, `linkCalloutToAccount`, `removeCalloutFromAccount`, `listCalloutAssets` |
| **C.96** | Target CPA — **Standard and Portfolio** | `campaign.target_cpa` (Std); `bidding_strategy.target_cpa` (Port) | ✅ | Standard: `updateCampaignBidding`. Portfolio: `createBiddingStrategy` + `linkCampaignToBiddingStrategy` |
| **C.97** | Target ROAS — **Standard and Portfolio** | `campaign.target_roas` (Std); `bidding_strategy.target_roas` (Port) | ✅ | Same tools as C.96 with `type: "TARGET_ROAS"` |
| **C.98** | Maximize Conversions (Standard) | `campaign.maximize_conversions` | ✅ | `updateCampaignBidding` with `biddingStrategy: "MAXIMIZE_CONVERSIONS"` |
| **C.120** | Set budget | `campaign_budget` | ✅ | `createCampaign` (create-time) + `updateCampaignBudget` (edit-time) |
| **C.190** | Create ad group | `ad_group` | ✅ | `createAdGroup` MCP tool; `createCampaign` also creates an initial ad group |
| **C.260** | Add keyword | `ad_group_criterion.keyword` | ✅ | `addKeyword`, `bulkAddKeywords` |
| **C.270** | Campaign negative keywords | `campaign_criterion.negative` | ✅ | `addNegativeKeyword`, `removeNegativeKeyword` |
| **C.300** | Keyword match type | `ad_group_criterion.keyword.match_type` | ✅ | `matchType` parameter on `addKeyword`, `bulkAddKeywords`, `moveKeywords` (BROAD / PHRASE / EXACT) |

---

## Management Functionality

| Item | Functionality | API resource / field | Status | Implementation |
|---|---|---|---|---|
| **M.10** | Edit campaign settings | `campaign.*setting` | ✅ | `updateCampaignSettings` (networks, locations), `renameCampaign`, `updateCampaignLanguages`, `updateCampaignBudget`, `updateCampaignBidding`, `updateCampaignGoals` |
| **M.96** | Edit Target CPA — **Standard and Portfolio** | `campaign.target_cpa` / `bidding_strategy.target_cpa` | ✅ | Standard: `updateCampaignBidding`. Portfolio: `updateBiddingStrategy` + `linkCampaignToBiddingStrategy` |
| **M.97** | Edit Target ROAS — **Standard and Portfolio** | `campaign.target_roas` / `bidding_strategy.target_roas` | ✅ | Same tools as M.96 with ROAS params |
| **M.98** | Edit Maximize Conversions (Standard) | `campaign.maximize_conversions` | ✅ | `updateCampaignBidding` |
| **M.110** | Pause / enable / remove campaign | `campaign.status` | ✅ | `pauseCampaign`, `enableCampaign`, `removeCampaign` |
| **M.130** | Pause / enable / remove ad | `ad_group_ad.status` | ✅ | `pauseAd`, `enableAd`, `removeAd` |
| **M.140** | Pause / enable / remove keyword | `ad_group_criterion.status` | ✅ | `pauseKeyword`, `enableKeyword`, `removeKeyword`, `bulkPauseKeywords` |

---

## Reporting Functionality

| Item | Functionality | Required fields | Status | Implementation / Notes |
|---|---|---|---|---|
| **R.10** | Customer (account) | `metrics.clicks`, `cost_micros`, `impressions`, `conversions`, `all_conversions` | ✅ | `getAccountInfo` + `getCampaignPerformance` (aggregate); `all_conversions` selected in `listCampaigns` + `queryPerformanceRows` |
| **R.20** | Campaign | `clicks`, `cost_micros`, `impressions`, `conversions`, `all_conversions`, `campaign.status` (if showing removed) | ✅ | `listCampaigns` + `getCampaignPerformance` — all required fields returned; campaign status exposed |
| **R.40** | Ad Group Ad | `clicks`, `cost_micros`, `impressions`, `conversions`, `ad_group_ad.status` (if showing removed) | ✅ | `listAds` MCP tool |
| **R.50** | Keyword View | `clicks`, `cost_micros`, `impressions`, `conversions`, `position_estimates.first_page_cpc_micros`, `position_estimates.first_position_cpc_micros`, status | ✅ | `getKeywords` — returns `firstPageCpc` and `firstPositionCpc` (may be null for low-volume keywords where Google hasn't computed an estimate yet — that's an API behavior, not a coverage gap) |
| **R.70** | Search Term View | `search_term_view.search_term`, `segments.search_term_match_type`, `clicks`, `cost_micros`, `impressions` | ✅ | `getSearchTermReport` — returns `matchType` per search term |
| **R.100** | Dynamic Search Ads Search Term View | DSA-only | n/a | We do not create or manage DSA campaigns. |
| **R.130** | Bidding Strategy | `bidding_strategy.type`, `clicks`, `cost_micros`, `cost_per_conversion`, `impressions`, `average_cpc`, `conversions`, `bidding_strategy.status` (if showing removed) | ✅ | `getBiddingStrategyPerformance` MCP tool (added with portfolio bidding work) |

---

## Cross-cutting policy requirements

| Requirement | Source section | Status | How we satisfy it |
|---|---|---|---|
| **Feature accessibility** — every required feature is easily accessible to end users | "Requirements for API Clients providing Creation / Management" | ✅ | Exposed in the in-app chat (`/chat`) via natural-language prompts; example prompts surfaced through the "Google Ads MCP tools" pill that lists every tool with a description |
| **Bid adjustments — allow full range of values** | "Requirements for Bid Adjustments" #1 | ✅ | `updateBid`, `updateCampaignBidding`, `updateBiddingStrategy` accept the full `micros` / dollar range; no artificial caps beyond the API minimum of $0.10 CPA |
| **Bid adjustments — review and edit before apply** | "Requirements for Bid Adjustments" #2 | ⚠️ | The chat agent presents proposed changes before executing write tools. **Verify:** ensure every write tool call in `/chat` shows a preview card with Confirm / Cancel before the tool fires — behavior lives in `lib/agents/google-ads-agent.ts` and the chat message renderer |
| **Bid adjustments only represent bid adjustments** (not used to approximate targeting/exclusion) | "Requirements for Bid Adjustments" #3 | ✅ | Bid tools operate on `ad_group_criterion.cpc_bid_micros` and bidding strategy fields only; never used as pseudo-targeting |
| **Planning service** — if KeywordPlanIdeaService / KeywordPlanService is used, all RMF Required items must be implemented | "Requirements for API Clients Providing Planning Services" | ✅ | We expose `getKeywordIdeas` (KeywordPlanIdeaService). As a Full-Service Tool we already implement all Required items (subject to the three R.* gaps above). |
| **Recommendation service** — if `ApplyRecommendation` / `DismissRecommendation` is used, must label as "Google Ads Recommendations" and let users view+apply all | "Requirements for API Clients Providing Recommendation Service" | n/a | We use `getRecommendations` (read only). We do **not** call `applyRecommendation` or `dismissRecommendation`, so the labeling/visibility rules don't bind us. Read-only use of `RecommendationService` is permitted for all client types. |

---

## Campaign types we create / manage

We only create and manage **Search campaigns** via `createSearchCampaign`. Other tables in the RMF policy are therefore non-binding:

| Feature list | Applies to NotFair? |
|---|---|
| Full-service Tool Feature List (Search / generic) | ✅ — this is our primary coverage (tables above) |
| App campaign Feature List | n/a — we do not create app campaigns |
| Hotel-only Feature List | n/a |
| Performance Max Feature List | ⚠️ Partial — we expose `pausePmaxAssetGroup` / `enablePmaxAssetGroup` / `getPmaxAssetGroups` / `getPmaxAssets` for users who already have PMax campaigns, but we do **not** create PMax campaigns. If we add PMax creation, PMax C.10 / C.20 / C.30 / C.65 / C.120 / M.10 / M.110 / R.10 / R.20 must be implemented at that time. |
| Smart Campaign Feature List | n/a — we do not create Smart campaigns |
| Standard Shopping Feature List | n/a — we do not create Shopping campaigns |

---

## Pre-submission action items

Only one item remains before the compliance reply is ready:

1. **Verify the chat confirmation step** actually renders a preview+Confirm UI for every write tool (especially `updateBid`, `updateCampaignBudget`, `updateCampaignBidding`, `createBiddingStrategy`, `updateBiddingStrategy`). Record a screen capture as evidence for the submission.

Once the chat confirmation step is documented, NotFair is fully RMF-compliant for a Full-Service Tool with Standard access — no disclosed gaps, no past-due items, no open policy violations.
