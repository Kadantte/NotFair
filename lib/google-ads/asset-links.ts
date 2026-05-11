/**
 * Unified asset-link primitive.
 *
 * Google Ads model:
 *  - `Asset` is immutable creative content (callout text, sitelink, image, etc).
 *    Assets are NEVER deleted by the API; only links are removable.
 *  - `CustomerAsset` / `CampaignAsset` / `AdGroupAsset` / `AssetGroupAsset` are
 *    the four "link" resources that attach an asset to a serving target with
 *    a specific `field_type` (CALLOUT / SITELINK / MARKETING_IMAGE / ...).
 *
 * This file is the single source of truth for:
 *  - linking an asset to one or more targets (`linkAsset`)
 *  - creating an asset and optionally linking it in one mutate (`createAssetWithLinks`)
 *  - listing every link for an asset across all 4 levels (`getAssetLinks`)
 *  - removing one or more links by canonical link resource_name (`unlinkAssetLinks`)
 *  - finding a specific link by composite key (`findAssetLink`) — used by typed
 *    create-with-targets paths and undo flows
 *
 * Adding a new asset family (video, lead form, hotel callout, price, promotion):
 *  - Add one row to `FIELD_TYPES` with its `fieldTypeInt`, `assetTypeName`, and
 *    supported levels. That's it.
 */

import { getCustomer } from "./client";
import { isDemoAuth } from "@/lib/demo/constants";
import { extractErrorMessage, normalizeCustomerId, safeEntityId } from "./helpers";
import type { AuthContext, WriteResult } from "./types";

// ─── Types ─────────────────────────────────────────────────────────────

export type AssetLinkLevel = "customer" | "campaign" | "ad_group" | "asset_group";

export type AssetLinkTarget =
  | { level: "customer" }
  | { level: "campaign"; campaignId: string }
  | { level: "ad_group"; adGroupId: string }
  | { level: "asset_group"; assetGroupId: string };

export type AssetLink = {
  level: AssetLinkLevel;
  resourceName: string;
  assetResourceName: string;
  campaignId?: string;
  adGroupId?: string;
  assetGroupId?: string;
};

export type AssetLinkMutationResult = WriteResult & {
  fieldType: string;
  assetId: string;
  assetResourceName: string;
  created?: boolean;
  linksCreated?: AssetLink[];
  linksRemoved?: AssetLink[];
  skipped?: Array<{ target: AssetLinkTarget; reason: string }>;
};

// ─── Field-type registry ───────────────────────────────────────────────

export type FieldTypeConfig = {
  fieldTypeName: string;
  fieldTypeInt: number;
  assetTypeName: string;
  supportedLevels: readonly AssetLinkLevel[];
};

const EXTENSION_LEVELS = ["customer", "campaign", "ad_group"] as const;
const ALL_LEVELS = ["customer", "campaign", "ad_group", "asset_group"] as const;
// AD_IMAGE (Search/Display "image extensions" on RSAs) is only valid at
// campaign + ad_group levels. The Google Ads proto only defines per-resource
// limits for those two (`AD_IMAGE_CAMPAIGN_ASSETS_PER_CAMPAIGN`,
// `AD_IMAGE_AD_GROUP_ASSETS_PER_AD_GROUP`); customer-level and asset_group
// (PMax) image slots use MARKETING_IMAGE / SQUARE_MARKETING_IMAGE instead.
const AD_IMAGE_LEVELS = ["campaign", "ad_group"] as const;

