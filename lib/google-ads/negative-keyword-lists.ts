/**
 * Shared Negative Keyword Lists.
 *
 * Google Ads supports "shared sets" — reusable lists of negative keywords that
 * can be linked to multiple campaigns at once. When you update the list, the
 * change propagates to every linked campaign automatically.
 *
 * Three API resources are involved:
 *   - `shared_set`          — the list container (type = NEGATIVE_KEYWORDS)
 *   - `shared_criterion`    — individual keywords inside a list
 *   - `campaign_shared_set` — links a list to a campaign
 */

import { getCachedCustomer, getCustomer, MATCH_TYPE, MATCH_TYPE_NAME } from "./client";
import { extractErrorMessage, normalizeCustomerId, safeEntityId } from "./helpers";
import type { AuthContext, WriteResult } from "./types";

// SharedSetType enum: NEGATIVE_KEYWORDS = 2 (from google-ads-api protos)
const SHARED_SET_TYPE_NEGATIVE_KEYWORDS = 2;

// SharedSetStatus enum values (from google-ads-api protos)
// ENABLED = 2, REMOVED = 3

// ─── Reads ──────────────────────────────────────────────────────────

export type NegativeKeywordList = {
  sharedSetId: string;
  name: string;
  memberCount: number;
  /** Resource name, e.g. "customers/123/sharedSets/456" */
  resourceName: string;
  /** Campaign IDs this list is linked to */
  linkedCampaignIds: string[];
};

/** List all negative keyword lists (shared sets of type NEGATIVE_KEYWORDS) in the account. */
export async function listNegativeKeywordLists(auth: AuthContext): Promise<NegativeKeywordList[]> {
  const customer = getCachedCustomer(auth);

  // Fetch shared sets
  const setsResult = await customer.query(`
    SELECT
      shared_set.id,
      shared_set.name,
      shared_set.resource_name,
      shared_set.member_count
    FROM shared_set
    WHERE shared_set.type = NEGATIVE_KEYWORDS
      AND shared_set.status != REMOVED
  `);

  const sets = (setsResult as any[]).map((row: any) => ({
    sharedSetId: String(row.shared_set?.id ?? ""),
    name: row.shared_set?.name ?? "",
    memberCount: Number(row.shared_set?.member_count ?? 0),
    resourceName: row.shared_set?.resource_name ?? "",
    linkedCampaignIds: [] as string[],
  }));

  if (sets.length === 0) return sets;

  // Fetch campaign links for all negative keyword shared sets
  const linksResult = await customer.query(`
    SELECT
      campaign_shared_set.shared_set,
      campaign_shared_set.campaign,
      campaign.id
    FROM campaign_shared_set
    WHERE shared_set.type = NEGATIVE_KEYWORDS
      AND campaign_shared_set.status != REMOVED
  `);

  // Build a map: shared_set resource_name → list of campaign IDs
  const linkMap = new Map<string, string[]>();
  for (const row of linksResult as any[]) {
    const setResource = row.campaign_shared_set?.shared_set as string;
    const campaignId = String(row.campaign?.id ?? "");
    if (setResource && campaignId) {
      const existing = linkMap.get(setResource) ?? [];
      existing.push(campaignId);
      linkMap.set(setResource, existing);
    }
  }

  for (const set of sets) {
    set.linkedCampaignIds = linkMap.get(set.resourceName) ?? [];
  }

  return sets;
}

export type NegativeKeywordListItem = {
  criterionId: string;
  text: string;
  matchType: string;
};

/** List keywords inside a negative keyword list. */
export async function getNegativeKeywordListItems(
  auth: AuthContext,
  sharedSetId: string,
  limit = 200,
): Promise<NegativeKeywordListItem[]> {
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(sharedSetId);
  const bounded = Math.min(Math.max(limit, 1), 1000);

  const result = await customer.query(`
    SELECT
      shared_criterion.criterion_id,
      shared_criterion.keyword.text,
      shared_criterion.keyword.match_type
    FROM shared_criterion
    WHERE shared_set.id = ${id}
      AND shared_criterion.type = KEYWORD
    LIMIT ${bounded}
  `);

  return (result as any[]).map((row: any) => ({
    criterionId: String(row.shared_criterion?.criterion_id ?? ""),
    text: row.shared_criterion?.keyword?.text ?? "",
    matchType: MATCH_TYPE_NAME[row.shared_criterion?.keyword?.match_type as number] ?? "UNKNOWN",
  }));
}

// ─── Writes ─────────────────────────────────────────────────────────

