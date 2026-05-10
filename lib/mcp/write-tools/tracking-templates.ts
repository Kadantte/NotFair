import { z } from "zod";
import {
  setTrackingTemplate,
  getTrackingTemplate,
  authForAccount,
  resolveAccountId,
} from "@/lib/google-ads";
import { execWrite } from "@/lib/tools/execute";
import { enforceRateLimit } from "@/lib/mcp/rate-limit";
import { typedResult, safeHandler, accountIdParam, WRITE_ANNOTATIONS } from "../types";
import type { WriteToolDeps } from "./_deps";
import {
  experimentImpactAcknowledgementSchema,
  preflightActiveExperimentMutation,
  buildExperimentPreflightBlock,
} from "./_deps";

export function registerTrackingTemplateTools(deps: WriteToolDeps) {
  const { server, currentAuth } = deps;

  // ─── Tracking Templates ─────────────────────────────────────────

  server.registerTool("setTrackingTemplate", {
    description: "Set or clear the click-tracking URL suffix at the account, campaign, ad group, or ad level. Uses ValueTrack parameters. Pass empty string to clear. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      level: z.enum(["account", "campaign", "ad_group", "ad"]),
      campaignId: z
        .string()
        .optional()
        .describe("The campaign ID. Required when level is 'campaign'."),
      adGroupId: z
        .string()
        .optional()
        .describe("The ad group ID. Required when level is 'ad_group'."),
      adId: z
        .string()
        .optional()
        .describe("The ad ID. Required when level is 'ad'."),
      trackingTemplate: z
        .string()
        .describe("Tracking URL template (e.g. '{lpurl}?utm_source=google&utm_medium=cpc'). Empty string to remove."),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, level, campaignId, adGroupId, adId, trackingTemplate, acknowledgeExperimentImpact }) => {
    const entityId = level === "campaign" ? campaignId
      : level === "ad_group" ? adGroupId
      : level === "ad" ? adId
      : undefined;
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const targetAuth = authForAccount(auth, accountId);
    await enforceRateLimit(auth.userId); // Check before API call (not deferred to execWrite)

    let resolvedCampaignId = level === "campaign" ? (entityId ?? null) : null;
    if ((level === "ad_group" || level === "ad") && entityId) {
      try {
        const current = await getTrackingTemplate(targetAuth, level, entityId);
        resolvedCampaignId = current.campaignId ?? null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return typedResult(buildExperimentPreflightBlock(`Could not resolve owning campaign before mutation: ${message}`));
      }
      if (!resolvedCampaignId) {
        return typedResult(buildExperimentPreflightBlock("Could not resolve owning campaign before mutation."));
      }
    }
    const block = await preflightActiveExperimentMutation(auth, accountId, [resolvedCampaignId], acknowledgeExperimentImpact);
    if (block) return typedResult(block);

    const t0 = performance.now();
    const writeResult = await setTrackingTemplate(targetAuth, level, trackingTemplate, entityId);
    const overrideLatencyMs = Math.round(performance.now() - t0);
    const result = await execWrite(auth, targetId, resolvedCampaignId, async () => writeResult, undefined, { overrideLatencyMs, experimentGuardAlreadyChecked: true, acknowledgeExperimentImpact });
    return typedResult(result);
  }));
}
