import { z } from "zod";
import {
  authForAccount,
  DEFAULT_GUARDRAILS,
  type AssetLinkMutationResult,
  type ActiveExperimentImpact,
  type AuthContext,
  type BulkValidationIssue,
  type CreateCampaignParams,
  type Guardrails,
  type WriteResult,
  checkActiveExperimentImpact,
} from "@/lib/google-ads";
import { getGoals } from "@/lib/db/tracking";
import { execWrite } from "@/lib/tools/execute";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Shared dependencies passed to every register*WriteTools(deps) entry point.
 *
 * `writeToolCall` and `executeCreate` are closures over `currentAuth` defined
 * in the entry file (write-tools.ts). The other shared helpers in this module
 * are pure and exported directly — domain files import them by name.
 */
export type WriteToolDeps = {
  server: McpServer;
  currentAuth: () => AuthContext;
  writeToolCall: <R extends WriteResult>(
    args: { accountId?: string; campaignId?: string | null },
    fn: (auth: AuthContext) => Promise<R>,
  ) => Promise<CallToolResult>;
  executeCreate: (
    accountId: string | undefined,
    params: CreateCampaignParams,
    action: string,
    successNextSteps: string,
  ) => Promise<CallToolResult>;
};

export type BulkValidationWithInput<T> = BulkValidationIssue & { input: T };

/**
 * Stable JSON used as a Map key. Plain JSON.stringify preserves insertion
 * order, so two structurally identical objects built differently would
 * produce different strings and wouldn't collapse during validation-issue
 * grouping. Sort keys to make the dedup key canonical.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

export function summarizeBulkValidationIssues<T>(issues: Array<BulkValidationWithInput<T>>) {
  const grouped = new Map<string, {
    code: string;
    severity: "error" | "warning";
    count: number;
    affectedIds: string[];
    affectedCriterionIds: string[];
    alternativeTool?: string;
    nextTool?: BulkValidationIssue["nextTool"];
    fix?: string;
    reason: string;
  }>();

  for (const issue of issues) {
    // Group by the routing-affecting fields. Two failures with the same
    // code+reason but different nextTool.args (different campaign/keyword)
    // are different failures — don't collapse them, or the agent loses the
    // per-row routing data.
    const key = [
      issue.code,
      issue.severity,
      issue.alternativeTool ?? "",
      issue.fix ?? "",
      issue.reason,
      issue.nextTool ? stableStringify(issue.nextTool) : "",
    ].join("|");
    const existing = grouped.get(key) ?? {
      code: issue.code,
      severity: issue.severity,
      count: 0,
      affectedIds: [],
      affectedCriterionIds: [],
      alternativeTool: issue.alternativeTool,
      nextTool: issue.nextTool,
      fix: issue.fix,
      reason: issue.reason,
    };
    existing.count += 1;
    existing.affectedIds.push(issue.id);
    if (issue.criterionId) existing.affectedCriterionIds.push(issue.criterionId);
    grouped.set(key, existing);
  }

  return [...grouped.values()].map((group) => ({
    code: group.code,
    severity: group.severity,
    count: group.count,
    affectedIds: group.affectedIds,
    ...(group.affectedCriterionIds.length > 0 ? { affectedCriterionIds: group.affectedCriterionIds } : {}),
    ...(group.alternativeTool ? { alternativeTool: group.alternativeTool } : {}),
    ...(group.nextTool ? { nextTool: group.nextTool } : {}),
    ...(group.fix ? { fix: group.fix } : {}),
    reason: group.reason,
  }));
}

export function buildBulkValidationResponse<T>(
  reason: "PRE_VALIDATION_FAILED" | "DRY_RUN",
  total: number,
  validIds: string[],
  issues: Array<BulkValidationWithInput<T>>,
) {
  const blockingIssues = issues.filter((issue) => issue.severity === "error");
  return {
    executed: false,
    reason,
    summary: {
      total,
      wouldSucceed: validIds.length,
      wouldFail: blockingIssues.length,
    },
    errors: summarizeBulkValidationIssues(issues),
    wouldSucceedIds: validIds,
  };
}

export function buildBulkSkipped<T>(issues: Array<BulkValidationWithInput<T>>) {
  return issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => ({
      id: issue.id,
      ...(issue.criterionId ? { criterionId: issue.criterionId } : {}),
      code: issue.code,
      reason: issue.reason,
      ...(issue.alternativeTool ? { alternativeTool: issue.alternativeTool } : {}),
      ...(issue.fix ? { fix: issue.fix } : {}),
    }));
}

/**
 * Asset link target — a serving location for an asset link.
 *
 * Levels mirror Google Ads' link entities: customer_asset / campaign_asset /
 * ad_group_asset / asset_group_asset. `customer` is the top level (formerly
 * called "account" in older NotFair tools — `customer` is Google's term).
 *
 * Not every asset family supports every level. Image assets support all 4;
 * callout/sitelink/structured-snippet support only customer/campaign/ad_group.
 * The runtime primitive (`linkAsset` / `createAssetWithLinks`) enforces this.
 */