/** Create a shared negative keyword list. */
export async function createNegativeKeywordList(
  auth: AuthContext,
  name: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const trimmed = name.trim();

  if (!trimmed) {
    return {
      success: false,
      action: "create_negative_keyword_list",
      entityId: "",
      beforeValue: "",
      afterValue: "",
      error: "List name cannot be empty",
    };
  }

  try {
    const response = await customer.mutateResources([
      {
        entity: "shared_set" as any,
        operation: "create",
        resource: {
          name: trimmed,
          type: SHARED_SET_TYPE_NEGATIVE_KEYWORDS,
        },
      },
    ]);

    const responses = (response as any)?.mutate_operation_responses ?? [];
    const resourceName = responses[0]?.shared_set_result?.resource_name as string | undefined;
    const sharedSetId = resourceName?.split("/").pop() ?? "";

    if (!sharedSetId) {
      return {
        success: false,
        action: "create_negative_keyword_list",
        entityId: "",
        beforeValue: "",
        afterValue: trimmed,
        error: "List created but could not parse shared set ID from response",
      };
    }

    return {
      success: true,
      action: "create_negative_keyword_list",
      entityId: sharedSetId,
      beforeValue: "",
      afterValue: trimmed,
      label: trimmed,
    };
  } catch (error) {
    return {
      success: false,
      action: "create_negative_keyword_list",
      entityId: "",
      beforeValue: "",
      afterValue: trimmed,
      error: extractErrorMessage(error),
    };
  }
}

/** Remove (delete) a shared negative keyword list. This also unlinks it from all campaigns. */
export async function removeNegativeKeywordList(
  auth: AuthContext,
  sharedSetId: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const customerId = normalizeCustomerId(auth.customerId);
  const id = safeEntityId(sharedSetId);

  try {
    // Fetch the list name before removal for undo metadata
    const nameResult = await customer.query(`
      SELECT shared_set.name
      FROM shared_set
      WHERE shared_set.id = ${id}
      LIMIT 1
    `);
    const listName = (nameResult as any[])[0]?.shared_set?.name ?? "";

    await customer.mutateResources([
      {
        entity: "shared_set" as any,
        operation: "remove",
        resource: `customers/${customerId}/sharedSets/${id}` as any,
      },
    ]);

    return {
      success: true,
      action: "remove_negative_keyword_list",
      entityId: sharedSetId,
      beforeValue: listName,
      afterValue: "",
      label: listName,
    };
  } catch (error) {
    return {
      success: false,
      action: "remove_negative_keyword_list",
      entityId: sharedSetId,
      beforeValue: "",
      afterValue: "",
      error: extractErrorMessage(error),
    };
  }
}

/** Add a keyword to a shared negative keyword list. */
export async function addKeywordToNegativeList(
  auth: AuthContext,
  sharedSetId: string,
  keyword: string,
  matchType: "BROAD" | "PHRASE" | "EXACT" = "PHRASE",
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const customerId = normalizeCustomerId(auth.customerId);
  const id = safeEntityId(sharedSetId);
  const text = keyword.trim();

  if (!text) {
    return {
      success: false,
      action: "add_keyword_to_negative_list",
      entityId: "",
      beforeValue: "",
      afterValue: "",
      error: "Keyword text cannot be empty",
    };
  }

  try {
    await customer.mutateResources([
      {
        entity: "shared_criterion" as any,
        operation: "create",
        resource: {
          shared_set: `customers/${customerId}/sharedSets/${id}`,
          keyword: {
            text,
            match_type: MATCH_TYPE[matchType],
          },
        },
      },
    ]);

    return {
      success: true,
      action: "add_keyword_to_negative_list",
      entityId: `${sharedSetId}:${text}`,
      beforeValue: "",
      afterValue: `${text}|${matchType}`,
      label: text,
    };
  } catch (error) {
    const msg = extractErrorMessage(error);
    return {
      success: false,
      action: "add_keyword_to_negative_list",
      entityId: `${sharedSetId}:${text}`,
      beforeValue: "",
      afterValue: `${text}|${matchType}`,
      error: msg.includes("ALREADY_EXISTS")
        ? `Keyword "${text}" already exists in this list`
        : msg,
    };
  }
}

