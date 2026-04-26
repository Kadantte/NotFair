import { getCustomer, MATCH_TYPE, MATCH_TYPE_NAME, STATUS } from "./client";
import { extractErrorMessage, extractPolicyDetails, normalizeCustomerId, removeNegativeKeywordHint, rewriteNegativePauseError, safeEntityId, toMicros } from "./helpers";
import type { AuthContext, Guardrails, NextToolHint, WriteResult } from "./types";
import { DEFAULT_GUARDRAILS } from "./types";
import { addKeyword, pauseKeyword } from "./writes";

// ─── Bidding Strategy Type Enum Mapping ──────────────────────────────
// The google-ads-api library may return bidding_strategy_type as a numeric
// enum value OR a string name, depending on the response decoder path. Map
// both forms to a canonical string name so downstream checks work.
// Source: google-ads-api enums.BiddingStrategyType (v22)
const BIDDING_STRATEGY_TYPE_NAME: Record<number, string> = {
  0: "UNSPECIFIED",
  1: "UNKNOWN",
  2: "ENHANCED_CPC",
  3: "MANUAL_CPC",
  4: "MANUAL_CPM",
  5: "PAGE_ONE_PROMOTED",
  6: "TARGET_CPA",
  7: "TARGET_OUTRANK_SHARE",
  8: "TARGET_ROAS",
  9: "TARGET_SPEND",
  10: "MAXIMIZE_CONVERSIONS",
  11: "MAXIMIZE_CONVERSION_VALUE",
  12: "PERCENT_CPC",
  13: "MANUAL_CPV",
  14: "TARGET_CPM",
  15: "TARGET_IMPRESSION_SHARE",
  16: "COMMISSION",
  17: "INVALID",
  18: "MANUAL_CPA",
  19: "FIXED_CPM",
  20: "TARGET_CPV",
  21: "TARGET_CPC",
  22: "FIXED_SHARE_OF_VOICE",
};

function normalizeBiddingStrategyName(raw: unknown): string {
  if (raw == null) return "UNKNOWN";
  if (typeof raw === "number") return BIDDING_STRATEGY_TYPE_NAME[raw] ?? `UNKNOWN_${raw}`;
  const s = String(raw);
  // Sometimes the API returns the number as a string ("3")
  const asNum = Number(s);
  if (Number.isInteger(asNum) && BIDDING_STRATEGY_TYPE_NAME[asNum]) {
    return BIDDING_STRATEGY_TYPE_NAME[asNum];
  }
  return s;
}

// ─── Retry helpers ────────────────────────────────────────────────────
// Google Ads occasionally returns `database_error=2` meaning "Multiple
// requests were attempting to modify the same resource at once. Retry the
// request." This is a transient, retryable error. Retry with exponential
// backoff + jitter.
function isDatabaseContentionError(message: string | undefined | null): boolean {
  if (!message) return false;
  return (
    message.includes("database_error=2") ||
    message.includes("Multiple requests were attempting to modify the same resource")
  );
}