export const assetLinkTargetSchema = z.discriminatedUnion("level", [
  z.object({ level: z.literal("customer") }),
  z.object({
    level: z.literal("campaign"),
    campaignId: z.string().describe("Campaign ID to link the asset to"),
  }),
  z.object({
    level: z.literal("ad_group"),
    adGroupId: z.string().describe("Ad group ID to link the asset to"),
  }),
  z.object({
    level: z.literal("asset_group"),
    assetGroupId: z.string().describe("Performance Max asset group ID to link the asset to"),
  }),
]);

/**
 * Reused shape doc for every `targets` array parameter on asset-creation /
 * linking tools. Past production traces show agents passing bare resource
 * strings like `"customers/123"` and getting the cryptic "targets[0]
 * expected object, received string" error — surface the discriminated-union
 * shape in the description so callers see it at schema-introspection time.
 */
export const ASSET_LINK_TARGETS_SHAPE_DOC =
  "Array of targets. Each target is an OBJECT with a `level` discriminator — bare resource strings (e.g. \"customers/123\") are rejected. " +
  "Shapes: { level: 'customer' } (account-wide), " +
  "{ level: 'campaign', campaignId: '123' }, " +
  "{ level: 'ad_group', adGroupId: '456' }, " +
  "{ level: 'asset_group', assetGroupId: '789' } (Performance Max only). " +
  "Example: [{ level: 'customer' }, { level: 'campaign', campaignId: '12345' }].";

export const experimentImpactAcknowledgementSchema = {
  acknowledgeExperimentImpact: z
    .boolean()
    .default(false)
    .describe("Danger override. Set true only after the user explicitly accepts that this mutation touches a campaign in an active experiment, or after applying the same intended change to both arms."),
};

export type AssetLinkToolTarget = z.infer<typeof assetLinkTargetSchema>;
export type ExperimentPreflightBlock = {
  success: false;
  executed: false;
  reason: "CAMPAIGN_IN_ACTIVE_EXPERIMENT";
  error: string;
  impacts: ActiveExperimentImpact[];
};

export function buildExperimentPreflightBlock(error: string, impacts: ActiveExperimentImpact[] = []): ExperimentPreflightBlock {
  const first = impacts[0];
  return {
    success: false,
    executed: false,
    reason: "CAMPAIGN_IN_ACTIVE_EXPERIMENT",
    error: first
      ? `CAMPAIGN_IN_ACTIVE_EXPERIMENT: campaign ${first.campaignId} is the ${first.armRole} arm of active experiment "${first.experimentName}" (${first.experimentResourceName}). Pass acknowledgeExperimentImpact: true only after explicit user approval, or apply the same intended change to both arms.`
      : error,
    impacts,
  };
}

export async function preflightActiveExperimentMutation(
  auth: AuthContext,
  accountId: string | undefined,
  campaignIds: Array<string | null | undefined>,
  acknowledgeExperimentImpact = false,
): Promise<ExperimentPreflightBlock | null> {
  if (acknowledgeExperimentImpact) return null;
  const uniqueCampaignIds = [...new Set(campaignIds.filter((id): id is string => Boolean(id)).map(String))];
  if (uniqueCampaignIds.length === 0) return null;

  const impact = await checkActiveExperimentImpact(authForAccount(auth, accountId), uniqueCampaignIds);
  if (impact.ok) return null;
  return buildExperimentPreflightBlock(
    impact.error ?? "CAMPAIGN_IN_ACTIVE_EXPERIMENT: at least one target campaign is in an active experiment.",
    impact.impacts,
  );
}

