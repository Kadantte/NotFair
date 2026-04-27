import { getCachedCustomer, getCustomer, AD_GROUP_TYPE, MATCH_TYPE, STATUS } from "./client";
import { extractErrorMessage, extractPolicyDetails, isValidFinalUrl, normalizeCustomerId, rewriteConversionActionMutateError, rewriteRemovedResourceError, safeEntityId, toMicros, validateRsaAssets } from "./helpers";
import type { AuthContext, WriteResult } from "./types";

// ─── Create Campaign ─────────────────────────────────────────────────

export type CreateCampaignParams = {
  campaignName: string;
  dailyBudgetDollars: number;
  keywords: string[];
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  biddingStrategy?: "MAXIMIZE_CONVERSIONS" | "MAXIMIZE_CLICKS" | "MANUAL_CPC";
  keywordMatchType?: "BROAD" | "PHRASE" | "EXACT";
  /** Geo target constant IDs (e.g. "2840" for US). Pass bare IDs or full resource names. */
  geoTargetIds?: string[];
  /** Language constant IDs (e.g. "1000" for English). Pass bare IDs or full resource names. */
  languageIds?: string[];
};

/** Normalize a geo target input to a full resource name. Accepts "2840", "geoTargetConstants/2840", etc. */
function toGeoTargetConstant(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("geoTargetConstants/")) return trimmed;
  return `geoTargetConstants/${trimmed}`;
}

/** Normalize a language input to a full resource name. Accepts "1000", "languageConstants/1000", etc. */
function toLanguageConstant(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("languageConstants/")) return trimmed;
  return `languageConstants/${trimmed}`;
}

export type CreateCampaignResult = {
  success: boolean;
  campaignName: string;
  campaignId?: string;
  adGroupId?: string;
  keywordCount?: number;
  dailyBudget?: number;
  biddingStrategy?: string;
  error?: string;
};

/**
 * Create a complete Search campaign: budget + campaign + ad group + keywords + RSA.
 * All resources are created atomically via batch mutate with temporary resource names.
 * Campaign starts PAUSED for safety — use enableCampaign to go live.
 */
export async function createSearchCampaign(
  auth: AuthContext,
  params: CreateCampaignParams,
): Promise<CreateCampaignResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  // ── Validation ──
  const rsaError = validateRsaAssets(params.headlines, params.descriptions);
  if (rsaError) {
    return { success: false, campaignName: params.campaignName, error: rsaError };
  }
  if (params.dailyBudgetDollars < 1) {
    return { success: false, campaignName: params.campaignName, error: "Daily budget must be at least $1" };
  }
  if (params.keywords.length < 1) {
    return { success: false, campaignName: params.campaignName, error: "At least 1 keyword is required" };
  }
  if (!params.finalUrl.startsWith("http")) {
    return { success: false, campaignName: params.campaignName, error: "Final URL must start with http:// or https://" };
  }

  const matchType = MATCH_TYPE[params.keywordMatchType ?? "BROAD"];
  const biddingStrategy = params.biddingStrategy ?? "MAXIMIZE_CONVERSIONS";

  // Build bidding strategy fields for campaign resource
  const biddingFields: Record<string, unknown> = {};
  switch (biddingStrategy) {
    case "MAXIMIZE_CONVERSIONS":
      biddingFields.maximize_conversions = {};
      break;
    case "MAXIMIZE_CLICKS":
      biddingFields.target_spend = {};
      break;
    case "MANUAL_CPC":
      biddingFields.manual_cpc = { enhanced_cpc_enabled: false };
      break;
  }

  // Temporary resource names for atomic batch creation
  const budgetTemp = `customers/${cid}/campaignBudgets/-1`;
  const campaignTemp = `customers/${cid}/campaigns/-2`;
  const adGroupTemp = `customers/${cid}/adGroups/-3`;

  const operations: Array<{
    entity: string;
    operation: string;
    resource: Record<string, unknown>;
  }> = [
    // 1. Campaign Budget
    {
      entity: "campaign_budget",
      operation: "create",
      resource: {
        resource_name: budgetTemp,
        name: `${params.campaignName} Budget`,
        amount_micros: toMicros(params.dailyBudgetDollars),
        delivery_method: 2, // STANDARD
        explicitly_shared: false,
      },
    },
    // 2. Campaign (starts PAUSED)
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
    // 3. Ad Group
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
    // 4. Keywords
    ...params.keywords.map((keyword) => ({
      entity: "ad_group_criterion",
      operation: "create",
      resource: {
        ad_group: adGroupTemp,
        status: STATUS.ENABLED,
        keyword: {
          text: keyword.trim(),
          match_type: matchType,
        },
      } as Record<string, unknown>,
    })),
    // 5. Responsive Search Ad
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
    // 6. Geo targeting criteria (C.20) — campaign_criterion.location
    ...(params.geoTargetIds ?? []).map((geo) => ({
      entity: "campaign_criterion",
      operation: "create",
      resource: {
        campaign: campaignTemp,
        negative: false,
        location: {
          geo_target_constant: toGeoTargetConstant(geo),
        },
      } as Record<string, unknown>,
    })),
    // 7. Language targeting criteria (C.30) — campaign_criterion.language
    ...(params.languageIds ?? []).map((lang) => ({
      entity: "campaign_criterion",
      operation: "create",
      resource: {
        campaign: campaignTemp,
        language: {
          language_constant: toLanguageConstant(lang),
        },
      } as Record<string, unknown>,
    })),
  ];

  try {
    const response = await customer.mutateResources(operations as any);

    // Extract the real campaign ID from the batch response
    const responses = (response as any)?.mutate_operation_responses ?? [];
    const campaignResourceName =
      responses[1]?.campaign_result?.resource_name as string | undefined;
    let campaignId = campaignResourceName?.split("/").pop();

    // Fallback: query by name if we can't extract from response
    if (!campaignId) {
      const queryResult = await customer.query(`
        SELECT campaign.id, campaign.name
        FROM campaign
        WHERE campaign.status = 'PAUSED'
        ORDER BY campaign.id DESC
        LIMIT 10
      `);
      const match = (queryResult as any[]).find(
        (r) => r.campaign?.name === params.campaignName,
      );
      campaignId = String(match?.campaign?.id ?? "unknown");
    }

    // Extract ad group ID
    const adGroupResourceName =
      responses[2]?.ad_group_result?.resource_name as string | undefined;
    const adGroupId = adGroupResourceName?.split("/").pop();

    return {
      success: true,
      campaignName: params.campaignName,
      campaignId,
      adGroupId,
      keywordCount: params.keywords.length,
      dailyBudget: params.dailyBudgetDollars,
      biddingStrategy,
    };
  } catch (error) {
    return {
      success: false,
      campaignName: params.campaignName,
      error: extractPolicyDetails(error) ?? extractErrorMessage(error),
    };
  }
}

// ─── Tracking Templates ──────────────────────────────────────────────

