import { getCachedCustomer, getCustomer, AD_GROUP_TYPE, MATCH_TYPE, STATUS } from "./client";
import { extractErrorMessage, isValidFinalUrl, normalizeCustomerId, safeEntityId, toMicros, validateRsaAssets } from "./helpers";
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
};

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
      error: extractErrorMessage(error),
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
    return {
      success: false,
      action: "update_ad_assets",
      entityId,
      beforeValue,
      afterValue,
      error: extractErrorMessage(error),
    };
  }
}
