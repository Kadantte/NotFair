/**
 * Central registry of every MCP tool's response shape.
 *
 * This is the single source of truth for the MCP wire contract. Every tool's
 * response is declared here as `<ToolName>Response`. Future phases consume this
 * registry:
 *   - Phase 5 caches per-response type
 *   - Phase 7 publishes JSON Schemas and contract-tests responses against them
 *
 * Response types model the shape seen at `CallToolResult.structuredContent`
 * (i.e. AFTER `typedResult` wraps the raw handler return). Because
 * `structuredContent` must be a JSON object on the wire, arrays returned by
 * handlers surface as `{ items: [...] }` and primitives as `{ value }` — see
 * `StructuredShape` below. Objects pass through unchanged.
 */

import type {
  searchGeoTargets,
  getRecommendations,
  getResourceMetadata,
  listQueryableResources,
  getKeywordIdeas,
  listKeywords,
  WriteResult,
} from "@/lib/google-ads";
import type { getChanges, reviewChangeImpact } from "@/lib/db/tracking";
import type { listChangeInterventions, getChangeIntervention, evaluateChangeIntervention } from "@/lib/db/interventions";

// ─── Utility types ──────────────────────────────────────────────────

/** Unwrap `Promise<T>` returned by an async function. */
type Unwrap<T> = T extends (...args: never[]) => Promise<infer R> ? R : never;

/**
 * Model the `structuredContent` shape after `typedResult` wraps a raw value.
 *
 * - Arrays become `{ items: T[] }`.
 * - Plain objects pass through.
 * - Primitives become `{ value: T }`.
 * - `null`/`undefined` map to `undefined` (`structuredContent` is omitted).
 */
export type StructuredShape<T> = [T] extends [null | undefined]
  ? undefined
  : [T] extends [readonly (infer E)[]]
    ? { items: E[] }
    : [T] extends [object]
      ? T
      : { value: T };

// ─── Write-tool shared response ────────────────────────────────────
//
// Most write tools fan out through `execWrite`, which returns
// `WriteResult & { changeId: number | null }`. Declare the shape once and
// alias each tool to it.

export interface WriteToolResponse extends WriteResult {
  changeId: number | null;
}

// ─── Read-tool responses ───────────────────────────────────────────
//
// The read surface is deliberately narrow: only non-GAQL specialized tools
// are first-class here. Everything else is reached via `runScript`.

export type SearchGeoTargetsResponse = StructuredShape<Unwrap<typeof searchGeoTargets>>;
export type GetRecommendationsResponse = StructuredShape<Unwrap<typeof getRecommendations>>;
export type GetChangesResponse = StructuredShape<Unwrap<typeof getChanges>>;
export type ReviewChangeImpactResponse = StructuredShape<Unwrap<typeof reviewChangeImpact>>;
export type ListChangeInterventionsResponse = StructuredShape<Unwrap<typeof listChangeInterventions>>;
export type GetChangeInterventionResponse = StructuredShape<Unwrap<typeof getChangeIntervention>>;
export type EvaluateChangeInterventionResponse = StructuredShape<Unwrap<typeof evaluateChangeIntervention>>;
export type GetResourceMetadataResponse = StructuredShape<Unwrap<typeof getResourceMetadata>>;
export type ListQueryableResourcesResponse = StructuredShape<Unwrap<typeof listQueryableResources>>;
export type GetKeywordIdeasResponse = StructuredShape<Unwrap<typeof getKeywordIdeas>>;
export type ListKeywordsResponse = StructuredShape<Unwrap<typeof listKeywords>>;

// `listConnectedAccounts` is registered inline in `app/api/[transport]/route.ts`
// (not a Google Ads helper call). Declare its shape explicitly.
export interface ListConnectedAccountsResponse {
  accounts: Array<{ id: string; name: string }>;
  defaultAccountId: string;
  totalAccounts: number;
}

/** `runScript` returns whatever the sandbox code returned, JSON-stringified
 *  or object-shaped. Declared as `unknown` because the shape is caller-defined. */
export type RunScriptResponse = { value: unknown } | { items: unknown[] } | Record<string, unknown>;

// ─── Write-tool responses ──────────────────────────────────────────
//
// Aliases of `WriteToolResponse`. Named per-tool so contract tests and
// JSON Schema generation can address each tool individually.

// Keyword management
export type PauseKeywordResponse = WriteToolResponse;
export type EnableKeywordResponse = WriteToolResponse;
export type AddKeywordResponse = WriteToolResponse;
export type UpdateBidResponse = WriteToolResponse;
export type AddNegativeKeywordResponse = WriteToolResponse;
export type RemoveNegativeKeywordResponse = WriteToolResponse;

// Campaigns
export type CreateCampaignResponse = WriteToolResponse;
export type PauseCampaignResponse = WriteToolResponse;
export type EnableCampaignResponse = WriteToolResponse;
export type RemoveCampaignResponse = WriteToolResponse;
export type RenameCampaignResponse = WriteToolResponse;
export type UpdateCampaignBudgetResponse = WriteToolResponse;
export type UpdateCampaignBiddingResponse = WriteToolResponse;
export type UpdateCampaignGoalsResponse = WriteToolResponse;
export type UpdateCampaignSettingsResponse = WriteToolResponse;
export type UpdateCampaignLanguagesResponse = WriteToolResponse;
export type SetTrackingTemplateResponse = WriteToolResponse;