export type TrackingTemplateLevel = "account" | "campaign" | "ad_group" | "ad";

/** Format: "account" | "campaign:{id}" | "ad_group:{id}" | "ad:{id}" */
export function encodeTrackingEntityId(level: TrackingTemplateLevel, entityId?: string): string {
  if (level === "account") return "account";
  return `${level}:${entityId}`;
}

export function decodeTrackingEntityId(encoded: string): { level: TrackingTemplateLevel; entityId?: string } {
  if (encoded === "account") return { level: "account" };
  const idx = encoded.indexOf(":");
  if (idx === -1) throw new Error(`Cannot undo: unrecognized tracking entity ID format "${encoded}"`);
  const level = encoded.slice(0, idx) as TrackingTemplateLevel;
  const entityId = encoded.slice(idx + 1);
  if (!["campaign", "ad_group", "ad"].includes(level)) {
    throw new Error(`Cannot undo: unknown tracking level "${level}" in entity ID "${encoded}"`);
  }
  return { level, entityId };
}

export async function getTrackingTemplate(
  auth: AuthContext,
  level: TrackingTemplateLevel,
  entityId?: string,
): Promise<{ level: string; entityId: string; trackingTemplate: string | null; campaignId?: string | null }> {
  const customer = getCachedCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  switch (level) {
    case "account": {
      const result = await customer.query(`
        SELECT customer.tracking_url_template
        FROM customer
        LIMIT 1
      `);
      const row = (result as any[])[0]?.customer;
      return { level, entityId: cid, trackingTemplate: row?.tracking_url_template ?? null };
    }
    case "campaign": {
      if (!entityId) throw new Error("entityId (campaignId) is required for campaign level");
      const id = safeEntityId(entityId);
      const result = await customer.query(`
        SELECT campaign.tracking_url_template
        FROM campaign
        WHERE campaign.id = ${id}
        LIMIT 1
      `);
      const row = (result as any[])[0]?.campaign;
      return { level, entityId, trackingTemplate: row?.tracking_url_template ?? null };
    }
    case "ad_group": {
      if (!entityId) throw new Error("entityId (adGroupId) is required for ad_group level");
      const id = Number(entityId);
      if (!Number.isFinite(id) || id <= 0) throw new Error(`Invalid adGroupId: ${entityId}`);
      // Single query fetches template + owning campaign in one round-trip
      const result = await customer.query(`
        SELECT ad_group.tracking_url_template, campaign.id
        FROM ad_group
        WHERE ad_group.id = ${id}
        LIMIT 1
      `);
      const row = (result as any[])[0];
      return {
        level,
        entityId,
        trackingTemplate: row?.ad_group?.tracking_url_template ?? null,
        campaignId: row?.campaign?.id ? String(row.campaign.id) : null,
      };
    }
    case "ad": {
      if (!entityId) throw new Error("entityId (adId) is required for ad level");
      const id = Number(entityId);
      if (!Number.isFinite(id) || id <= 0) throw new Error(`Invalid adId: ${entityId}`);
      // Single query fetches template + owning campaign in one round-trip
      const result = await customer.query(`
        SELECT ad_group_ad.ad.tracking_url_template, campaign.id
        FROM ad_group_ad
        WHERE ad_group_ad.ad.id = ${id}
        LIMIT 1
      `);
      const row = (result as any[])[0];
      return {
        level,
        entityId,
        trackingTemplate: row?.ad_group_ad?.ad?.tracking_url_template ?? null,
        campaignId: row?.campaign?.id ? String(row.campaign.id) : null,
      };
    }
  }
}

export async function setTrackingTemplate(
  auth: AuthContext,
  level: TrackingTemplateLevel,
  trackingTemplate: string,
  entityId?: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);
  const encoded = encodeTrackingEntityId(level, entityId);

  if (trackingTemplate !== "" && !trackingTemplate.includes("{lpurl}")) {
    return {
      success: false,
      action: "set_tracking_template",
      entityId: encoded,
      beforeValue: "",
      afterValue: trackingTemplate,
      error: 'Tracking template must contain {lpurl} (e.g. "{lpurl}?utm_source=google&utm_medium=cpc"). Pass an empty string to clear the template.',
    };
  }

  // Fetch current state before writing — required for accurate undo record.
  // Also resolves the owning campaignId for ad_group/ad levels in the same query.
  // If the fetch fails, abort: a write with a wrong beforeValue cannot be safely undone.
  let prefetch: Awaited<ReturnType<typeof getTrackingTemplate>>;
  try {
    prefetch = await getTrackingTemplate(auth, level, entityId);
  } catch (fetchError) {
    return {
      success: false,
      action: "set_tracking_template",
      entityId: encoded,
      beforeValue: "",
      afterValue: trackingTemplate,
      error: `Could not read current tracking template before writing (undo would be unsafe): ${extractErrorMessage(fetchError)}`,
    };
  }

  const beforeValue = prefetch.trackingTemplate ?? "";

  try {
    switch (level) {
      case "account":
        await customer.mutateResources([
          {
            entity: "customer" as any,
            operation: "update",
            resource: {
              resource_name: `customers/${cid}`,
              tracking_url_template: trackingTemplate,
            },
          },
        ]);
        break;
      case "campaign": {
        if (!entityId) throw new Error("entityId (campaignId) is required");
        const campaignIdNum = safeEntityId(entityId);
        await customer.mutateResources([
          {
            entity: "campaign" as any,
            operation: "update",
            resource: {
              resource_name: `customers/${cid}/campaigns/${campaignIdNum}`,
              tracking_url_template: trackingTemplate,
            },
          },
        ]);
        break;
      }
      case "ad_group": {
        if (!entityId) throw new Error("entityId (adGroupId) is required");
        const agId = Number(entityId);
        if (!Number.isFinite(agId) || agId <= 0) throw new Error(`Invalid adGroupId: ${entityId}`);
        await customer.mutateResources([
          {
            entity: "ad_group" as any,
            operation: "update",
            resource: {
              resource_name: `customers/${cid}/adGroups/${agId}`,
              tracking_url_template: trackingTemplate,
            },
          },
        ]);
        break;
      }
      case "ad": {
        if (!entityId) throw new Error("entityId (adId) is required");
        const adId = Number(entityId);
        if (!Number.isFinite(adId) || adId <= 0) throw new Error(`Invalid adId: ${entityId}`);
        await customer.mutateResources([
          {
            entity: "ad" as any,
            operation: "update",
            resource: {
              resource_name: `customers/${cid}/ads/${adId}`,
              tracking_url_template: trackingTemplate,
            },
          },
        ]);
        break;
      }
    }

    return {
      success: true,
      action: "set_tracking_template",
      entityId: encoded,
      beforeValue,
      afterValue: trackingTemplate,
      campaignId: prefetch.campaignId,
    };
  } catch (error) {
    return {
      success: false,
      action: "set_tracking_template",
      entityId: encoded,
      beforeValue,
      afterValue: trackingTemplate,
      error: extractErrorMessage(error),
    };
  }
}