// Backoff schedule for retries AFTER the initial attempt.
// Attempt 2: 200ms + rand(0-100); Attempt 3: 500ms + rand(0-200)
const DB_CONTENTION_BACKOFFS_MS: Array<{ base: number; jitter: number }> = [
  { base: 200, jitter: 100 },
  { base: 500, jitter: 200 },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Invoke an async op that returns a WriteResult. If it returns an unsuccessful
 * result whose error matches the database contention pattern, retry up to 2
 * additional times with jittered exponential backoff. Any other error (or
 * success) returns immediately.
 */
async function withDatabaseContentionRetry<T extends WriteResult>(
  op: () => Promise<T>,
): Promise<T> {
  let result = await op();
  for (const { base, jitter } of DB_CONTENTION_BACKOFFS_MS) {
    if (result.success || !isDatabaseContentionError(result.error)) return result;
    await sleep(base + Math.floor(Math.random() * (jitter + 1)));
    result = await op();
  }
  return result;
}

// ─── Bulk Operations ─────────────────────────────────────────────────

export type BulkBidUpdate = {
  campaignId: string;
  adGroupId: string;
  criterionId: string;
  newBidDollars: number;
};

export async function bulkUpdateBids(
  auth: AuthContext,
  updates: BulkBidUpdate[],
  guardrails = DEFAULT_GUARDRAILS,
): Promise<Array<WriteResult & { input: BulkBidUpdate }>> {
  if (updates.length === 0) return [];

  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  // Group by campaign to batch-fetch bidding strategy + current bids
  const byCampaign = new Map<string, BulkBidUpdate[]>();
  for (const u of updates) {
    const arr = byCampaign.get(u.campaignId) ?? [];
    arr.push(u);
    byCampaign.set(u.campaignId, arr);
  }

  // 1 query per campaign: fetch strategy + all keyword bids at once
  const preCheckData = new Map<string, { strategy: string; bidMicros: number }>();
  for (const [campaignId, group] of byCampaign) {
    const campId = safeEntityId(campaignId);
    const validIds = group
      .map((u) => Number(u.criterionId))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (validIds.length === 0) continue; // every criterionId malformed — let the downstream "Keyword not found" path report
    const criterionIds = validIds.join(",");
    const rows = await customer.query(`
      SELECT
        campaign.bidding_strategy_type,
        ad_group_criterion.criterion_id,
        ad_group_criterion.cpc_bid_micros
      FROM keyword_view
      WHERE campaign.id = ${campId}
        AND ad_group_criterion.criterion_id IN (${criterionIds})
    `);
    for (const row of rows as any[]) {
      const critId = String(row.ad_group_criterion?.criterion_id ?? "");
      preCheckData.set(`${campaignId}:${critId}`, {
        strategy: normalizeBiddingStrategyName(row.campaign?.bidding_strategy_type),
        bidMicros: row.ad_group_criterion?.cpc_bid_micros ?? 0,
      });
    }
  }

  // Validate all updates and build mutations
  const results: Array<WriteResult & { input: BulkBidUpdate }> = [];
  const validMutations: Array<{ update: BulkBidUpdate; newBidMicros: number; currentBidMicros: number }> = [];

  for (const u of updates) {
    const newBidMicros = toMicros(u.newBidDollars);
    const data = preCheckData.get(`${u.campaignId}:${u.criterionId}`);

    if (!data) {
      results.push({ success: false, action: "update_bid", entityId: u.criterionId, beforeValue: "N/A", afterValue: String(newBidMicros), error: "Keyword not found", input: u });
      continue;
    }
    if (newBidMicros <= 0) {
      results.push({ success: false, action: "update_bid", entityId: u.criterionId, beforeValue: String(data.bidMicros), afterValue: String(newBidMicros), error: "Bid must be greater than zero", input: u });
      continue;
    }
    if (data.bidMicros > 0) {
      const changePct = Math.abs(newBidMicros - data.bidMicros) / data.bidMicros;
      if (changePct > guardrails.maxBidChangePct) {
        results.push({ success: false, action: "update_bid", entityId: u.criterionId, beforeValue: String(data.bidMicros), afterValue: String(newBidMicros), error: `Bid change of ${(changePct * 100).toFixed(0)}% exceeds maximum allowed ${(guardrails.maxBidChangePct * 100).toFixed(0)}%`, input: u });
        continue;
      }
    }
    validMutations.push({ update: u, newBidMicros, currentBidMicros: data.bidMicros });
  }

  // Batch mutate in chunks to avoid API limits and isolate failures
  const CHUNK_SIZE = 10;
  for (let i = 0; i < validMutations.length; i += CHUNK_SIZE) {
    const chunk = validMutations.slice(i, i + CHUNK_SIZE);
    try {
      await customer.mutateResources(
        chunk.map(({ update, newBidMicros }) => ({
          entity: "ad_group_criterion" as any,
          operation: "update" as const,
          resource: {
            resource_name: `customers/${cid}/adGroupCriteria/${update.adGroupId}~${update.criterionId}`,
            cpc_bid_micros: newBidMicros,
          },
        })),
      );
      for (const { update, newBidMicros, currentBidMicros } of chunk) {
        results.push({ success: true, action: "update_bid", entityId: update.criterionId, beforeValue: String(currentBidMicros), afterValue: String(newBidMicros), input: update });
      }
    } catch (error) {
      const msg = extractErrorMessage(error);
      for (const { update, newBidMicros, currentBidMicros } of chunk) {
        results.push({ success: false, action: "update_bid", entityId: update.criterionId, beforeValue: String(currentBidMicros), afterValue: String(newBidMicros), error: msg, input: update });
      }
    }
  }

  return results;
}

// ─── Bulk Keyword Operations ────────────────────────────────────────────

export type BulkPauseKeywordInput = {
  campaignId: string;
  adGroupId: string;
  criterionId: string;
};

export type BulkValidationOperation = "pause_keyword" | "add_keyword" | "update_bid";

export type BulkValidationIssue = {
  id: string;
  code: string;
  severity: "error" | "warning";
  reason: string;
  criterionId?: string;
  /** @deprecated use `nextTool.name` — kept for client backwards-compat. */
  alternativeTool?: string;
  /** Structured tool-routing hint, parallel to WriteResult.nextTool. */
  nextTool?: NextToolHint;
  fix?: string;
};

export type BulkPreValidationResult<T> = {
  ok: boolean;
  valid: Array<{ id: string; input: T }>;
  invalid: Array<BulkValidationIssue & { input: T }>;
};

type KeywordPrevalidationRow = {
  campaign?: {
    id?: string | number;
    status?: string | number;
    bidding_strategy_type?: string | number;
  };
  ad_group?: {
    id?: string | number;
    status?: string | number;
  };
  ad_group_criterion?: {
    criterion_id?: string | number;
    status?: string | number;
    cpc_bid_micros?: string | number;
    negative?: boolean;
    keyword?: {
      text?: string;
      match_type?: string | number;
    };
  };
};

type BulkAddValidationInput = BulkAddKeywordInput & {
  campaignId: string;
  adGroupId: string;
};

type AddKeywordPrevalidationRow = {
  campaign?: {
    id?: string | number;
    status?: string | number;
  };
  ad_group?: {
    id?: string | number;
    status?: string | number;
  };
  ad_group_criterion?: {
    criterion_id?: string | number;
    negative?: boolean;
    status?: string | number;
    keyword?: {
      text?: string;
      match_type?: string | number;
    };
  };
};

export async function preValidateBulkMutation(
  auth: AuthContext,
  operation: "pause_keyword",
  items: BulkPauseKeywordInput[],
): Promise<BulkPreValidationResult<BulkPauseKeywordInput>>;
export async function preValidateBulkMutation(
  auth: AuthContext,
  operation: "update_bid",
  items: BulkBidUpdate[],
  guardrails?: Guardrails,
): Promise<BulkPreValidationResult<BulkBidUpdate>>;
export async function preValidateBulkMutation(
  auth: AuthContext,
  operation: "add_keyword",
  items: BulkAddValidationInput[],
): Promise<BulkPreValidationResult<BulkAddValidationInput>>;
export async function preValidateBulkMutation(
  auth: AuthContext,
  operation: BulkValidationOperation,
  items: Array<BulkPauseKeywordInput | BulkBidUpdate | BulkAddValidationInput>,
  guardrails = DEFAULT_GUARDRAILS,
): Promise<BulkPreValidationResult<BulkPauseKeywordInput | BulkBidUpdate | BulkAddValidationInput>> {
  if (items.length === 0) return { ok: true, valid: [], invalid: [] };
  if (operation === "add_keyword") {
    return preValidateBulkAddKeywords(auth, items as BulkAddValidationInput[]);
  }
  return preValidateCriterionBulkMutation(
    auth,
    operation,
    items as Array<BulkPauseKeywordInput | BulkBidUpdate>,
    guardrails,
  );
}

async function preValidateCriterionBulkMutation<T extends BulkPauseKeywordInput | BulkBidUpdate>(
  auth: AuthContext,
  operation: "pause_keyword" | "update_bid",
  items: T[],
  guardrails: Guardrails,
): Promise<BulkPreValidationResult<T>> {
  if (items.length === 0) return { ok: true, valid: [], invalid: [] };

  const customer = getCustomer(auth);
  const byCampaign = new Map<string, T[]>();
  for (const k of items) {
    const arr = byCampaign.get(k.campaignId) ?? [];
    arr.push(k);
    byCampaign.set(k.campaignId, arr);
  }

  const records = new Map<string, KeywordPrevalidationRow>();
  await Promise.all(
    [...byCampaign.entries()].map(async ([campaignId, group]) => {
      const validIds = group
        .map((k) => Number(k.criterionId))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (validIds.length === 0) return;

      const rows = await customer.query(`
        SELECT
          campaign.id,
          campaign.status,
          campaign.bidding_strategy_type,
          ad_group.id,
          ad_group.status,
          ad_group_criterion.criterion_id,
          ad_group_criterion.status,
          ad_group_criterion.cpc_bid_micros,
          ad_group_criterion.negative,
          ad_group_criterion.keyword.match_type
        FROM keyword_view
        WHERE campaign.id = ${safeEntityId(campaignId)}
          AND ad_group.id IN (${[...new Set(group.map((k) => safeEntityId(k.adGroupId)))].join(",")})
          AND ad_group_criterion.criterion_id IN (${validIds.join(",")})
        LIMIT ${Math.min(validIds.length + 1, 2000)}
      `);

      for (const row of rows as KeywordPrevalidationRow[]) {
        const criterionId = String(row.ad_group_criterion?.criterion_id ?? "");
        const adGroupId = String(row.ad_group?.id ?? "");
        if (criterionId && adGroupId) records.set(`${campaignId}:${adGroupId}:${criterionId}`, row);
      }
    }),
  );

  const valid: Array<{ id: string; input: T }> = [];
  const invalid: Array<BulkValidationIssue & { input: T }> = [];
  const activePauseCountByCampaign = new Map<string, number>();
  const requestedPauseCountByCampaign = new Map<string, number>();

  for (const item of items) {
    const id = item.criterionId;
    const record = records.get(`${item.campaignId}:${item.adGroupId}:${item.criterionId}`);
    const issues = validateCriterionRecord(operation, item, record, guardrails);
    if (issues.length > 0) {
      invalid.push(...issues.map((issue) => ({ ...issue, input: item })));
    }
    if (issues.some((issue) => issue.severity === "error")) {
      continue;
    }
    if (operation === "pause_keyword") {
      requestedPauseCountByCampaign.set(
        item.campaignId,
        (requestedPauseCountByCampaign.get(item.campaignId) ?? 0) + 1,
      );
    }
    valid.push({ id, input: item });
  }

  if (operation === "pause_keyword") {
    await Promise.all(
      [...requestedPauseCountByCampaign.keys()].map(async (campaignId) => {
        const countResult = await customer.query(`
          SELECT ad_group_criterion.criterion_id
          FROM keyword_view
          WHERE campaign.id = ${safeEntityId(campaignId)}
            AND campaign.status != 'REMOVED'
            AND ad_group.status != 'REMOVED'
            AND ad_group_criterion.status = 'ENABLED'
            AND ad_group_criterion.negative = FALSE
        `);
        activePauseCountByCampaign.set(campaignId, (countResult as unknown[]).length);
      }),
    );

    for (const [campaignId, requestedCount] of requestedPauseCountByCampaign) {
      const activeCount = activePauseCountByCampaign.get(campaignId) ?? 0;
      if (requestedCount >= activeCount) {
        for (const item of valid.filter((v) => v.input.campaignId === campaignId)) {
          invalid.push({
            id: item.id,
            criterionId: item.id,
            code: "WOULD_LEAVE_CAMPAIGN_WITH_NO_ACTIVE_KEYWORDS",
            severity: "error",
            reason: `Cannot pause ${requestedCount} of ${activeCount} active positive keywords in campaign ${campaignId}.`,
            fix: "Leave at least one active positive keyword in the campaign.",
            input: item.input,
          });
        }
      }
    }
  }

  const invalidIds = new Set(invalid.filter((issue) => issue.severity === "error").map((issue) => `${issue.id}:${issue.code}`));
  const validAfterCampaignChecks = valid.filter((item) =>
    ![...invalidIds].some((key) => key.startsWith(`${item.id}:`)),
  );

  return {
    ok: invalid.every((issue) => issue.severity === "warning"),
    valid: validAfterCampaignChecks,
    invalid,
  };
}

function validateCriterionRecord<T extends BulkPauseKeywordInput | BulkBidUpdate>(
  operation: "pause_keyword" | "update_bid",
  item: T,
  record: KeywordPrevalidationRow | undefined,
  guardrails: Guardrails,
): BulkValidationIssue[] {
  const id = item.criterionId;
  if (!record) {
    return [{
      id,
      criterionId: id,
      code: "ENTITY_NOT_FOUND",
      severity: "error",
      reason: `Keyword criterion ${id} was not found in campaign ${item.campaignId}.`,
    }];
  }

  const issues: BulkValidationIssue[] = [];
  const campaignStatus = normalizeStatus(record.campaign?.status);
  if (campaignStatus === "REMOVED") {
    return [{
      id,
      criterionId: id,
      code: "PARENT_CAMPAIGN_REMOVED",
      severity: "error",
      reason: `Parent campaign ${item.campaignId} is REMOVED.`,
    }];
  }

  const adGroupStatus = normalizeStatus(record.ad_group?.status);
  if (adGroupStatus === "REMOVED") {
    return [{
      id,
      criterionId: id,
      code: "PARENT_AD_GROUP_REMOVED",
      severity: "error",
      reason: `Parent ad group ${item.adGroupId} is REMOVED.`,
    }];
  }

  const rawMatchType = record.ad_group_criterion?.keyword?.match_type;
  const matchType = normalizeMatchType(rawMatchType);
  const isNegative = record.ad_group_criterion?.negative === true || matchType === "UNSPECIFIED";
  if (operation === "pause_keyword" && isNegative) {
    const keywordText = record.ad_group_criterion?.keyword?.text;
    return [{
      id,
      criterionId: id,
      code: "NEGATIVE_KEYWORDS_CANNOT_PAUSE",
      severity: "error",
      reason: `Criterion ${id} is a negative keyword. Google Ads negatives cannot be paused.`,
      alternativeTool: "removeNegativeKeyword",
      nextTool: removeNegativeKeywordHint(
        item.campaignId,
        keywordText,
        `Criterion ${id} is a negative keyword; pause is not a valid operation for negatives.`,
      ),
      fix: "Remove this ID from the batch, or call removeNegativeKeyword/removeKeywordFromNegativeList if you want to unblock that query.",
    }];
  }
  if (operation === "update_bid" && isNegative) {
    const keywordText = record.ad_group_criterion?.keyword?.text;
    return [{
      id,
      criterionId: id,
      code: "NEGATIVE_KEYWORDS_HAVE_NO_BID",
      severity: "error",
      reason: `Criterion ${id} is a negative keyword and has no CPC bid to update.`,
      alternativeTool: "removeNegativeKeyword",
      nextTool: removeNegativeKeywordHint(
        item.campaignId,
        keywordText,
        `Criterion ${id} is a negative keyword; it has no CPC bid to update.`,
      ),
    }];
  }

  const criterionStatus = normalizeStatus(record.ad_group_criterion?.status);
  if (operation === "pause_keyword" && criterionStatus === "PAUSED") {
    return [{
      id,
      criterionId: id,
      code: "ALREADY_PAUSED",
      severity: "error",
      reason: `Keyword criterion ${id} is already PAUSED.`,
    }];
  }

  if (operation === "update_bid") {
    const update = item as BulkBidUpdate;
    const strategy = normalizeBiddingStrategyName(record.campaign?.bidding_strategy_type);
    if (!["MANUAL_CPC", "ENHANCED_CPC"].includes(strategy)) {
      issues.push({
        id,
        criterionId: id,
        code: "SMART_BIDDING_MANUAL_BID_OVERRIDE",
        severity: "warning",
        reason: `Campaign uses ${strategy}; keyword CPC bid edits may be ignored by smart bidding.`,
      });
    }
    const currentBidMicros = Number(record.ad_group_criterion?.cpc_bid_micros ?? 0);
    const newBidMicros = toMicros(update.newBidDollars);
    if (newBidMicros <= 0) {
      return [{
        id,
        criterionId: id,
        code: "INVALID_BID",
        severity: "error",
        reason: "Bid must be greater than zero.",
      }];
    }
    if (currentBidMicros > 0) {
      const changePct = Math.abs(newBidMicros - currentBidMicros) / currentBidMicros;
      if (changePct > guardrails.maxBidChangePct) {
        return [{
          id,
          criterionId: id,
          code: "BID_CHANGE_EXCEEDS_GUARDRAIL",
          severity: "error",
          reason: `Bid change of ${(changePct * 100).toFixed(0)}% exceeds maximum allowed ${(guardrails.maxBidChangePct * 100).toFixed(0)}%.`,
        }];
      }
    }
  }

  return issues;
}

async function preValidateBulkAddKeywords(
  auth: AuthContext,
  items: BulkAddValidationInput[],
): Promise<BulkPreValidationResult<BulkAddValidationInput>> {
  if (items.length === 0) return { ok: true, valid: [], invalid: [] };

  const customer = getCustomer(auth);
  const byCampaign = new Map<string, BulkAddValidationInput[]>();
  for (const item of items) {
    const arr = byCampaign.get(item.campaignId) ?? [];
    arr.push(item);
    byCampaign.set(item.campaignId, arr);
  }

  const rowsByCampaign = new Map<string, AddKeywordPrevalidationRow[]>();
  await Promise.all(
    [...byCampaign.entries()].map(async ([campaignId, group]) => {
      const adGroupIds = [...new Set(group.map((item) => safeEntityId(item.adGroupId)))];
      const rows = await customer.query(`
        SELECT
          campaign.id,
          campaign.status,
          ad_group.id,
          ad_group.status,
          ad_group_criterion.criterion_id,
          ad_group_criterion.status,
          ad_group_criterion.negative,
          ad_group_criterion.keyword.text,
          ad_group_criterion.keyword.match_type
        FROM keyword_view
        WHERE campaign.id = ${safeEntityId(campaignId)}
          AND ad_group.id IN (${adGroupIds.join(",")})
        LIMIT 2000
      `);
      rowsByCampaign.set(campaignId, rows as AddKeywordPrevalidationRow[]);
    }),
  );

  const valid: Array<{ id: string; input: BulkAddValidationInput }> = [];
  const invalid: Array<BulkValidationIssue & { input: BulkAddValidationInput }> = [];
  const seenSubmitted = new Map<string, { id: string; input: BulkAddValidationInput }>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const signature = `${item.campaignId}:${item.adGroupId}:${normalizeKeywordText(item.keyword)}:${item.matchType ?? "BROAD"}`;
    const id = `${signature}:${i}`;
    const rows = rowsByCampaign.get(item.campaignId) ?? [];
    const issue = validateAddKeywordItem(id, item, rows);
    if (issue) {
      invalid.push({ ...issue, input: item });
      continue;
    }

    const firstSubmitted = seenSubmitted.get(signature);
    if (firstSubmitted) {
      invalid.push({
        id,
        code: "DUPLICATE_IN_REQUEST",
        severity: "error",
        reason: `Keyword "${normalizeKeywordText(item.keyword)}" (${item.matchType ?? "BROAD"}) appears more than once in this bulkAddKeywords request.`,
        fix: "Remove duplicate keyword entries from the same request before executing.",
        input: item,
      });
      invalid.push({
        id: firstSubmitted.id,
        code: "DUPLICATE_IN_REQUEST",
        severity: "error",
        reason: `Keyword "${normalizeKeywordText(item.keyword)}" (${item.matchType ?? "BROAD"}) appears more than once in this bulkAddKeywords request.`,
        fix: "Remove duplicate keyword entries from the same request before executing.",
        input: firstSubmitted.input,
      });
      continue;
    }

    seenSubmitted.set(signature, { id, input: item });
    valid.push({ id, input: item });
  }

  const duplicateIds = new Set(
    invalid
      .filter((issue) => issue.code === "DUPLICATE_IN_REQUEST")
      .map((issue) => issue.id),
  );

  return {
    ok: invalid.every((issue) => issue.severity === "warning"),
    valid: valid.filter((item) => !duplicateIds.has(item.id)),
    invalid,
  };
}

