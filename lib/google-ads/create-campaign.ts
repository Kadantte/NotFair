/**
 * Unified campaign creation entry point.
 *
 * All 7 campaign types (SEARCH, SHOPPING, PERFORMANCE_MAX, DEMAND_GEN,
 * DISPLAY, VIDEO, APP) are created through the single `createCampaign`
 * function, dispatched by the `campaignType` discriminator.
 *
 * Each builder follows the atomic-batch pattern:
 *   1. Validate inputs → return { success: false, error } on bad input
 *   2. Build all operations with temp resource names
 *   3. Single mutateResources call
 *   4. Extract IDs from response, with query fallback
 *   5. Return typed result
 *
 * All campaigns start PAUSED. Call enableCampaign to go live.
 *
 * Enum values verified against google-ads-node v22 protos:
 *   AdvertisingChannelType: SEARCH=2, DISPLAY=3, SHOPPING=4, VIDEO=6,
 *     MULTI_CHANNEL=7, PERFORMANCE_MAX=10, DEMAND_GEN=14
 *   AdvertisingChannelSubType: APP_CAMPAIGN=12
 *   AdGroupType: SEARCH_STANDARD=2, DISPLAY_STANDARD=3, SHOPPING_PRODUCT_ADS=4,
 *     VIDEO_TRUE_VIEW_IN_STREAM=9
 *   AssetFieldType: HEADLINE=2, DESCRIPTION=3, YOUTUBE_VIDEO=7,
 *     LONG_HEADLINE=17, BUSINESS_NAME=18
 *   AssetGroupStatus: ENABLED=2
 *   MobileAppVendor: APPLE_APP_STORE=2, GOOGLE_APP_STORE=3
 *   AppCampaignBiddingStrategyGoalType:
 *     OPTIMIZE_INSTALLS_TARGET_INSTALL_COST=2,
 *     OPTIMIZE_INSTALLS_WITHOUT_TARGET_INSTALL_COST=7
 *   ProductTypeLevel: LEVEL1=7, LEVEL2=8, ..., LEVEL5=11
 *   ProductCustomAttributeIndex: INDEX0=7, INDEX1=8, ..., INDEX4=11
 */

import { getCachedCustomer, getCustomer, AD_GROUP_TYPE, MATCH_TYPE, STATUS } from "./client";
import {
  extractErrorMessage,
  extractPolicyRejection,
  getPolicyRetryBlock,
  normalizeCustomerId,
  recordPolicyFailure,
  toMicros,
  validateRsaAssets,
} from "./helpers";
import type { AuthContext, PolicyRejectionDetails } from "./types";
import type { ShoppingInventoryFilter } from "./campaign-ops";

// ─── Campaign type discriminator ──────────────────────────────────────

export type CampaignType =
  | "SEARCH"
  | "SHOPPING"
  | "PERFORMANCE_MAX"
  | "DEMAND_GEN"
  | "DISPLAY"
  | "VIDEO"
  | "APP";

// ─── Shared param shapes ──────────────────────────────────────────────

type SharedParams = {
  campaignName: string;
  dailyBudgetDollars: number;
  geoTargetIds?: string[];
  languageIds?: string[];
};

// ─── Per-type param shapes ────────────────────────────────────────────

export type SearchCampaignParams = SharedParams & {
  campaignType: "SEARCH";
  keywords: string[];
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  bidding?: {
    strategy?: "MAXIMIZE_CONVERSIONS" | "MAXIMIZE_CLICKS" | "MANUAL_CPC";
    defaultCpcDollars?: number;
  };
  keywordMatchType?: "BROAD" | "PHRASE" | "EXACT";
};

export type ShoppingCampaignParams = SharedParams & {
  campaignType: "SHOPPING";
  merchantId: number;
  salesCountry: string;
  campaignPriority?: 0 | 1 | 2;
  enableLocal?: boolean;
  searchPartners?: boolean;
  bidding?: {
    strategy?: "MANUAL_CPC" | "TARGET_ROAS" | "MAXIMIZE_CLICKS";
    defaultCpcDollars?: number;
    targetRoas?: number;
  };
  inventoryFilter?: ShoppingInventoryFilter[];
};

export type PerformanceMaxCampaignParams = SharedParams & {
  campaignType: "PERFORMANCE_MAX";
  finalUrl: string;
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
  businessName: string;
  bidding?: {
    strategy?: "MAXIMIZE_CONVERSIONS" | "MAXIMIZE_CONVERSION_VALUE";
    targetCpaDollars?: number;
    targetRoas?: number;
  };
  merchantId?: string | number;
  salesCountry?: string;
};

export type DemandGenCampaignParams = SharedParams & {
  campaignType: "DEMAND_GEN";
  finalUrl: string;
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
  businessName: string;
  bidding?: {
    strategy?: "MAXIMIZE_CONVERSIONS" | "MAXIMIZE_CONVERSION_VALUE";
    targetCpaDollars?: number;
    targetRoas?: number;
  };
};

export type DisplayCampaignParams = SharedParams & {
  campaignType: "DISPLAY";
  finalUrl: string;
  headlines: string[];
  longHeadline: string;
  descriptions: string[];
  businessName: string;
  marketingImageAssetId: string;
  squareMarketingImageAssetId: string;
  logoImageAssetId?: string;
  adGroupName?: string;
  bidding?: {
    strategy?: "MAXIMIZE_CONVERSIONS" | "MAXIMIZE_CLICKS" | "MANUAL_CPC";
    defaultCpcDollars?: number;
    targetCpaDollars?: number;
  };
};

export type VideoCampaignParams = SharedParams & {
  campaignType: "VIDEO";
  youtubeVideoId: string;
  finalUrl: string;
  headline: string;
  longHeadline?: string;
  description?: string;
  adName?: string;
  callToAction?: string;
  bidding?: {
    strategy?: "TARGET_CPV" | "MAXIMIZE_CONVERSIONS";
    targetCpvDollars?: number;
    targetCpaDollars?: number;
  };
};

export type AppCampaignParams = SharedParams & {
  campaignType: "APP";
  appId: string;
  appStore: "GOOGLE_APP_STORE" | "APPLE_APP_STORE";
  finalUrl: string;
  headlines: string[];
  descriptions: string[];
  businessName?: string;
  bidding?: {
    strategy?: "TARGET_CPA" | "MAXIMIZE_CONVERSIONS";
    targetCpaDollars?: number;
  };
};

export type CreateCampaignParams =
  | SearchCampaignParams
  | ShoppingCampaignParams
  | PerformanceMaxCampaignParams
  | DemandGenCampaignParams
  | DisplayCampaignParams
  | VideoCampaignParams
  | AppCampaignParams;

// ─── Result type ──────────────────────────────────────────────────────

