import { z } from "zod";
import { safeHandler, accountIdParam, WRITE_ANNOTATIONS } from "../types";
import type { WriteToolDeps } from "./_deps";

export function registerCreateCampaignTools(deps: WriteToolDeps) {
  const { server, executeCreate } = deps;

  // ─── Create Campaign (7 separate tools, unified lib) ───────────────
  //
  // Each tool has a focused flat Zod schema with only the fields its campaign
  // type uses and proper required-field enforcement at the schema level.
  // All handlers delegate to the same unified createCampaign lib function.
  //
  // Action strings are load-bearing — they must match the case labels in the
  // undoChange handler below and the TOOL_CODE / REVERSIBLE_ACTIONS maps.

  // ── 1. Search ──────────────────────────────────────────────────────

  server.registerTool("createCampaign", {
    description:
      "Create a Search campaign with budget, ad group, keywords, and a Responsive Search Ad. " +
      "Starts PAUSED — use enableCampaign to go live. Returns changeId. " +
      "For other campaign types use: createShoppingCampaign, createPerformanceMaxCampaign, " +
      "createDemandGenCampaign, createDisplayCampaign, createVideoCampaign, createAppCampaign.",
    inputSchema: {
      accountId: accountIdParam,
      campaignName: z.string().min(1),
      dailyBudgetDollars: z.number().positive().min(1).describe("Daily budget in dollars"),
      keywords: z.array(z.string().min(1)).min(1).describe("Keywords to target (at least 1 required)."),
      headlines: z.array(z.string().max(30)).min(3).max(15).describe("3–15 headlines, max 30 chars each."),
      descriptions: z.array(z.string().max(90)).min(2).max(4).describe("2–4 descriptions, max 90 chars each."),
      finalUrl: z.string().url().describe("Primary landing page URL."),
      geoTargetIds: z.array(z.string()).optional().describe("Geo target constant IDs (e.g. '2840' for US). Use searchGeoTargets to find IDs."),
      languageIds: z.array(z.string()).optional().describe("Language constant IDs (e.g. '1000' for English). Defaults to no restriction."),
      keywordMatchType: z.enum(["BROAD", "PHRASE", "EXACT"]).optional().describe("Keyword match type. Defaults to BROAD."),
      bidding: z
        .object({
          strategy: z.enum(["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CLICKS", "MANUAL_CPC"]).optional().describe("Bidding strategy. Defaults to MAXIMIZE_CONVERSIONS."),
          defaultCpcDollars: z.number().positive().optional().describe("Default max CPC in dollars. Required for MANUAL_CPC."),
        })
        .optional()
        .describe("Bidding configuration. Defaults to MAXIMIZE_CONVERSIONS."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignName, dailyBudgetDollars, keywords, headlines, descriptions, finalUrl, geoTargetIds, languageIds, keywordMatchType, bidding }) => {
    return executeCreate(accountId, {
      campaignType: "SEARCH",
      campaignName,
      dailyBudgetDollars,
      keywords,
      headlines,
      descriptions,
      finalUrl,
      geoTargetIds,
      languageIds,
      keywordMatchType,
      bidding,
    }, "create_campaign", "Campaign created as PAUSED. Review settings in Google Ads, then use enableCampaign to start running ads.");
  }));

  // ── 2. Shopping ────────────────────────────────────────────────────

  const inventoryFilterSchema = z
    .array(
      z.union([
        z.object({
          productType: z.object({
            level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
            value: z.string().min(1),
          }),
        }),
        z.object({
          customLabel: z.object({
            index: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
            value: z.string().min(1),
          }),
        }),
      ])
    )
    .optional()
    .describe("Inventory filter dimensions restricting campaign to matching products. Omit to show all products.");

  server.registerTool("createShoppingCampaign", {
    description:
      "Create a Standard Shopping campaign linked to a Merchant Center feed. " +
      "Optional inventoryFilter scopes the campaign to a product_type or custom_label. " +
      "Starts PAUSED. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignName: z.string().min(1),
      dailyBudgetDollars: z.number().positive().min(1).describe("Daily budget in dollars"),
      merchantId: z
        .union([z.number().int().positive(), z.string().regex(/^\d+$/)])
        .transform((v) => Number(v))
        .describe("Google Merchant Center account ID."),
      salesCountry: z.string().length(2).describe("ISO-3166-1 alpha-2 sales country (e.g. 'US')."),
      geoTargetIds: z.array(z.string()).optional().describe("Geo target constant IDs (e.g. '2840' for US). Use searchGeoTargets to find IDs."),
      languageIds: z.array(z.string()).optional().describe("Language constant IDs. Defaults to no restriction."),
      campaignPriority: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional().describe("Campaign priority: 0=LOW (default), 1=MEDIUM, 2=HIGH."),
      enableLocal: z.boolean().optional().describe("Enable local inventory ads. Defaults to false."),
      searchPartners: z.boolean().optional().describe("Include search partner network. Defaults to false."),
      inventoryFilter: inventoryFilterSchema,
      bidding: z
        .object({
          strategy: z.enum(["MANUAL_CPC", "MAXIMIZE_CLICKS", "TARGET_ROAS"]).optional().describe("Bidding strategy. Defaults to MANUAL_CPC."),
          defaultCpcDollars: z.number().positive().optional().describe("Default max CPC in dollars. Required for MANUAL_CPC."),
          targetRoas: z.number().positive().optional().describe("Target ROAS as a ratio (e.g. 3.5 = 350%). Required for TARGET_ROAS."),
        })
        .optional()
        .describe("Bidding configuration. Defaults to MANUAL_CPC."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignName, dailyBudgetDollars, merchantId, salesCountry, geoTargetIds, languageIds, campaignPriority, enableLocal, searchPartners, inventoryFilter, bidding }) => {
    return executeCreate(accountId, {
      campaignType: "SHOPPING",
      campaignName,
      dailyBudgetDollars,
      merchantId,
      salesCountry,
      geoTargetIds,
      languageIds,
      campaignPriority,
      enableLocal,
      searchPartners,
      inventoryFilter: inventoryFilter as any,
      bidding,
    }, "create_shopping_campaign", "Shopping campaign created as PAUSED. Verify the Merchant Center link and inventory filter in Google Ads, then use enableCampaign to start running ads.");
  }));

  // ── 3. Performance Max ─────────────────────────────────────────────

  server.registerTool("createPerformanceMaxCampaign", {
    description:
      "Create a Performance Max campaign that serves across all Google channels via asset groups. " +
      "Pass merchantId+salesCountry for retail PMax linked to Merchant Center. " +
      "Starts PAUSED. Add image and video assets in Google Ads UI before enabling for full serving scale. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignName: z.string().min(1),
      dailyBudgetDollars: z.number().positive().min(1).describe("Daily budget in dollars"),
      finalUrl: z.string().url().describe("Primary landing page URL."),
      headlines: z.array(z.string().max(30)).min(3).max(15).describe("3–15 headlines, max 30 chars each."),
      longHeadlines: z.array(z.string().max(90)).min(1).max(5).describe("1–5 long headlines, max 90 chars each."),
      descriptions: z.array(z.string().max(90)).min(2).max(5).describe("2–5 descriptions, max 90 chars each."),
      businessName: z.string().min(1).describe("Business name shown in ads."),
      geoTargetIds: z.array(z.string()).optional().describe("Geo target constant IDs (e.g. '2840' for US). Use searchGeoTargets to find IDs."),
      languageIds: z.array(z.string()).optional().describe("Language constant IDs. Defaults to no restriction."),
      merchantId: z
        .union([z.number().int().positive(), z.string().regex(/^\d+$/)])
        .transform((v) => Number(v))
        .optional()
        .describe("Google Merchant Center account ID. Optional — links to product feed for retail PMax."),
      salesCountry: z.string().length(2).optional().describe("ISO-3166-1 alpha-2 sales country (e.g. 'US'). Required when merchantId is provided."),
      bidding: z
        .object({
          strategy: z.enum(["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE"]).optional().describe("Bidding strategy. Defaults to MAXIMIZE_CONVERSIONS."),
          targetCpaDollars: z.number().positive().optional().describe("Target CPA in dollars. Optional for MAXIMIZE_CONVERSIONS."),
          targetRoas: z.number().positive().optional().describe("Target ROAS as a ratio (e.g. 5.0 = 500%). Optional for MAXIMIZE_CONVERSION_VALUE."),
        })
        .optional()
        .describe("Bidding configuration. Defaults to MAXIMIZE_CONVERSIONS."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignName, dailyBudgetDollars, finalUrl, headlines, longHeadlines, descriptions, businessName, geoTargetIds, languageIds, merchantId, salesCountry, bidding }) => {
    return executeCreate(accountId, {
      campaignType: "PERFORMANCE_MAX",
      campaignName,
      dailyBudgetDollars,
      finalUrl,
      headlines,
      longHeadlines,
      descriptions,
      businessName,
      geoTargetIds,
      languageIds,
      merchantId,
      salesCountry,
      bidding,
    }, "create_pmax_campaign", "PMax campaign created as PAUSED. Add image and video assets in Google Ads UI (required for full serving scale), then use enableCampaign to go live.");
  }));

  // ── 4. Demand Gen ──────────────────────────────────────────────────

  server.registerTool("createDemandGenCampaign", {
    description:
      "Create a Demand Gen campaign serving on YouTube/Gmail/Discover. " +
      "Asset-based discovery campaigns. Add image assets in Google Ads UI for full ad delivery. " +
      "Starts PAUSED. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignName: z.string().min(1),
      dailyBudgetDollars: z.number().positive().min(1).describe("Daily budget in dollars"),
      finalUrl: z.string().url().describe("Primary landing page URL."),
      headlines: z.array(z.string().max(40)).min(3).max(5).describe("3–5 headlines, max 40 chars each."),
      longHeadlines: z.array(z.string().max(90)).min(1).max(5).describe("1–5 long headlines, max 90 chars each."),
      descriptions: z.array(z.string().max(90)).min(2).max(5).describe("2–5 descriptions, max 90 chars each."),
      businessName: z.string().min(1).describe("Business name shown in ads."),
      geoTargetIds: z.array(z.string()).optional().describe("Geo target constant IDs (e.g. '2840' for US). Use searchGeoTargets to find IDs."),
      languageIds: z.array(z.string()).optional().describe("Language constant IDs. Defaults to no restriction."),
      bidding: z
        .object({
          strategy: z.enum(["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE"]).optional().describe("Bidding strategy. Defaults to MAXIMIZE_CONVERSIONS."),
          targetCpaDollars: z.number().positive().optional().describe("Target CPA in dollars. Optional for MAXIMIZE_CONVERSIONS."),
          targetRoas: z.number().positive().optional().describe("Target ROAS as a ratio. Optional for MAXIMIZE_CONVERSION_VALUE."),
        })
        .optional()
        .describe("Bidding configuration. Defaults to MAXIMIZE_CONVERSIONS."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignName, dailyBudgetDollars, finalUrl, headlines, longHeadlines, descriptions, businessName, geoTargetIds, languageIds, bidding }) => {
    return executeCreate(accountId, {
      campaignType: "DEMAND_GEN",
      campaignName,
      dailyBudgetDollars,
      finalUrl,
      headlines,
      longHeadlines,
      descriptions,
      businessName,
      geoTargetIds,
      languageIds,
      bidding,
    }, "create_demand_gen_campaign", "Demand Gen campaign created as PAUSED. Add image assets (marketing images, square images, logo) in Google Ads UI for full ad delivery, then use enableCampaign to go live.");
  }));

  // ── 5. Display ─────────────────────────────────────────────────────

  server.registerTool("createDisplayCampaign", {
    description:
      "Create a Display Network campaign with a Responsive Display Ad. " +
      "Image assets must be uploaded first via createImageAsset; pass the resulting asset resource names. " +
      "Starts PAUSED. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignName: z.string().min(1),
      dailyBudgetDollars: z.number().positive().min(1).describe("Daily budget in dollars"),
      finalUrl: z.string().url().describe("Primary landing page URL."),
      headlines: z.array(z.string().max(30)).min(1).max(5).describe("1–5 short headlines, max 30 chars each."),
      longHeadline: z.string().max(90).describe("Single long headline, max 90 chars."),
      descriptions: z.array(z.string().max(90)).min(1).max(5).describe("1–5 descriptions, max 90 chars each."),
      businessName: z.string().min(1).describe("Business name shown in ads."),
      marketingImageAssetId: z.string().min(1).describe("Asset resource name for landscape marketing image (1200×628). Create via createImageAsset first."),
      squareMarketingImageAssetId: z.string().min(1).describe("Asset resource name for square marketing image (1200×1200). Create via createImageAsset first."),
      geoTargetIds: z.array(z.string()).optional().describe("Geo target constant IDs (e.g. '2840' for US). Use searchGeoTargets to find IDs."),
      languageIds: z.array(z.string()).optional().describe("Language constant IDs. Defaults to no restriction."),
      logoImageAssetId: z.string().optional().describe("Optional logo image asset resource name."),
      adGroupName: z.string().optional().describe("Ad group name. Defaults to '{campaignName} - Ad Group 1'."),
      bidding: z
        .object({
          strategy: z.enum(["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CLICKS", "MANUAL_CPC"]).optional().describe("Bidding strategy. Defaults to MAXIMIZE_CONVERSIONS."),
          defaultCpcDollars: z.number().positive().optional().describe("Default max CPC in dollars. Required for MANUAL_CPC."),
          targetCpaDollars: z.number().positive().optional().describe("Target CPA in dollars. Optional for MAXIMIZE_CONVERSIONS."),
        })
        .optional()
        .describe("Bidding configuration. Defaults to MAXIMIZE_CONVERSIONS."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignName, dailyBudgetDollars, finalUrl, headlines, longHeadline, descriptions, businessName, marketingImageAssetId, squareMarketingImageAssetId, geoTargetIds, languageIds, logoImageAssetId, adGroupName, bidding }) => {
    return executeCreate(accountId, {
      campaignType: "DISPLAY",
      campaignName,
      dailyBudgetDollars,
      finalUrl,
      headlines,
      longHeadline,
      descriptions,
      businessName,
      marketingImageAssetId,
      squareMarketingImageAssetId,
      geoTargetIds,
      languageIds,
      logoImageAssetId,
      adGroupName,
      bidding,
    }, "create_display_campaign", "Display campaign created as PAUSED. Review ad assets in Google Ads, then use enableCampaign to start serving ads.");
  }));

  // ── 6. Video ───────────────────────────────────────────────────────

  server.registerTool("createVideoCampaign", {
    description:
      "Create a YouTube TrueView in-stream video campaign. " +
      "Requires an existing YouTube video ID. Starts PAUSED. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignName: z.string().min(1),
      dailyBudgetDollars: z.number().positive().min(1).describe("Daily budget in dollars"),
      youtubeVideoId: z.string().min(1).describe("YouTube video ID (e.g. 'abc123XYZ' from youtube.com/watch?v=abc123XYZ). Must be uploaded to YouTube."),
      finalUrl: z.string().url().describe("Primary landing page URL."),
      headline: z.string().max(30).describe("Short headline, max 30 chars."),
      geoTargetIds: z.array(z.string()).optional().describe("Geo target constant IDs (e.g. '2840' for US). Use searchGeoTargets to find IDs."),
      languageIds: z.array(z.string()).optional().describe("Language constant IDs. Defaults to no restriction."),
      longHeadline: z.string().max(90).optional().describe("Long headline, max 90 chars."),
      description: z.string().max(90).optional().describe("Ad description, max 90 chars."),
      adName: z.string().optional().describe("Ad name. Defaults to '{campaignName} - Video Ad'."),
      callToAction: z.string().optional().describe("Call-to-action text (e.g. 'LEARN_MORE', 'SHOP_NOW'). Omit to use Google's default."),
      bidding: z
        .object({
          strategy: z.enum(["TARGET_CPV", "MAXIMIZE_CONVERSIONS"]).optional().describe("Bidding strategy. Defaults to TARGET_CPV."),
          targetCpvDollars: z.number().positive().optional().describe("Target cost-per-view in dollars. Required for TARGET_CPV."),
          targetCpaDollars: z.number().positive().optional().describe("Target CPA in dollars. Optional for MAXIMIZE_CONVERSIONS."),
        })
        .optional()
        .describe("Bidding configuration. Defaults to TARGET_CPV."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignName, dailyBudgetDollars, youtubeVideoId, finalUrl, headline, geoTargetIds, languageIds, longHeadline, description, adName, callToAction, bidding }) => {
    return executeCreate(accountId, {
      campaignType: "VIDEO",
      campaignName,
      dailyBudgetDollars,
      youtubeVideoId,
      finalUrl,
      headline,
      geoTargetIds,
      languageIds,
      longHeadline,
      description,
      adName,
      callToAction,
      bidding,
    }, "create_video_campaign", "Video campaign created as PAUSED. Confirm the ad preview looks correct in Google Ads, then use enableCampaign to start running.");
  }));

  // ── 7. App ─────────────────────────────────────────────────────────

  server.registerTool("createAppCampaign", {
    description:
      "Create an App campaign (install-focused) for the Apple App Store or Google Play Store. " +
      "App ID required. Add image and video assets in Google Ads UI for full serving. " +
      "Starts PAUSED. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignName: z.string().min(1),
      dailyBudgetDollars: z.number().positive().min(1).describe("Daily budget in dollars"),
      finalUrl: z.string().url().describe("App store URL (e.g. https://apps.apple.com/app/id123456789)."),
      appId: z.string().min(1).describe("App ID: Apple App Store numeric ID (e.g. '123456789') or Google Play package name (e.g. 'com.example.app')."),
      appStore: z.enum(["GOOGLE_APP_STORE", "APPLE_APP_STORE"]).describe("App store: GOOGLE_APP_STORE for Android, APPLE_APP_STORE for iOS."),
      headlines: z.array(z.string().max(30)).min(2).max(5).describe("2–5 headlines, max 30 chars each."),
      descriptions: z.array(z.string().max(90)).min(1).max(5).describe("1–5 descriptions, max 90 chars each."),
      geoTargetIds: z.array(z.string()).optional().describe("Geo target constant IDs (e.g. '2840' for US). Use searchGeoTargets to find IDs."),
      languageIds: z.array(z.string()).optional().describe("Language constant IDs. Defaults to no restriction."),
      businessName: z.string().optional().describe("Business name shown in ads."),
      bidding: z
        .object({
          strategy: z.enum(["TARGET_CPA", "MAXIMIZE_CONVERSIONS"]).optional().describe("Bidding strategy. Defaults to TARGET_CPA."),
          targetCpaDollars: z.number().positive().optional().describe("Target CPA in dollars. Required for TARGET_CPA."),
        })
        .optional()
        .describe("Bidding configuration. Defaults to TARGET_CPA."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignName, dailyBudgetDollars, finalUrl, appId, appStore, headlines, descriptions, geoTargetIds, languageIds, businessName, bidding }) => {
    return executeCreate(accountId, {
      campaignType: "APP",
      campaignName,
      dailyBudgetDollars,
      finalUrl,
      appId,
      appStore,
      headlines,
      descriptions,
      geoTargetIds,
      languageIds,
      businessName,
      bidding,
    }, "create_app_campaign", "App campaign created as PAUSED. Add image and video assets in Google Ads UI for full ad serving, then use enableCampaign to start driving installs.");
  }));
}