// Ad groups & ads
export type CreateAdGroupResponse = WriteToolResponse;
export type RenameAdGroupResponse = WriteToolResponse;
export type CreateAdResponse = WriteToolResponse;
export type PauseAdResponse = WriteToolResponse;
export type EnableAdResponse = WriteToolResponse;
export type RemoveAdResponse = WriteToolResponse;
export type UpdateAdFinalUrlResponse = WriteToolResponse;
export type UpdateAdAssetsResponse = WriteToolResponse;

// Bulk
export type BulkUpdateBidsResponse = WriteToolResponse;
export type BulkPauseKeywordsResponse = WriteToolResponse;
export type BulkAddKeywordsResponse = WriteToolResponse;
export type MoveKeywordsResponse = WriteToolResponse;

// Conversion actions
export type CreateConversionActionResponse = WriteToolResponse;
export type UpdateConversionActionResponse = WriteToolResponse;
export type RemoveConversionActionResponse = WriteToolResponse;

// Performance Max
export type PausePmaxAssetGroupResponse = WriteToolResponse;
export type EnablePmaxAssetGroupResponse = WriteToolResponse;

// Callouts
export type AddCalloutAssetResponse = WriteToolResponse;
export type CreateCalloutAssetResponse = WriteToolResponse;
export type LinkCalloutAssetResponse = WriteToolResponse;
export type LinkCalloutToAccountResponse = WriteToolResponse;
export type UnlinkCalloutAssetResponse = WriteToolResponse;
export type RemoveCalloutFromAccountResponse = WriteToolResponse;

// Structured snippets
export type AddStructuredSnippetAssetResponse = WriteToolResponse;
export type CreateStructuredSnippetAssetResponse = WriteToolResponse;
export type LinkStructuredSnippetAssetResponse = WriteToolResponse;
export type UnlinkStructuredSnippetAssetResponse = WriteToolResponse;

// Sitelinks
export type AddSitelinkAssetResponse = WriteToolResponse;
export type CreateSitelinkAssetResponse = WriteToolResponse;
export type LinkSitelinkAssetResponse = WriteToolResponse;
export type UnlinkSitelinkAssetResponse = WriteToolResponse;

// Image assets
export type CreateImageAssetResponse = WriteToolResponse;
export type LinkImageAssetResponse = WriteToolResponse;

// Bidding strategies
export type CreateBiddingStrategyResponse = WriteToolResponse;
export type UpdateBiddingStrategyResponse = WriteToolResponse;
export type RemoveBiddingStrategyResponse = WriteToolResponse;
export type LinkCampaignToBiddingStrategyResponse = WriteToolResponse;

// Negative keyword lists
export type CreateNegativeKeywordListResponse = WriteToolResponse;
export type RemoveNegativeKeywordListResponse = WriteToolResponse;
export type AddKeywordToNegativeListResponse = WriteToolResponse;
export type RemoveKeywordFromNegativeListResponse = WriteToolResponse;
export type LinkNegativeListToCampaignResponse = WriteToolResponse;
export type UnlinkNegativeListFromCampaignResponse = WriteToolResponse;

// Write-tool responses with custom shapes (not WriteToolResponse).

/** Result of `uploadClickConversions` — per-row success/failure totals. */
export interface UploadClickConversionsResponse {
  successCount: number;
  failureCount: number;
  errors?: Array<{ index: number; message: string }>;
}

/** Guardrail snapshot — either campaign-specific, account, or defaults. */
export interface GetGuardrailsResponse {
  source: "campaign" | "account" | "defaults";
  targetCpa: number | null;
  monthlyCap: number | null;
  maxBidChangePct: number;
  maxBudgetChangePct: number;
  maxKeywordPausePct: number;
  campaignId?: string | null;
}

export interface SetGuardrailsResponse {
  success: true;
  accountId: string;
  campaignId: string | null;
  targetCpa?: number | null;
  monthlyCap?: number | null;
  maxBidChangePct?: number;
  maxBudgetChangePct?: number;
  maxKeywordPausePct?: number;
}

/** Result of `undoChange` — composes the underlying WriteResult with undo metadata. */
export interface UndoChangeResponse extends WriteResult {
  undoneChangeId: number;
  originalAction: string;
}

// ─── Registry map (type-level completeness check) ───────────────────

/**
 * Maps every registered MCP tool name to its declared response type.
 *
 * Used by tests to prove completeness: if a new tool is registered but not
 * added here, the corresponding type-level test fails. Not imported at
 * runtime — this is a compile-time contract.
 */
