import { getCustomer } from "./client";
import { isDemoAuth } from "@/lib/demo/constants";
import { extractErrorMessage, normalizeCustomerId, safeEntityId } from "./helpers";
import type { AuthContext, WriteResult } from "./types";

export const ASSET_EXTENSION_FIELD_TYPE = {
  CALLOUT: 11,
  STRUCTURED_SNIPPET: 12,
  SITELINK: 13,
} as const;

export type AssetExtensionType = keyof typeof ASSET_EXTENSION_FIELD_TYPE;
export type AssetExtensionLevel = "account" | "campaign" | "ad_group";

export type AssetExtensionTarget = {
  level: AssetExtensionLevel;
  campaignId?: string;
  adGroupId?: string;
};

export type AssetExtensionLink = {
  level: AssetExtensionLevel;
  resourceName: string;
  assetResourceName: string;
  campaignId?: string;
  adGroupId?: string;
};

export type AssetExtensionMutationResult = WriteResult & {
  assetType: AssetExtensionType;
  assetId: string;
  assetResourceName: string;
  created?: boolean;
  linksCreated?: AssetExtensionLink[];
  linksRemoved?: AssetExtensionLink[];
  skipped?: Array<{ target: AssetExtensionTarget; reason: string }>;
};

type MutateResultRecord = { resource_name?: string };
type MutateResourcesResponse = {
  mutate_operation_responses?: Array<Record<string, MutateResultRecord | undefined>>;
};
type AssetSourceRow = {
  asset?: {
    source?: string | number;
  };
};
type AssetExtensionLinkRow = Partial<Record<LinkTargetMeta["entity"], { resource_name?: string }>>;

type LinkTargetMeta = {
  entity: "customer_asset" | "campaign_asset" | "ad_group_asset";
  resultKey: "customer_asset_result" | "campaign_asset_result" | "ad_group_asset_result";
  resourceField: "campaign" | "ad_group" | null;
  resourceCollection: "campaigns" | "adGroups" | null;
  requiredParam: "campaignId" | "adGroupId" | null;
  idLabel: string;
};

