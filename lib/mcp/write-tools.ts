import {
  pauseKeyword,
  enableKeyword,
  removeKeyword,
  updateBid,
  addNegativeKeyword,
  removeNegativeKeyword,
  updateCampaignBudget,
  pauseCampaign,
  enableCampaign,
  removeCampaign,
  createCampaign,
  setTrackingTemplate,
  decodeTrackingEntityId,
  getCustomer,
  safeEntityId,
  authForAccount,
  resolveAccountId,
  pauseAd,
  enableAd,
  updateAdFinalUrl,
  updateAdAssets,
  renameCampaign,
  renameAdGroup,
  updateCampaignSettings,
  updateCampaignBidding,
  removeConversionAction,
  updateConversionAction,
  pausePmaxAssetGroup,
  enablePmaxAssetGroup,
  unlinkAssetLinks,
  removeNegativeKeywordList,
  removeKeywordFromNegativeList,
  addKeywordToNegativeList,
  linkNegativeListToCampaign,
  unlinkNegativeListFromCampaign,
} from "@/lib/google-ads";
import type { WriteResult, AuthContext, BiddingStrategyType, CreateCampaignParams, TargetImpressionShareLocation } from "@/lib/google-ads";
import { execWrite } from "@/lib/tools/execute";
import { enforceRateLimit } from "@/lib/mcp/rate-limit";
import { typedResult } from "./types";
import type { ToolRegistrar } from "./types";
import { resolveToolAuth } from "./helpers";
import type { WriteToolDeps } from "./write-tools/_deps";
import { registerKeywordWriteTools } from "./write-tools/keywords";
import { registerCampaignWriteTools } from "./write-tools/campaigns";
import { registerCreateCampaignTools } from "./write-tools/create-campaign";
import { registerAdGroupWriteTools } from "./write-tools/ad-groups";
import { registerAdWriteTools } from "./write-tools/ads";
import { registerBulkOperationTools } from "./write-tools/bulk-operations";
import { registerTrackingTemplateTools } from "./write-tools/tracking-templates";
import { registerConversionWriteTools } from "./write-tools/conversions";
import { registerGuardrailsTools } from "./write-tools/guardrails";
import { registerPmaxWriteTools } from "./write-tools/pmax";
import { registerAssetWriteTools } from "./write-tools/assets";
import { registerBiddingStrategyTools } from "./write-tools/bidding-strategies";
import { registerNegativeKeywordListTools } from "./write-tools/negative-keyword-lists";
import { registerExperimentWriteTools } from "./write-tools/experiments";
import { registerUndoTools } from "./write-tools/undo";

/**
 * Write tools that mutate Google Ads account state.
 * All tools include guardrails to prevent excessive changes.
 * All successful writes are logged to the changes table with a changeId for undo support.
 *
 * The 69 tool registrations live in per-domain files under `./write-tools/*`.
 * This entry point owns the closure-scoped helpers (`writeToolCall`,
 * `executeCreate`) and builds the dependency bundle each domain file consumes.
 * The order of `register*WriteTools(deps)` calls below determines the order
 * tools appear to MCP clients — preserve it when adding new domains.
 */