export interface McpToolResponseRegistry {
  // Read tools (specialized, non-GAQL only)
  searchGeoTargets: SearchGeoTargetsResponse;
  getRecommendations: GetRecommendationsResponse;
  getChanges: GetChangesResponse;
  reviewChangeImpact: ReviewChangeImpactResponse;
  listChangeInterventions: ListChangeInterventionsResponse;
  getChangeIntervention: GetChangeInterventionResponse;
  evaluateChangeIntervention: EvaluateChangeInterventionResponse;
  getResourceMetadata: GetResourceMetadataResponse;
  listQueryableResources: ListQueryableResourcesResponse;
  getKeywordIdeas: GetKeywordIdeasResponse;
  listKeywords: ListKeywordsResponse;
  // Inline-registered (route.ts)
  listConnectedAccounts: ListConnectedAccountsResponse;
  // Code mode (sandboxed GAQL — owns all reads not covered above)
  runScript: RunScriptResponse;

  // Write tools
  pauseKeyword: PauseKeywordResponse;
  enableKeyword: EnableKeywordResponse;
  addKeyword: AddKeywordResponse;
  updateBid: UpdateBidResponse;
  addNegativeKeyword: AddNegativeKeywordResponse;
  removeNegativeKeyword: RemoveNegativeKeywordResponse;
  updateCampaignBudget: UpdateCampaignBudgetResponse;
  createCampaign: CreateCampaignResponse;
  pauseCampaign: PauseCampaignResponse;
  enableCampaign: EnableCampaignResponse;
  removeCampaign: RemoveCampaignResponse;
  setTrackingTemplate: SetTrackingTemplateResponse;
  createAdGroup: CreateAdGroupResponse;
  createAd: CreateAdResponse;
  pauseAd: PauseAdResponse;
  enableAd: EnableAdResponse;
  removeAd: RemoveAdResponse;
  updateAdFinalUrl: UpdateAdFinalUrlResponse;
  updateAdAssets: UpdateAdAssetsResponse;
  bulkUpdateBids: BulkUpdateBidsResponse;
  bulkPauseKeywords: BulkPauseKeywordsResponse;
  bulkAddKeywords: BulkAddKeywordsResponse;
  moveKeywords: MoveKeywordsResponse;
  renameCampaign: RenameCampaignResponse;
  renameAdGroup: RenameAdGroupResponse;
  updateCampaignBidding: UpdateCampaignBiddingResponse;
  updateCampaignGoals: UpdateCampaignGoalsResponse;
  updateCampaignSettings: UpdateCampaignSettingsResponse;
  createConversionAction: CreateConversionActionResponse;
  updateConversionAction: UpdateConversionActionResponse;
  removeConversionAction: RemoveConversionActionResponse;
  uploadClickConversions: UploadClickConversionsResponse;
  setGuardrails: SetGuardrailsResponse;
  getGuardrails: GetGuardrailsResponse;
  pausePmaxAssetGroup: PausePmaxAssetGroupResponse;
  enablePmaxAssetGroup: EnablePmaxAssetGroupResponse;
  updateCampaignLanguages: UpdateCampaignLanguagesResponse;
  addCalloutAsset: AddCalloutAssetResponse;
  createCalloutAsset: CreateCalloutAssetResponse;
  linkCalloutAsset: LinkCalloutAssetResponse;
  linkCalloutToAccount: LinkCalloutToAccountResponse;
  unlinkCalloutAsset: UnlinkCalloutAssetResponse;
  removeCalloutFromAccount: RemoveCalloutFromAccountResponse;
  addStructuredSnippetAsset: AddStructuredSnippetAssetResponse;
  createStructuredSnippetAsset: CreateStructuredSnippetAssetResponse;
  linkStructuredSnippetAsset: LinkStructuredSnippetAssetResponse;
  unlinkStructuredSnippetAsset: UnlinkStructuredSnippetAssetResponse;
  addSitelinkAsset: AddSitelinkAssetResponse;
  createSitelinkAsset: CreateSitelinkAssetResponse;
  linkSitelinkAsset: LinkSitelinkAssetResponse;
  unlinkSitelinkAsset: UnlinkSitelinkAssetResponse;
  createImageAsset: CreateImageAssetResponse;
  linkImageAsset: LinkImageAssetResponse;
  createBiddingStrategy: CreateBiddingStrategyResponse;
  updateBiddingStrategy: UpdateBiddingStrategyResponse;
  removeBiddingStrategy: RemoveBiddingStrategyResponse;
  linkCampaignToBiddingStrategy: LinkCampaignToBiddingStrategyResponse;
  createNegativeKeywordList: CreateNegativeKeywordListResponse;
  removeNegativeKeywordList: RemoveNegativeKeywordListResponse;
  addKeywordToNegativeList: AddKeywordToNegativeListResponse;
  removeKeywordFromNegativeList: RemoveKeywordFromNegativeListResponse;
  linkNegativeListToCampaign: LinkNegativeListToCampaignResponse;
  unlinkNegativeListFromCampaign: UnlinkNegativeListFromCampaignResponse;
  undoChange: UndoChangeResponse;
}

/** Every registered MCP tool name. */
export type McpToolName = keyof McpToolResponseRegistry;

/** Response type for a given tool name. */
export type McpToolResponse<N extends McpToolName> = McpToolResponseRegistry[N];