// ─── Ad Group Management ─────────────────────────────────────────────

export async function createAdGroup(
  auth: AuthContext,
  campaignId: string,
  adGroupName: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);
  const campaignIdNum = safeEntityId(campaignId);

  if (!adGroupName.trim()) {
    return { success: false, action: "create_ad_group", entityId: "", beforeValue: "", afterValue: "", error: "Ad group name cannot be empty" };
  }

  try {
    const response = await customer.mutateResources([
      {
        entity: "ad_group" as any,
        operation: "create",
        resource: {
          name: adGroupName.trim(),
          campaign: `customers/${cid}/campaigns/${campaignIdNum}`,
          status: STATUS.ENABLED,
          type: AD_GROUP_TYPE.SEARCH_STANDARD,
        },
      },
    ]);

    const responses = (response as any)?.mutate_operation_responses ?? [];
    const resourceName = responses[0]?.ad_group_result?.resource_name as string | undefined;
    const adGroupId = resourceName?.split("/").pop() ?? "";

    if (!adGroupId) {
      return { success: false, action: "create_ad_group", entityId: "", beforeValue: "", afterValue: adGroupName, error: "Ad group created but ID could not be extracted from response" };
    }

    return {
      success: true,
      action: "create_ad_group",
      entityId: adGroupId,
      beforeValue: "",
      afterValue: adGroupName,
      campaignId,
    };
  } catch (error) {
    return {
      success: false,
      action: "create_ad_group",
      entityId: "",
      beforeValue: "",
      afterValue: adGroupName,
      error: extractErrorMessage(error),
    };
  }
}

// ─── Ad Management ───────────────────────────────────────────────────

export type CreateAdParams = {
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
};

export async function createAd(
  auth: AuthContext,
  adGroupId: string,
  params: CreateAdParams,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  const rsaError = validateRsaAssets(params.headlines, params.descriptions);
  if (rsaError) {
    return { success: false, action: "create_ad", entityId: "", beforeValue: "", afterValue: "", error: rsaError };
  }
  let adGroupIdNum: number;
  try {
    adGroupIdNum = safeEntityId(adGroupId, "ad group");
  } catch (e) {
    return { success: false, action: "create_ad", entityId: "", beforeValue: "", afterValue: "", error: (e as Error).message };
  }
  if (!isValidFinalUrl(params.finalUrl)) {
    return { success: false, action: "create_ad", entityId: "", beforeValue: "", afterValue: "", error: "Final URL must start with http:// or https://" };
  }

  try {
    const response = await customer.mutateResources([
      {
        entity: "ad_group_ad" as any,
        operation: "create",
        resource: {
          ad_group: `customers/${cid}/adGroups/${adGroupIdNum}`,
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
    ]);

    const responses = (response as any)?.mutate_operation_responses ?? [];
    const resourceName = responses[0]?.ad_group_ad_result?.resource_name as string | undefined;
    // resource_name format: customers/{cid}/adGroupAds/{adGroupId}~{adId}
    const adId = resourceName?.split("~").pop() ?? "";

    if (!adId) {
      return { success: false, action: "create_ad", entityId: "", beforeValue: adGroupId, afterValue: params.finalUrl, error: "Ad created but ID could not be extracted from response" };
    }

    return {
      success: true,
      action: "create_ad",
      entityId: adId,
      beforeValue: adGroupId,
      afterValue: params.finalUrl,
    };
  } catch (error) {
    return {
      success: false,
      action: "create_ad",
      entityId: "",
      beforeValue: adGroupId,
      afterValue: params.finalUrl,
      error: extractErrorMessage(error),
    };
  }
}

async function setAdStatus(
  auth: AuthContext,
  adGroupId: string,
  adId: string,
  pause: boolean,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);
  const action = pause ? "pause_ad" : "enable_ad";
  const targetStatus = pause ? STATUS.PAUSED : STATUS.ENABLED;

  try {
    await customer.mutateResources([
      {
        entity: "ad_group_ad" as any,
        operation: "update",
        resource: {
          resource_name: `customers/${cid}/adGroupAds/${adGroupId}~${adId}`,
          status: targetStatus,
        },
      },
    ]);

    return {
      success: true,
      action,
      entityId: adId,
      beforeValue: adGroupId, // stored for undo (needs adGroupId + adId)
      afterValue: pause ? "PAUSED" : "ENABLED",
    };
  } catch (error) {
    return {
      success: false,
      action,
      entityId: adId,
      beforeValue: adGroupId,
      afterValue: pause ? "ENABLED" : "PAUSED",
      error: extractErrorMessage(error),
    };
  }
}

export async function pauseAd(auth: AuthContext, adGroupId: string, adId: string): Promise<WriteResult> {
  return setAdStatus(auth, adGroupId, adId, true);
}

export async function enableAd(auth: AuthContext, adGroupId: string, adId: string): Promise<WriteResult> {
  return setAdStatus(auth, adGroupId, adId, false);
}

export async function removeAd(
  auth: AuthContext,
  adGroupId: string,
  adId: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);
  const normalizedAdGroupId = safeEntityId(adGroupId);
  const normalizedAdId = safeEntityId(adId);

  try {
    await customer.mutateResources([
      {
        entity: "ad_group_ad" as any,
        operation: "remove",
        resource: `customers/${cid}/adGroupAds/${normalizedAdGroupId}~${normalizedAdId}` as any,
      },
    ]);

    return {
      success: true,
      action: "remove_ad",
      entityId: adId,
      beforeValue: adGroupId,
      afterValue: "REMOVED",
    };
  } catch (error) {
    return {
      success: false,
      action: "remove_ad",
      entityId: adId,
      beforeValue: adGroupId,
      afterValue: "PAUSED",
      error: extractErrorMessage(error),
    };
  }
}

// ─── Conversion Action Management ──────────────────────────────────

// Shared enum maps — values from google-ads-api protobuf (enums.js).
// Used by both create and update functions.
const CONVERSION_CATEGORY_MAP: Record<string, number> = {
  DEFAULT: 2, PAGE_VIEW: 3, PURCHASE: 4, SIGNUP: 5,
  DOWNLOAD: 7, ADD_TO_CART: 8, BEGIN_CHECKOUT: 9, SUBSCRIBE_PAID: 10,
  PHONE_CALL_LEAD: 11, IMPORTED_LEAD: 12, SUBMIT_LEAD_FORM: 13,
  BOOK_APPOINTMENT: 14, REQUEST_QUOTE: 15, GET_DIRECTIONS: 16,
  OUTBOUND_CLICK: 17, CONTACT: 18, ENGAGEMENT: 19,
  STORE_VISIT: 20, STORE_SALE: 21, QUALIFIED_LEAD: 22, CONVERTED_LEAD: 23,
  LEAD: 12, // Alias for IMPORTED_LEAD
  OTHER: 2, // No distinct OTHER in ConversionActionCategoryEnum, falls back to DEFAULT
};
const CONVERSION_TYPE_MAP: Record<string, number> = {
  UPLOAD_CALLS: 6, UPLOAD_CLICKS: 7, WEBPAGE: 8,
};
const CONVERSION_COUNTING_MAP: Record<string, number> = {
  ONE_PER_CLICK: 2, MANY_PER_CLICK: 3,
};
const CONVERSION_STATUS_MAP: Record<string, number> = {
  ENABLED: 2, REMOVED: 3,
};