export const registerWriteTools: ToolRegistrar = (server, currentAuth) => {
  /**
   * Closure-scoped boilerplate eliminator for the simple write pattern:
   *   resolve auth → execWrite → typedResult.
   *
   * Use only for handlers that go through a single execWrite call and pass the
   * raw write result straight to typedResult. Handlers that post-process the
   * result, fan out per-campaign, pre-build resources, or pass extra options
   * (overrideLatencyMs, experimentGuardAlreadyChecked) must stay inline — see
   * the bulk-edit, asset-link, createCampaign, and tracking-template handlers
   * for examples that intentionally don't use this helper.
   */
  async function writeToolCall<R extends WriteResult>(
    args: { accountId?: string; campaignId?: string | null },
    fn: (auth: AuthContext) => Promise<R>,
  ) {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, args.accountId);
    const result = await execWrite(auth, targetId, args.campaignId ?? null, () => fn(targetAuth));
    return typedResult(result);
  }

  /**
   * Shared helper for the 7 create-campaign tools: builds the write-log entry
   * and returns the typedResult. Callers pass the fully-typed lib params, the
   * action string, and the success-path next-steps hint.
   *
   * Action strings are load-bearing — they must match the case labels in
   * `executeUndoForChange` and the TOOL_CODE / REVERSIBLE_ACTIONS maps.
   */
  async function executeCreate(
    accountId: string | undefined,
    params: CreateCampaignParams,
    action: string,
    successNextSteps: string,
  ) {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    await enforceRateLimit(auth.userId);

    const t0 = performance.now();
    const result = await createCampaign(authForAccount(auth, accountId), params);
    const overrideLatencyMs = Math.round(performance.now() - t0);

    const writeResult: WriteResult = {
      success: result.success,
      action,
      entityId: result.campaignId ?? "",
      beforeValue: "",
      afterValue: result.campaignName,
      error: result.error,
      ...(result.policy ? { policy: result.policy } : {}),
    };
    const logged = await execWrite(auth, targetId, result.campaignId ?? null, async () => writeResult, undefined, { overrideLatencyMs });

    return typedResult({
      ...result,
      changeId: logged.changeId,
      status: result.success ? "PAUSED" : undefined,
      nextSteps: result.success ? successNextSteps : undefined,
    });
  }

  const deps: WriteToolDeps = { server, currentAuth, writeToolCall, executeCreate };

  // Order matters — MCP clients surface tools in registration order.
  registerKeywordWriteTools(deps);
  registerCampaignWriteTools(deps);
  registerCreateCampaignTools(deps);
  registerAdGroupWriteTools(deps);
  registerAdWriteTools(deps);
  registerBulkOperationTools(deps);
  registerTrackingTemplateTools(deps);
  registerConversionWriteTools(deps);
  registerGuardrailsTools(deps);
  registerPmaxWriteTools(deps);
  registerAssetWriteTools(deps);
  registerBiddingStrategyTools(deps);
  registerNegativeKeywordListTools(deps);
  registerExperimentWriteTools(deps);
  registerUndoTools(deps);
};

// ─── Undo Helpers ─────────────────────────────────────────────────

/** Look up a keyword's adGroupId and campaignId by criterionId. */
async function findKeywordContext(
  auth: AuthContext,
  criterionId: string,
): Promise<{ adGroupId: string; campaignId: string } | null> {
  const customer = getCustomer(auth);

  const cid = safeEntityId(criterionId, "criterion");
  const result = await customer.query(`
    SELECT ad_group.id, campaign.id
    FROM keyword_view
    WHERE ad_group_criterion.criterion_id = ${cid}
    LIMIT 1
  `);

  const row = (result as Array<{ ad_group?: { id?: string | number }; campaign?: { id?: string | number } }>)[0];
  const adGroupId = String(row?.ad_group?.id);
  const campaignId = String(row?.campaign?.id);
  if (!adGroupId || adGroupId === "undefined") return null;
  return { adGroupId, campaignId };
}

const NOT_FOUND_ERROR = "Could not find ad group for this keyword";

async function findAndEnableKeyword(auth: AuthContext, criterionId: string): Promise<WriteResult> {
  const ctx = await findKeywordContext(auth, criterionId);
  if (!ctx) return { success: false, action: "enable_keyword", entityId: criterionId, beforeValue: "PAUSED", afterValue: "PAUSED", error: NOT_FOUND_ERROR };
  return enableKeyword(auth, ctx.adGroupId, criterionId);
}

async function findAndPauseKeyword(auth: AuthContext, criterionId: string): Promise<WriteResult> {
  const ctx = await findKeywordContext(auth, criterionId);
  if (!ctx) return { success: false, action: "pause_keyword", entityId: criterionId, beforeValue: "ENABLED", afterValue: "ENABLED", error: NOT_FOUND_ERROR };
  return pauseKeyword(auth, ctx.campaignId, ctx.adGroupId, criterionId);
}

async function findAndUpdateBid(auth: AuthContext, criterionId: string, previousBidMicros: number): Promise<WriteResult> {
  const ctx = await findKeywordContext(auth, criterionId);
  if (!ctx) return { success: false, action: "update_bid", entityId: criterionId, beforeValue: "N/A", afterValue: String(previousBidMicros), error: NOT_FOUND_ERROR };
  return updateBid(auth, ctx.campaignId, ctx.adGroupId, criterionId, previousBidMicros, {
    maxBidChangePct: 1.0,
    maxBudgetChangePct: 1.0,
    maxKeywordPausePct: 1.0,
  });
}