export const FIELD_TYPES = {
  CALLOUT: {
    fieldTypeName: "CALLOUT",
    fieldTypeInt: 11,
    assetTypeName: "CALLOUT",
    supportedLevels: EXTENSION_LEVELS,
  },
  STRUCTURED_SNIPPET: {
    fieldTypeName: "STRUCTURED_SNIPPET",
    fieldTypeInt: 12,
    assetTypeName: "STRUCTURED_SNIPPET",
    supportedLevels: EXTENSION_LEVELS,
  },
  SITELINK: {
    fieldTypeName: "SITELINK",
    fieldTypeInt: 13,
    assetTypeName: "SITELINK",
    supportedLevels: EXTENSION_LEVELS,
  },
  MARKETING_IMAGE: {
    fieldTypeName: "MARKETING_IMAGE",
    fieldTypeInt: 5,
    assetTypeName: "IMAGE",
    supportedLevels: ALL_LEVELS,
  },
  SQUARE_MARKETING_IMAGE: {
    fieldTypeName: "SQUARE_MARKETING_IMAGE",
    fieldTypeInt: 19,
    assetTypeName: "IMAGE",
    supportedLevels: ALL_LEVELS,
  },
  AD_IMAGE: {
    fieldTypeName: "AD_IMAGE",
    fieldTypeInt: 26,
    assetTypeName: "IMAGE",
    supportedLevels: AD_IMAGE_LEVELS,
  },
} as const satisfies Record<string, FieldTypeConfig>;

export type FieldTypeName = keyof typeof FIELD_TYPES;

export const FIELD_TYPE_NAMES = Object.keys(FIELD_TYPES) as FieldTypeName[];

// ─── Level registry ────────────────────────────────────────────────────

type LevelConfig = {
  entity: "customer_asset" | "campaign_asset" | "ad_group_asset" | "asset_group_asset";
  resultKey: "customer_asset_result" | "campaign_asset_result" | "ad_group_asset_result" | "asset_group_asset_result";
  resourceField: "campaign" | "ad_group" | "asset_group" | null;
  resourceCollection: "campaigns" | "adGroups" | "assetGroups" | null;
  requiredParam: "campaignId" | "adGroupId" | "assetGroupId" | null;
  idLabel: string;
};