// Reverse-lookup maps for normalizing numeric GAQL responses to string names.
// The google-ads-api returns numeric protobuf values for enum fields.
function reverseMap(map: Record<string, number>): Record<number, string> {
  const result: Record<number, string> = {};
  for (const [key, value] of Object.entries(map)) {
    if (!(value in result)) result[value] = key; // first key wins (handles OTHER→DEFAULT alias)
  }
  return result;
}
const CATEGORY_REVERSE = reverseMap(CONVERSION_CATEGORY_MAP);
const STATUS_REVERSE = reverseMap(CONVERSION_STATUS_MAP);
const COUNTING_REVERSE = reverseMap(CONVERSION_COUNTING_MAP);

// ConversionAction.type values that are read-only via the API. Mutating these
// returns mutate_error=9 ("Mutates are not allowed for the requested resource").
// Source: ConversionActionTypeEnum in google-ads-api protobuf. Includes types
// imported from external systems (GA4, UA, Floodlight, Salesforce, SA360),
// app-store integrations (Firebase, Google Play, Android pre-registration,
// third-party app analytics), Smart Campaign auto-generated actions, and
// Google-measured store visits. Numeric values match the enum.
const READ_ONLY_CONVERSION_ACTION_TYPES = new Map<number, string>([
  [1, "UNKNOWN"],
  [4, "GOOGLE_PLAY_DOWNLOAD"],
  [5, "GOOGLE_PLAY_IN_APP_PURCHASE"],
  [12, "FIREBASE_ANDROID_FIRST_OPEN"],
  [13, "FIREBASE_ANDROID_IN_APP_PURCHASE"],
  [14, "FIREBASE_ANDROID_CUSTOM"],
  [15, "FIREBASE_IOS_FIRST_OPEN"],
  [16, "FIREBASE_IOS_IN_APP_PURCHASE"],
  [17, "FIREBASE_IOS_CUSTOM"],
  [18, "THIRD_PARTY_APP_ANALYTICS_ANDROID_FIRST_OPEN"],
  [19, "THIRD_PARTY_APP_ANALYTICS_ANDROID_IN_APP_PURCHASE"],
  [20, "THIRD_PARTY_APP_ANALYTICS_ANDROID_CUSTOM"],
  [21, "THIRD_PARTY_APP_ANALYTICS_IOS_FIRST_OPEN"],
  [22, "THIRD_PARTY_APP_ANALYTICS_IOS_IN_APP_PURCHASE"],
  [23, "THIRD_PARTY_APP_ANALYTICS_IOS_CUSTOM"],
  [24, "ANDROID_APP_PRE_REGISTRATION"],
  [25, "ANDROID_INSTALLS_ALL_OTHER_APPS"],
  [26, "FLOODLIGHT_ACTION"],
  [27, "FLOODLIGHT_TRANSACTION"],
  [28, "GOOGLE_HOSTED"],
  [30, "SALESFORCE"],
  [31, "SEARCH_ADS_360"],
  [32, "SMART_CAMPAIGN_AD_CLICKS_TO_CALL"],
  [33, "SMART_CAMPAIGN_MAP_CLICKS_TO_CALL"],
  [34, "SMART_CAMPAIGN_MAP_DIRECTIONS"],
  [35, "SMART_CAMPAIGN_TRACKED_CALLS"],
  [36, "STORE_VISITS"],
  [38, "UNIVERSAL_ANALYTICS_GOAL"],
  [39, "UNIVERSAL_ANALYTICS_TRANSACTION"],
  [40, "GOOGLE_ANALYTICS_4_CUSTOM"],
  [41, "GOOGLE_ANALYTICS_4_PURCHASE"],
]);

/**
 * Classify whether a conversion action can be mutated. Returns a human-readable
 * reason string when read-only, or null when mutation is allowed.
 *
 * GAQL may return either numeric protobuf values or string enum names depending
 * on the client version, so we accept both.
 */
export function readOnlyConversionActionReason(
  cid: string,
  conversionActionId: string,
  rawType: unknown,
  ownerCustomer: unknown,
): string | null {
  // Manager-owned conversion actions are inherited and cannot be modified
  // from the child account. owner_customer is a resource_name like
  // "customers/123456". We compare against the current customer.
  if (typeof ownerCustomer === "string" && ownerCustomer.length > 0) {
    const ownerCid = ownerCustomer.split("/").pop();
    if (ownerCid && ownerCid !== cid) {
      return `Conversion action ${conversionActionId} is owned by a manager account (${ownerCid}). Inherited conversion actions are read-only from this account; modify it in the manager account or in the Google Ads UI.`;
    }
  }

  if (typeof rawType === "number" && READ_ONLY_CONVERSION_ACTION_TYPES.has(rawType)) {
    const typeName = READ_ONLY_CONVERSION_ACTION_TYPES.get(rawType);
    return `Conversion action ${conversionActionId} has type ${typeName} and is read-only via the API. Modify it in the Google Ads UI or in its source system (e.g. GA4, Firebase, Salesforce, Floodlight).`;
  }
  if (typeof rawType === "string") {
    for (const name of READ_ONLY_CONVERSION_ACTION_TYPES.values()) {
      if (name === rawType) {
        return `Conversion action ${conversionActionId} has type ${rawType} and is read-only via the API. Modify it in the Google Ads UI or in its source system (e.g. GA4, Firebase, Salesforce, Floodlight).`;
      }
    }
  }
  return null;
}

/** Enable Enhanced Conversions for Leads at account level (idempotent). */
async function enableEcfl(
  customer: ReturnType<typeof getCustomer>,
  cid: string,
): Promise<string | null> {
  try {
    await customer.mutateResources([
      {
        entity: "customer" as any,
        operation: "update",
        resource: {
          resource_name: `customers/${cid}`,
          conversion_tracking_setting: {
            enhanced_conversions_for_leads_enabled: true,
          },
        },
      },
    ]);
    return null; // success
  } catch (error) {
    return extractErrorMessage(error);
  }
}

/**
 * Set whether a conversion action is "primary" (included in Conversions column)
 * or "secondary" (observation only). Updates primary_for_goal on the ConversionAction resource.
 */