export type CreateCampaignResult = {
  success: boolean;
  campaignType: CampaignType;
  campaignName: string;
  campaignId?: string;
  /** Set for ad-group–based campaigns (SEARCH, SHOPPING, DEMAND_GEN, DISPLAY, VIDEO). */
  adGroupId?: string;
  /** Set for asset-group–based campaigns (PERFORMANCE_MAX, APP). */
  assetGroupId?: string;
  dailyBudget?: number;
  biddingStrategy?: string;
  keywordCount?: number;
  textAssetCount?: number;
  merchantId?: number;
  salesCountry?: string;
  inventoryFilterApplied?: boolean;
  error?: string;
  policy?: PolicyRejectionDetails;
};

// ─── Shared helpers ───────────────────────────────────────────────────

function campaignPolicyTexts(params: CreateCampaignParams): string[] {
  const texts = [params.campaignName];
  if ("finalUrl" in params) texts.push(params.finalUrl);
  if ("keywords" in params) texts.push(...params.keywords);
  if ("headlines" in params) texts.push(...params.headlines);
  if ("longHeadline" in params && params.longHeadline) texts.push(params.longHeadline);
  if ("longHeadlines" in params) texts.push(...params.longHeadlines);
  if ("descriptions" in params && params.descriptions) texts.push(...params.descriptions);
  if ("businessName" in params && params.businessName) texts.push(params.businessName);
  if ("youtubeVideoId" in params && params.youtubeVideoId) texts.push(params.youtubeVideoId);
  if ("appId" in params && params.appId) texts.push(params.appId);
  return texts;
}

function campaignPolicyErrorFields(
  auth: AuthContext,
  params: CreateCampaignParams,
  error: unknown,
): Pick<CreateCampaignResult, "error" | "policy"> {
  const policy = extractPolicyRejection(error);
  if (policy) recordPolicyFailure(auth, "createCampaign", campaignPolicyTexts(params), policy);
  return {
    error: policy?.message ?? extractErrorMessage(error),
    ...(policy ? { policy } : {}),
  };
}

/** Normalize a geo target input to a full resource name. */
function toGeoTargetConstant(input: string): string {
  const trimmed = input.trim();
  return trimmed.startsWith("geoTargetConstants/") ? trimmed : `geoTargetConstants/${trimmed}`;
}

/** Normalize a language input to a full resource name. */
function toLanguageConstant(input: string): string {
  const trimmed = input.trim();
  return trimmed.startsWith("languageConstants/") ? trimmed : `languageConstants/${trimmed}`;
}

// AssetFieldType enum values verified from v22 protos
const ASSET_FIELD_TYPE = {
  HEADLINE: 2,
  DESCRIPTION: 3,
  YOUTUBE_VIDEO: 7,
  LONG_HEADLINE: 17,
  BUSINESS_NAME: 18,
} as const;

// Proto enum values verified against google-ads-node v22 protos.
// ProductTypeLevel: LEVEL1=7, LEVEL2=8, ..., LEVEL5=11
// ProductCustomAttributeIndex: INDEX0=7, INDEX1=8, ..., INDEX4=11
const PRODUCT_TYPE_LEVEL_MAP: Record<number, number> = { 1: 7, 2: 8, 3: 9, 4: 10, 5: 11 };
const CUSTOM_ATTRIBUTE_INDEX_MAP: Record<number, number> = { 0: 7, 1: 8, 2: 9, 3: 10, 4: 11 };

type CampaignOp = { entity: string; operation: string; resource: Record<string, unknown> };

function buildBudgetOp(cid: string, campaignName: string, dailyBudgetDollars: number): CampaignOp {
  return {
    entity: "campaign_budget",
    operation: "create",
    resource: {
      resource_name: `customers/${cid}/campaignBudgets/-1`,
      name: `${campaignName} Budget`,
      amount_micros: toMicros(dailyBudgetDollars),
      delivery_method: 2, // STANDARD
      explicitly_shared: false,
    },
  };
}

function buildGeoCriteriaOps(campaignTemp: string, geoTargetIds?: string[]): CampaignOp[] {
  return (geoTargetIds ?? []).map((geo) => ({
    entity: "campaign_criterion",
    operation: "create",
    resource: {
      campaign: campaignTemp,
      negative: false,
      location: { geo_target_constant: toGeoTargetConstant(geo) },
    } as Record<string, unknown>,
  }));
}

function buildLanguageCriteriaOps(campaignTemp: string, languageIds?: string[]): CampaignOp[] {
  return (languageIds ?? []).map((lang) => ({
    entity: "campaign_criterion",
    operation: "create",
    resource: {
      campaign: campaignTemp,
      language: { language_constant: toLanguageConstant(lang) },
    } as Record<string, unknown>,
  }));
}

/**
 * Build interleaved asset + asset_group_asset operations for text assets.
 */
function buildTextAssetOps(
  cid: string,
  assetGroupTemp: string,
  textAssets: Array<{ text: string; fieldType: number }>,
  startIndex = -100,
): CampaignOp[] {
  const ops: CampaignOp[] = [];
  let idx = startIndex;
  for (const { text, fieldType } of textAssets) {
    const assetTemp = `customers/${cid}/assets/${idx}`;
    idx--;
    ops.push({
      entity: "asset",
      operation: "create",
      resource: { resource_name: assetTemp, text_asset: { text } },
    });
    ops.push({
      entity: "asset_group_asset",
      operation: "create",
      resource: { asset_group: assetGroupTemp, asset: assetTemp, field_type: fieldType },
    });
  }
  return ops;
}

/**
 * Normalize an asset ID to a full resource name.
 * Accepts bare numeric ID or full "customers/.../assets/..." resource name.
 */
function normalizeAssetId(cid: string, id: string): string {
  return id.startsWith("customers/") ? id : `customers/${cid}/assets/${id}`;
}

/**
 * Extract campaign ID from mutate response, with query fallback.
 * Campaign is always at response index 1.
 */
async function extractCampaignId(
  customer: ReturnType<typeof getCustomer>,
  responses: unknown[],
  campaignName: string,
): Promise<string> {
  const r = responses as Array<Record<string, unknown>>;
  const campaignResourceName = (r[1] as any)?.campaign_result?.resource_name as string | undefined;
  const fromResponse = campaignResourceName?.split("/").pop();
  if (fromResponse) return fromResponse;

  // Fallback: query by name
  const queryResult = await customer.query(`
    SELECT campaign.id, campaign.name
    FROM campaign
    WHERE campaign.status = 'PAUSED'
    ORDER BY campaign.id DESC
    LIMIT 10
  `);
  const match = (queryResult as any[]).find((row) => row.campaign?.name === campaignName);
  return String(match?.campaign?.id ?? "unknown");
}

// ─── Per-type builders ────────────────────────────────────────────────