const LEVEL_CONFIG: Record<AssetLinkLevel, LevelConfig> = {
  customer: {
    entity: "customer_asset",
    resultKey: "customer_asset_result",
    resourceField: null,
    resourceCollection: null,
    requiredParam: null,
    idLabel: "customer",
  },
  campaign: {
    entity: "campaign_asset",
    resultKey: "campaign_asset_result",
    resourceField: "campaign",
    resourceCollection: "campaigns",
    requiredParam: "campaignId",
    idLabel: "campaign",
  },
  ad_group: {
    entity: "ad_group_asset",
    resultKey: "ad_group_asset_result",
    resourceField: "ad_group",
    resourceCollection: "adGroups",
    requiredParam: "adGroupId",
    idLabel: "ad group",
  },
  asset_group: {
    entity: "asset_group_asset",
    resultKey: "asset_group_asset_result",
    resourceField: "asset_group",
    resourceCollection: "assetGroups",
    requiredParam: "assetGroupId",
    idLabel: "asset group",
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────

type MutateResultRecord = { resource_name?: string };
type MutateResourcesResponse = {
  mutate_operation_responses?: Array<Record<string, MutateResultRecord | undefined>>;
};

function targetKey(target: AssetLinkTarget): string {
  if (target.level === "customer") return "customer";
  if (target.level === "campaign") return `campaign:${target.campaignId}`;
  if (target.level === "ad_group") return `ad_group:${target.adGroupId}`;
  return `asset_group:${target.assetGroupId}`;
}

export function normalizeAssetLinkTarget(target: AssetLinkTarget): AssetLinkTarget {
  if (target.level === "customer") return { level: "customer" };
  if (target.level === "campaign") {
    if (!target.campaignId) throw new Error("campaignId is required when target level is campaign");
    return { level: "campaign", campaignId: String(safeEntityId(target.campaignId, "campaign")) };
  }
  if (target.level === "ad_group") {
    if (!target.adGroupId) throw new Error("adGroupId is required when target level is ad_group");
    return { level: "ad_group", adGroupId: String(safeEntityId(target.adGroupId, "ad group")) };
  }
  if (target.level === "asset_group") {
    if (!target.assetGroupId) throw new Error("assetGroupId is required when target level is asset_group");
    return { level: "asset_group", assetGroupId: String(safeEntityId(target.assetGroupId, "asset group")) };
  }
  throw new Error(`Unsupported asset link target level: ${(target as AssetLinkTarget).level}`);
}

export function normalizeAssetLinkTargets(
  targets: AssetLinkTarget[] | undefined,
  defaultToCustomer = false,
): AssetLinkTarget[] {
  const raw = targets === undefined
    ? defaultToCustomer ? [{ level: "customer" as const }] : []
    : targets;
  const deduped = new Map<string, AssetLinkTarget>();
  for (const target of raw) {
    deduped.set(targetKey(target), normalizeAssetLinkTarget(target));
  }
  return [...deduped.values()];
}

export function assetResourceName(auth: AuthContext, assetId: string): string {
  const customerId = normalizeCustomerId(auth.customerId);
  const safeAssetId = safeEntityId(assetId, "asset");
  return `customers/${customerId}/assets/${safeAssetId}`;
}

export function normalizeAssetSource(source: string | number | null | undefined): string | null {
  if (source == null) return null;
  const normalized = String(source);
  if (normalized === "3") return "AUTOMATICALLY_CREATED";
  if (normalized === "2") return "ADVERTISER";
  return normalized;
}

export function isAutomaticallyCreatedAssetSource(source: string | number | null | undefined): boolean {
  return normalizeAssetSource(source) === "AUTOMATICALLY_CREATED";
}

function ensureLevelSupported(config: FieldTypeConfig, level: AssetLinkLevel): string | null {
  if (!config.supportedLevels.includes(level)) {
    return `${config.fieldTypeName} assets cannot be linked at the ${level} level. Supported levels: ${config.supportedLevels.join(", ")}.`;
  }
  return null;
}

type AssetSourceRow = {
  asset?: {
    source?: string | number;
  };
};

async function rejectUnlinkableAutomaticAsset(
  auth: AuthContext,
  assetResource: string,
  config: FieldTypeConfig,
): Promise<string | null> {
  if (isDemoAuth(auth)) return null;
  const customer = getCustomer(auth);
  try {
    const result = await customer.query(`
      SELECT
        asset.source
      FROM asset
      WHERE asset.resource_name = '${assetResource}'
        AND asset.type = ${config.assetTypeName}
      LIMIT 1
    `);
    const source = normalizeAssetSource((result as AssetSourceRow[])[0]?.asset?.source);
    const idTail = assetResource.split("/").pop();
    if (!source || source === "UNSPECIFIED" || source === "UNKNOWN") {
      return `Could not verify whether ${config.fieldTypeName} asset ${idTail} is advertiser-linkable. Query asset.source first or create a new advertiser-provided asset.`;
    }
    if (source === "AUTOMATICALLY_CREATED") {
      return `${config.fieldTypeName} asset ${idTail} was automatically created by Google and cannot be linked by advertisers. Create a new advertiser-provided asset instead of reusing this asset ID.`;
    }
    if (source !== "ADVERTISER") {
      return `${config.fieldTypeName} asset ${idTail} has source ${source} and cannot be linked by advertisers. Create a new advertiser-provided asset instead of reusing this asset ID.`;
    }
    return null;
  } catch (error) {
    return `Could not verify whether ${config.fieldTypeName} asset ${assetResource.split("/").pop()} is advertiser-linkable: ${extractErrorMessage(error)}`;
  }
}

export function buildAssetLinkOperation(
  auth: AuthContext,
  assetResource: string,
  fieldType: FieldTypeName,
  target: AssetLinkTarget,
) {
  const config = FIELD_TYPES[fieldType];
  const customerId = normalizeCustomerId(auth.customerId);
  const normalized = normalizeAssetLinkTarget(target);
  const meta = LEVEL_CONFIG[normalized.level];
  const resource: Record<string, unknown> = {
    asset: assetResource,
    field_type: config.fieldTypeInt,
  };
  if (meta.requiredParam && meta.resourceField && meta.resourceCollection) {
    const targetId = (normalized as Record<string, string | undefined>)[meta.requiredParam];
    resource[meta.resourceField] = `customers/${customerId}/${meta.resourceCollection}/${targetId}`;
  }
  return {
    entity: meta.entity,
    operation: "create" as const,
    resource,
  };
}

function linkFromResponse(
  target: AssetLinkTarget,
  assetResource: string,
  resourceName: string,
): AssetLink {
  const link: AssetLink = {
    level: target.level,
    resourceName,
    assetResourceName: assetResource,
  };
  if (target.level === "campaign") link.campaignId = target.campaignId;
  if (target.level === "ad_group") link.adGroupId = target.adGroupId;
  if (target.level === "asset_group") link.assetGroupId = target.assetGroupId;
  return link;
}

function targetCampaignId(target: AssetLinkTarget): string | null {
  return target.level === "campaign" ? target.campaignId : null;
}

// ─── Public: link an existing asset to one or more targets ─────────────

export async function linkAsset(
  auth: AuthContext,
  params: {
    assetId: string;
    fieldType: FieldTypeName;
    targets: AssetLinkTarget[];
    action?: string;
    label?: string;
  },
): Promise<AssetLinkMutationResult> {
  const action = params.action ?? "link_asset";
  const config = FIELD_TYPES[params.fieldType];
  if (!config) {
    return {
      success: false,
      action,
      entityId: params.assetId,
      beforeValue: "",
      afterValue: "",
      error: `Unknown asset fieldType: ${params.fieldType}. Valid: ${FIELD_TYPE_NAMES.join(", ")}.`,
      fieldType: String(params.fieldType),
      assetId: params.assetId,
      assetResourceName: "",
    };
  }

  const assetResource = assetResourceName(auth, params.assetId);
  const targets = normalizeAssetLinkTargets(params.targets);

  if (targets.length === 0) {
    return {
      success: false,
      action,
      entityId: params.assetId,
      beforeValue: "",
      afterValue: "",
      error: "linkAsset requires at least one target",
      fieldType: config.fieldTypeName,
      assetId: params.assetId,
      assetResourceName: assetResource,
    };
  }

  for (const target of targets) {
    const issue = ensureLevelSupported(config, target.level);
    if (issue) {
      return {
        success: false,
        action,
        entityId: params.assetId,
        beforeValue: "",
        afterValue: "",
        error: issue,
        fieldType: config.fieldTypeName,
        assetId: params.assetId,
        assetResourceName: assetResource,
      };
    }
  }

  const automaticAssetError = await rejectUnlinkableAutomaticAsset(auth, assetResource, config);
  if (automaticAssetError) {
    return {
      success: false,
      action,
      entityId: params.assetId,
      beforeValue: "",
      afterValue: "",
      error: automaticAssetError,
      fieldType: config.fieldTypeName,
      assetId: params.assetId,
      assetResourceName: assetResource,
      campaignId: targets.length === 1 ? targetCampaignId(targets[0]) : null,
    };
  }

  const customer = getCustomer(auth);
  try {
    const operations = targets.map((target) =>
      buildAssetLinkOperation(auth, assetResource, params.fieldType, target),
    ) as Parameters<typeof customer.mutateResources>[0];

    const response = await customer.mutateResources(operations);
    const responses = (response as unknown as MutateResourcesResponse)?.mutate_operation_responses ?? [];
    const linksCreated: AssetLink[] = targets.map((target, i) => {
      const meta = LEVEL_CONFIG[target.level];
      const resourceName = responses[i]?.[meta.resultKey]?.resource_name as string | undefined;
      return linkFromResponse(target, assetResource, resourceName ?? `${meta.entity} link for ${assetResource}`);
    });

    return {
      success: true,
      action,
      entityId: params.assetId,
      beforeValue: "",
      afterValue: linksCreated.length === 1 ? linksCreated[0].resourceName : `${linksCreated.length} links`,
      label: params.label ?? `${config.fieldTypeName} asset ${params.assetId}`,
      fieldType: config.fieldTypeName,
      assetId: params.assetId,
      assetResourceName: assetResource,
      linksCreated,
      campaignId: targets.length === 1 ? targetCampaignId(targets[0]) : null,
    };
  } catch (error) {
    return {
      success: false,
      action,
      entityId: params.assetId,
      beforeValue: "",
      afterValue: "",
      error: extractErrorMessage(error),
      fieldType: config.fieldTypeName,
      assetId: params.assetId,
      assetResourceName: assetResource,
      campaignId: targets.length === 1 ? targetCampaignId(targets[0]) : null,
    };
  }
}

// ─── Public: create asset (+ optional links) in one atomic mutate ──────

export async function createAssetWithLinks(
  auth: AuthContext,
  params: {
    fieldType: FieldTypeName;
    assetResource: Record<string, unknown>;
    targets: AssetLinkTarget[];
    action: string;
    afterValue: string;
    label?: string;
  },
): Promise<AssetLinkMutationResult> {
  const config = FIELD_TYPES[params.fieldType];
  if (!config) {
    return {
      success: false,
      action: params.action,
      entityId: "",
      beforeValue: "",
      afterValue: params.afterValue,
      error: `Unknown asset fieldType: ${params.fieldType}`,
      fieldType: String(params.fieldType),
      assetId: "",
      assetResourceName: "",
    };
  }

  const customer = getCustomer(auth);
  const customerId = normalizeCustomerId(auth.customerId);
  const tempAssetResourceName = `customers/${customerId}/assets/-1`;
  const targets = normalizeAssetLinkTargets(params.targets, false);

  for (const target of targets) {
    const issue = ensureLevelSupported(config, target.level);
    if (issue) {
      return {
        success: false,
        action: params.action,
        entityId: "",
        beforeValue: "",
        afterValue: params.afterValue,
        error: issue,
        fieldType: config.fieldTypeName,
        assetId: "",
        assetResourceName: "",
      };
    }
  }

  try {
    const operations: Parameters<typeof customer.mutateResources>[0] = [
      {
        entity: "asset",
        operation: "create" as const,
        resource: {
          resource_name: tempAssetResourceName,
          ...params.assetResource,
        },
      },
      ...targets.map((target) =>
        buildAssetLinkOperation(auth, tempAssetResourceName, params.fieldType, target),
      ),
    ];

    const response = await customer.mutateResources(operations);
    const responses = (response as unknown as MutateResourcesResponse)?.mutate_operation_responses ?? [];
    const assetResource = responses[0]?.asset_result?.resource_name as string | undefined;
    if (!assetResource) {
      return {
        success: false,
        action: params.action,
        entityId: "",
        beforeValue: "",
        afterValue: params.afterValue,
        error: "Asset created but no resource_name returned",
        label: params.label ?? null,
        fieldType: config.fieldTypeName,
        assetId: "",
        assetResourceName: "",
      };
    }

    const assetId = assetResource.split("/").pop() ?? "";
    const linksCreated: AssetLink[] = targets.map((target, i) => {
      const meta = LEVEL_CONFIG[target.level];
      const resourceName = responses[i + 1]?.[meta.resultKey]?.resource_name as string | undefined;
      return linkFromResponse(target, assetResource, resourceName ?? `${meta.entity} link for ${assetResource}`);
    });

    return {
      success: true,
      action: params.action,
      entityId: assetId,
      beforeValue: "",
      afterValue: params.afterValue,
      label: params.label ?? null,
      fieldType: config.fieldTypeName,
      assetId,
      assetResourceName: assetResource,
      created: true,
      linksCreated,
      skipped: [],
      campaignId: targets.length === 1 ? targetCampaignId(targets[0]) : null,
    };
  } catch (error) {
    return {
      success: false,
      action: params.action,
      entityId: "",
      beforeValue: "",
      afterValue: params.afterValue,
      error: extractErrorMessage(error),
      label: params.label ?? null,
      fieldType: config.fieldTypeName,
      assetId: "",
      assetResourceName: "",
      created: false,
      campaignId: targets.length === 1 ? targetCampaignId(targets[0]) : null,
    };
  }
}

// ─── Public: enumerate every link for an asset across 4 levels ─────────

export type AssetLinkRecord = {
  level: AssetLinkLevel;
  linkResourceName: string;
  fieldType: string;
  fieldTypeInt: number | null;
  assetResourceName: string;
  campaignId?: string;
  adGroupId?: string;
  assetGroupId?: string;
};

type LinkRow = {
  resource_name?: string;
  field_type?: string | number;
  asset?: string;
  campaign?: string;
  ad_group?: string;
  asset_group?: string;
};
type LinkRowResponse = Partial<Record<LevelConfig["entity"], LinkRow>>;

export async function getAssetLinks(
  auth: AuthContext,
  assetId: string,
): Promise<AssetLinkRecord[]> {
  const customer = getCustomer(auth);
  const assetResource = assetResourceName(auth, assetId);

  const queries: Array<{ level: AssetLinkLevel; entity: LevelConfig["entity"]; query: string }> = [
    {
      level: "customer",
      entity: "customer_asset",
      query: `
        SELECT
          customer_asset.resource_name,
          customer_asset.field_type,
          customer_asset.asset
        FROM customer_asset
        WHERE customer_asset.asset = '${assetResource}'
          AND customer_asset.status != REMOVED
      `,
    },
    {
      level: "campaign",
      entity: "campaign_asset",
      query: `
        SELECT
          campaign_asset.resource_name,
          campaign_asset.field_type,
          campaign_asset.asset,
          campaign_asset.campaign
        FROM campaign_asset
        WHERE campaign_asset.asset = '${assetResource}'
          AND campaign_asset.status != REMOVED
      `,
    },
    {
      level: "ad_group",
      entity: "ad_group_asset",
      query: `
        SELECT
          ad_group_asset.resource_name,
          ad_group_asset.field_type,
          ad_group_asset.asset,
          ad_group_asset.ad_group
        FROM ad_group_asset
        WHERE ad_group_asset.asset = '${assetResource}'
          AND ad_group_asset.status != REMOVED
      `,
    },
    {
      level: "asset_group",
      entity: "asset_group_asset",
      query: `
        SELECT
          asset_group_asset.resource_name,
          asset_group_asset.field_type,
          asset_group_asset.asset,
          asset_group_asset.asset_group
        FROM asset_group_asset
        WHERE asset_group_asset.asset = '${assetResource}'
          AND asset_group_asset.status != REMOVED
      `,
    },
  ];

  const responses = await Promise.all(
    queries.map((q) => customer.query(q.query).catch(() => [] as LinkRowResponse[])),
  );

  const records: AssetLinkRecord[] = [];
  for (const [i, q] of queries.entries()) {
    const rows = (responses[i] ?? []) as LinkRowResponse[];
    for (const row of rows) {
      const linkRow = row[q.entity];
      if (!linkRow) continue;
      const fieldTypeRaw = linkRow.field_type;
      const fieldType = fieldTypeRaw == null ? "" : String(fieldTypeRaw);
      const fieldTypeInt = typeof fieldTypeRaw === "number"
        ? fieldTypeRaw
        : Number.isFinite(Number(fieldTypeRaw)) ? Number(fieldTypeRaw) : null;
      const record: AssetLinkRecord = {
        level: q.level,
        linkResourceName: String(linkRow.resource_name ?? ""),
        fieldType,
        fieldTypeInt,
        assetResourceName: String(linkRow.asset ?? assetResource),
      };
      if (q.level === "campaign") {
        record.campaignId = String(linkRow.campaign ?? "").split("/").pop() ?? "";
      } else if (q.level === "ad_group") {
        record.adGroupId = String(linkRow.ad_group ?? "").split("/").pop() ?? "";
      } else if (q.level === "asset_group") {
        record.assetGroupId = String(linkRow.asset_group ?? "").split("/").pop() ?? "";
      }
      records.push(record);
    }
  }
  return records;
}

// ─── Public: unlink one or more links by canonical resource_name ──────

const ENTITY_BY_PATH: Array<[string, LevelConfig["entity"]]> = [
  ["/customerAssets/", "customer_asset"],
  ["/campaignAssets/", "campaign_asset"],
  ["/adGroupAssets/", "ad_group_asset"],
  ["/assetGroupAssets/", "asset_group_asset"],
];

function entityForLinkResourceName(linkResourceName: string): LevelConfig["entity"] | null {
  for (const [path, entity] of ENTITY_BY_PATH) {
    if (linkResourceName.includes(path)) return entity;
  }
  return null;
}

export type UnlinkAssetLinksResult = WriteResult & {
  removed: number;
  linkResourceNames: string[];
};

export async function unlinkAssetLinks(
  auth: AuthContext,
  linkResourceNames: string[],
): Promise<UnlinkAssetLinksResult> {
  const action = "unlink_asset";
  if (linkResourceNames.length === 0) {
    return {
      success: false,
      action,
      entityId: "",
      beforeValue: "",
      afterValue: "",
      error: "unlinkAssetLinks requires at least one link resource name",
      removed: 0,
      linkResourceNames: [],
    };
  }

  const operations: Array<{ entity: LevelConfig["entity"]; operation: "remove"; resource: string }> = [];
  const invalid: string[] = [];
  for (const link of linkResourceNames) {
    const entity = entityForLinkResourceName(link);
    if (!entity) {
      invalid.push(link);
      continue;
    }
    operations.push({ entity, operation: "remove", resource: link });
  }

  if (invalid.length > 0) {
    return {
      success: false,
      action,
      entityId: invalid[0],
      beforeValue: invalid[0],
      afterValue: "",
      error: `Unrecognized link resource_name(s): ${invalid.join(", ")}. Expected paths containing /customerAssets/, /campaignAssets/, /adGroupAssets/, or /assetGroupAssets/.`,
      removed: 0,
      linkResourceNames: invalid,
    };
  }

  const customer = getCustomer(auth);
  try {
    await customer.mutateResources(operations as unknown as Parameters<typeof customer.mutateResources>[0]);
    return {
      success: true,
      action,
      entityId: linkResourceNames[0],
      beforeValue: linkResourceNames.length === 1 ? linkResourceNames[0] : `${linkResourceNames.length} links`,
      afterValue: "",
      removed: linkResourceNames.length,
      linkResourceNames,
    };
  } catch (error) {
    return {
      success: false,
      action,
      entityId: linkResourceNames[0],
      beforeValue: linkResourceNames[0],
      afterValue: "",
      error: extractErrorMessage(error),
      removed: 0,
      linkResourceNames,
    };
  }
}

// ─── Public: find a single link by composite key ───────────────────────

export async function findAssetLink(
  auth: AuthContext,
  params: {
    assetId: string;
    fieldType: FieldTypeName;
    target: AssetLinkTarget;
  },
): Promise<{ linkResourceName: string | null; error?: string }> {
  const config = FIELD_TYPES[params.fieldType];
  if (!config) return { linkResourceName: null, error: `Unknown asset fieldType: ${params.fieldType}` };
  const target = normalizeAssetLinkTarget(params.target);
  const issue = ensureLevelSupported(config, target.level);
  if (issue) return { linkResourceName: null, error: issue };

  const customer = getCustomer(auth);
  const assetResource = assetResourceName(auth, params.assetId);
  const meta = LEVEL_CONFIG[target.level];
  const customerId = normalizeCustomerId(auth.customerId);

  const targetFilter =
    target.level === "customer" ? "" :
    target.level === "campaign" ? `AND campaign_asset.campaign = 'customers/${customerId}/campaigns/${target.campaignId}'` :
    target.level === "ad_group" ? `AND ad_group_asset.ad_group = 'customers/${customerId}/adGroups/${target.adGroupId}'` :
    `AND asset_group_asset.asset_group = 'customers/${customerId}/assetGroups/${target.assetGroupId}'`;

  try {
    const result = await customer.query(`
      SELECT ${meta.entity}.resource_name
      FROM ${meta.entity}
      WHERE ${meta.entity}.asset = '${assetResource}'
        AND ${meta.entity}.field_type = ${config.fieldTypeName}
        AND ${meta.entity}.status != REMOVED
        ${targetFilter}
      LIMIT 1
    `);
    const row = (result as Array<Partial<Record<LevelConfig["entity"], { resource_name?: string }>>>)[0];
    const linkResource = row?.[meta.entity]?.resource_name;
    return { linkResourceName: linkResource ?? null };
  } catch (error) {
    return { linkResourceName: null, error: extractErrorMessage(error) };
  }
}

// ─── Public: typed helper — unlink a single link by composite key ──────

export async function unlinkAssetByTarget(
  auth: AuthContext,
  params: {
    assetId: string;
    fieldType: FieldTypeName;
    target: AssetLinkTarget;
    action?: string;
    label?: string;
  },
): Promise<AssetLinkMutationResult> {
  const action = params.action ?? "unlink_asset";
  const config = FIELD_TYPES[params.fieldType];
  if (!config) {
    return {
      success: false,
      action,
      entityId: params.assetId,
      beforeValue: "",
      afterValue: "",
      error: `Unknown asset fieldType: ${params.fieldType}`,
      fieldType: String(params.fieldType),
      assetId: params.assetId,
      assetResourceName: "",
    };
  }
  const target = normalizeAssetLinkTarget(params.target);
  const assetResource = assetResourceName(auth, params.assetId);

  const found = await findAssetLink(auth, {
    assetId: params.assetId,
    fieldType: params.fieldType,
    target,
  });

  if (!found.linkResourceName) {
    return {
      success: false,
      action,
      entityId: params.assetId,
      beforeValue: "",
      afterValue: "",
      error: found.error ?? `No ${config.fieldTypeName} ${target.level} link found for asset ${params.assetId}`,
      fieldType: config.fieldTypeName,
      assetId: params.assetId,
      assetResourceName: assetResource,
      campaignId: targetCampaignId(target),
    };
  }

  const customer = getCustomer(auth);
  const meta = LEVEL_CONFIG[target.level];
  try {
    const operations = [{
      entity: meta.entity,
      operation: "remove" as const,
      resource: found.linkResourceName,
    }] as unknown as Parameters<typeof customer.mutateResources>[0];
    await customer.mutateResources(operations);
    return {
      success: true,
      action,
      entityId: params.assetId,
      beforeValue: found.linkResourceName,
      afterValue: "",
      label: params.label ?? null,
      fieldType: config.fieldTypeName,
      assetId: params.assetId,
      assetResourceName: assetResource,
      linksRemoved: [linkFromResponse(target, assetResource, found.linkResourceName)],
      campaignId: targetCampaignId(target),
    };
  } catch (error) {
    return {
      success: false,
      action,
      entityId: params.assetId,
      beforeValue: "",
      afterValue: "",
      error: extractErrorMessage(error),
      fieldType: config.fieldTypeName,
      assetId: params.assetId,
      assetResourceName: assetResource,
      campaignId: targetCampaignId(target),
    };
  }
}