async function setPrimaryForGoal(
  customer: ReturnType<typeof getCustomer>,
  cid: string,
  conversionActionId: string,
  primary: boolean,
): Promise<string | null> {
  try {
    await customer.mutateResources([
      {
        entity: "conversion_action" as any,
        operation: "update",
        resource: {
          resource_name: `customers/${cid}/conversionActions/${conversionActionId}`,
          primary_for_goal: primary,
        },
      },
    ]);
    return null;
  } catch (error) {
    return rewriteConversionActionMutateError(extractErrorMessage(error), conversionActionId);
  }
}

export type CreateConversionActionParams = {
  name: string;
  category?: string;
  type?: string;
  countingType?: string;
  defaultValue?: number;
  alwaysUseDefaultValue?: boolean;
  status?: string;
  primaryForGoal?: boolean;
  enhancedConversionsForLeads?: boolean;
  viewThroughLookbackWindowDays?: number;
  clickThroughLookbackWindowDays?: number;
};

export async function createConversionAction(
  auth: AuthContext,
  params: CreateConversionActionParams,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  if (!params.name.trim()) {
    return { success: false, action: "create_conversion_action", entityId: "", beforeValue: "", afterValue: "", error: "Conversion action name cannot be empty" };
  }

  const resource: Record<string, unknown> = {
    name: params.name.trim(),
    category: CONVERSION_CATEGORY_MAP[params.category ?? "PURCHASE"] ?? CONVERSION_CATEGORY_MAP.PURCHASE,
    type: CONVERSION_TYPE_MAP[params.type ?? "UPLOAD_CLICKS"] ?? CONVERSION_TYPE_MAP.UPLOAD_CLICKS,
    counting_type: CONVERSION_COUNTING_MAP[params.countingType ?? "ONE_PER_CLICK"] ?? CONVERSION_COUNTING_MAP.ONE_PER_CLICK,
    status: CONVERSION_STATUS_MAP[params.status ?? "ENABLED"] ?? CONVERSION_STATUS_MAP.ENABLED,
  };

  // Value settings
  if (params.defaultValue !== undefined || params.alwaysUseDefaultValue !== undefined) {
    resource.value_settings = {
      default_value: params.defaultValue ?? 0,
      always_use_default_value: params.alwaysUseDefaultValue ?? true,
    };
  }

  if (params.viewThroughLookbackWindowDays !== undefined) {
    resource.view_through_lookback_window_days = params.viewThroughLookbackWindowDays;
  }
  if (params.clickThroughLookbackWindowDays !== undefined) {
    resource.click_through_lookback_window_days = params.clickThroughLookbackWindowDays;
  }

  try {
    const response = await customer.mutateResources([
      {
        entity: "conversion_action" as any,
        operation: "create",
        resource,
      },
    ]);

    const responses = (response as any)?.mutate_operation_responses ?? [];
    const resourceName = responses[0]?.conversion_action_result?.resource_name as string | undefined;
    const conversionActionId = resourceName?.split("/").pop() ?? "";

    if (!conversionActionId) {
      return { success: false, action: "create_conversion_action", entityId: "", beforeValue: "", afterValue: params.name, error: "Conversion action created but ID could not be extracted from response" };
    }

    const warnings: string[] = [];

    // Set as secondary (observation only) if requested
    if (params.primaryForGoal === false) {
      const goalError = await setPrimaryForGoal(customer, cid, conversionActionId, false);
      if (goalError) warnings.push(`Setting as secondary failed: ${goalError}`);
    }

    // Enable Enhanced Conversions for Leads at account level if requested
    if (params.enhancedConversionsForLeads) {
      const ecflError = await enableEcfl(customer, cid);
      if (ecflError) warnings.push(`Enabling Enhanced Conversions for Leads failed: ${ecflError}`);
    }

    return {
      success: true,
      action: "create_conversion_action",
      entityId: conversionActionId,
      beforeValue: "",
      afterValue: params.name,
      ...(warnings.length > 0 ? { label: `Warning: ${warnings.join(". ")}` } : {}),
    };
  } catch (error) {
    return {
      success: false,
      action: "create_conversion_action",
      entityId: "",
      beforeValue: "",
      afterValue: params.name,
      error: extractErrorMessage(error),
    };
  }
}

export type UpdateConversionActionParams = {
  conversionActionId: string;
  name?: string;
  category?: string;
  countingType?: string;
  defaultValue?: number;
  alwaysUseDefaultValue?: boolean;
  status?: string;
  primaryForGoal?: boolean;
  enhancedConversionsForLeads?: boolean;
  viewThroughLookbackWindowDays?: number;
  clickThroughLookbackWindowDays?: number;
};

