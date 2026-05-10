import { z } from "zod";
import {
  updateCampaignBudget,
  pauseCampaign,
  enableCampaign,
  removeCampaign,
  renameCampaign,
  updateCampaignBidding,
  updateCampaignGoalConfig,
  updateCampaignSettings,
  updateCampaignLanguages,
  toMicros,
  authForAccount,
  resolveAccountId,
  TARGET_IMPRESSION_SHARE_LOCATIONS,
} from "@/lib/google-ads";
import type {
  BiddingStrategyType,
  GoalConfigLevel,
  UpdateCampaignSettingsParams,
} from "@/lib/google-ads";
import { execWrite } from "@/lib/tools/execute";
import { typedResult, safeHandler, accountIdParam, WRITE_ANNOTATIONS } from "../types";
import type { WriteToolDeps } from "./_deps";
import { experimentImpactAcknowledgementSchema, preflightActiveExperimentMutation } from "./_deps";

export function registerCampaignWriteTools(deps: WriteToolDeps) {
  const { server, currentAuth, writeToolCall } = deps;

  // ─── Budget Management ──────────────────────────────────────────

  server.registerTool("updateCampaignBudget", {
    description: "Update a campaign's daily budget. Capped at 50% change per adjustment, minimum $1/day. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      newDailyBudgetDollars: z.number().positive().describe("New daily budget in dollars (e.g. 25.00)"),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, newDailyBudgetDollars }) =>
    writeToolCall({ accountId, campaignId }, (a) =>
      updateCampaignBudget(a, campaignId, toMicros(newDailyBudgetDollars)),
    ),
  ));

  // ─── Campaign Status ────────────────────────────────────────────

  server.registerTool("pauseCampaign", {
    description: "Pause a campaign, stopping all its ads. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, safeHandler(async ({ accountId, campaignId }) =>
    writeToolCall({ accountId, campaignId }, (a) => pauseCampaign(a, campaignId)),
  ));

  server.registerTool("enableCampaign", {
    description: "Re-enable a paused campaign. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId }) =>
    writeToolCall({ accountId, campaignId }, (a) => enableCampaign(a, campaignId)),
  ));

  server.registerTool("removeCampaign", {
    description: "PERMANENTLY remove a campaign — cannot be undone, not even with undoChange. The campaign and all its ad groups, ads, and keywords will be deleted. Prefer pauseCampaign in most cases. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, safeHandler(async ({ accountId, campaignId }) =>
    writeToolCall({ accountId, campaignId }, (a) => removeCampaign(a, campaignId)),
  ));

  // ─── Rename Campaign / Ad Group ────────────────────────────────────

  server.registerTool("renameCampaign", {
    description: "Rename a campaign. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      newName: z.string().min(1),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, newName }) =>
    writeToolCall({ accountId, campaignId }, (a) => renameCampaign(a, campaignId, newName)),
  ));

  // ─── Campaign Bidding Strategy ──────────────────────────────────

  server.registerTool("updateCampaignBidding", {
    description: "Update a campaign's bidding strategy. Supports: TARGET_CPA (set a target cost per acquisition), MAXIMIZE_CONVERSIONS (optionally with a target CPA cap), MAXIMIZE_CONVERSION_VALUE (maximize total conversion value, optionally with a target ROAS — required for PMAX value-based bidding), TARGET_ROAS (target return on ad spend), MAXIMIZE_CLICKS, MANUAL_CPC, TARGET_IMPRESSION_SHARE (presence-based — 'just win' on a given SERP position, ideal for brand campaigns). For TARGET_CPA, targetCpa is required (in dollars). For MAXIMIZE_CONVERSIONS, targetCpa is optional (acts as a cap). For TARGET_ROAS and MAXIMIZE_CONVERSION_VALUE, targetRoas is required/optional respectively (e.g. 2.0 = 200% ROAS). For TARGET_IMPRESSION_SHARE, impressionShareLocation, locationFraction, and cpcBidCeiling are all required — Google will not accept this strategy without all three. Returns a changeId for undo support.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      biddingStrategy: z.enum(["MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE", "MAXIMIZE_CLICKS", "MANUAL_CPC", "TARGET_CPA", "TARGET_ROAS", "TARGET_IMPRESSION_SHARE"])
        .describe("The bidding strategy to set. Use MAXIMIZE_CONVERSION_VALUE for Performance Max campaigns optimizing for revenue/value. Use TARGET_IMPRESSION_SHARE for brand campaigns where 'just win the auction' matters more than per-conversion efficiency."),
      targetCpa: z.number().optional()
        .describe("Target CPA in dollars (e.g. 10.50 for $10.50). Required for TARGET_CPA, optional cap for MAXIMIZE_CONVERSIONS."),
      targetRoas: z.number().optional()
        .describe("Target ROAS as a multiplier (e.g. 2.0 = 200% return). Required for TARGET_ROAS, optional cap for MAXIMIZE_CONVERSION_VALUE."),
      impressionShareLocation: z.enum(TARGET_IMPRESSION_SHARE_LOCATIONS).optional()
        .describe("TARGET_IMPRESSION_SHARE only: where on the SERP to target. TOP_OF_PAGE = above organic results (most common for brand). ABSOLUTE_TOP_OF_PAGE = position 1. ANYWHERE_ON_PAGE = any paid slot."),
      locationFraction: z.number().min(0.01).max(1).optional()
        .describe("TARGET_IMPRESSION_SHARE only: the IS target as a fraction from 0.01 to 1.00 (e.g. 0.95 = 95%). Typical brand target is 0.90–0.95."),
      cpcBidCeiling: z.number().positive().optional()
        .describe("TARGET_IMPRESSION_SHARE only: max CPC bid cap in dollars (e.g. 2.00 = $2.00). Required — without a ceiling Google can bid unbounded to hit the IS target."),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, async ({ accountId, campaignId, biddingStrategy, targetCpa, targetRoas, impressionShareLocation, locationFraction, cpcBidCeiling }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);

    const logged = await execWrite(auth, targetId, campaignId, () =>
      updateCampaignBidding(authForAccount(auth, accountId), campaignId, {
        biddingStrategy: biddingStrategy as BiddingStrategyType,
        targetCpaMicros: targetCpa != null ? toMicros(targetCpa) : undefined,
        targetRoas,
        impressionShareLocation,
        locationFractionMicros: locationFraction != null ? Math.round(locationFraction * 1_000_000) : undefined,
        cpcBidCeilingMicros: cpcBidCeiling != null ? toMicros(cpcBidCeiling) : undefined,
      }),
    );

    return typedResult(logged);
  });

  // ─── Campaign Goal Config ───────────────────────────────────────

  server.registerTool("updateCampaignGoals", {
    description: "Switch a campaign between campaign-specific and account-level conversion goals. Set to CUSTOMER to use account-level goals (required before switching to non-conversion bidding strategies like MAXIMIZE_CLICKS or MANUAL_CPC). Set to CAMPAIGN for campaign-specific goals. Note: updateCampaignBidding auto-handles this when switching to MAXIMIZE_CLICKS or MANUAL_CPC, so this tool is only needed for manual goal config changes.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      goalConfigLevel: z.enum(["CUSTOMER", "CAMPAIGN"])
        .describe("CUSTOMER = use account-level conversion goals. CAMPAIGN = use campaign-specific conversion goals."),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, goalConfigLevel }) =>
    writeToolCall({ accountId, campaignId }, (a) =>
      updateCampaignGoalConfig(a, campaignId, goalConfigLevel as GoalConfigLevel),
    ),
  ));

  // ─── Campaign Settings ──────────────────────────────────────────

  server.registerTool("updateCampaignSettings", {
    description: "Update campaign network targeting, location targeting, and/or ad schedule. Networks: toggle Google Search, Search Partners, Display Network. Locations: add/remove geo targets (positive or negative) by geo target constant ID (e.g. '2840' for US, '200840' for Seattle-Tacoma DMA). Ad schedule: replace the entire schedule with a list of slots (use dayOfWeek 'ALL' as a shortcut for all 7 days; pass an empty array to clear the schedule and run 24/7). NOTE: If the campaign uses smart bidding (TARGET_CPA/TARGET_ROAS/MAXIMIZE_CONVERSIONS/MAXIMIZE_CONVERSION_VALUE), schedule restrictions are respected but can hurt performance by removing learning signal. Prefer 24/7 schedules unless you have strong evidence specific hours are unprofitable. Returns a changeId per mutation plus any warnings. Geo intent: set positiveGeoTargetType to PRESENCE (only people physically in the area) or PRESENCE_OR_INTEREST (default — also includes people searching for the area). Proximity: add radius-based targeting (5-mile circles) by lat/lng via proximityTargeting.add; remove by criterionId via proximityTargeting.remove (get criterionIds from getCampaignSettings or runScript).",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      networks: z
        .object({
          googleSearch: z.boolean().optional().describe("Target Google Search"),
          searchPartners: z.boolean().optional().describe("Target Search Partner sites"),
          displayNetwork: z.boolean().optional().describe("Target Google Display Network"),
        })
        .optional()
        .describe("Network targeting toggles — only specified fields are changed"),
      locationTargeting: z
        .object({
          add: z.array(z.string()).optional().describe("Geo target constant IDs to add (e.g. '2840' for US)"),
          remove: z.array(z.string()).optional().describe("Geo target constant IDs to remove"),
        })
        .optional()
        .describe("Positive location targeting — where ads should show"),
      negativeLocationTargeting: z
        .object({
          add: z.array(z.string()).optional().describe("Geo target constant IDs to exclude"),
          remove: z.array(z.string()).optional().describe("Geo target constant IDs to stop excluding"),
        })
        .optional()
        .describe("Negative location targeting — where ads should NOT show"),
      adSchedule: z
        .object({
          set: z
            .array(
              z.object({
                dayOfWeek: z
                  .enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY", "ALL"])
                  .describe("Day of week, or 'ALL' to apply to all 7 days"),
                startHour: z.number().int().min(0).max(23).describe("Start hour (0-23)"),
                endHour: z.number().int().min(1).max(24).describe("End hour (1-24, exclusive)"),
                startMinute: z.enum(["ZERO", "FIFTEEN", "THIRTY", "FORTY_FIVE"]).optional().describe("Defaults to ZERO"),
                endMinute: z.enum(["ZERO", "FIFTEEN", "THIRTY", "FORTY_FIVE"]).optional().describe("Defaults to ZERO"),
              }),
            )
            .describe("Replace the entire ad schedule with these slots. Pass [] to clear (run 24/7)."),
        })
        .optional()
        .describe("Ad schedule (dayparting) — REPLACES the entire current schedule. For smart-bidding campaigns, non-24/7 schedules can reduce learning signal; the tool returns a SMART_BIDDING_SCHEDULE_RESTRICTION warning when detected."),
      positiveGeoTargetType: z
        .enum(["PRESENCE", "PRESENCE_OR_INTEREST"])
        .optional()
        .describe(
          "Who sees ads based on location intent. PRESENCE: only people physically in the targeted area. " +
          "PRESENCE_OR_INTEREST: people in OR interested in the area (Google default). " +
          "Use PRESENCE for purely local intent; use PRESENCE_OR_INTEREST for broader reach.",
        ),
      negativeGeoTargetType: z
        .enum(["PRESENCE", "PRESENCE_OR_INTEREST"])
        .optional()
        .describe(
          "Who is excluded based on excluded locations. PRESENCE: exclude people physically there. " +
          "PRESENCE_OR_INTEREST: exclude people in or interested in the excluded area.",
        ),
      proximityTargeting: z
        .object({
          add: z
            .array(
              z.object({
                latitudeMicroDegrees: z.number().int().min(-90_000_000).max(90_000_000).describe("Latitude in micro-degrees (degrees × 1,000,000). e.g. 47608013 for 47.608013° N"),
                longitudeMicroDegrees: z.number().int().min(-180_000_000).max(180_000_000).describe("Longitude in micro-degrees (degrees × 1,000,000). e.g. -122335167 for -122.335167° W"),
                radius: z.number().min(0.1).describe("Radius value, minimum 0.1. e.g. 5.0"),
                radiusUnits: z.enum(["MILES", "KILOMETERS"]).describe("Unit for the radius"),
                label: z.string().optional().describe("Optional human-readable label for logging, e.g. 'Downtown Seattle'"),
              }),
            )
            .optional()
            .describe("Proximity circles to add. Each defines a lat/lng center + radius."),
          remove: z
            .array(z.string())
            .optional()
            .describe("Criterion IDs of proximity targets to remove. Get IDs from getCampaignSettings or runScript on campaign_criterion WHERE type = 'PROXIMITY'."),
        })
        .optional()
        .describe("Radius-based proximity targeting — target people within N miles/km of a lat/lng point."),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, networks, locationTargeting, negativeLocationTargeting, adSchedule, positiveGeoTargetType, negativeGeoTargetType, proximityTargeting, acknowledgeExperimentImpact }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const targetAuth = authForAccount(auth, accountId);

    const params: UpdateCampaignSettingsParams = {};
    if (networks) params.networks = networks;
    if (locationTargeting) params.locationTargeting = locationTargeting;
    if (negativeLocationTargeting) params.negativeLocationTargeting = negativeLocationTargeting;
    if (adSchedule) params.adSchedule = adSchedule;
    if (positiveGeoTargetType) params.positiveGeoTargetType = positiveGeoTargetType;
    if (negativeGeoTargetType) params.negativeGeoTargetType = negativeGeoTargetType;
    if (proximityTargeting) params.proximityTargeting = proximityTargeting;

    const block = await preflightActiveExperimentMutation(auth, accountId, [campaignId], acknowledgeExperimentImpact);
    if (block) return typedResult(block);

    const t0 = performance.now();
    const result = await updateCampaignSettings(targetAuth, campaignId, params);
    const overrideLatencyMs = Math.round(performance.now() - t0);

    const logged = await Promise.all(
      result.results.map((r) => execWrite(auth, targetId, campaignId, async () => r, undefined, { overrideLatencyMs, experimentGuardAlreadyChecked: true, acknowledgeExperimentImpact })),
    );

    return typedResult({
      success: result.success,
      error: result.error,
      warnings: result.warnings,
      results: logged,
    });
  }));

  // ─── Language Targeting (RMF C.30 / M.10) ────────────────────────

  server.registerTool("updateCampaignLanguages", {
    description: "Add or remove language targeting criteria on a campaign. Pass language constant IDs (e.g. '1000' for English, '1003' for Spanish). Returns a changeId per mutation.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      add: z.array(z.string()).optional().describe("Language constant IDs to add (e.g. ['1000'] for English)"),
      remove: z.array(z.string()).optional().describe("Language constant IDs to remove"),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, add, remove, acknowledgeExperimentImpact }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const targetAuth = authForAccount(auth, accountId);
    const block = await preflightActiveExperimentMutation(auth, accountId, [campaignId], acknowledgeExperimentImpact);
    if (block) return typedResult(block);
    const t0 = performance.now();
    const result = await updateCampaignLanguages(targetAuth, campaignId, { add, remove });
    const overrideLatencyMs = Math.round(performance.now() - t0);
    const logged = await Promise.all(
      result.results.map((r) => execWrite(auth, targetId, campaignId, async () => r, undefined, { overrideLatencyMs, experimentGuardAlreadyChecked: true, acknowledgeExperimentImpact })),
    );
    return typedResult({ success: result.success, error: result.error, results: logged });
  }));
}