const LINK_TARGET: Record<AssetExtensionLevel, LinkTargetMeta> = {
  account: {
    entity: "customer_asset",
    resultKey: "customer_asset_result",
    resourceField: null,
    resourceCollection: null,
    requiredParam: null,
    idLabel: "account",
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
};

function targetKey(target: AssetExtensionTarget): string {
  if (target.level === "account") return "account";
  if (target.level === "campaign") return `campaign:${target.campaignId}`;
  return `ad_group:${target.adGroupId}`;
}

export function normalizeAssetExtensionTargets(
  targets: AssetExtensionTarget[] | undefined,
  defaultToAccount = true,
): AssetExtensionTarget[] {
  const raw = targets === undefined
    ? defaultToAccount
      ? [{ level: "account" as const }]
      : []
    : targets;
  const deduped = new Map<string, AssetExtensionTarget>();

  for (const target of raw) {
    const normalized = normalizeAssetExtensionTarget(target);
    deduped.set(targetKey(normalized), normalized);
  }

  return [...deduped.values()];
}

export function normalizeAssetExtensionTarget(target: AssetExtensionTarget): AssetExtensionTarget {
  if (target.level === "account") return { level: "account" };
  if (target.level === "campaign") {
    if (!target.campaignId) throw new Error("campaignId is required when target level is campaign");
    return { level: "campaign", campaignId: String(safeEntityId(target.campaignId, "campaign")) };
  }
  if (target.level === "ad_group") {
    if (!target.adGroupId) throw new Error("adGroupId is required when target level is ad_group");
    return { level: "ad_group", adGroupId: String(safeEntityId(target.adGroupId, "ad group")) };
  }
  throw new Error(`Unsupported asset extension target level: ${(target as AssetExtensionTarget).level}`);
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

async function rejectUnlinkableAutomaticAsset(
  auth: AuthContext,
  assetResource: string,
  assetType: AssetExtensionType,
): Promise<string | null> {
  if (isDemoAuth(auth)) return null;

  const customer = getCustomer(auth);

  try {
    const result = await customer.query(`
      SELECT
        asset.source
      FROM asset
      WHERE asset.resource_name = '${assetResource}'
        AND asset.type = ${assetType}
      LIMIT 1
    `);
    const source = normalizeAssetSource((result as AssetSourceRow[])[0]?.asset?.source);

    if (!source || source === "UNSPECIFIED" || source === "UNKNOWN") {
      return `Could not verify whether ${assetType} asset ${assetResource.split("/").pop()} is advertiser-linkable. Query asset.source first or create a new advertiser-provided asset.`;
    }
    if (source === "AUTOMATICALLY_CREATED") {
      return `${assetType} asset ${assetResource.split("/").pop()} was automatically created by Google and cannot be linked by advertisers. Create a new advertiser-provided asset instead of reusing this asset ID.`;
    }
    if (source !== "ADVERTISER") {
      return `${assetType} asset ${assetResource.split("/").pop()} has source ${source} and cannot be linked by advertisers. Create a new advertiser-provided asset instead of reusing this asset ID.`;
    }
    return null;
  } catch (error) {
    return `Could not verify whether ${assetType} asset ${assetResource.split("/").pop()} is advertiser-linkable: ${extractErrorMessage(error)}`;
  }
}

export function buildAssetExtensionLinkOperation(
  auth: AuthContext,
  assetResource: string,
  assetType: AssetExtensionType,
  target: AssetExtensionTarget,
) {
  const customerId = normalizeCustomerId(auth.customerId);
  const normalizedTarget = normalizeAssetExtensionTarget(target);
  const meta = LINK_TARGET[normalizedTarget.level];
  const resource: Record<string, unknown> = {
    asset: assetResource,
    field_type: ASSET_EXTENSION_FIELD_TYPE[assetType],
  };

  if (meta.requiredParam) {
    const targetId = normalizedTarget[meta.requiredParam];
    resource[meta.resourceField!] = `customers/${customerId}/${meta.resourceCollection}/${targetId}`;
  }

  return {
    entity: meta.entity,
    operation: "create" as const,
    resource,
  };
}

function linkFromResponse(
  target: AssetExtensionTarget,
  assetResource: string,
  fallbackResourceName: string,
): AssetExtensionLink {
  return {
    ...target,
    assetResourceName: assetResource,
    resourceName: fallbackResourceName,
  };
}

export async function linkAssetExtension(
  auth: AuthContext,
  params: {
    assetType: AssetExtensionType;
    assetId: string;
    target: AssetExtensionTarget;
    action: string;
    label?: string;
  },
): Promise<AssetExtensionMutationResult> {
  const customer = getCustomer(auth);
  const assetResource = assetResourceName(auth, params.assetId);
  const target = normalizeAssetExtensionTarget(params.target);
  const meta = LINK_TARGET[target.level];
  const automaticAssetError = await rejectUnlinkableAutomaticAsset(auth, assetResource, params.assetType);

  if (automaticAssetError) {
    return {
      success: false,
      action: params.action,
      entityId: params.assetId,
      beforeValue: "",
      afterValue: "",
      error: automaticAssetError,
      assetType: params.assetType,
      assetId: params.assetId,
      assetResourceName: assetResource,
      campaignId: target.campaignId ?? null,
    };
  }

  try {
    const response = await customer.mutateResources([
      buildAssetExtensionLinkOperation(auth, assetResource, params.assetType, target),
    ]);
    const responses = (response as unknown as MutateResourcesResponse)?.mutate_operation_responses ?? [];
    const resourceName = responses[0]?.[meta.resultKey]?.resource_name as string | undefined;
    const link = linkFromResponse(
      target,
      assetResource,
      resourceName ?? `${meta.entity} link for ${assetResource}`,
    );

    return {
      success: true,
      action: params.action,
      entityId: params.assetId,
      beforeValue: "",
      afterValue: link.resourceName,
      label: params.label ?? `${params.assetType} asset ${params.assetId}`,
      assetType: params.assetType,
      assetId: params.assetId,
      assetResourceName: assetResource,
      linksCreated: [link],
      campaignId: target.campaignId ?? null,
    };
  } catch (error) {
    return {
      success: false,
      action: params.action,
      entityId: params.assetId,
      beforeValue: "",
      afterValue: "",
      error: extractErrorMessage(error),
      assetType: params.assetType,
      assetId: params.assetId,
      assetResourceName: assetResource,
      campaignId: target.campaignId ?? null,
    };
  }
}

export async function createAssetExtensionWithLinks(
  auth: AuthContext,
  params: {
    assetType: AssetExtensionType;
    assetResource: Record<string, unknown>;
    targets: AssetExtensionTarget[];
    action: string;
    afterValue: string;
    label?: string;
  },
): Promise<AssetExtensionMutationResult> {
  const customer = getCustomer(auth);
  const customerId = normalizeCustomerId(auth.customerId);
  const tempAssetResourceName = `customers/${customerId}/assets/-1`;
  const targets = normalizeAssetExtensionTargets(params.targets, false);

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
        buildAssetExtensionLinkOperation(auth, tempAssetResourceName, params.assetType, target),
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
        assetType: params.assetType,
        assetId: "",
        assetResourceName: "",
      };
    }

    const assetId = assetResource.split("/").pop() ?? "";
    const linksCreated = targets.map((target, index) => {
      const meta = LINK_TARGET[target.level];
      const resourceName = responses[index + 1]?.[meta.resultKey]?.resource_name as string | undefined;
      return linkFromResponse(
        target,
        assetResource,
        resourceName ?? `${meta.entity} link for ${assetResource}`,
      );
    });

    return {
      success: true,
      action: params.action,
      entityId: assetId,
      beforeValue: "",
      afterValue: params.afterValue,
      label: params.label ?? null,
      assetType: params.assetType,
      assetId,
      assetResourceName: assetResource,
      created: true,
      linksCreated,
      skipped: [],
      campaignId: targets.length === 1 ? targets[0].campaignId ?? null : null,
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
      assetType: params.assetType,
      assetId: "",
      assetResourceName: "",
      created: false,
      campaignId: targets.length === 1 ? targets[0].campaignId ?? null : null,
    };
  }
}