export async function updateConversionAction(
  auth: AuthContext,
  params: UpdateConversionActionParams,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);


  // Fetch current state for undo record + read-only classification.
  // type and owner_customer let us pre-empt mutate_error=9 ("Mutates not
  // allowed") on GA4-imported, Floodlight, Firebase, manager-owned, and other
  // read-only conversion actions, returning a clear actionable error instead
  // of a cryptic API failure.
  let beforeValue: string;
  let rawType: unknown;
  let ownerCustomer: unknown;
  try {
    const current = await customer.query(`
      SELECT
        conversion_action.name,
        conversion_action.status,
        conversion_action.category,
        conversion_action.counting_type,
        conversion_action.type,
        conversion_action.owner_customer,
        conversion_action.value_settings.default_value,
        conversion_action.value_settings.always_use_default_value
      FROM conversion_action
      WHERE conversion_action.id = ${safeEntityId(params.conversionActionId, "conversion action")}
      LIMIT 1
    `);
    const row = (current as any[])[0]?.conversion_action ?? {};
    // Normalize numeric enum values to string names for undo compatibility.
    // GAQL returns numeric protobuf values (e.g. 2 for ENABLED), but the
    // undo path passes these back through CONVERSION_STATUS_MAP which expects string keys.
    const rawStatus = row.status;
    const rawCategory = row.category;
    const rawCounting = row.counting_type;
    rawType = row.type;
    ownerCustomer = row.owner_customer;
    beforeValue = JSON.stringify({
      name: row.name,
      status: typeof rawStatus === "number" ? STATUS_REVERSE[rawStatus] : rawStatus,
      category: typeof rawCategory === "number" ? CATEGORY_REVERSE[rawCategory] : rawCategory,
      countingType: typeof rawCounting === "number" ? COUNTING_REVERSE[rawCounting] : rawCounting,
      defaultValue: row.value_settings?.default_value,
      alwaysUseDefaultValue: row.value_settings?.always_use_default_value,
    });
  } catch (fetchError) {
    return {
      success: false,
      action: "update_conversion_action",
      entityId: params.conversionActionId,
      beforeValue: "",
      afterValue: "",
      error: `Could not read current conversion action before writing (undo would be unsafe): ${extractErrorMessage(fetchError)}`,
    };
  }

  // Pre-flight: refuse early when the conversion action is read-only via the
  // API (manager-owned or imported from GA4/UA/Firebase/Floodlight/etc.).
  // Without this we'd send a mutate that fails with mutate_error=9 and the
  // agent gets no signal about why — agents iterating "demote all secondary"
  // sweeps would burn N round trips.
  const readOnlyReason = readOnlyConversionActionReason(
    cid,
    params.conversionActionId,
    rawType,
    ownerCustomer,
  );
  if (readOnlyReason) {
    return {
      success: false,
      action: "update_conversion_action",
      entityId: params.conversionActionId,
      beforeValue,
      afterValue: "",
      error: readOnlyReason,
    };
  }

  // Build the conversion_action mutate resource. Track whether we have any
  // real field changes — if the caller is only flipping primaryForGoal, we
  // must NOT issue an empty mutate. The google-ads-api library derives the
  // field_mask from the resource keys, skipping camelCase `resourceName` but
  // NOT snake_case `resource_name`. An empty resource would produce
  // field_mask=["resource_name"], which Google rejects with mutate_error=9.
  const resource: Record<string, unknown> = {
    resource_name: `customers/${cid}/conversionActions/${params.conversionActionId}`,
  };
  let hasFieldChanges = false;

  if (params.name !== undefined) {
    resource.name = params.name.trim();
    hasFieldChanges = true;
  }
  if (params.category !== undefined) {
    resource.category = CONVERSION_CATEGORY_MAP[params.category] ?? CONVERSION_CATEGORY_MAP.DEFAULT;
    hasFieldChanges = true;
  }
  if (params.countingType !== undefined) {
    resource.counting_type = CONVERSION_COUNTING_MAP[params.countingType] ?? CONVERSION_COUNTING_MAP.ONE_PER_CLICK;
    hasFieldChanges = true;
  }
  if (params.status !== undefined) {
    resource.status = CONVERSION_STATUS_MAP[params.status] ?? CONVERSION_STATUS_MAP.ENABLED;
    hasFieldChanges = true;
  }
  if (params.defaultValue !== undefined || params.alwaysUseDefaultValue !== undefined) {
    resource.value_settings = {
      ...(params.defaultValue !== undefined && { default_value: params.defaultValue }),
      ...(params.alwaysUseDefaultValue !== undefined && { always_use_default_value: params.alwaysUseDefaultValue }),
    };
    hasFieldChanges = true;
  }
  if (params.viewThroughLookbackWindowDays !== undefined) {
    resource.view_through_lookback_window_days = params.viewThroughLookbackWindowDays;
    hasFieldChanges = true;
  }
  if (params.clickThroughLookbackWindowDays !== undefined) {
    resource.click_through_lookback_window_days = params.clickThroughLookbackWindowDays;
    hasFieldChanges = true;
  }

  const afterValue = JSON.stringify({
    name: params.name,
    status: params.status,
    category: params.category,
    countingType: params.countingType,
    defaultValue: params.defaultValue,
    alwaysUseDefaultValue: params.alwaysUseDefaultValue,
  });

  try {
    if (hasFieldChanges) {
      await customer.mutateResources([
        {
          entity: "conversion_action" as any,
          operation: "update",
          resource,
        },
      ]);
    }

    const warnings: string[] = [];

    // Set primary/secondary via ConversionAction.primary_for_goal. This is a
    // separate mutate with primary_for_goal populated (non-empty field_mask),
    // so it works even when no other fields are being changed.
    if (params.primaryForGoal !== undefined) {
      const goalError = await setPrimaryForGoal(customer, cid, params.conversionActionId, params.primaryForGoal);
      if (goalError) {
        // If primaryForGoal was the ONLY thing being changed, the entire
        // operation has effectively failed — surface it as a hard failure
        // rather than a silent warning. Otherwise (real field changes also
        // landed) keep it as a warning so the partial success is visible.
        if (!hasFieldChanges) {
          return {
            success: false,
            action: "update_conversion_action",
            entityId: params.conversionActionId,
            beforeValue,
            afterValue,
            error: `Setting primary_for_goal failed: ${goalError}`,
          };
        }
        warnings.push(`Setting primary_for_goal failed: ${goalError}`);
      }
    }

    // Enable Enhanced Conversions for Leads at account level if requested
    if (params.enhancedConversionsForLeads) {
      const ecflError = await enableEcfl(customer, cid);
      if (ecflError) warnings.push(`Enabling Enhanced Conversions for Leads failed: ${ecflError}`);
    }

    return {
      success: true,
      action: "update_conversion_action",
      entityId: params.conversionActionId,
      beforeValue,
      afterValue,
      ...(warnings.length > 0 ? { label: `Warning: ${warnings.join(". ")}` } : {}),
    };
  } catch (error) {
    return {
      success: false,
      action: "update_conversion_action",
      entityId: params.conversionActionId,
      beforeValue,
      afterValue,
      error: rewriteConversionActionMutateError(extractErrorMessage(error), params.conversionActionId),
    };
  }
}

/**
 * Permanently remove a conversion action. Setting `status: REMOVED` via update
 * is rejected by Google with `request_error=18` (UNUSABLE_ENUM_VALUE) — the
 * canonical delete is the `remove` operation on ConversionActionService. This
 * is not undoable: removed conversion actions are gone.
 */
export async function removeConversionAction(
  auth: AuthContext,
  conversionActionId: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  // Snapshot type + owner so we (a) write a useful beforeValue for the audit
  // trail and (b) can preempt the same read-only failure modes that update has.
  let beforeValue = "";
  let rawType: unknown;
  let ownerCustomer: unknown;
  try {
    const current = await customer.query(`
      SELECT
        conversion_action.name,
        conversion_action.status,
        conversion_action.type,
        conversion_action.owner_customer
      FROM conversion_action
      WHERE conversion_action.id = ${safeEntityId(conversionActionId, "conversion action")}
      LIMIT 1
    `);
    const row = (current as any[])[0]?.conversion_action ?? {};
    rawType = row.type;
    ownerCustomer = row.owner_customer;
    beforeValue = JSON.stringify({ name: row.name, status: row.status, type: row.type });
  } catch (fetchError) {
    return {
      success: false,
      action: "remove_conversion_action",
      entityId: conversionActionId,
      beforeValue: "",
      afterValue: "",
      error: `Could not read current conversion action before removing: ${extractErrorMessage(fetchError)}`,
    };
  }

  const readOnlyReason = readOnlyConversionActionReason(cid, conversionActionId, rawType, ownerCustomer);
  if (readOnlyReason) {
    return {
      success: false,
      action: "remove_conversion_action",
      entityId: conversionActionId,
      beforeValue,
      afterValue: "",
      error: readOnlyReason,
    };
  }

  const resourceName = `customers/${cid}/conversionActions/${conversionActionId}`;
  try {
    await customer.conversionActions.remove([resourceName]);
    return {
      success: true,
      action: "remove_conversion_action",
      entityId: conversionActionId,
      beforeValue,
      afterValue: "removed",
    };
  } catch (error) {
    return {
      success: false,
      action: "remove_conversion_action",
      entityId: conversionActionId,
      beforeValue,
      afterValue: "",
      error: rewriteConversionActionMutateError(extractErrorMessage(error), conversionActionId),
    };
  }
}

