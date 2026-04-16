import { getCustomer, MATCH_TYPE, MATCH_TYPE_NAME, STATUS } from "./client";
import { extractErrorMessage, normalizeCustomerId, safeEntityId, toMicros } from "./helpers";
import type { AuthContext, Guardrails, WriteResult } from "./types";
import { DEFAULT_GUARDRAILS } from "./types";
import { addKeyword, pauseKeyword } from "./writes";

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
    const criterionIds = group.map((u) => Number(u.criterionId)).join(",");
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
        strategy: row.campaign?.bidding_strategy_type ?? "UNKNOWN",
        bidMicros: row.ad_group_criterion?.cpc_bid_micros ?? 0,
      });
    }
  }

  // Validate all updates and build mutations
  const results: Array<WriteResult & { input: BulkBidUpdate }> = [];
  const validMutations: Array<{ update: BulkBidUpdate; newBidMicros: number; currentBidMicros: number }> = [];
  const manualStrategies = ["MANUAL_CPC", "ENHANCED_CPC"];

  for (const u of updates) {
    const newBidMicros = toMicros(u.newBidDollars);
    const data = preCheckData.get(`${u.campaignId}:${u.criterionId}`);

    if (!data) {
      results.push({ success: false, action: "update_bid", entityId: u.criterionId, beforeValue: "N/A", afterValue: String(newBidMicros), error: "Keyword not found", input: u });
      continue;
    }
    if (data.strategy && !manualStrategies.includes(data.strategy)) {
      results.push({ success: false, action: "update_bid", entityId: u.criterionId, beforeValue: "N/A", afterValue: String(newBidMicros), error: `Bid changes not supported for ${data.strategy} strategy`, input: u });
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
          results.push({ success: false, action: "pause_keyword", entityId: k.criterionId, beforeValue: "ENABLED", afterValue: "ENABLED", error: errorMsg, input: k });
        } else {
          results.push({ success: true, action: "pause_keyword", entityId: k.criterionId, beforeValue: "ENABLED", afterValue: "PAUSED", input: k });
        }
      }
    } catch (error) {
      // Full batch failure (network error, auth, etc.) — mark all in chunk as failed.
      const msg = extractErrorMessage(error);
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
      const msg = extractErrorMessage(error);
      for (const { input, text } of chunk) {
        results.push({
          success: false, action: "add_keyword", entityId: "", beforeValue: "", afterValue: text,
          error: msg.includes("ALREADY_EXISTS") ? `Keyword "${text}" already exists in this ad group` : msg,
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
        const addResult = await addKeyword(auth, toAdGroupId, kw.text, effectiveMatchType);
        return { ...addResult, criterionId: critId };
      }),
    );
    added.push(...chunkResults);
  }

  // Step 3: Pause only successfully-added keywords in the source ad group
  const successfulCriterionIds = added.filter((r) => r.success).map((r) => r.criterionId);
  const paused: Array<WriteResult & { criterionId: string }> = [];
  for (const critId of successfulCriterionIds) {
    const pauseResult = await pauseKeyword(auth, campaignId, fromAdGroupId, critId);
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