/** Remove a keyword from a shared negative keyword list. */
export async function removeKeywordFromNegativeList(
  auth: AuthContext,
  sharedSetId: string,
  keyword: string,
  matchType?: "BROAD" | "PHRASE" | "EXACT",
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const customerId = normalizeCustomerId(auth.customerId);
  const id = safeEntityId(sharedSetId);

  try {
    // Find the shared_criterion by keyword text
    const result = await customer.query(`
      SELECT
        shared_criterion.criterion_id,
        shared_criterion.keyword.text,
        shared_criterion.keyword.match_type
      FROM shared_criterion
      WHERE shared_set.id = ${id}
        AND shared_criterion.type = KEYWORD
    `);

    const match = (result as any[]).find((row) => {
      if (row.shared_criterion?.keyword?.text !== keyword) return false;
      if (matchType && row.shared_criterion?.keyword?.match_type !== MATCH_TYPE[matchType]) return false;
      return true;
    });

    const criterionId = match?.shared_criterion?.criterion_id;
    if (!criterionId) {
      return {
        success: false,
        action: "remove_keyword_from_negative_list",
        entityId: `${sharedSetId}:${keyword}`,
        beforeValue: keyword,
        afterValue: "",
        error: `Keyword "${keyword}" not found in list ${sharedSetId}`,
      };
    }

    const resolvedMatchType = MATCH_TYPE_NAME[match.shared_criterion?.keyword?.match_type as number] ?? "PHRASE";

    await customer.mutateResources([
      {
        entity: "shared_criterion" as any,
        operation: "remove",
        resource: `customers/${customerId}/sharedCriteria/${id}~${criterionId}` as any,
      },
    ]);

    return {
      success: true,
      action: "remove_keyword_from_negative_list",
      entityId: `${sharedSetId}:${keyword}`,
      beforeValue: `${keyword}|${resolvedMatchType}`,
      afterValue: "",
      label: keyword,
    };
  } catch (error) {
    return {
      success: false,
      action: "remove_keyword_from_negative_list",
      entityId: `${sharedSetId}:${keyword}`,
      beforeValue: keyword,
      afterValue: "",
      error: extractErrorMessage(error),
    };
  }
}

/** Link a shared negative keyword list to a campaign. */
export async function linkNegativeListToCampaign(
  auth: AuthContext,
  campaignId: string,
  sharedSetId: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const customerId = normalizeCustomerId(auth.customerId);
  const cid = safeEntityId(campaignId);
  const sid = safeEntityId(sharedSetId);

  try {
    await customer.mutateResources([
      {
        entity: "campaign_shared_set" as any,
        operation: "create",
        resource: {
          campaign: `customers/${customerId}/campaigns/${cid}`,
          shared_set: `customers/${customerId}/sharedSets/${sid}`,
        },
      },
    ]);

    return {
      success: true,
      action: "link_negative_list_to_campaign",
      entityId: `${campaignId}~${sharedSetId}`,
      beforeValue: "",
      afterValue: `campaign:${campaignId}|list:${sharedSetId}`,
    };
  } catch (error) {
    const msg = extractErrorMessage(error);
    return {
      success: false,
      action: "link_negative_list_to_campaign",
      entityId: `${campaignId}~${sharedSetId}`,
      beforeValue: "",
      afterValue: "",
      error: msg.includes("ALREADY_EXISTS")
        ? `List ${sharedSetId} is already linked to campaign ${campaignId}`
        : msg,
    };
  }
}

/** Unlink a shared negative keyword list from a campaign. */
export async function unlinkNegativeListFromCampaign(
  auth: AuthContext,
  campaignId: string,
  sharedSetId: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const customerId = normalizeCustomerId(auth.customerId);
  const cid = safeEntityId(campaignId);
  const sid = safeEntityId(sharedSetId);

  try {
    // Find the campaign_shared_set link
    const linkResult = await customer.query(`
      SELECT campaign_shared_set.resource_name
      FROM campaign_shared_set
      WHERE campaign.id = ${cid}
        AND shared_set.id = ${sid}
        AND campaign_shared_set.status != REMOVED
      LIMIT 1
    `);

    const linkResource = (linkResult as any[])[0]?.campaign_shared_set?.resource_name as string | undefined;
    if (!linkResource) {
      return {
        success: false,
        action: "unlink_negative_list_from_campaign",
        entityId: `${campaignId}~${sharedSetId}`,
        beforeValue: "",
        afterValue: "",
        error: `List ${sharedSetId} is not linked to campaign ${campaignId}`,
      };
    }

    await customer.mutateResources([
      {
        entity: "campaign_shared_set" as any,
        operation: "remove",
        resource: linkResource as any,
      },
    ]);

    return {
      success: true,
      action: "unlink_negative_list_from_campaign",
      entityId: `${campaignId}~${sharedSetId}`,
      beforeValue: `campaign:${campaignId}|list:${sharedSetId}`,
      afterValue: "",
    };
  } catch (error) {
    return {
      success: false,
      action: "unlink_negative_list_from_campaign",
      entityId: `${campaignId}~${sharedSetId}`,
      beforeValue: "",
      afterValue: "",
      error: extractErrorMessage(error),
    };
  }
}