// ─── Upload Click Conversions ───────────────────────────────────────

export type ClickConversionInput = {
  gclid?: string;
  conversionDateTime: string;
  conversionValue?: number;
  currencyCode?: string;
  orderId?: string;
  hashedEmail?: string;
  hashedPhoneNumber?: string;
};

export type UploadClickConversionsResult = {
  success: boolean;
  action: string;
  totalUploaded: number;
  successCount: number;
  failureCount: number;
  partialErrors: Array<{ index: number; message: string }>;
  error?: string;
};

/** Validate a string looks like a SHA-256 hash (64 hex chars). */
function isValidSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

/**
 * Convert ISO 8601 datetime to Google Ads format: "yyyy-mm-dd hh:mm:ss+|-hh:mm"
 * Example: "2024-01-15T14:30:00-05:00" → "2024-01-15 14:30:00-05:00"
 *
 * Google Ads rejects milliseconds and requires an explicit timezone offset.
 */
function toGoogleAdsDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${iso}`);
  }

  // If the input has an explicit offset (e.g. -05:00 or +00:00), preserve it.
  // Otherwise, format in UTC with +00:00.
  const offsetMatch = iso.match(/([+-]\d{2}:\d{2})$/);

  if (offsetMatch) {
    // Input has explicit offset — strip T, strip fractional seconds, keep offset
    return iso
      .replace("T", " ")
      .replace(/\.\d+/, ""); // remove any fractional seconds (.123, .123456, etc.)
  }

  // No explicit offset (bare datetime or trailing Z) — format as UTC
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  const seconds = pad(d.getUTCSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}+00:00`;
}

export async function uploadClickConversions(
  auth: AuthContext,
  conversionActionId: string,
  conversions: ClickConversionInput[],
): Promise<UploadClickConversionsResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  // Validate conversionActionId
  try {
    safeEntityId(conversionActionId, "conversion action");
  } catch (e) {
    return {
      success: false,
      action: "upload_click_conversions",
      totalUploaded: 0,
      successCount: 0,
      failureCount: conversions.length,
      partialErrors: [],
      error: (e as Error).message,
    };
  }

  const conversionActionResourceName = `customers/${cid}/conversionActions/${conversionActionId}`;

  // Validate each conversion
  for (let i = 0; i < conversions.length; i++) {
    const c = conversions[i];
    if (!c.gclid && !c.hashedEmail && !c.hashedPhoneNumber) {
      return {
        success: false,
        action: "upload_click_conversions",
        totalUploaded: 0,
        successCount: 0,
        failureCount: conversions.length,
        partialErrors: [],
        error: `Conversion at index ${i}: must have at least one of gclid, hashedEmail, or hashedPhoneNumber`,
      };
    }
    if (c.hashedEmail && !isValidSha256(c.hashedEmail)) {
      return {
        success: false,
        action: "upload_click_conversions",
        totalUploaded: 0,
        successCount: 0,
        failureCount: conversions.length,
        partialErrors: [],
        error: `Conversion at index ${i}: hashedEmail must be a valid SHA-256 hash (64 hex characters)`,
      };
    }
    if (c.hashedPhoneNumber && !isValidSha256(c.hashedPhoneNumber)) {
      return {
        success: false,
        action: "upload_click_conversions",
        totalUploaded: 0,
        successCount: 0,
        failureCount: conversions.length,
        partialErrors: [],
        error: `Conversion at index ${i}: hashedPhoneNumber must be a valid SHA-256 hash (64 hex characters)`,
      };
    }
  }

  // Build ClickConversion objects
  const clickConversions = conversions.map((c) => {
    const conversion: Record<string, unknown> = {
      conversion_action: conversionActionResourceName,
      conversion_date_time: toGoogleAdsDateTime(c.conversionDateTime),
    };

    if (c.gclid) conversion.gclid = c.gclid;
    if (c.conversionValue !== undefined) conversion.conversion_value = c.conversionValue;
    if (c.currencyCode) conversion.currency_code = c.currencyCode;
    if (c.orderId) conversion.order_id = c.orderId;

    // Enhanced Conversions for Leads user identifiers
    const userIdentifiers: Array<Record<string, unknown>> = [];
    if (c.hashedEmail) {
      userIdentifiers.push({
        hashed_email: c.hashedEmail,
        user_identifier_source: 1, // FIRST_PARTY
      });
    }
    if (c.hashedPhoneNumber) {
      userIdentifiers.push({
        hashed_phone_number: c.hashedPhoneNumber,
        user_identifier_source: 1, // FIRST_PARTY
      });
    }
    if (userIdentifiers.length > 0) {
      conversion.user_identifiers = userIdentifiers;
    }

    return conversion;
  });

  try {
    const response = await customer.conversionUploads.uploadClickConversions({
      customer_id: cid,
      conversions: clickConversions as any,
      partial_failure: true,
    } as any);

    // Parse partial failure errors
    const partialErrors: Array<{ index: number; message: string }> = [];
    const partialFailureError = (response as any).partial_failure_error;
    if (partialFailureError?.details) {
      for (const detail of partialFailureError.details) {
        const errors = detail?.errors ?? [];
        for (const err of errors) {
          const fieldPath = err?.location?.field_path_elements?.[0];
          const index = fieldPath?.index ?? -1;
          partialErrors.push({
            index: Number(index),
            message: err.message ?? extractErrorMessage(err),
          });
        }
      }
    }

    // Count unique failed conversion indices (one conversion can have multiple errors)
    const failedIndices = new Set(partialErrors.map((e) => e.index));
    const failureCount = failedIndices.size;
    const successCount = conversions.length - failureCount;

    return {
      success: failureCount === 0,
      action: "upload_click_conversions",
      totalUploaded: conversions.length,
      successCount,
      failureCount,
      partialErrors,
    };
  } catch (error) {
    return {
      success: false,
      action: "upload_click_conversions",
      totalUploaded: 0,
      successCount: 0,
      failureCount: conversions.length,
      partialErrors: [],
      error: extractErrorMessage(error),
    };
  }
}

