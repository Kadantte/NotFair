import { z } from "zod";
import {
  createBiddingStrategy,
  updateBiddingStrategy,
  removeBiddingStrategy,
  linkCampaignToBiddingStrategy,
  toMicros,
} from "@/lib/google-ads";
import type { PortfolioStrategyType } from "@/lib/google-ads";
import { safeHandler, accountIdParam, WRITE_ANNOTATIONS, DESTRUCTIVE_WRITE_ANNOTATIONS } from "../types";
import type { WriteToolDeps } from "./_deps";
import { experimentImpactAcknowledgementSchema } from "./_deps";

export function registerBiddingStrategyTools(deps: WriteToolDeps) {
  const { server, writeToolCall } = deps;

  // ─── Portfolio Bidding Strategies (RMF C.96/97, M.96/97) ─────────

  server.registerTool("createBiddingStrategy", {
    description: "Create a portfolio bidding strategy — a shared bidding configuration that multiple campaigns can reference. Supports TARGET_CPA, TARGET_ROAS, MAXIMIZE_CONVERSIONS, and MAXIMIZE_CONVERSION_VALUE. For TARGET_CPA, targetCpa (in dollars) is required. For TARGET_ROAS, targetRoas (e.g. 2.0 = 200%) is required. Returns changeId + biddingStrategyId. Use linkCampaignToBiddingStrategy to attach to campaigns.",
    inputSchema: {
      accountId: accountIdParam,
      name: z.string().min(1).describe("Strategy name, e.g. 'Lead Gen Target CPA'"),
      type: z.enum(["TARGET_CPA", "TARGET_ROAS", "MAXIMIZE_CONVERSIONS", "MAXIMIZE_CONVERSION_VALUE"]),
      targetCpa: z.number().optional().describe("Target CPA in dollars. Required for TARGET_CPA; optional cap for MAXIMIZE_CONVERSIONS."),
      targetRoas: z.number().optional().describe("Target ROAS multiplier (e.g. 2.0 = 200% return). Required for TARGET_ROAS; optional cap for MAXIMIZE_CONVERSION_VALUE."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, name, type, targetCpa, targetRoas }) =>
    writeToolCall({ accountId }, (a) => createBiddingStrategy(a, {
      name,
      type: type as PortfolioStrategyType,
      targetCpaMicros: targetCpa != null ? toMicros(targetCpa) : undefined,
      targetRoas,
    })),
  ));

  server.registerTool("updateBiddingStrategy", {
    description: "Edit a portfolio bidding strategy's name and/or target value. You can change targetCpa on TARGET_CPA/MAXIMIZE_CONVERSIONS strategies, and targetRoas on TARGET_ROAS/MAXIMIZE_CONVERSION_VALUE strategies. The strategy type itself cannot be changed. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      biddingStrategyId: z.string(),
      name: z.string().min(1).optional(),
      targetCpa: z.number().optional().describe("New target CPA in dollars"),
      targetRoas: z.number().optional().describe("New target ROAS multiplier"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, biddingStrategyId, name, targetCpa, targetRoas }) =>
    writeToolCall({ accountId }, (a) => updateBiddingStrategy(a, {
      biddingStrategyId,
      name,
      targetCpaMicros: targetCpa != null ? toMicros(targetCpa) : undefined,
      targetRoas,
    })),
  ));

  server.registerTool("removeBiddingStrategy", {
    description: "Remove a portfolio bidding strategy. All campaigns currently linked to it must be unlinked first (Google Ads will reject otherwise). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      biddingStrategyId: z.string(),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, biddingStrategyId }) =>
    writeToolCall({ accountId }, (a) => removeBiddingStrategy(a, biddingStrategyId)),
  ));

  server.registerTool("linkCampaignToBiddingStrategy", {
    description: "Link a campaign to a portfolio bidding strategy — the campaign will use the shared strategy's configuration. This replaces any standard (campaign-level) bidding config. Use listBiddingStrategies to find strategy IDs. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      biddingStrategyId: z.string(),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, biddingStrategyId }) =>
    writeToolCall({ accountId, campaignId }, (a) => linkCampaignToBiddingStrategy(a, campaignId, biddingStrategyId)),
  ));
}