function validateAddKeywordItem(
  id: string,
  item: BulkAddValidationInput,
  rows: AddKeywordPrevalidationRow[],
): BulkValidationIssue | null {
  const keyword = normalizeKeywordText(item.keyword);
  const matchType = item.matchType ?? "BROAD";
  if (!keyword) {
    return { id, code: "INVALID_KEYWORD_SYNTAX", severity: "error", reason: "Keyword text cannot be empty." };
  }
  if (keyword.split(/\s+/).length > 10) {
    return { id, code: "INVALID_KEYWORD_SYNTAX", severity: "error", reason: "Keyword text cannot exceed 10 words." };
  }

  const parentRow = rows.find((row) => String(row.ad_group?.id ?? "") === item.adGroupId) ?? rows[0];
  const campaignStatus = normalizeStatus(parentRow?.campaign?.status);
  if (campaignStatus === "REMOVED") {
    return { id, code: "PARENT_CAMPAIGN_REMOVED", severity: "error", reason: `Parent campaign ${item.campaignId} is REMOVED.` };
  }
  const adGroupStatus = normalizeStatus(parentRow?.ad_group?.status);
  if (adGroupStatus === "REMOVED") {
    return { id, code: "PARENT_AD_GROUP_REMOVED", severity: "error", reason: `Parent ad group ${item.adGroupId} is REMOVED.` };
  }

  for (const row of rows) {
    const existingText = normalizeKeywordText(row.ad_group_criterion?.keyword?.text ?? "");
    const existingMatchType = normalizeMatchType(row.ad_group_criterion?.keyword?.match_type);
    if (existingText !== keyword || existingMatchType !== matchType) continue;
    if (row.ad_group_criterion?.negative) {
      return {
        id,
        code: "CONFLICTS_WITH_NEGATIVE",
        severity: "error",
        reason: `Keyword "${keyword}" conflicts with an existing negative keyword in this campaign/ad group.`,
        alternativeTool: "removeNegativeKeyword",
        nextTool: removeNegativeKeywordHint(
          item.campaignId,
          keyword,
          `Keyword "${keyword}" exists as a negative on this campaign and is blocking the add.`,
          matchType,
        ),
      };
    }
    const rowAdGroupId = String(row.ad_group?.id ?? "");
    if (rowAdGroupId === item.adGroupId) {
      return {
        id,
        code: "DUPLICATE_IN_AD_GROUP",
        severity: "error",
        reason: `Keyword "${keyword}" (${matchType}) already exists in ad group ${item.adGroupId}.`,
      };
    }
    return {
      id,
      code: "DUPLICATE_IN_CAMPAIGN",
      severity: "error",
      reason: `Keyword "${keyword}" (${matchType}) already exists in another ad group in campaign ${item.campaignId}.`,
    };
  }

  return null;
}