export async function updateAdFinalUrl(
  auth: AuthContext,
  adGroupId: string,
  adId: string,
  finalUrl: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);
  const entityId = `${adGroupId}~${adId}`;

  if (!isValidFinalUrl(finalUrl)) {
    return { success: false, action: "update_ad_final_url", entityId, beforeValue: "", afterValue: finalUrl, error: "Final URL must start with http:// or https://" };
  }

  let adIdNum: number;
  let adGroupIdNum: number;
  try {
    adIdNum = safeEntityId(adId, "ad");
    adGroupIdNum = safeEntityId(adGroupId, "ad group");
  } catch (e) {
    return { success: false, action: "update_ad_final_url", entityId, beforeValue: "", afterValue: finalUrl, error: (e as Error).message };
  }

  // Fetch current URL for undo record, scoped to the correct ad group.
  // Abort if fetch fails — proceeding with empty beforeValue would cause undo to set URL to "".
  let beforeValue: string;
  try {
    const current = await customer.query(`
      SELECT ad_group_ad.ad.final_urls
      FROM ad_group_ad
      WHERE ad_group_ad.ad.id = ${adIdNum}
        AND ad_group.id = ${adGroupIdNum}
      LIMIT 1
    `);
    beforeValue = (current as any[])[0]?.ad_group_ad?.ad?.final_urls?.[0] ?? "";
  } catch (fetchError) {
    return {
      success: false,
      action: "update_ad_final_url",
      entityId,
      beforeValue: "",
      afterValue: finalUrl,
      error: `Could not read current final URL before writing (undo would be unsafe): ${extractErrorMessage(fetchError)}`,
    };
  }

  try {
    await customer.mutateResources([
      {
        entity: "ad" as any,
        operation: "update",
        resource: {
          resource_name: `customers/${cid}/ads/${adId}`,
          final_urls: [finalUrl],
        },
      },
    ]);

    return {
      success: true,
      action: "update_ad_final_url",
      entityId,
      beforeValue,
      afterValue: finalUrl,
    };
  } catch (error) {
    return {
      success: false,
      action: "update_ad_final_url",
      entityId,
      beforeValue,
      afterValue: finalUrl,
      error: extractErrorMessage(error),
    };
  }
}

export type AdAsset = { text: string; pin?: number };

export type UpdateAdAssetsParams = {
  headlines: AdAsset[];
  descriptions: AdAsset[];
};

/** Convert raw API pinned_field value (number or string) to user-facing pin number (1-3). */
function pinnedFieldToPin(raw: unknown): number | undefined {
  if (!raw) return undefined;
  const s = String(raw);
  if (s === "HEADLINE_1" || s === "2") return 1;
  if (s === "HEADLINE_2" || s === "3") return 2;
  if (s === "HEADLINE_3" || s === "4") return 3;
  if (s === "DESCRIPTION_1" || s === "5") return 1;
  if (s === "DESCRIPTION_2" || s === "6") return 2;
  return undefined;
}

/** Convert user-facing pin number to Google Ads API pinned_field string for headlines. */
function headlinePinnedField(pin: number | undefined): string | undefined {
  if (pin === 1) return "HEADLINE_1";
  if (pin === 2) return "HEADLINE_2";
  if (pin === 3) return "HEADLINE_3";
  return undefined;
}

/** Convert user-facing pin number to Google Ads API pinned_field string for descriptions. */
function descriptionPinnedField(pin: number | undefined): string | undefined {
  if (pin === 1) return "DESCRIPTION_1";
  if (pin === 2) return "DESCRIPTION_2";
  return undefined;
}

export async function updateAdAssets(
  auth: AuthContext,
  adGroupId: string,
  adId: string,
  params: UpdateAdAssetsParams,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);
  const entityId = `${adGroupId}~${adId}`;

  const rsaError = validateRsaAssets(
    params.headlines.map((h) => h.text),
    params.descriptions.map((d) => d.text),
  );
  if (rsaError) {
    return { success: false, action: "update_ad_assets", entityId, beforeValue: "", afterValue: "", error: rsaError };
  }

  // Validate pin values
  for (const h of params.headlines) {
    if (h.pin !== undefined && (h.pin < 1 || h.pin > 3 || !Number.isInteger(h.pin))) {
      return { success: false, action: "update_ad_assets", entityId, beforeValue: "", afterValue: "", error: `Invalid headline pin ${h.pin}: must be 1, 2, or 3` };
    }
  }
  for (const d of params.descriptions) {
    if (d.pin !== undefined && (d.pin < 1 || d.pin > 2 || !Number.isInteger(d.pin))) {
      return { success: false, action: "update_ad_assets", entityId, beforeValue: "", afterValue: "", error: `Invalid description pin ${d.pin}: must be 1 or 2` };
    }
  }

  let adIdNum: number;
  let adGroupIdNum: number;
  try {
    adIdNum = safeEntityId(adId, "ad");
    adGroupIdNum = safeEntityId(adGroupId, "ad group");
  } catch (e) {
    return { success: false, action: "update_ad_assets", entityId, beforeValue: "", afterValue: "", error: (e as Error).message };
  }

  // Fetch current assets for undo record, scoped to the correct ad group.
  // Abort if fetch fails — proceeding with empty beforeValue would cause undo to restore empty assets.
  let beforeValue: string;
  try {
    const current = await customer.query(`
      SELECT
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions
      FROM ad_group_ad
      WHERE ad_group_ad.ad.id = ${adIdNum}
        AND ad_group.id = ${adGroupIdNum}
      LIMIT 1
    `);
    const row = (current as any[])[0]?.ad_group_ad?.ad?.responsive_search_ad ?? {};
    beforeValue = JSON.stringify({
      h: (row.headlines ?? []).map((x: any) => {
        const asset: AdAsset = { text: x.text ?? "" };
        const pin = pinnedFieldToPin(x.pinned_field);
        if (pin !== undefined) asset.pin = pin;
        return asset;
      }),
      d: (row.descriptions ?? []).map((x: any) => {
        const asset: AdAsset = { text: x.text ?? "" };
        const pin = pinnedFieldToPin(x.pinned_field);
        if (pin !== undefined) asset.pin = pin;
        return asset;
      }),
    });
  } catch (fetchError) {
    return {
      success: false,
      action: "update_ad_assets",
      entityId,
      beforeValue: "",
      afterValue: "",
      error: `Could not read current ad assets before writing (undo would be unsafe): ${extractErrorMessage(fetchError)}`,
    };
  }

  const afterValue = JSON.stringify({
    h: params.headlines,
    d: params.descriptions,
  });

  try {
    await customer.mutateResources([
      {
        entity: "ad" as any,
        operation: "update",
        resource: {
          resource_name: `customers/${cid}/ads/${adId}`,
          responsive_search_ad: {
            headlines: params.headlines.map((h) => {
              const asset: Record<string, unknown> = { text: h.text };
              const pf = headlinePinnedField(h.pin);
              if (pf) asset.pinned_field = pf;
              return asset;
            }),
            descriptions: params.descriptions.map((d) => {
              const asset: Record<string, unknown> = { text: d.text };
              const pf = descriptionPinnedField(d.pin);
              if (pf) asset.pinned_field = pf;
              return asset;
            }),
          },
        },
      },
    ]);

    return {
      success: true,
      action: "update_ad_assets",
      entityId,
      beforeValue,
      afterValue,
    };
  } catch (error) {
    const policy = extractPolicyDetails(error);
    const raw = extractErrorMessage(error);
    const rewritten = rewriteRemovedResourceError(raw, `Ad ${adId}`);
    return {
      success: false,
      action: "update_ad_assets",
      entityId,
      beforeValue,
      afterValue,
      error: policy ?? rewritten,
    };
  }
}
