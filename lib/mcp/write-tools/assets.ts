import { z } from "zod";
import {
  createCalloutAsset,
  createStructuredSnippetAsset,
  STRUCTURED_SNIPPET_HEADERS,
  createSitelinkAsset,
  createCallAsset,
  createImageAsset,
  fetchImageAssetFromUrl,
  IMAGE_FIELD_TYPE_NAMES,
  linkAsset,
  unlinkAssetLinks,
  getAssetLinks,
  FIELD_TYPE_NAMES,
} from "@/lib/google-ads";
import type {
  AssetLinkMutationResult,
  AssetLinkTarget,
  FieldTypeName,
  ImageAssetFieldType,
} from "@/lib/google-ads";
import { execRead } from "@/lib/tools/execute";
import {
  typedResult,
  safeHandler,
  accountIdParam,
  READ_ANNOTATIONS,
  WRITE_ANNOTATIONS,
  DESTRUCTIVE_WRITE_ANNOTATIONS,
} from "../types";
import { resolveToolAuth } from "../helpers";
import type { WriteToolDeps } from "./_deps";
import {
  assetLinkTargetSchema,
  ASSET_LINK_TARGETS_SHAPE_DOC,
  experimentImpactAcknowledgementSchema,
  campaignTargetIds,
  execAssetLinkWrite,
} from "./_deps";