function normalizeStatus(raw: unknown): string {
  if (raw == null) return "UNKNOWN";
  if (raw === 2) return "ENABLED";
  if (raw === 3) return "PAUSED";
  if (raw === 4) return "REMOVED";
  return String(raw);
}

function normalizeMatchType(raw: unknown): string {
  if (raw == null) return "UNKNOWN";
  if (typeof raw === "number") {
    if (raw === 0) return "UNSPECIFIED";
    return MATCH_TYPE_NAME[raw] ?? String(raw);
  }
  return String(raw);
}

function normalizeKeywordText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function bulkPauseKeywords(
  auth: AuthContext,
  keywords: BulkPauseKeywordInput[],
  _guardrails = DEFAULT_GUARDRAILS,
): Promise<Array<WriteResult & { input: BulkPauseKeywordInput }>> {
  if (keywords.length === 0) return [];

  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  // Group by campaign to batch-check active keyword counts
  const byCampaign = new Map<string, BulkPauseKeywordInput[]>();
  for (const k of keywords) {
    const arr = byCampaign.get(k.campaignId) ?? [];
    arr.push(k);
    byCampaign.set(k.campaignId, arr);
  }

  // 1 query per campaign: count active keywords (parallelized)
  const activeCountByCampaign = new Map<string, number>();
  await Promise.all(
    [...byCampaign.keys()].map(async (campaignId) => {
      const campId = safeEntityId(campaignId);
      const countResult = await customer.query(`
        SELECT ad_group_criterion.criterion_id
        FROM keyword_view
        WHERE campaign.id = ${campId}
          AND ad_group_criterion.status = 'ENABLED'
          AND ad_group_criterion.negative = FALSE
      `);
      activeCountByCampaign.set(campaignId, (countResult as any[]).length);
    }),
  );

  // Validate: ensure we don't pause all active keywords in any campaign
  const results: Array<WriteResult & { input: BulkPauseKeywordInput }> = [];
  const validKeywords: BulkPauseKeywordInput[] = [];

  for (const [campaignId, group] of byCampaign) {
    const activeCount = activeCountByCampaign.get(campaignId) ?? 0;
    if (group.length >= activeCount) {
      // Would pause all keywords — reject the whole group
      for (const k of group) {
        results.push({ success: false, action: "pause_keyword", entityId: k.criterionId, beforeValue: "ENABLED", afterValue: "ENABLED", error: `Cannot pause ${group.length} of ${activeCount} active keywords — would leave campaign with none`, input: k });
      }
    } else {
      validKeywords.push(...group);
    }
  }

  // Batch mutate in chunks with partial_failure so valid operations succeed
  // even if some fail (e.g. negative criteria mixed in with positive ones)
  const CHUNK_SIZE = 10;
  for (let i = 0; i < validKeywords.length; i += CHUNK_SIZE) {
    const chunk = validKeywords.slice(i, i + CHUNK_SIZE);
    try {
      const response = await customer.mutateResources(
        chunk.map((k) => ({
          entity: "ad_group_criterion" as any,
          operation: "update" as const,
          resource: {
            resource_name: `customers/${cid}/adGroupCriteria/${k.adGroupId}~${k.criterionId}`,
            status: STATUS.PAUSED,
          },
        })),
        { partial_failure: true },
      );

      // With partial_failure, the library decodes partial_failure_error into a
      // GoogleAdsFailure with an errors[] array. Each error has location.field_path_elements
      // where the first element's index is the operation index.
      const failedIndices = new Map<number, string>();
      const partialErrors = (response as any)?.partial_failure_error?.errors ?? [];
      for (const err of partialErrors) {
        const opIndex = err?.location?.field_path_elements?.[0]?.index;
        if (typeof opIndex === "number") {
          failedIndices.set(opIndex, err?.message ?? "Unknown error");
        }
      }

      for (let j = 0; j < chunk.length; j++) {
        const k = chunk[j];
        const errorMsg = failedIndices.get(j);
        if (errorMsg) {
          results.push({ success: false, action: "pause_keyword", entityId: k.criterionId, beforeValue: "ENABLED", afterValue: "ENABLED", error: rewriteNegativePauseError(errorMsg), input: k });
        } else {
          results.push({ success: true, action: "pause_keyword", entityId: k.criterionId, beforeValue: "ENABLED", afterValue: "PAUSED", input: k });
        }
      }
    } catch (error) {
      // Full batch failure (network error, auth, etc.) — mark all in chunk as failed.
      const msg = rewriteNegativePauseError(extractErrorMessage(error));
      for (const k of chunk) {
        results.push({ success: false, action: "pause_keyword", entityId: k.criterionId, beforeValue: "ENABLED", afterValue: "ENABLED", error: msg, input: k });
      }
    }
  }

  return results;
}

