import { z } from "zod";
import {
  pauseKeyword,
  enableKeyword,
  addKeyword,
  updateBid,
  addNegativeKeyword,
  removeNegativeKeyword,
  toMicros,
} from "@/lib/google-ads";
import { accountIdParam, safeHandler, WRITE_ANNOTATIONS } from "../types";
import type { WriteToolDeps } from "./_deps";
import { experimentImpactAcknowledgementSchema } from "./_deps";

export function registerKeywordWriteTools(deps: WriteToolDeps) {
  const { server, writeToolCall } = deps;

  // ─── Keyword Management ─────────────────────────────────────────

  server.registerTool("pauseKeyword", {
    description: "Pause a POSITIVE (active) keyword. Does NOT work on negative keywords — Google Ads has no 'pause' for negatives; call `removeNegativeKeyword` instead (and `addNegativeKeyword` to re-add later). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupId: z.string(),
      criterionId: z.string().describe("Keyword criterion ID (query keyword_view via runScript)"),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, criterionId }) =>
    writeToolCall({ accountId, campaignId }, (a) => pauseKeyword(a, campaignId, adGroupId, criterionId)),
  ));

  server.registerTool("enableKeyword", {
    description: "Re-enable a paused keyword. Only needs adGroupId + criterionId (no campaignId, unlike pauseKeyword). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      adGroupId: z.string(),
      criterionId: z.string().describe("Keyword criterion ID (query keyword_view via runScript)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, adGroupId, criterionId }) =>
    writeToolCall({ accountId }, (a) => enableKeyword(a, adGroupId, criterionId)),
  ));

  server.registerTool("addKeyword", {
    description: "Create/add a new positive keyword in an ad group (starts enabled). Use this for a single new keyword; use bulkAddKeywords to create many positive keywords at once. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupId: z.string(),
      keyword: z.string().min(1),
      matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).default("BROAD"),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, keyword, matchType }) =>
    writeToolCall({ accountId, campaignId }, (a) => addKeyword(a, adGroupId, keyword, matchType)),
  ));

  // ─── Bid Management ─────────────────────────────────────────────

  server.registerTool("updateBid", {
    description: "Update a keyword's CPC bid. Only works with MANUAL_CPC or ENHANCED_CPC bidding. Capped at 25% change per adjustment. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupId: z.string(),
      criterionId: z.string().describe("Keyword criterion ID (query keyword_view via runScript)"),
      newBidDollars: z.number().positive().describe("New bid in dollars (e.g. 1.50)"),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, criterionId, newBidDollars }) =>
    writeToolCall({ accountId, campaignId }, (a) =>
      updateBid(a, campaignId, adGroupId, criterionId, toMicros(newBidDollars)),
    ),
  ));

  // ─── Negative Keywords ──────────────────────────────────────────

  server.registerTool("addNegativeKeyword", {
    description: "Add a negative keyword to a campaign. Also use this to re-enable a previously removed negative keyword (Google Ads has no 'enable' state for negatives). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      keyword: z.string().min(1).describe("Keyword text to block"),
      matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).default("PHRASE").describe("Match type for the negative keyword (default: PHRASE)"),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, keyword, matchType }) =>
    writeToolCall({ accountId, campaignId }, (a) => addNegativeKeyword(a, campaignId, keyword, matchType)),
  ));

  server.registerTool("removeNegativeKeyword", {
    description: "Remove a negative keyword from a campaign. This is the correct tool for 'pausing' or 'disabling' a negative keyword — Google Ads has no pause state for negatives, removing is the equivalent. To re-add later, call `addNegativeKeyword` with the same text and match type. If the same keyword text exists under multiple match types, specify matchType to remove the correct one. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      keyword: z.string().min(1).describe("Exact negative keyword text to remove"),
      matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).optional().describe("Match type to disambiguate if the same text exists under multiple match types"),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, safeHandler(async ({ accountId, campaignId, keyword, matchType }) =>
    writeToolCall({ accountId, campaignId }, (a) => removeNegativeKeyword(a, campaignId, keyword, matchType)),
  ));
}