async function buildSearchResources(
  auth: AuthContext,
  params: SearchCampaignParams,
): Promise<CreateCampaignResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  // Validation
  const rsaError = validateRsaAssets(params.headlines, params.descriptions);
  if (rsaError) return { success: false, campaignType: "SEARCH", campaignName: params.campaignName, error: rsaError };
  if (params.dailyBudgetDollars < 1)
    return { success: false, campaignType: "SEARCH", campaignName: params.campaignName, error: "Daily budget must be at least $1" };
  if (params.keywords.length < 1)
    return { success: false, campaignType: "SEARCH", campaignName: params.campaignName, error: "At least 1 keyword is required" };
  if (!params.finalUrl.startsWith("http"))
    return { success: false, campaignType: "SEARCH", campaignName: params.campaignName, error: "Final URL must start with http:// or https://" };

  const strategy = params.bidding?.strategy ?? "MAXIMIZE_CONVERSIONS";
  const matchType = MATCH_TYPE[params.keywordMatchType ?? "BROAD"];

  const biddingFields: Record<string, unknown> = {};
  switch (strategy) {
    case "MAXIMIZE_CONVERSIONS": biddingFields.maximize_conversions = {}; break;
    case "MAXIMIZE_CLICKS": biddingFields.target_spend = {}; break;
    case "MANUAL_CPC": biddingFields.manual_cpc = { enhanced_cpc_enabled: false }; break;
  }

  const budgetTemp = `customers/${cid}/campaignBudgets/-1`;
  const campaignTemp = `customers/${cid}/campaigns/-2`;
  const adGroupTemp = `customers/${cid}/adGroups/-3`;

  const operations: CampaignOp[] = [
    buildBudgetOp(cid, params.campaignName, params.dailyBudgetDollars),
    {
      entity: "campaign",
      operation: "create",
      resource: {
        resource_name: campaignTemp,
        name: params.campaignName,
        status: STATUS.PAUSED,
        advertising_channel_type: 2, // SEARCH
        campaign_budget: budgetTemp,
        network_settings: {
          target_google_search: true,
          target_search_network: false,
        },
        contains_eu_political_advertising: 3, // DOES_NOT_CONTAIN
        ...biddingFields,
      },
    },
    {
      entity: "ad_group",
      operation: "create",
      resource: {
        resource_name: adGroupTemp,
        name: `${params.campaignName} - Ad Group 1`,
        campaign: campaignTemp,
        status: STATUS.ENABLED,
        type: 2, // SEARCH_STANDARD
      },
    },
    ...params.keywords.map((keyword) => ({
      entity: "ad_group_criterion",
      operation: "create",
      resource: {
        ad_group: adGroupTemp,
        status: STATUS.ENABLED,
        keyword: { text: keyword.trim(), match_type: matchType },
      } as Record<string, unknown>,
    })),
    {
      entity: "ad_group_ad",
      operation: "create",
      resource: {
        ad_group: adGroupTemp,
        status: STATUS.ENABLED,
        ad: {
          final_urls: [params.finalUrl],
          responsive_search_ad: {
            headlines: params.headlines.map((text) => ({ text })),
            descriptions: params.descriptions.map((text) => ({ text })),
          },
        },
      },
    },
    ...buildGeoCriteriaOps(campaignTemp, params.geoTargetIds),
    ...buildLanguageCriteriaOps(campaignTemp, params.languageIds),
  ];

  try {
    const response = await customer.mutateResources(operations as any);
    const responses = (response as any)?.mutate_operation_responses ?? [];
    const campaignId = await extractCampaignId(customer, responses, params.campaignName);
    const adGroupId = (responses[2] as any)?.ad_group_result?.resource_name?.split("/").pop();

    return {
      success: true,
      campaignType: "SEARCH",
      campaignName: params.campaignName,
      campaignId,
      adGroupId,
      keywordCount: params.keywords.length,
      dailyBudget: params.dailyBudgetDollars,
      biddingStrategy: strategy,
    };
  } catch (error) {
    return {
      success: false,
      campaignType: "SEARCH",
      campaignName: params.campaignName,
      ...campaignPolicyErrorFields(auth, params, error),
    };
  }
}