export type BulkAddKeywordInput = {
  keyword: string;
  matchType?: "BROAD" | "PHRASE" | "EXACT";
};

export async function bulkAddKeywords(
  auth: AuthContext,
  adGroupId: string,
  keywords: BulkAddKeywordInput[],
): Promise<Array<WriteResult & { input: BulkAddKeywordInput }>> {
  if (keywords.length === 0) return [];

  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  // Validate inputs
  const valid: Array<{ input: BulkAddKeywordInput; text: string; matchType: "BROAD" | "PHRASE" | "EXACT" }> = [];
  const results: Array<WriteResult & { input: BulkAddKeywordInput }> = [];

  for (const k of keywords) {
    const text = k.keyword.trim();
    if (!text) {
      results.push({ success: false, action: "add_keyword", entityId: "", beforeValue: "", afterValue: "", error: "Keyword text cannot be empty", input: k });
    } else {
      valid.push({ input: k, text, matchType: k.matchType ?? "BROAD" });
    }
  }

  if (valid.length === 0) return results;

  // Batch mutate in chunks to avoid API limits and isolate failures
  const CHUNK_SIZE = 10;
  for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
    const chunk = valid.slice(i, i + CHUNK_SIZE);
    try {
      const response = await customer.mutateResources(
        chunk.map(({ text, matchType }) => ({
          entity: "ad_group_criterion" as any,
          operation: "create" as const,
          resource: {
            ad_group: `customers/${cid}/adGroups/${adGroupId}`,
            status: STATUS.ENABLED,
            keyword: {
              text,
              match_type: MATCH_TYPE[matchType],
            },
          },
        })),
      );

      const responses = (response as any)?.mutate_operation_responses ?? [];
      for (let j = 0; j < chunk.length; j++) {
        const { input, text, matchType } = chunk[j];
        const resourceName = responses[j]?.ad_group_criterion_result?.resource_name as string | undefined;
        const criterionId = resourceName?.split("~").pop() ?? "";
        if (criterionId) {
          results.push({ success: true, action: "add_keyword", entityId: criterionId, beforeValue: adGroupId, afterValue: `${text} (${matchType})`, input });
        } else {
          results.push({ success: false, action: "add_keyword", entityId: "", beforeValue: "", afterValue: text, error: "Keyword created but criterion ID could not be extracted", input });
        }
      }
    } catch (error) {
      const policy = extractPolicyDetails(error);
      const msg = extractErrorMessage(error);
      for (const { input, text } of chunk) {
        const finalError = policy
          ?? (msg.includes("ALREADY_EXISTS") ? `Keyword "${text}" already exists in this ad group` : msg);
        results.push({
          success: false, action: "add_keyword", entityId: "", beforeValue: "", afterValue: text,
          error: finalError,
          input,
        });
      }
    }
  }

  return results;
}