export async function removeAssetExtensionLink(
  auth: AuthContext,
  params: {
    assetType: AssetExtensionType;
    assetId: string;
    target: AssetExtensionTarget;
    action: string;
    label?: string;
  },
): Promise<AssetExtensionMutationResult> {
  const customer = getCustomer(auth);
  const assetResource = assetResourceName(auth, params.assetId);
  const target = normalizeAssetExtensionTarget(params.target);
  const meta = LINK_TARGET[target.level];
  const fieldType = params.assetType;
  const targetFilter = buildTargetFilter(auth, target);

  try {
    const linkResult = await customer.query(`
      SELECT ${meta.entity}.resource_name
      FROM ${meta.entity}
      WHERE ${meta.entity}.asset = '${assetResource}'
        AND ${meta.entity}.field_type = ${fieldType}
        AND ${meta.entity}.status != REMOVED
        ${targetFilter}
      LIMIT 1
    `);
    const linkResource = (linkResult as AssetExtensionLinkRow[])[0]?.[meta.entity]?.resource_name;
    if (!linkResource) {
      return {
        success: false,
        action: params.action,
        entityId: params.assetId,
        beforeValue: "",
        afterValue: "",
        error: `No ${fieldType} ${target.level} link found for asset ${params.assetId}`,
        assetType: params.assetType,
        assetId: params.assetId,
        assetResourceName: assetResource,
        campaignId: target.campaignId ?? null,
      };
    }

    const operations = [
      {
        entity: meta.entity,
        operation: "remove" as const,
        resource: linkResource,
      },
    ] as unknown as Parameters<typeof customer.mutateResources>[0];
    await customer.mutateResources(operations);

    return {
      success: true,
      action: params.action,
      entityId: params.assetId,
      beforeValue: linkResource,
      afterValue: "",
      label: params.label ?? null,
      assetType: params.assetType,
      assetId: params.assetId,
      assetResourceName: assetResource,
      linksRemoved: [linkFromResponse(target, assetResource, linkResource)],
      campaignId: target.campaignId ?? null,
    };
  } catch (error) {
    return {
      success: false,
      action: params.action,
      entityId: params.assetId,
      beforeValue: "",
      afterValue: "",
      error: extractErrorMessage(error),
      assetType: params.assetType,
      assetId: params.assetId,
      assetResourceName: assetResource,
      campaignId: target.campaignId ?? null,
    };
  }
}

function buildTargetFilter(auth: AuthContext, target: AssetExtensionTarget): string {
  const customerId = normalizeCustomerId(auth.customerId);
  if (target.level === "account") return "";
  if (target.level === "campaign") {
    return `AND campaign_asset.campaign = 'customers/${customerId}/campaigns/${target.campaignId}'`;
  }
  return `AND ad_group_asset.ad_group = 'customers/${customerId}/adGroups/${target.adGroupId}'`;
}