async function buildShoppingResources(
  auth: AuthContext,
  params: ShoppingCampaignParams,
): Promise<CreateCampaignResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  const strategy = params.bidding?.strategy ?? "MANUAL_CPC";
  const defaultCpcDollars = params.bidding?.defaultCpcDollars;
  const targetRoas = params.bidding?.targetRoas;

  // Validation
  if (params.dailyBudgetDollars < 1)
    return { success: false, campaignType: "SHOPPING", campaignName: params.campaignName, error: "Daily budget must be at least $1" };
  if (!Number.isInteger(params.merchantId) || params.merchantId <= 0)
    return { success: false, campaignType: "SHOPPING", campaignName: params.campaignName, error: "merchantId must be a positive integer" };
  if (!params.salesCountry.trim())
    return { success: false, campaignType: "SHOPPING", campaignName: params.campaignName, error: "salesCountry is required (e.g. 'US')" };
  if (strategy === "TARGET_ROAS" && (targetRoas === undefined || targetRoas <= 0))
    return { success: false, campaignType: "SHOPPING", campaignName: params.campaignName, error: "bidding.targetRoas must be a positive number when strategy is TARGET_ROAS" };
  if (strategy === "MANUAL_CPC" && (defaultCpcDollars === undefined || defaultCpcDollars <= 0))
    return { success: false, campaignType: "SHOPPING", campaignName: params.campaignName, error: "bidding.defaultCpcDollars must be a positive number when strategy is MANUAL_CPC" };
  const campaignPriority = params.campaignPriority ?? 0;
  if (![0, 1, 2].includes(campaignPriority))
    return { success: false, campaignType: "SHOPPING", campaignName: params.campaignName, error: "campaignPriority must be 0 (LOW), 1 (MEDIUM), or 2 (HIGH)" };

  const biddingFields: Record<string, unknown> = {};
  switch (strategy) {
    case "MANUAL_CPC": biddingFields.manual_cpc = { enhanced_cpc_enabled: false }; break;
    case "TARGET_ROAS": biddingFields.target_roas = { target_roas: targetRoas }; break;
    case "MAXIMIZE_CLICKS": biddingFields.target_spend = {}; break;
  }

  const budgetTemp = `customers/${cid}/campaignBudgets/-1`;
  const campaignTemp = `customers/${cid}/campaigns/-2`;
  const adGroupTemp = `customers/${cid}/adGroups/-3`;

  const operations: CampaignOp[] = [
    buildBudgetOp(cid, params.campaignName, params.dailyBudgetDollars),
    {
      entity: "campaign",
      operation: "create",
      resource: {
        resource_name: campaignTemp,
        name: params.campaignName,
        status: STATUS.PAUSED,
        advertising_channel_type: 4, // SHOPPING
        campaign_budget: budgetTemp,
        shopping_setting: {
          merchant_id: params.merchantId,
          sales_country: params.salesCountry.trim().toUpperCase(),
          campaign_priority: campaignPriority,
          enable_local: params.enableLocal ?? false,
        },
        network_settings: {
          target_google_search: true,
          target_search_network: !!(params.searchPartners),
          target_content_network: false,
          target_partner_search_network: false,
        },
        contains_eu_political_advertising: 3, // DOES_NOT_CONTAIN
        ...biddingFields,
      },
    },
    {
      entity: "ad_group",
      operation: "create",
      resource: {
        resource_name: adGroupTemp,
        name: `${params.campaignName} - Ad Group 1`,
        campaign: campaignTemp,
        status: STATUS.ENABLED,
        type: AD_GROUP_TYPE.SHOPPING_PRODUCT_ADS, // 4
        ...(strategy === "MANUAL_CPC" && { cpc_bid_micros: toMicros(defaultCpcDollars!) }),
      },
    },
    // Root listing group (UNIT = 3 in ListingGroupType)
    {
      entity: "ad_group_criterion",
      operation: "create",
      resource: {
        ad_group: adGroupTemp,
        listing_group: { type: 3 }, // UNIT — root catch-all partition
        status: STATUS.ENABLED,
        ...(strategy === "MANUAL_CPC" && { cpc_bid_micros: toMicros(defaultCpcDollars!) }),
      },
    },
    {
      entity: "ad_group_ad",
      operation: "create",
      resource: {
        ad_group: adGroupTemp,
        ad: { shopping_product_ad: {} },
        status: STATUS.ENABLED,
      },
    },
    // Inventory filter via campaign_criterion listing_scope (optional)
    ...(params.inventoryFilter ?? []).map((filter) => {
      let dimension: Record<string, unknown>;
      if (filter.productType) {
        dimension = {
          product_type: {
            level: PRODUCT_TYPE_LEVEL_MAP[filter.productType.level],
            value: filter.productType.value,
          },
        };
      } else {
        dimension = {
          product_custom_attribute: {
            index: CUSTOM_ATTRIBUTE_INDEX_MAP[filter.customLabel.index],
            value: filter.customLabel.value,
          },
        };
      }
      return {
        entity: "campaign_criterion",
        operation: "create",
        resource: {
          campaign: campaignTemp,
          listing_scope: { dimensions: [dimension] },
        } as Record<string, unknown>,
      };
    }),
    ...buildGeoCriteriaOps(campaignTemp, params.geoTargetIds),
    ...buildLanguageCriteriaOps(campaignTemp, params.languageIds),
  ];

  try {
    const response = await customer.mutateResources(operations as any);
    const responses = (response as any)?.mutate_operation_responses ?? [];
    const campaignId = await extractCampaignId(customer, responses, params.campaignName);
    const adGroupId = (responses[2] as any)?.ad_group_result?.resource_name?.split("/").pop();

    return {
      success: true,
      campaignType: "SHOPPING",
      campaignName: params.campaignName,
      campaignId,
      adGroupId,
      dailyBudget: params.dailyBudgetDollars,
      biddingStrategy: strategy,
      merchantId: params.merchantId,
      salesCountry: params.salesCountry.trim().toUpperCase(),
      inventoryFilterApplied: (params.inventoryFilter ?? []).length > 0,
    };
  } catch (error) {
    return {
      success: false,
      campaignType: "SHOPPING",
      campaignName: params.campaignName,
      ...campaignPolicyErrorFields(auth, params, error),
    };
  }
}

async function buildPerformanceMaxResources(
  auth: AuthContext,
  params: PerformanceMaxCampaignParams,
): Promise<CreateCampaignResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  const strategy = params.bidding?.strategy ?? "MAXIMIZE_CONVERSIONS";
  const targetCpaDollars = params.bidding?.targetCpaDollars;
  const targetRoas = params.bidding?.targetRoas;

  // Validation
  if (params.dailyBudgetDollars < 1)
    return { success: false, campaignType: "PERFORMANCE_MAX", campaignName: params.campaignName, error: "Daily budget must be at least $1" };
  if (!params.finalUrl.startsWith("http://") && !params.finalUrl.startsWith("https://"))
    return { success: false, campaignType: "PERFORMANCE_MAX", campaignName: params.campaignName, error: "finalUrl must be a valid URL starting with http:// or https://" };
  if (!params.headlines || params.headlines.length < 3 || params.headlines.length > 15)
    return { success: false, campaignType: "PERFORMANCE_MAX", campaignName: params.campaignName, error: "headlines must have 3–15 items" };
  if (params.headlines.some((h) => h.length > 30))
    return { success: false, campaignType: "PERFORMANCE_MAX", campaignName: params.campaignName, error: "Each headline must be max 30 characters" };
  if (!params.longHeadlines || params.longHeadlines.length < 1 || params.longHeadlines.length > 5)
    return { success: false, campaignType: "PERFORMANCE_MAX", campaignName: params.campaignName, error: "longHeadlines must have 1–5 items" };
  if (params.longHeadlines.some((h) => h.length > 90))
    return { success: false, campaignType: "PERFORMANCE_MAX", campaignName: params.campaignName, error: "Each long headline must be max 90 characters" };
  if (!params.descriptions || params.descriptions.length < 2 || params.descriptions.length > 5)
    return { success: false, campaignType: "PERFORMANCE_MAX", campaignName: params.campaignName, error: "descriptions must have 2–5 items" };
  if (params.descriptions.some((d) => d.length > 90))
    return { success: false, campaignType: "PERFORMANCE_MAX", campaignName: params.campaignName, error: "Each description must be max 90 characters" };
  if (!params.businessName?.trim())
    return { success: false, campaignType: "PERFORMANCE_MAX", campaignName: params.campaignName, error: "businessName is required" };
  if (strategy === "MAXIMIZE_CONVERSION_VALUE" && targetRoas !== undefined && targetRoas <= 0)
    return { success: false, campaignType: "PERFORMANCE_MAX", campaignName: params.campaignName, error: "bidding.targetRoas must be a positive number" };
  if (strategy === "MAXIMIZE_CONVERSIONS" && targetCpaDollars !== undefined && targetCpaDollars <= 0)
    return { success: false, campaignType: "PERFORMANCE_MAX", campaignName: params.campaignName, error: "bidding.targetCpaDollars must be a positive number" };

  const biddingFields: Record<string, unknown> =
    strategy === "MAXIMIZE_CONVERSIONS"
      ? { maximize_conversions: { ...(targetCpaDollars !== undefined && { target_cpa_micros: toMicros(targetCpaDollars) }) } }
      : { maximize_conversion_value: { ...(targetRoas !== undefined && { target_roas: targetRoas }) } };

  const shoppingSetting: Record<string, unknown> | undefined =
    params.merchantId !== undefined && params.salesCountry
      ? { merchant_id: Number(params.merchantId), sales_country: params.salesCountry.trim().toUpperCase() }
      : undefined;

  const budgetTemp = `customers/${cid}/campaignBudgets/-1`;
  const campaignTemp = `customers/${cid}/campaigns/-2`;
  const assetGroupTemp = `customers/${cid}/assetGroups/-3`;

  const textAssets: Array<{ text: string; fieldType: number }> = [
    ...params.headlines.map((text) => ({ text, fieldType: ASSET_FIELD_TYPE.HEADLINE })),
    ...params.longHeadlines.map((text) => ({ text, fieldType: ASSET_FIELD_TYPE.LONG_HEADLINE })),
    ...params.descriptions.map((text) => ({ text, fieldType: ASSET_FIELD_TYPE.DESCRIPTION })),
    { text: params.businessName.trim(), fieldType: ASSET_FIELD_TYPE.BUSINESS_NAME },
  ];

  const operations: CampaignOp[] = [
    buildBudgetOp(cid, params.campaignName, params.dailyBudgetDollars),
    {
      entity: "campaign",
      operation: "create",
      resource: {
        resource_name: campaignTemp,
        name: params.campaignName,
        status: STATUS.PAUSED,
        advertising_channel_type: 10, // PERFORMANCE_MAX
        campaign_budget: budgetTemp,
        network_settings: {
          target_google_search: true,
          target_search_network: true,
          target_content_network: true,
          target_partner_search_network: false,
        },
        contains_eu_political_advertising: 3, // DOES_NOT_CONTAIN
        ...(shoppingSetting && { shopping_setting: shoppingSetting }),
        ...biddingFields,
      },
    },
    {
      entity: "asset_group",
      operation: "create",
      resource: {
        resource_name: assetGroupTemp,
        name: `${params.campaignName} - Asset Group 1`,
        campaign: campaignTemp,
        final_urls: [params.finalUrl],
        status: 2, // ENABLED (AssetGroupStatus)
      },
    },
    ...buildTextAssetOps(cid, assetGroupTemp, textAssets),
    ...buildGeoCriteriaOps(campaignTemp, params.geoTargetIds),
    ...buildLanguageCriteriaOps(campaignTemp, params.languageIds),
  ];

  try {
    const response = await customer.mutateResources(operations as any);
    const responses = (response as any)?.mutate_operation_responses ?? [];
    const campaignId = await extractCampaignId(customer, responses, params.campaignName);
    const assetGroupId = (responses[2] as any)?.asset_group_result?.resource_name?.split("/").pop();

    return {
      success: true,
      campaignType: "PERFORMANCE_MAX",
      campaignName: params.campaignName,
      campaignId,
      assetGroupId,
      dailyBudget: params.dailyBudgetDollars,
      biddingStrategy: strategy,
      textAssetCount: textAssets.length,
    };
  } catch (error) {
    return {
      success: false,
      campaignType: "PERFORMANCE_MAX",
      campaignName: params.campaignName,
      ...campaignPolicyErrorFields(auth, params, error),
    };
  }
}