// ─── Move Keywords ──────────────────────────────────────────────────────

export type MoveKeywordsResult = {
  success: boolean;
  added: Array<WriteResult & { criterionId: string }>;
  paused: Array<WriteResult & { criterionId: string }>;
  error?: string;
};

export async function moveKeywords(
  auth: AuthContext,
  campaignId: string,
  fromAdGroupId: string,
  toAdGroupId: string,
  criterionIds: string[],
  matchType?: "BROAD" | "PHRASE" | "EXACT",
): Promise<MoveKeywordsResult> {
  const customer = getCustomer(auth);
  const cid = safeEntityId(campaignId);

  // Step 1: Look up keyword text and match type for each criterionId from the source ad group
  const result = await customer.query(`
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type
    FROM keyword_view
    WHERE campaign.id = ${cid}
      AND ad_group.id = ${safeEntityId(fromAdGroupId)}
      AND ad_group_criterion.criterion_id IN (${criterionIds.map((id) => safeEntityId(id)).join(",")})
  `);

  const keywordMap = new Map<string, { text: string; sourceMatchType: "BROAD" | "PHRASE" | "EXACT" }>();
  for (const row of result as any[]) {
    const critId = String(row.ad_group_criterion?.criterion_id ?? "");
    const text = row.ad_group_criterion?.keyword?.text ?? "";
    const rawMatchType = row.ad_group_criterion?.keyword?.match_type;
    const sourceMatchType = (typeof rawMatchType === "number" ? MATCH_TYPE_NAME[rawMatchType] : rawMatchType) ?? "BROAD";
    if (critId && text) keywordMap.set(critId, { text, sourceMatchType });
  }

  // Validate all keywords were found
  const missing = criterionIds.filter((id) => !keywordMap.has(id));
  if (missing.length > 0) {
    return {
      success: false,
      added: [],
      paused: [],
      error: `Could not find keywords for criterion IDs: ${missing.join(", ")}`,
    };
  }

  // Step 2: Add keywords to the destination ad group (partial success — don't roll back)
  const added: Array<WriteResult & { criterionId: string }> = [];
  const CHUNK_SIZE = 5;
  for (let i = 0; i < criterionIds.length; i += CHUNK_SIZE) {
    const chunk = criterionIds.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (critId) => {
        const kw = keywordMap.get(critId)!;
        // Use explicit matchType override if provided, otherwise inherit from source
        const effectiveMatchType = matchType ?? kw.sourceMatchType;
        // Retry on transient database contention (database_error=2)
        const addResult = await withDatabaseContentionRetry(() =>
          addKeyword(auth, toAdGroupId, kw.text, effectiveMatchType),
        );
        return { ...addResult, criterionId: critId };
      }),
    );
    added.push(...chunkResults);
  }

  // Step 3: Pause only successfully-added keywords in the source ad group
  const successfulCriterionIds = added.filter((r) => r.success).map((r) => r.criterionId);
  const paused: Array<WriteResult & { criterionId: string }> = [];
  for (const critId of successfulCriterionIds) {
    // Retry on transient database contention (database_error=2)
    const pauseResult = await withDatabaseContentionRetry(() =>
      pauseKeyword(auth, campaignId, fromAdGroupId, critId),
    );
    paused.push({ ...pauseResult, criterionId: critId });
  }

  const addFailures = added.filter((r) => !r.success);
  const pauseFailures = paused.filter((r) => !r.success);
  const hasErrors = addFailures.length > 0 || pauseFailures.length > 0;

  let error: string | undefined;
  if (addFailures.length > 0 && pauseFailures.length > 0) {
    error = `${addFailures.length} keyword(s) failed to add, ${pauseFailures.length} failed to pause in source — check per-keyword results`;
  } else if (addFailures.length > 0) {
    error = `${addFailures.length} of ${criterionIds.length} keyword(s) failed to add — ${successfulCriterionIds.length} moved successfully`;
  } else if (pauseFailures.length > 0) {
    error = `Keywords added successfully but ${pauseFailures.length} failed to pause in source — may be duplicated`;
  }

  return {
    success: !hasErrors,
    added,
    paused,
    error,
  };
}