export function registerAssetWriteTools(deps: WriteToolDeps) {
  const { server, currentAuth, writeToolCall } = deps;

  // ─── Asset creation (typed per family — input shape differs per family) ──
  //
  // Each create*Asset tool builds a fresh Asset and (optionally) links it to
  // one or more serving targets in a single atomic mutate. Pass `targets: []`
  // (or omit) to create the asset only; pass targets to also link it.
  //
  // For LINK-ONLY operations on existing assets, use `linkAsset`.
  // To list where an asset is currently linked, use `getAssetLinks`.
  // To remove links, use `unlinkAssetLinks` with the link resource_name(s).
  //
  // Note: assets in Google Ads are immutable and cannot be deleted. To make
  // an asset stop serving, remove every link that references it.

  server.registerTool("createCalloutAsset", {
    description: "Create a callout asset (≤25 char snippet shown under text ads, e.g. 'Free shipping'). Optionally link it to customer, campaign, or ad group targets in the same atomic mutate via `targets`. Returns changeId, assetId, and link resource names. To attach an existing callout to more targets later, call `linkAsset`.",
    inputSchema: {
      accountId: accountIdParam,
      text: z.string().min(1).max(25).describe("Callout text (≤25 chars), e.g. 'Free shipping'"),
      targets: z.array(assetLinkTargetSchema).optional().describe(
        `Optional serving targets. Omit or pass [] to create the asset only; pass targets to link it in the same mutate. ${ASSET_LINK_TARGETS_SHAPE_DOC}`,
      ),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, text, targets, acknowledgeExperimentImpact }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execAssetLinkWrite(
      auth,
      targetId,
      campaignTargetIds(targets),
      () => createCalloutAsset(targetAuth, { text, targets: targets as AssetLinkTarget[] | undefined }),
      acknowledgeExperimentImpact,
    );
    return typedResult(result);
  }));

  server.registerTool("createStructuredSnippetAsset", {
    description: `Create a structured snippet asset (header + 3-10 values, each ≤25 chars). Optionally link it to customer/campaign/ad-group targets via \`targets\`. Valid headers: ${STRUCTURED_SNIPPET_HEADERS.join(", ")}. Alias accepted: "Service catalog" → "Services". Returns changeId, assetId, and link resource names. To attach an existing snippet to more targets later, call \`linkAsset\`.`,
    inputSchema: {
      accountId: accountIdParam,
      header: z.string().describe(`Structured snippet header. Must be one of: ${STRUCTURED_SNIPPET_HEADERS.join(", ")}. "Service catalog" is accepted and normalized to "Services".`),
      values: z.array(z.string().min(1).max(25)).min(3).max(10).describe("Snippet values, 3-10 items, each ≤25 chars"),
      targets: z.array(assetLinkTargetSchema).optional().describe(
        `Optional serving targets. Omit or pass [] to create the asset only. ${ASSET_LINK_TARGETS_SHAPE_DOC}`,
      ),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, header, values, targets, acknowledgeExperimentImpact }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execAssetLinkWrite(
      auth,
      targetId,
      campaignTargetIds(targets),
      () => createStructuredSnippetAsset(targetAuth, { header, values, targets: targets as AssetLinkTarget[] | undefined }),
      acknowledgeExperimentImpact,
    );
    return typedResult(result);
  }));

  server.registerTool("createSitelinkAsset", {
    description: "Create a sitelink asset (link text + destination URL + optional description pair). Optionally link it to customer/campaign/ad-group targets via `targets`. Sitelink text ≤25 chars; descriptions ≤35 chars each and must be provided as a pair. Returns changeId, assetId, and link resource names. To attach an existing sitelink to more targets later, call `linkAsset`.",
    inputSchema: {
      accountId: accountIdParam,
      linkText: z.string().min(1).max(25).describe("Sitelink text (≤25 chars), e.g. 'Pricing'"),
      finalUrl: z.string().url().describe("Destination URL for the sitelink"),
      description1: z.string().max(35).optional().describe("Optional sitelink description line 1 (≤35 chars). If provided, description2 is also required."),
      description2: z.string().max(35).optional().describe("Optional sitelink description line 2 (≤35 chars). If provided, description1 is also required."),
      targets: z.array(assetLinkTargetSchema).optional().describe(
        `Optional serving targets. Omit or pass [] to create the asset only. ${ASSET_LINK_TARGETS_SHAPE_DOC}`,
      ),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, linkText, finalUrl, description1, description2, targets, acknowledgeExperimentImpact }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execAssetLinkWrite(
      auth,
      targetId,
      campaignTargetIds(targets),
      () => createSitelinkAsset(targetAuth, { linkText, finalUrl, description1, description2, targets: targets as AssetLinkTarget[] | undefined }),
      acknowledgeExperimentImpact,
    );
    return typedResult(result);
  }));

  server.registerTool("createCallAsset", {
    description: "Create a call asset (phone number + country code) and optionally link it to customer/campaign/ad-group targets in the same atomic mutate. Call assets show a phone number in search ads and enable call tracking. callConversionReportingState defaults to account-level tracking when omitted. Returns changeId, assetId, and link resource names.",
    inputSchema: {
      accountId: accountIdParam,
      phoneNumber: z.string().min(1).describe("Phone number in E.164-style or local format, e.g. '+14155550123' or '(415) 555-0123'"),
      countryCode: z.string().length(2).describe("Two-letter ISO 3166-1 alpha-2 country code, e.g. 'US'"),
      callConversionReportingState: z.enum(["DISABLED", "USE_ACCOUNT_LEVEL_CALL_CONVERSION_ACTION", "USE_RESOURCE_LEVEL_CALL_CONVERSION_ACTION"]).optional().describe("Call conversion reporting behavior. Omit to use account-level tracking (default)."),
      callConversionAction: z.string().optional().describe("Conversion action resource_name to use when callConversionReportingState is USE_RESOURCE_LEVEL_CALL_CONVERSION_ACTION. Format: customers/{customer_id}/conversionActions/{id}."),
      targets: z.array(assetLinkTargetSchema).optional().describe(
        `Optional serving targets (customer/campaign/ad_group — call assets don't support asset_group). Omit or pass [] to create the asset only. ${ASSET_LINK_TARGETS_SHAPE_DOC}`,
      ),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, phoneNumber, countryCode, callConversionReportingState, callConversionAction, targets, acknowledgeExperimentImpact }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execAssetLinkWrite(
      auth,
      targetId,
      campaignTargetIds(targets),
      () => createCallAsset(targetAuth, { phoneNumber, countryCode, callConversionReportingState, callConversionAction, targets: targets as AssetLinkTarget[] | undefined }),
      acknowledgeExperimentImpact,
    );
    return typedResult(result);
  }));

  server.registerTool("createImageAsset", {
    description: "Upload a PNG/JPEG image asset from an HTTPS URL. Pick the field type by SERVING SLOT, not by aspect ratio: MARKETING_IMAGE (Display/PMax 1.91:1, min 600x314) | SQUARE_MARKETING_IMAGE (Display/PMax 1:1, min 300x300) | AD_IMAGE (Search/Display 'image extension' on RSAs — accepts either 1.91:1 OR 1:1 source, campaign/ad_group link levels only). Optionally link it to serving targets via `targets`. Returns changeId, assetId, and link resource names. To attach an existing image to more targets later, call `linkAsset`.",
    inputSchema: {
      accountId: accountIdParam,
      imageUrl: z.string().url().describe("Public HTTPS URL for the PNG/JPEG image to upload. Max 5 MB."),
      name: z.string().min(1).max(255).describe("Asset name shown in Google Ads, e.g. 'Spring promo landscape'"),
      fieldType: z.enum(IMAGE_FIELD_TYPE_NAMES).describe("Serving slot; pre-validates dimensions and (when `targets` is set) used as the link field_type. AD_IMAGE accepts either 1.91:1 or 1:1 source dimensions."),
      targets: z.array(assetLinkTargetSchema).optional().describe(
        `Optional serving targets. MARKETING_IMAGE/SQUARE_MARKETING_IMAGE support all 4 levels (customer/campaign/ad_group/asset_group for Performance Max). AD_IMAGE supports campaign/ad_group only. Omit or pass [] to create the asset only. ${ASSET_LINK_TARGETS_SHAPE_DOC}`,
      ),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, imageUrl, name, fieldType, targets, acknowledgeExperimentImpact }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execAssetLinkWrite(
      auth,
      targetId,
      campaignTargetIds(targets),
      async () => {
        const image = await fetchImageAssetFromUrl(imageUrl);
        return createImageAsset(targetAuth, {
          imageBytes: image.imageBytes,
          mimeType: image.mimeType,
          fieldType: fieldType as ImageAssetFieldType,
          name,
          targets: targets as AssetLinkTarget[] | undefined,
        }) as Promise<AssetLinkMutationResult>;
      },
      acknowledgeExperimentImpact,
    );
    return typedResult(result);
  }));

  // ─── Generic asset link operations ──────────────────────────────────
  //
  // Three primitives that work for every asset family (callout / sitelink /
  // structured snippet / image — and any future family added to the
  // FIELD_TYPES registry).

  server.registerTool("linkAsset", {
    description: `Link an existing asset to one or more serving targets in a single atomic mutate. Bulk-by-default: pass a single-element targets array for one target, or many for fan-out. Field types: ${FIELD_TYPE_NAMES.join(", ")}. Level support varies by field type: MARKETING_IMAGE / SQUARE_MARKETING_IMAGE support all 4 levels including asset_group (Performance Max); CALLOUT / SITELINK / STRUCTURED_SNIPPET / CALL support customer/campaign/ad_group only; AD_IMAGE (Search/Display 'image extension' on RSAs) supports campaign/ad_group only. The underlying asset is field-type-agnostic — the same IMAGE asset can be linked as MARKETING_IMAGE at one target and AD_IMAGE at another. Auto-generated assets (asset.source = AUTOMATICALLY_CREATED) are rejected before the mutate. To remove links, use unlinkAssetLinks with the link resource_names returned here. Returns changeId and link resource names.`,
    inputSchema: {
      accountId: accountIdParam,
      assetId: z.string().describe("Asset ID (query `asset` via runScript, or pass the assetId returned from a create*Asset call)"),
      fieldType: z.enum(FIELD_TYPE_NAMES as [string, ...string[]]).describe("Asset field type — what kind of asset this is and which serving slot it goes in."),
      targets: z.array(assetLinkTargetSchema).min(1).describe(
        `One or more serving targets. ${ASSET_LINK_TARGETS_SHAPE_DOC}`,
      ),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, assetId, fieldType, targets, acknowledgeExperimentImpact }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execAssetLinkWrite(
      auth,
      targetId,
      campaignTargetIds(targets),
      () => linkAsset(targetAuth, {
        assetId,
        fieldType: fieldType as FieldTypeName,
        targets: targets as AssetLinkTarget[],
      }),
      acknowledgeExperimentImpact,
    );
    return typedResult(result);
  }));

  server.registerTool("unlinkAssetLinks", {
    description: "Remove one or more asset links by their canonical link resource_names (returned by `getAssetLinks`, `linkAsset`, or any create*Asset call). Bulk-by-default: pass a single-element array for one link, or many for atomic bulk removal. The underlying asset is NOT deleted — Google Ads assets are immutable. To 'delete' an asset, remove every link that references it; the asset row remains in the account but stops serving. Returns changeId(s).",
    inputSchema: {
      accountId: accountIdParam,
      linkResourceNames: z.array(z.string()).min(1).describe("Canonical link resource_names. Each must be a path containing /customerAssets/, /campaignAssets/, /adGroupAssets/, or /assetGroupAssets/. Get these from `getAssetLinks(assetId)` or from a previous link operation."),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, linkResourceNames }) =>
    writeToolCall({ accountId }, (a) => unlinkAssetLinks(a, linkResourceNames)),
  ));

  server.registerTool("getAssetLinks", {
    description: "List every link for an asset across all 4 levels (customer / campaign / ad_group / asset_group). Use this before `unlinkAssetLinks` to discover which link resource_names to pass. Pure read — does not mutate. Returns an array of { level, linkResourceName, fieldType, target }.",
    inputSchema: {
      accountId: accountIdParam,
      assetId: z.string().describe("Asset ID (query `asset` via runScript, or pass an assetId you already have)"),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, assetId }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const links = await execRead(auth, targetId, "getAssetLinks", () => getAssetLinks(targetAuth, assetId));
    return typedResult({ assetId, links });
  }));
}
