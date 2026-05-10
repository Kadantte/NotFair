import { z } from "zod";
import {
  bulkUpdateBids,
  bulkPauseKeywords,
  bulkAddKeywords,
  preValidateBulkMutation,
  moveKeywords,
  authForAccount,
  resolveAccountId,
} from "@/lib/google-ads";
import { execWrite } from "@/lib/tools/execute";
import { typedResult, safeHandler, accountIdParam, WRITE_ANNOTATIONS, DESTRUCTIVE_WRITE_ANNOTATIONS } from "../types";
import type { WriteToolDeps } from "./_deps";
import {
  experimentImpactAcknowledgementSchema,
  preflightActiveExperimentMutation,
  buildBulkValidationResponse,
  buildBulkSkipped,
  summarizeBulkValidationIssues,
} from "./_deps";

export function registerBulkOperationTools(deps: WriteToolDeps) {
  const { server, currentAuth } = deps;

  // ─── Bulk Operations ────────────────────────────────────────────

  server.registerTool("bulkUpdateBids", {
    description: "Update up to 50 keyword bids in one call. Atomic by default: the server pre-validates every item and executes nothing if any item fails static checks. Set continueOnError=true to skip invalid items and update the valid subset. Set dryRun=true to validate only. Each bid capped at 25% change. Returns per-keyword results with individual changeIds when executed.",
    inputSchema: {
      accountId: accountIdParam,
      updates: z
        .array(
          z.object({
            campaignId: z.string(),
            adGroupId: z.string(),
            criterionId: z.string(),
            newBidDollars: z.number().positive().describe("New bid in dollars"),
          }),
        )
        .min(1)
        .max(50),
      continueOnError: z
        .boolean()
        .default(false)
        .describe("If true, skip invalid items and execute the valid subset. If false, fail the whole batch before writing when any item fails pre-validation."),
      dryRun: z
        .boolean()
        .default(false)
        .describe("If true, run pre-validation but do not execute. Returns wouldSucceedIds and structured errors/warnings."),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, updates, continueOnError, dryRun, acknowledgeExperimentImpact }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const t0 = performance.now();
    const targetAuth = authForAccount(auth, accountId);
    const validation = await preValidateBulkMutation(targetAuth, "update_bid", updates);
    const validUpdates = validation.valid.map((item) => item.input);

    if (dryRun) {
      return typedResult(buildBulkValidationResponse("DRY_RUN", updates.length, validation.valid.map((item) => item.id), validation.invalid));
    }
    if (!validation.ok && !continueOnError) {
      return typedResult(buildBulkValidationResponse("PRE_VALIDATION_FAILED", updates.length, validation.valid.map((item) => item.id), validation.invalid));
    }

    const block = await preflightActiveExperimentMutation(auth, accountId, validUpdates.map((update) => update.campaignId), acknowledgeExperimentImpact);
    if (block) return typedResult(block);

    const results = validUpdates.length > 0 ? await bulkUpdateBids(targetAuth, validUpdates) : [];
    const overrideLatencyMs = Math.round(performance.now() - t0);

    const logged = await Promise.all(
      results.map(({ input, ...result }) =>
        execWrite(auth, targetId, input.campaignId, async () => result, undefined, { overrideLatencyMs, experimentGuardAlreadyChecked: true, acknowledgeExperimentImpact })
          .then((r) => ({ ...r, input })),
      ),
    );

    const succeeded = logged.filter((r) => r.success).length;
    const failed = logged.filter((r) => !r.success).length;
    const skipped = buildBulkSkipped(validation.invalid);

    return typedResult({
      executed: true,
      summary: continueOnError
        ? { total: updates.length, succeeded, skipped: skipped.length, failed }
        : { total: results.length, succeeded, failed },
      ...(skipped.length > 0 ? { skipped } : {}),
      ...(validation.invalid.some((issue) => issue.severity === "warning") ? { warnings: summarizeBulkValidationIssues(validation.invalid.filter((issue) => issue.severity === "warning")) } : {}),
      results: logged,
    });
  }));

  // ─── Bulk Keyword Operations ─────────────────────────────────────

  server.registerTool("bulkPauseKeywords", {
    description: "Pause up to 100 POSITIVE keywords in one call. Atomic by default: the server pre-validates every item and executes nothing if any item fails static checks. Does NOT work on negative keywords — for negatives, call `removeNegativeKeyword` or `removeKeywordFromNegativeList`; Google Ads has no 'pause' for negatives. Set continueOnError=true to skip invalid items and pause the valid subset. Set dryRun=true to validate only. Returns per-keyword results with individual changeIds when executed.",
    inputSchema: {
      accountId: accountIdParam,
      keywords: z
        .array(
          z.object({
            campaignId: z.string(),
            adGroupId: z.string(),
            criterionId: z.string(),
          }),
        )
        .min(1)
        .max(100),
      dryRun: z
        .boolean()
        .default(false)
        .describe("Validate and report what would happen without writing to Google Ads or logging changes."),
      continueOnError: z
        .boolean()
        .default(false)
        .describe("If true, skip invalid items and execute the valid subset. If false, fail the whole batch before writing when any item fails pre-validation."),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, keywords, dryRun, continueOnError, acknowledgeExperimentImpact }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const t0 = performance.now();
    const targetAuth = authForAccount(auth, accountId);
    const validation = await preValidateBulkMutation(targetAuth, "pause_keyword", keywords);
    const validKeywords = validation.valid.map((item) => item.input);

    if (dryRun) {
      return typedResult(buildBulkValidationResponse("DRY_RUN", keywords.length, validation.valid.map((item) => item.id), validation.invalid));
    }
    if (!validation.ok && !continueOnError) {
      return typedResult(buildBulkValidationResponse("PRE_VALIDATION_FAILED", keywords.length, validation.valid.map((item) => item.id), validation.invalid));
    }

    const block = await preflightActiveExperimentMutation(auth, accountId, validKeywords.map((keyword) => keyword.campaignId), acknowledgeExperimentImpact);
    if (block) return typedResult(block);

    const results = validKeywords.length > 0 ? await bulkPauseKeywords(targetAuth, validKeywords) : [];
    const overrideLatencyMs = Math.round(performance.now() - t0);

    const logged = await Promise.all(
      results.map(({ input, ...result }) =>
        execWrite(auth, targetId, input.campaignId, async () => result, undefined, { overrideLatencyMs, experimentGuardAlreadyChecked: true, acknowledgeExperimentImpact })
          .then((r) => ({ ...r, input })),
      ),
    );

    const succeeded = logged.filter((r) => r.success).length;
    const failed = logged.filter((r) => !r.success).length;
    const skipped = buildBulkSkipped(validation.invalid);

    return typedResult({
      executed: true,
      summary: continueOnError
        ? { total: keywords.length, succeeded, skipped: skipped.length, failed }
        : { total: results.length, succeeded, failed },
      ...(skipped.length > 0 ? { skipped } : {}),
      results: logged,
    });
  }));

  server.registerTool("bulkAddKeywords", {
    description: "Bulk-create/add up to 100 new positive keywords to an ad group in one call. This is the bulk variant of addKeyword/create keyword. Atomic by default: the server pre-validates every item and executes nothing if any keyword fails static checks such as duplicates, invalid syntax, removed parents, or negative-keyword conflicts. Set continueOnError=true to skip invalid items and add the valid subset. Set dryRun=true to validate only. Returns per-keyword results with individual changeIds when executed.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string(),
      keywords: z
        .array(
          z.object({
            keyword: z.string().min(1),
            matchType: z.enum(["BROAD", "PHRASE", "EXACT"]).default("BROAD"),
          }),
        )
        .min(1)
        .max(100),
      continueOnError: z
        .boolean()
        .default(false)
        .describe("If true, skip invalid items and execute the valid subset. If false, fail the whole batch before writing when any item fails pre-validation."),
      dryRun: z
        .boolean()
        .default(false)
        .describe("If true, run pre-validation but do not execute. Returns wouldSucceedIds and structured errors/warnings."),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, keywords, continueOnError, dryRun, acknowledgeExperimentImpact }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const t0 = performance.now();
    const targetAuth = authForAccount(auth, accountId);
    const validationInputs = keywords.map((keyword) => ({ ...keyword, campaignId, adGroupId }));
    const validation = await preValidateBulkMutation(targetAuth, "add_keyword", validationInputs);
    const validKeywords = validation.valid.map((item) => ({
      keyword: item.input.keyword,
      matchType: item.input.matchType,
    }));

    if (dryRun) {
      return typedResult(buildBulkValidationResponse("DRY_RUN", keywords.length, validation.valid.map((item) => item.id), validation.invalid));
    }
    if (!validation.ok && !continueOnError) {
      return typedResult(buildBulkValidationResponse("PRE_VALIDATION_FAILED", keywords.length, validation.valid.map((item) => item.id), validation.invalid));
    }

    const block = await preflightActiveExperimentMutation(auth, accountId, [campaignId], acknowledgeExperimentImpact);
    if (block) return typedResult(block);

    const results = validKeywords.length > 0
      ? await bulkAddKeywords(targetAuth, adGroupId, validKeywords, { partialFailure: continueOnError })
      : [];
    const overrideLatencyMs = Math.round(performance.now() - t0);

    const logged = await Promise.all(
      results.map(({ input, ...result }) =>
        execWrite(auth, targetId, campaignId, async () => result, undefined, { overrideLatencyMs, experimentGuardAlreadyChecked: true, acknowledgeExperimentImpact })
          .then((r) => ({ ...r, input })),
      ),
    );

    const succeeded = logged.filter((r) => r.success).length;
    const failed = logged.filter((r) => !r.success).length;
    const skipped = buildBulkSkipped(validation.invalid);

    return typedResult({
      executed: true,
      summary: continueOnError
        ? { total: keywords.length, succeeded, skipped: skipped.length, failed }
        : { total: results.length, succeeded, failed },
      ...(skipped.length > 0 ? { skipped } : {}),
      results: logged,
    });
  }));

  // ─── Move Keywords ─────────────────────────────────────────────────

  server.registerTool("moveKeywords", {
    description: "Move keywords between ad groups in the same campaign. Inherits match type from source keywords by default — specify matchType only to override. Allows partial success: successfully-added keywords are paused in source, failed ones are left untouched. Returns changeIds for both adds and pauses.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      fromAdGroupId: z.string(),
      toAdGroupId: z.string(),
      criterionIds: z.array(z.string()).min(1).max(100).describe("Keyword criterion IDs (query keyword_view via runScript)"),
      matchType: z
        .enum(["BROAD", "PHRASE", "EXACT"])
        .optional()
        .describe("Override match type in destination — omit to inherit from source"),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, fromAdGroupId, toAdGroupId, criterionIds, matchType, acknowledgeExperimentImpact }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const targetAuth = authForAccount(auth, accountId);
    const block = await preflightActiveExperimentMutation(auth, accountId, [campaignId], acknowledgeExperimentImpact);
    if (block) return typedResult(block);
    const t0 = performance.now();
    const result = await moveKeywords(targetAuth, campaignId, fromAdGroupId, toAdGroupId, criterionIds, matchType);
    const overrideLatencyMs = Math.round(performance.now() - t0);

    // Route every result (success or failure) through execWrite so failures count toward the daily
    // limit — same overcount-preferred policy as every other write path.
    const addChangeIds = await Promise.all(
      result.added.map((r) =>
        execWrite(auth, targetId, campaignId, async () => r, undefined, { overrideLatencyMs, experimentGuardAlreadyChecked: true, acknowledgeExperimentImpact }),
      ),
    );
    const pauseChangeIds = await Promise.all(
      result.paused.map((r) =>
        execWrite(auth, targetId, campaignId, async () => r, undefined, { overrideLatencyMs, experimentGuardAlreadyChecked: true, acknowledgeExperimentImpact }),
      ),
    );

    return typedResult({
      success: result.success,
      summary: {
        added: { total: result.added.length, succeeded: result.added.filter((r) => r.success).length },
        paused: { total: result.paused.length, succeeded: result.paused.filter((r) => r.success).length },
      },
      changeIds: {
        adds: addChangeIds.map((r) => r.changeId).filter(Boolean),
        pauses: pauseChangeIds.map((r) => r.changeId).filter(Boolean),
      },
      error: result.error,
    });
  }));
}
