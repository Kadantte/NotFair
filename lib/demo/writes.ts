/**
 * Demo write no-ops. Every write the UI or MCP triggers while a demo session
 * is active short-circuits here and returns a success result that the existing
 * downstream logic (optimistic UI, toasts, operations log skip) can treat
 * normally.
 *
 * Nothing is persisted — we never hit Google Ads, and we never write to the
 * DB. The demo reads already encode the post-change state narratively (e.g.
 * "this negative would have been added"), so the UI still feels responsive.
 */
import type { WriteResult } from "@/lib/google-ads";

const DEMO_ERROR_PREFIX = "Demo mode — ";

export function demoWriteSuccess(
  action: string,
  entityId: string,
  beforeValue = "",
  afterValue = "",
  label: string | null = null,
): WriteResult {
  return {
    success: true,
    action,
    entityId,
    beforeValue,
    afterValue,
    label,
  };
}

export function demoPauseCampaign(campaignId: string): WriteResult {
  return demoWriteSuccess("pause_campaign", campaignId, "ENABLED", "PAUSED");
}

export function demoEnableCampaign(campaignId: string): WriteResult {
  return demoWriteSuccess("enable_campaign", campaignId, "PAUSED", "ENABLED");
}

export function demoRemoveCampaign(campaignId: string): WriteResult {
  return demoWriteSuccess("remove_campaign", campaignId, "PAUSED", "REMOVED");
}

export function demoRenameCampaign(campaignId: string, newName: string): WriteResult {
  return demoWriteSuccess("rename_campaign", campaignId, "Old name", newName);
}

export function demoPauseKeyword(criterionId: string): WriteResult {
  return demoWriteSuccess("pause_keyword", criterionId, "ENABLED", "PAUSED");
}

export function demoEnableKeyword(criterionId: string): WriteResult {
  return demoWriteSuccess("enable_keyword", criterionId, "PAUSED", "ENABLED");
}

export function demoAddKeyword(text: string, matchType: "EXACT" | "PHRASE" | "BROAD"): WriteResult {
  return demoWriteSuccess("add_keyword", `demo-kw-${Date.now()}`, "", `${text} (${matchType})`);
}

export function demoRemoveKeyword(criterionId: string): WriteResult {
  return demoWriteSuccess("remove_keyword", criterionId, criterionId, "");
}

export function demoUpdateBid(criterionId: string, newBidMicros: number): WriteResult {
  return demoWriteSuccess(
    "update_bid",
    criterionId,
    "1000000",
    String(newBidMicros),
  );
}

export function demoAddNegativeKeyword(campaignId: string, text: string): WriteResult {
  return demoWriteSuccess(
    "add_negative_keyword",
    `${campaignId}-neg-${Date.now()}`,
    "",
    text,
  );
}

export function demoRemoveNegativeKeyword(criterionId: string): WriteResult {
  return demoWriteSuccess("remove_negative_keyword", criterionId, criterionId, "");
}

export function demoUpdateCampaignBudget(campaignId: string, newBudgetMicros: number): WriteResult {
  return demoWriteSuccess(
    "update_campaign_budget",
    campaignId,
    "0",
    String(newBudgetMicros),
  );
}

export function demoRenameAdGroup(adGroupId: string, newName: string, campaignId: string): WriteResult {
  return {
    ...demoWriteSuccess("rename_ad_group", adGroupId, "Old name", newName),
    campaignId,
  };
}

export function demoFailure(action: string, entityId: string, reason: string): WriteResult {
  return {
    success: false,
    action,
    entityId,
    beforeValue: "",
    afterValue: "",
    error: `${DEMO_ERROR_PREFIX}${reason}`,
  };
}