async function buildDemandGenResources(
  auth: AuthContext,
  params: DemandGenCampaignParams,
): Promise<CreateCampaignResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  const strategy = params.bidding?.strategy ?? "MAXIMIZE_CONVERSIONS";
  const targetCpaDollars = params.bidding?.targetCpaDollars;
  const targetRoas = params.bidding?.targetRoas;

  // Validation
  if (params.dailyBudgetDollars < 1)
    return { success: false, campaignType: "DEMAND_GEN", campaignName: params.campaignName, error: "Daily budget must be at least $1" };
  if (!params.finalUrl.startsWith("http://") && !params.finalUrl.startsWith("https://"))
    return { success: false, campaignType: "DEMAND_GEN", campaignName: params.campaignName, error: "finalUrl must be a valid URL" };
  if (!params.headlines || params.headlines.length < 3 || params.headlines.length > 5)
    return { success: false, campaignType: "DEMAND_GEN", campaignName: params.campaignName, error: "headlines must have 3–5 items" };
  if (params.headlines.some((h) => h.length > 40))
    return { success: false, campaignType: "DEMAND_GEN", campaignName: params.campaignName, error: "Each headline must be max 40 characters" };
  if (!params.longHeadlines || params.longHeadlines.length < 1 || params.longHeadlines.length > 5)
    return { success: false, campaignType: "DEMAND_GEN", campaignName: params.campaignName, error: "longHeadlines must have 1–5 items" };
  if (params.longHeadlines.some((h) => h.length > 90))
    return { success: false, campaignType: "DEMAND_GEN", campaignName: params.campaignName, error: "Each long headline must be max 90 characters" };
  if (!params.descriptions || params.descriptions.length < 2 || params.descriptions.length > 5)
    return { success: false, campaignType: "DEMAND_GEN", campaignName: params.campaignName, error: "descriptions must have 2–5 items" };
  if (params.descriptions.some((d) => d.length > 90))
    return { success: false, campaignType: "DEMAND_GEN", campaignName: params.campaignName, error: "Each description must be max 90 characters" };
  if (!params.businessName?.trim())
    return { success: false, campaignType: "DEMAND_GEN", campaignName: params.campaignName, error: "businessName is required" };
  if (strategy === "MAXIMIZE_CONVERSION_VALUE" && targetRoas !== undefined && targetRoas <= 0)
    return { success: false, campaignType: "DEMAND_GEN", campaignName: params.campaignName, error: "bidding.targetRoas must be a positive number" };
  if (strategy === "MAXIMIZE_CONVERSIONS" && targetCpaDollars !== undefined && targetCpaDollars <= 0)
    return { success: false, campaignType: "DEMAND_GEN", campaignName: params.campaignName, error: "bidding.targetCpaDollars must be a positive number" };

  const biddingFields: Record<string, unknown> =
    strategy === "MAXIMIZE_CONVERSIONS"
      ? { maximize_conversions: { ...(targetCpaDollars !== undefined && { target_cpa_micros: toMicros(targetCpaDollars) }) } }
      : { maximize_conversion_value: { ...(targetRoas !== undefined && { target_roas: targetRoas }) } };

  const budgetTemp = `customers/${cid}/campaignBudgets/-1`;
  const campaignTemp = `customers/${cid}/campaigns/-2`;
  const adGroupTemp = `customers/${cid}/adGroups/-3`;

  const operations: CampaignOp[] = [
    buildBudgetOp(cid, params.campaignName, params.dailyBudgetDollars),
    {
      entity: "campaign",
      operation: "create",
      resource: {
        resource_name: campaignTemp,
        name: params.campaignName,
        status: STATUS.PAUSED,
        advertising_channel_type: 14, // DEMAND_GEN
        campaign_budget: budgetTemp,
        contains_eu_political_advertising: 3, // DOES_NOT_CONTAIN
        ...biddingFields,
      },
    },
    {
      entity: "ad_group",
      operation: "create",
      resource: {
        resource_name: adGroupTemp,
        name: `${params.campaignName} - Ad Group 1`,
        campaign: campaignTemp,
        status: STATUS.ENABLED,
      },
    },
    {
      entity: "ad_group_ad",
      operation: "create",
      resource: {
        ad_group: adGroupTemp,
        status: STATUS.ENABLED,
        ad: {
          final_urls: [params.finalUrl],
          demand_gen_multi_asset_ad: {
            business_name: params.businessName.trim(),
            headlines: params.headlines.map((text) => ({ text })),
            long_headlines: params.longHeadlines.map((text) => ({ text })),
            descriptions: params.descriptions.map((text) => ({ text })),
          },
        },
      },
    },
    ...buildGeoCriteriaOps(campaignTemp, params.geoTargetIds),
    ...buildLanguageCriteriaOps(campaignTemp, params.languageIds),
  ];

  try {
    const response = await customer.mutateResources(operations as any);
    const responses = (response as any)?.mutate_operation_responses ?? [];
    const campaignId = await extractCampaignId(customer, responses, params.campaignName);
    const adGroupId = (responses[2] as any)?.ad_group_result?.resource_name?.split("/").pop();

    return {
      success: true,
      campaignType: "DEMAND_GEN",
      campaignName: params.campaignName,
      campaignId,
      adGroupId,
      dailyBudget: params.dailyBudgetDollars,
      biddingStrategy: strategy,
    };
  } catch (error) {
    return {
      success: false,
      campaignType: "DEMAND_GEN",
      campaignName: params.campaignName,
      ...campaignPolicyErrorFields(auth, params, error),
    };
  }
}

