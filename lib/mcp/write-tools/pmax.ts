import { z } from "zod";
import { pausePmaxAssetGroup, enablePmaxAssetGroup } from "@/lib/google-ads";
import { safeHandler, accountIdParam, WRITE_ANNOTATIONS } from "../types";
import type { WriteToolDeps } from "./_deps";
import { experimentImpactAcknowledgementSchema } from "./_deps";

export function registerPmaxWriteTools(deps: WriteToolDeps) {
  const { server, writeToolCall } = deps;

  // ─── Performance Max ─────────────────────────────────────────────

  server.registerTool("pausePmaxAssetGroup", {
    description: "Pause a Performance Max asset group. When paused, Google stops serving ads from this asset group while the campaign and other asset groups remain active. Use getPmaxAssetGroups to find asset group IDs. Returns a changeId for undo support.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Performance Max campaign ID"),
      assetGroupId: z.string().describe("Asset group ID to pause (query asset_group WHERE type = PERFORMANCE_MAX via runScript)"),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, assetGroupId }) =>
    writeToolCall({ accountId, campaignId }, (a) => pausePmaxAssetGroup(a, campaignId, assetGroupId)),
  ));

  server.registerTool("enablePmaxAssetGroup", {
    description: "Re-enable a paused Performance Max asset group so it can serve ads again. Use getPmaxAssetGroups to find asset group IDs. Returns a changeId for undo support.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Performance Max campaign ID"),
      assetGroupId: z.string().describe("Asset group ID to enable (query asset_group WHERE type = PERFORMANCE_MAX via runScript)"),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, assetGroupId }) =>
    writeToolCall({ accountId, campaignId }, (a) => enablePmaxAssetGroup(a, campaignId, assetGroupId)),
  ));
}
