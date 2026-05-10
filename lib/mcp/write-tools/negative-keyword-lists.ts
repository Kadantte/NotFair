import { z } from "zod";
import {
  createNegativeKeywordList,
  removeNegativeKeywordList,
  addKeywordToNegativeList,
  removeKeywordFromNegativeList,
  linkNegativeListToCampaign,
  unlinkNegativeListFromCampaign,
} from "@/lib/google-ads";
import { safeHandler, accountIdParam, WRITE_ANNOTATIONS, DESTRUCTIVE_WRITE_ANNOTATIONS } from "../types";
import type { WriteToolDeps } from "./_deps";
import { experimentImpactAcknowledgementSchema } from "./_deps";

export function registerNegativeKeywordListTools(deps: WriteToolDeps) {
  const { server, writeToolCall } = deps;

  // ─── Negative Keyword Lists (Shared Sets) ──────────────────────────

  server.registerTool("createNegativeKeywordList", {
    description: "Create a shared negative keyword list. After creating, add keywords with addKeywordToNegativeList and link to campaigns with linkNegativeListToCampaign. Returns changeId + sharedSetId.",
    inputSchema: {
      accountId: accountIdParam,
      name: z.string().min(1).max(255).describe("List name, e.g. 'Brand Negatives' or 'Competitor Terms'"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, name }) =>
    writeToolCall({ accountId }, (a) => createNegativeKeywordList(a, name)),
  ));

  server.registerTool("removeNegativeKeywordList", {
    description: "Delete a shared negative keyword list. This also unlinks it from all campaigns. Permanent — cannot be undone. Use listNegativeKeywordLists to find the sharedSetId. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      sharedSetId: z.string().describe("Shared set ID (query shared_set WHERE type = NEGATIVE_KEYWORDS via runScript)"),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, sharedSetId }) =>
    writeToolCall({ accountId }, (a) => removeNegativeKeywordList(a, sharedSetId)),
  ));

  server.registerTool("addKeywordToNegativeList", {
    description: "Add a keyword to a shared negative keyword list. The keyword will be blocked across all campaigns linked to this list. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      sharedSetId: z.string().describe("Shared set ID (query shared_set WHERE type = NEGATIVE_KEYWORDS via runScript)"),
      keyword: z.string().min(1).describe("Keyword text to block"),
      matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).default("PHRASE").describe("Match type (default: PHRASE)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, sharedSetId, keyword, matchType }) =>
    writeToolCall({ accountId }, (a) => addKeywordToNegativeList(a, sharedSetId, keyword, matchType)),
  ));

  server.registerTool("removeKeywordFromNegativeList", {
    description: "Remove a keyword from a shared negative keyword list. If the same keyword text exists under multiple match types, specify matchType to remove the correct one. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      sharedSetId: z.string().describe("Shared set ID (query shared_set WHERE type = NEGATIVE_KEYWORDS via runScript)"),
      keyword: z.string().min(1).describe("Exact keyword text to remove"),
      matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).optional().describe("Match type to disambiguate"),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, sharedSetId, keyword, matchType }) =>
    writeToolCall({ accountId }, (a) => removeKeywordFromNegativeList(a, sharedSetId, keyword, matchType)),
  ));

  server.registerTool("linkNegativeListToCampaign", {
    description: "Link a shared negative keyword list to a campaign. All keywords in the list will be blocked for this campaign. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      sharedSetId: z.string().describe("Shared set ID (query shared_set WHERE type = NEGATIVE_KEYWORDS via runScript)"),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, sharedSetId }) =>
    writeToolCall({ accountId, campaignId }, (a) => linkNegativeListToCampaign(a, campaignId, sharedSetId)),
  ));

  server.registerTool("unlinkNegativeListFromCampaign", {
    description: "Unlink a shared negative keyword list from a campaign. The list's keywords will no longer be blocked for this campaign. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      sharedSetId: z.string().describe("Shared set ID (query shared_set WHERE type = NEGATIVE_KEYWORDS via runScript)"),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, sharedSetId }) =>
    writeToolCall({ accountId, campaignId }, (a) => unlinkNegativeListFromCampaign(a, campaignId, sharedSetId)),
  ));
}