async function buildDisplayResources(
  auth: AuthContext,
  params: DisplayCampaignParams,
): Promise<CreateCampaignResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  const strategy = params.bidding?.strategy ?? "MAXIMIZE_CONVERSIONS";
  const defaultCpcDollars = params.bidding?.defaultCpcDollars;
  const targetCpaDollars = params.bidding?.targetCpaDollars;

  // Validation
  if (params.dailyBudgetDollars < 1)
    return { success: false, campaignType: "DISPLAY", campaignName: params.campaignName, error: "Daily budget must be at least $1" };
  if (!params.finalUrl.startsWith("http://") && !params.finalUrl.startsWith("https://"))
    return { success: false, campaignType: "DISPLAY", campaignName: params.campaignName, error: "finalUrl must be a valid URL" };
  if (!params.headlines || params.headlines.length < 1 || params.headlines.length > 5)
    return { success: false, campaignType: "DISPLAY", campaignName: params.campaignName, error: "headlines must have 1–5 items" };
  if (params.headlines.some((h) => h.length > 30))
    return { success: false, campaignType: "DISPLAY", campaignName: params.campaignName, error: "Each headline must be max 30 characters" };
  if (!params.longHeadline || params.longHeadline.length > 90)
    return { success: false, campaignType: "DISPLAY", campaignName: params.campaignName, error: "longHeadline is required and must be max 90 characters" };
  if (!params.descriptions || params.descriptions.length < 1 || params.descriptions.length > 5)
    return { success: false, campaignType: "DISPLAY", campaignName: params.campaignName, error: "descriptions must have 1–5 items" };
  if (params.descriptions.some((d) => d.length > 90))
    return { success: false, campaignType: "DISPLAY", campaignName: params.campaignName, error: "Each description must be max 90 characters" };
  if (!params.businessName?.trim())
    return { success: false, campaignType: "DISPLAY", campaignName: params.campaignName, error: "businessName is required" };
  if (!params.marketingImageAssetId?.trim())
    return { success: false, campaignType: "DISPLAY", campaignName: params.campaignName, error: "marketingImageAssetId is required (create via createImageAsset first)" };
  if (!params.squareMarketingImageAssetId?.trim())
    return { success: false, campaignType: "DISPLAY", campaignName: params.campaignName, error: "squareMarketingImageAssetId is required (create via createImageAsset first)" };
  if (strategy === "MANUAL_CPC" && (defaultCpcDollars === undefined || defaultCpcDollars <= 0))
    return { success: false, campaignType: "DISPLAY", campaignName: params.campaignName, error: "bidding.defaultCpcDollars must be a positive number when strategy is MANUAL_CPC" };

  const biddingFields: Record<string, unknown> = {};
  switch (strategy) {
    case "MAXIMIZE_CONVERSIONS":
      biddingFields.maximize_conversions = {
        ...(targetCpaDollars !== undefined && { target_cpa_micros: toMicros(targetCpaDollars) }),
      };
      break;
    case "MAXIMIZE_CLICKS": biddingFields.target_spend = {}; break;
    case "MANUAL_CPC": biddingFields.manual_cpc = { enhanced_cpc_enabled: false }; break;
  }

  const marketingImageRef = normalizeAssetId(cid, params.marketingImageAssetId.trim());
  const squareImageRef = normalizeAssetId(cid, params.squareMarketingImageAssetId.trim());
  const logoImageRef = params.logoImageAssetId ? normalizeAssetId(cid, params.logoImageAssetId.trim()) : undefined;

  const budgetTemp = `customers/${cid}/campaignBudgets/-1`;
  const campaignTemp = `customers/${cid}/campaigns/-2`;
  const adGroupTemp = `customers/${cid}/adGroups/-3`;
  const adGroupName = params.adGroupName ?? `${params.campaignName} - Ad Group 1`;

  const operations: CampaignOp[] = [
    buildBudgetOp(cid, params.campaignName, params.dailyBudgetDollars),
    {
      entity: "campaign",
      operation: "create",
      resource: {
        resource_name: campaignTemp,
        name: params.campaignName,
        status: STATUS.PAUSED,
        advertising_channel_type: 3, // DISPLAY
        campaign_budget: budgetTemp,
        network_settings: {
          target_google_search: false,
          target_search_network: false,
          target_content_network: true, // Display Network
          target_partner_search_network: false,
        },
        contains_eu_political_advertising: 3, // DOES_NOT_CONTAIN
        ...biddingFields,
      },
    },
    {
      entity: "ad_group",
      operation: "create",
      resource: {
        resource_name: adGroupTemp,
        name: adGroupName,
        campaign: campaignTemp,
        status: STATUS.ENABLED,
        type: 3, // DISPLAY_STANDARD
        ...(strategy === "MANUAL_CPC" && { cpc_bid_micros: toMicros(defaultCpcDollars!) }),
      },
    },
    {
      entity: "ad_group_ad",
      operation: "create",
      resource: {
        ad_group: adGroupTemp,
        status: STATUS.ENABLED,
        ad: {
          final_urls: [params.finalUrl],
          responsive_display_ad: {
            business_name: params.businessName.trim(),
            long_headline: { text: params.longHeadline },
            headlines: params.headlines.map((text) => ({ text })),
            descriptions: params.descriptions.map((text) => ({ text })),
            marketing_images: [{ asset: marketingImageRef }],
            square_marketing_images: [{ asset: squareImageRef }],
            ...(logoImageRef && { logo_images: [{ asset: logoImageRef }] }),
          },
        },
      },
    },
    ...buildGeoCriteriaOps(campaignTemp, params.geoTargetIds),
    ...buildLanguageCriteriaOps(campaignTemp, params.languageIds),
  ];

  try {
    const response = await customer.mutateResources(operations as any);
    const responses = (response as any)?.mutate_operation_responses ?? [];
    const campaignId = await extractCampaignId(customer, responses, params.campaignName);
    const adGroupId = (responses[2] as any)?.ad_group_result?.resource_name?.split("/").pop();

    return {
      success: true,
      campaignType: "DISPLAY",
      campaignName: params.campaignName,
      campaignId,
      adGroupId,
      dailyBudget: params.dailyBudgetDollars,
      biddingStrategy: strategy,
    };
  } catch (error) {
    return {
      success: false,
      campaignType: "DISPLAY",
      campaignName: params.campaignName,
      ...campaignPolicyErrorFields(auth, params, error),
    };
  }
}