/** Execute the reverse operation for a change record. Used by both MCP undoChange and the dashboard undo action. */
export async function executeUndoForChange(
  auth: AuthContext,
  change: { toolName: string; entityId: string | null; campaignId: string | null; beforeValue: string | null; afterValue: string | null },
): Promise<WriteResult> {
  const entityId = change.entityId ?? "";
  const beforeValue = change.beforeValue ?? "";
  if (!entityId) {
    return { success: false, action: change.toolName, entityId: "", beforeValue, afterValue: beforeValue, error: "Cannot undo: missing entity ID" };
  }
  switch (change.toolName) {
    case "pause_keyword":
      return findAndEnableKeyword(auth, entityId);
    case "enable_keyword":
      return findAndPauseKeyword(auth, entityId);
    case "update_bid": {
      const bidMicros = Number(beforeValue);
      if (!bidMicros || bidMicros <= 0) return { success: false, action: "update_bid", entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: invalid previous bid value" };
      return findAndUpdateBid(auth, entityId, bidMicros);
    }
    case "update_budget": {
      const budgetMicros = Number(beforeValue);
      if (!budgetMicros || budgetMicros <= 0) return { success: false, action: "update_budget", entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: invalid previous budget value" };
      return updateCampaignBudget(auth, entityId, budgetMicros, { maxBidChangePct: 1.0, maxBudgetChangePct: 1.0, maxKeywordPausePct: 1.0 });
    }
    case "add_keyword": {
      if (!beforeValue) return { success: false, action: "remove_keyword", entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: missing adGroupId" };
      return removeKeyword(auth, beforeValue, entityId);
    }
    case "remove_keyword": {
      return { success: false, action: "add_keyword", entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo keyword removal (keyword text not stored)" };
    }
    case "add_negative_keyword": {
      const afterVal = change.afterValue ?? "";
      const pipeIdx = afterVal.lastIndexOf("|");
      const undoMatchType = pipeIdx > 0 ? afterVal.slice(pipeIdx + 1) as "BROAD" | "PHRASE" | "EXACT" : undefined;
      return removeNegativeKeyword(auth, change.campaignId ?? "", entityId, undoMatchType);
    }
    case "remove_negative_keyword": {
      const pipeIdx = beforeValue.lastIndexOf("|");
      const undoMatchType = pipeIdx > 0 ? beforeValue.slice(pipeIdx + 1) as "BROAD" | "PHRASE" | "EXACT" : "PHRASE";
      const undoText = pipeIdx > 0 ? beforeValue.slice(0, pipeIdx) : entityId;
      return addNegativeKeyword(auth, change.campaignId ?? "", undoText, undoMatchType);
    }
    case "pause_campaign":
      return enableCampaign(auth, entityId);
    case "enable_campaign":
      return pauseCampaign(auth, entityId);
    case "create_campaign":
    case "create_shopping_campaign":
    case "create_pmax_campaign":
    case "create_demand_gen_campaign":
    case "create_display_campaign":
    case "create_video_campaign":
    case "create_app_campaign":
      return removeCampaign(auth, entityId);
    case "remove_campaign":
      return { success: false, action: "remove_campaign", entityId, beforeValue, afterValue: beforeValue, error: "Campaign removal is permanent in Google Ads and cannot be undone." };
    case "set_tracking_template": {
      const { level, entityId: actualId } = decodeTrackingEntityId(entityId);
      return setTrackingTemplate(auth, level, beforeValue, actualId);
    }
    case "create_ad_group":
      return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo ad group creation (would require removing all ads and keywords inside it)" };
    case "create_ad":
      return pauseAd(auth, beforeValue, entityId);
    case "pause_ad":
      return enableAd(auth, beforeValue, entityId);
    case "enable_ad":
      return pauseAd(auth, beforeValue, entityId);
    case "remove_ad":
      return { success: false, action: "remove_ad", entityId, beforeValue, afterValue: beforeValue, error: "Ad removal is permanent in Google Ads and cannot be undone." };
    case "update_ad_final_url": {
      const [adGroupIdPart, adIdPart] = entityId.split("~");
      if (!adGroupIdPart || !adIdPart) {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: malformed entity ID" };
      }
      if (!beforeValue) {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous URL was not recorded" };
      }
      return updateAdFinalUrl(auth, adGroupIdPart, adIdPart, beforeValue);
    }
    case "update_ad_assets": {
      const [adGroupIdPart, adIdPart] = entityId.split("~");
      if (!adGroupIdPart || !adIdPart) {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: malformed entity ID" };
      }
      if (!beforeValue) {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous assets were not recorded" };
      }
      try {
        const prev = JSON.parse(beforeValue) as { h: (string | { text: string; pin?: number })[]; d: (string | { text: string; pin?: number })[] };
        const toAsset = (x: string | { text: string; pin?: number }) =>
          typeof x === "string" ? { text: x } : x;
        return updateAdAssets(auth, adGroupIdPart, adIdPart, {
          headlines: prev.h.map(toAsset),
          descriptions: prev.d.map(toAsset),
        });
      } catch {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: could not parse previous asset state" };
      }
    }
    case "update_campaign_networks": {
      if (!beforeValue) return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous network settings not recorded" };
      try {
        const prev = JSON.parse(beforeValue) as { googleSearch: boolean; searchPartners: boolean; displayNetwork: boolean };
        const result = await updateCampaignSettings(auth, entityId, { networks: prev });
        return result.results[0] ?? { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "No result from network settings update" };
      } catch {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: failed to parse previous network settings" };
      }
    }
    case "add_campaign_location":
    case "remove_campaign_location":
      return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Location changes cannot be automatically undone. Use updateCampaignSettings to adjust locations manually." };
    case "update_bidding": {
      if (!beforeValue) return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous bidding strategy not recorded" };
      try {
        const prev = JSON.parse(beforeValue) as {
          strategy: string;
          targetCpaMicros: number | null;
          targetRoas: number | null;
          impressionShareLocation?: TargetImpressionShareLocation | null;
          locationFractionMicros?: number | null;
          cpcBidCeilingMicros?: number | null;
        };
        return updateCampaignBidding(auth, entityId, {
          biddingStrategy: prev.strategy as BiddingStrategyType,
          targetCpaMicros: prev.targetCpaMicros ?? undefined,
          targetRoas: prev.targetRoas ?? undefined,
          impressionShareLocation: prev.impressionShareLocation ?? undefined,
          locationFractionMicros: prev.locationFractionMicros ?? undefined,
          cpcBidCeilingMicros: prev.cpcBidCeilingMicros ?? undefined,
        });
      } catch {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: failed to parse previous bidding strategy" };
      }
    }
    case "rename_campaign":
      if (!beforeValue) return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous name was not recorded" };
      return renameCampaign(auth, entityId, beforeValue);
    case "rename_ad_group":
      if (!beforeValue) return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous name was not recorded" };
      return renameAdGroup(auth, change.campaignId ?? "", entityId, beforeValue);
    case "create_conversion_action":
      // Undo creation via the canonical remove operation. Setting status=REMOVED
      // through update is rejected by Google (request_error=18).
      return removeConversionAction(auth, entityId);
    case "update_conversion_action": {
      if (!beforeValue) return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: previous conversion action state not recorded" };
      try {
        const prev = JSON.parse(beforeValue) as Record<string, unknown>;
        // status=REMOVED is not settable via update — if the previous state was
        // REMOVED, restoring it requires the remove operation. ENABLED is the
        // only valid status mutation value, so coerce anything else to undefined
        // and the caller's status field stays unchanged.
        const prevStatus = typeof prev.status === "string" && prev.status === "ENABLED" ? "ENABLED" : undefined;
        return updateConversionAction(auth, {
          conversionActionId: entityId,
          name: prev.name as string | undefined,
          status: prevStatus,
          category: prev.category as string | undefined,
          countingType: prev.countingType as string | undefined,
          defaultValue: prev.defaultValue as number | undefined,
          alwaysUseDefaultValue: prev.alwaysUseDefaultValue as boolean | undefined,
        });
      } catch {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: failed to parse previous conversion action state" };
      }
    }
    case "upload_click_conversions":
      return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Conversion uploads cannot be undone — uploaded conversions are permanent in Google Ads" };
    case "pause_pmax_asset_group":
      return enablePmaxAssetGroup(auth, change.campaignId ?? "", entityId);
    case "enable_pmax_asset_group":
      return pausePmaxAssetGroup(auth, change.campaignId ?? "", entityId);
    case "create_negative_keyword_list":
      return removeNegativeKeywordList(auth, entityId);
    case "remove_negative_keyword_list":
      return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Negative keyword list removal is permanent and cannot be undone." };
    case "add_keyword_to_negative_list": {
      const [undoSetId, ...rest] = entityId.split(":");
      const undoKeyword = rest.join(":");
      const afterVal = change.afterValue ?? "";
      const pipeIdx = afterVal.lastIndexOf("|");
      const undoMatchType = pipeIdx > 0 ? afterVal.slice(pipeIdx + 1) as "BROAD" | "PHRASE" | "EXACT" : undefined;
      return removeKeywordFromNegativeList(auth, undoSetId, undoKeyword, undoMatchType);
    }
    case "remove_keyword_from_negative_list": {
      const [undoSetId, ...rest] = entityId.split(":");
      const undoKeyword = rest.join(":");
      const bv = change.beforeValue ?? "";
      const pipeIdx = bv.lastIndexOf("|");
      const undoMatchType = pipeIdx > 0 ? bv.slice(pipeIdx + 1) as "BROAD" | "PHRASE" | "EXACT" : "PHRASE";
      const undoText = pipeIdx > 0 ? bv.slice(0, pipeIdx) : undoKeyword;
      return addKeywordToNegativeList(auth, undoSetId, undoText, undoMatchType);
    }
    case "link_negative_list_to_campaign": {
      const [undoCampaignId, undoSetId] = entityId.split("~");
      return unlinkNegativeListFromCampaign(auth, undoCampaignId, undoSetId);
    }
    case "unlink_negative_list_from_campaign": {
      const [undoCampaignId, undoSetId] = entityId.split("~");
      return linkNegativeListToCampaign(auth, undoCampaignId, undoSetId);
    }
    case "create_experiment":
    case "add_experiment_arms":
    case "schedule_experiment":
    case "end_experiment":
    case "promote_experiment":
    case "graduate_experiment":
    case "create_ad_variation_experiment":
      // Experiment lifecycle transitions aren't safely reversible by undo:
      // schedule forks campaigns, promote rewrites the base, graduate splits
      // them off, end is already a terminal state. The natural inverse is
      // `endExperiment` — discard the experiment without applying changes.
      return {
        success: false,
        action: change.toolName,
        entityId,
        beforeValue,
        afterValue: beforeValue,
        error: `Experiment writes aren't reversible via undoChange. To discard a scheduled experiment without promoting/graduating, call endExperiment with the experimentResourceName.`,
      };
    case "link_asset": {
      // Undo a link by removing the link resource(s). The afterValue is the
      // canonical link resource_name (single link) — for multi-target link
      // operations, change records are split per-campaign by execAssetLinkWrite
      // so each record carries its own link resource_name.
      const afterVal = change.afterValue ?? "";
      if (!afterVal || !/\/(?:customer|campaign|adGroup|assetGroup)Assets\//.test(afterVal)) {
        return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: "Cannot undo: link resource_name was not recorded on this change. Call unlinkAssetLinks directly." };
      }
      return unlinkAssetLinks(auth, [afterVal]);
    }
    case "unlink_asset":
      // Unlink can't be safely auto-redone — we'd need to re-create the same
      // link with the same field_type at the same target, but the link
      // resource_name is gone after removal. Surface a clear pointer instead.
      return {
        success: false,
        action: change.toolName,
        entityId,
        beforeValue,
        afterValue: beforeValue,
        error: "Cannot auto-undo asset link removal — re-link the asset with `linkAsset` if you want to restore serving.",
      };
    case "create_callout_asset":
    case "create_sitelink_asset":
    case "create_structured_snippet_asset":
    case "create_image_asset":
      // Create+link operations are reversible by removing every link they
      // produced. The asset itself remains (Google Ads has no asset deletion
      // in the public API), but it stops serving when its links are gone. The
      // afterValue carries the primary link resource_name when targets were
      // provided; for asset-only creates it's text/dimensions metadata, which
      // we can't undo.
      {
        const afterVal = change.afterValue ?? "";
        if (afterVal && /\/(?:customer|campaign|adGroup|assetGroup)Assets\//.test(afterVal)) {
          return unlinkAssetLinks(auth, [afterVal]);
        }
        return {
          success: false,
          action: change.toolName,
          entityId,
          beforeValue,
          afterValue: beforeValue,
          error: `Cannot undo: ${change.toolName} created an asset with no link to remove (Google Ads has no asset deletion). The asset row remains permanently in the account; this is harmless because it can't serve without a link.`,
        };
      }
    default:
      return { success: false, action: change.toolName, entityId, beforeValue, afterValue: beforeValue, error: `Don't know how to undo "${change.toolName}"` };
  }
}
