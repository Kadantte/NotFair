import { z } from "zod";
import { createAdGroup, renameAdGroup } from "@/lib/google-ads";
import { safeHandler, accountIdParam, WRITE_ANNOTATIONS } from "../types";
import type { WriteToolDeps } from "./_deps";
import { experimentImpactAcknowledgementSchema } from "./_deps";

export function registerAdGroupWriteTools(deps: WriteToolDeps) {
  const { server, writeToolCall } = deps;

  // ─── Ad Group Management ────────────────────────────────────────

  server.registerTool("createAdGroup", {
    description: "Create an ad group in a campaign (starts enabled). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupName: z.string().min(1),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupName }) =>
    writeToolCall({ accountId, campaignId }, (a) => createAdGroup(a, campaignId, adGroupName)),
  ));

  // ─── Rename Campaign / Ad Group ────────────────────────────────────

  server.registerTool("renameAdGroup", {
    description: "Rename an ad group. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupId: z.string(),
      newName: z.string().min(1),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, newName }) =>
    writeToolCall({ accountId, campaignId }, (a) => renameAdGroup(a, campaignId, adGroupId, newName)),
  ));
}