async function buildVideoResources(
  auth: AuthContext,
  params: VideoCampaignParams,
): Promise<CreateCampaignResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  const strategy = params.bidding?.strategy ?? "TARGET_CPV";
  const targetCpvDollars = params.bidding?.targetCpvDollars;
  const targetCpaDollars = params.bidding?.targetCpaDollars;

  // Validation
  if (params.dailyBudgetDollars < 1)
    return { success: false, campaignType: "VIDEO", campaignName: params.campaignName, error: "Daily budget must be at least $1" };
  if (!params.youtubeVideoId?.trim())
    return { success: false, campaignType: "VIDEO", campaignName: params.campaignName, error: "youtubeVideoId is required" };
  if (!params.finalUrl.startsWith("http://") && !params.finalUrl.startsWith("https://"))
    return { success: false, campaignType: "VIDEO", campaignName: params.campaignName, error: "finalUrl must be a valid URL" };
  if (!params.headline?.trim() || params.headline.length > 30)
    return { success: false, campaignType: "VIDEO", campaignName: params.campaignName, error: "headline is required and must be max 30 characters" };
  if (params.longHeadline && params.longHeadline.length > 90)
    return { success: false, campaignType: "VIDEO", campaignName: params.campaignName, error: "longHeadline must be max 90 characters" };
  if (params.description && params.description.length > 90)
    return { success: false, campaignType: "VIDEO", campaignName: params.campaignName, error: "description must be max 90 characters" };
  if (strategy === "TARGET_CPV" && (targetCpvDollars === undefined || targetCpvDollars <= 0))
    return { success: false, campaignType: "VIDEO", campaignName: params.campaignName, error: "bidding.targetCpvDollars must be a positive number when strategy is TARGET_CPV" };

  const biddingFields: Record<string, unknown> =
    strategy === "TARGET_CPV"
      ? { target_cpv: { target_cpv_micros: toMicros(targetCpvDollars!) } }
      : { maximize_conversions: { ...(targetCpaDollars !== undefined && { target_cpa_micros: toMicros(targetCpaDollars) }) } };

  const budgetTemp = `customers/${cid}/campaignBudgets/-1`;
  const campaignTemp = `customers/${cid}/campaigns/-2`;
  const adGroupTemp = `customers/${cid}/adGroups/-3`;
  const videoAssetTemp = `customers/${cid}/assets/-100`;
  const adName = params.adName ?? `${params.campaignName} - Video Ad`;
  const callToActions = params.callToAction ? [{ text: params.callToAction }] : [];

  const operations: CampaignOp[] = [
    buildBudgetOp(cid, params.campaignName, params.dailyBudgetDollars),
    {
      entity: "campaign",
      operation: "create",
      resource: {
        resource_name: campaignTemp,
        name: params.campaignName,
        status: STATUS.PAUSED,
        advertising_channel_type: 6, // VIDEO
        campaign_budget: budgetTemp,
        network_settings: {
          target_youtube: true,
          target_content_network: false,
          target_google_tv_network: false,
        },
        contains_eu_political_advertising: 3, // DOES_NOT_CONTAIN
        ...biddingFields,
      },
    },
    {
      entity: "ad_group",
      operation: "create",
      resource: {
        resource_name: adGroupTemp,
        name: `${params.campaignName} - Ad Group 1`,
        campaign: campaignTemp,
        status: STATUS.ENABLED,
        type: 9, // VIDEO_TRUE_VIEW_IN_STREAM
      },
    },
    {
      entity: "asset",
      operation: "create",
      resource: {
        resource_name: videoAssetTemp,
        name: adName,
        youtube_video_asset: { youtube_video_id: params.youtubeVideoId.trim() },
      },
    },
    {
      entity: "ad_group_ad",
      operation: "create",
      resource: {
        ad_group: adGroupTemp,
        status: STATUS.ENABLED,
        ad: {
          name: adName,
          final_urls: [params.finalUrl],
          video_responsive_ad: {
            videos: [{ asset: videoAssetTemp }],
            headlines: [{ text: params.headline.trim() }],
            ...(params.longHeadline && { long_headlines: [{ text: params.longHeadline }] }),
            ...(params.description && { descriptions: [{ text: params.description }] }),
            ...(callToActions.length > 0 && { call_to_actions: callToActions }),
          },
        },
      },
    },
    ...buildGeoCriteriaOps(campaignTemp, params.geoTargetIds),
    ...buildLanguageCriteriaOps(campaignTemp, params.languageIds),
  ];

  try {
    const response = await customer.mutateResources(operations as any);
    const responses = (response as any)?.mutate_operation_responses ?? [];
    const campaignId = await extractCampaignId(customer, responses, params.campaignName);
    const adGroupId = (responses[2] as any)?.ad_group_result?.resource_name?.split("/").pop();

    return {
      success: true,
      campaignType: "VIDEO",
      campaignName: params.campaignName,
      campaignId,
      adGroupId,
      dailyBudget: params.dailyBudgetDollars,
      biddingStrategy: strategy,
    };
  } catch (error) {
    return {
      success: false,
      campaignType: "VIDEO",
      campaignName: params.campaignName,
      ...campaignPolicyErrorFields(auth, params, error),
    };
  }
}