export function campaignTargetIds(targets: AssetLinkToolTarget[] | undefined): string[] {
  const ids = targets
    ?.filter((target): target is { level: "campaign"; campaignId: string } => target.level === "campaign")
    .map((target) => target.campaignId) ?? [];
  return [...new Set(ids)];
}

export function linkedCampaignIds(result: AssetLinkMutationResult): string[] {
  const ids = [
    ...(result.linksCreated ?? []),
    ...(result.linksRemoved ?? []),
  ].flatMap((link) => (link.campaignId ? [link.campaignId] : []));
  return [...new Set(ids)];
}

/**
 * Run an asset-link write, fanning out a single change record per affected
 * campaign (so per-campaign undo + experiment guard checks line up).
 */
export async function execAssetLinkWrite(
  auth: AuthContext,
  targetId: string,
  campaignIds: string[],
  fn: () => Promise<AssetLinkMutationResult>,
  acknowledgeExperimentImpact = false,
) {
  const intendedCampaignIds = [...new Set(campaignIds.filter(Boolean))];
  const block = await preflightActiveExperimentMutation(auth, targetId, intendedCampaignIds, acknowledgeExperimentImpact);
  if (block) return block;

  const initialCampaignId = intendedCampaignIds[0] ?? null;
  const t0 = performance.now();
  const first = await execWrite(auth, targetId, initialCampaignId, fn, undefined, {
    acknowledgeExperimentImpact,
    experimentGuardAlreadyChecked: intendedCampaignIds.length > 0,
  });
  if (!first.success) return first;

  const overrideLatencyMs = Math.round(performance.now() - t0);
  const extraCampaignIds = linkedCampaignIds(first).filter((campaignId) => campaignId !== initialCampaignId);
  if (extraCampaignIds.length === 0) return first;

  const extraLogs = await Promise.all(
    extraCampaignIds.map((campaignId) =>
      execWrite(
        auth,
        targetId,
        campaignId,
        async () => ({ ...first, campaignId }),
        undefined,
        { overrideLatencyMs, acknowledgeExperimentImpact, experimentGuardAlreadyChecked: true },
      ),
    ),
  );

  return {
    ...first,
    changeIds: [first.changeId, ...extraLogs.map((log) => log.changeId)],
  };
}

/**
 * Resolve the effective guardrails for a write operation, reading the
 * persisted goals row written by `setGuardrails` and falling back to
 * `DEFAULT_GUARDRAILS` for any unset field. Campaign-specific guardrails
 * take precedence over account-level when `campaignId` is provided
 * (`getGoals` already implements that lookup order).
 *
 * The lib/google-ads layer accepts a guardrails parameter but treats
 * `DEFAULT_GUARDRAILS` (0.25 / 0.50 / 0.30) as the silent default — so any
 * MCP write path that doesn't call this helper effectively ignores the
 * user's `setGuardrails` configuration. Every bid / budget mutation in
 * the MCP layer must resolve through here.
 *
 * If the goals lookup fails (DB hiccup, missing DATABASE_URL in tests,
 * etc.) we fall back to `DEFAULT_GUARDRAILS` rather than failing the
 * write — the user can retry, and the worst case is they get the tighter
 * default cap instead of their custom one. Blocking a bid update on a
 * goals-table outage would be worse UX.
 */
export async function resolveGuardrails(
  accountId: string,
  campaignId?: string,
): Promise<Guardrails> {
  try {
    const goals = await getGoals(accountId, campaignId);
    return {
      maxBidChangePct: goals?.maxBidChangePct ?? DEFAULT_GUARDRAILS.maxBidChangePct,
      maxBudgetChangePct: goals?.maxBudgetChangePct ?? DEFAULT_GUARDRAILS.maxBudgetChangePct,
      maxKeywordPausePct: goals?.maxKeywordPausePct ?? DEFAULT_GUARDRAILS.maxKeywordPausePct,
    };
  } catch (error) {
    // Surface the failure for ops visibility but don't fail the write.
    console.warn("[resolveGuardrails] failed to read goals row, falling back to defaults:", error);
    return { ...DEFAULT_GUARDRAILS };
  }
}