async function buildAppResources(
  auth: AuthContext,
  params: AppCampaignParams,
): Promise<CreateCampaignResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  const strategy = params.bidding?.strategy ?? "TARGET_CPA";
  const targetCpaDollars = params.bidding?.targetCpaDollars;

  // Validation
  if (params.dailyBudgetDollars < 1)
    return { success: false, campaignType: "APP", campaignName: params.campaignName, error: "Daily budget must be at least $1" };
  if (!params.appId?.trim())
    return { success: false, campaignType: "APP", campaignName: params.campaignName, error: "appId is required" };
  if (!params.finalUrl.startsWith("http://") && !params.finalUrl.startsWith("https://"))
    return { success: false, campaignType: "APP", campaignName: params.campaignName, error: "finalUrl must be a valid URL" };
  if (!params.headlines || params.headlines.length < 2 || params.headlines.length > 5)
    return { success: false, campaignType: "APP", campaignName: params.campaignName, error: "headlines must have 2–5 items" };
  if (params.headlines.some((h) => h.length > 30))
    return { success: false, campaignType: "APP", campaignName: params.campaignName, error: "Each headline must be max 30 characters" };
  if (!params.descriptions || params.descriptions.length < 1 || params.descriptions.length > 5)
    return { success: false, campaignType: "APP", campaignName: params.campaignName, error: "descriptions must have 1–5 items" };
  if (params.descriptions.some((d) => d.length > 90))
    return { success: false, campaignType: "APP", campaignName: params.campaignName, error: "Each description must be max 90 characters" };
  if (strategy === "TARGET_CPA" && (targetCpaDollars === undefined || targetCpaDollars <= 0))
    return { success: false, campaignType: "APP", campaignName: params.campaignName, error: "bidding.targetCpaDollars must be a positive number when strategy is TARGET_CPA" };

  // MobileAppVendor: APPLE_APP_STORE=2, GOOGLE_APP_STORE=3
  const appStoreEnum = params.appStore === "APPLE_APP_STORE" ? 2 : 3;
  // AppCampaignBiddingStrategyGoalType:
  //   OPTIMIZE_INSTALLS_TARGET_INSTALL_COST=2 (TARGET_CPA)
  //   OPTIMIZE_INSTALLS_WITHOUT_TARGET_INSTALL_COST=7 (MAXIMIZE_CONVERSIONS)
  const biddingGoalType = strategy === "TARGET_CPA" ? 2 : 7;

  const biddingFields: Record<string, unknown> =
    strategy === "TARGET_CPA"
      ? { target_cpa: { target_cpa_micros: toMicros(targetCpaDollars!) } }
      : { maximize_conversions: {} };

  const budgetTemp = `customers/${cid}/campaignBudgets/-1`;
  const campaignTemp = `customers/${cid}/campaigns/-2`;
  const assetGroupTemp = `customers/${cid}/assetGroups/-3`;

  const textAssets: Array<{ text: string; fieldType: number }> = [
    ...params.headlines.map((text) => ({ text, fieldType: ASSET_FIELD_TYPE.HEADLINE })),
    ...params.descriptions.map((text) => ({ text, fieldType: ASSET_FIELD_TYPE.DESCRIPTION })),
    ...(params.businessName ? [{ text: params.businessName.trim(), fieldType: ASSET_FIELD_TYPE.BUSINESS_NAME }] : []),
  ];

  const operations: CampaignOp[] = [
    buildBudgetOp(cid, params.campaignName, params.dailyBudgetDollars),
    {
      entity: "campaign",
      operation: "create",
      resource: {
        resource_name: campaignTemp,
        name: params.campaignName,
        status: STATUS.PAUSED,
        advertising_channel_type: 7, // MULTI_CHANNEL
        advertising_channel_sub_type: 12, // APP_CAMPAIGN
        campaign_budget: budgetTemp,
        app_campaign_setting: {
          app_id: params.appId.trim(),
          app_store: appStoreEnum,
          bidding_strategy_goal_type: biddingGoalType,
        },
        contains_eu_political_advertising: 3, // DOES_NOT_CONTAIN
        ...biddingFields,
      },
    },
    {
      entity: "asset_group",
      operation: "create",
      resource: {
        resource_name: assetGroupTemp,
        name: `${params.campaignName} - Asset Group 1`,
        campaign: campaignTemp,
        final_urls: [params.finalUrl],
        status: 2, // ENABLED (AssetGroupStatus)
      },
    },
    ...buildTextAssetOps(cid, assetGroupTemp, textAssets),
    ...buildGeoCriteriaOps(campaignTemp, params.geoTargetIds),
    ...buildLanguageCriteriaOps(campaignTemp, params.languageIds),
  ];

  try {
    const response = await customer.mutateResources(operations as any);
    const responses = (response as any)?.mutate_operation_responses ?? [];
    const campaignId = await extractCampaignId(customer, responses, params.campaignName);
    const assetGroupId = (responses[2] as any)?.asset_group_result?.resource_name?.split("/").pop();

    return {
      success: true,
      campaignType: "APP",
      campaignName: params.campaignName,
      campaignId,
      assetGroupId,
      dailyBudget: params.dailyBudgetDollars,
      biddingStrategy: strategy,
      textAssetCount: textAssets.length,
    };
  } catch (error) {
    return {
      success: false,
      campaignType: "APP",
      campaignName: params.campaignName,
      ...campaignPolicyErrorFields(auth, params, error),
    };
  }
}

// ─── Public entry point ───────────────────────────────────────────────

/**
 * Create a Google Ads campaign of any supported type.
 *
 * Campaign type is determined by `params.campaignType`. All campaigns start
 * PAUSED — use `enableCampaign` to go live after reviewing settings.
 */
export async function createCampaign(
  auth: AuthContext,
  params: CreateCampaignParams,
): Promise<CreateCampaignResult> {
  const retryBlock = getPolicyRetryBlock(auth, "createCampaign", campaignPolicyTexts(params));
  if (retryBlock) {
    return {
      success: false,
      campaignType: params.campaignType,
      campaignName: params.campaignName,
      error: retryBlock.error,
      policy: retryBlock.policy,
    };
  }

  switch (params.campaignType) {
    case "SEARCH":
      return buildSearchResources(auth, params);
    case "SHOPPING":
      return buildShoppingResources(auth, params);
    case "PERFORMANCE_MAX":
      return buildPerformanceMaxResources(auth, params);
    case "DEMAND_GEN":
      return buildDemandGenResources(auth, params);
    case "DISPLAY":
      return buildDisplayResources(auth, params);
    case "VIDEO":
      return buildVideoResources(auth, params);
    case "APP":
      return buildAppResources(auth, params);
    default: {
      // TypeScript exhaustive check
      const _never: never = params;
      return {
        success: false,
        campaignType: (params as CreateCampaignParams).campaignType,
        campaignName: (params as CreateCampaignParams).campaignName,
        error: `Unsupported campaignType: ${(params as CreateCampaignParams).campaignType}`,
      };
    }
  }
}
