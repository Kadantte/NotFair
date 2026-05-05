import { getCachedCustomer } from "./client";
import {
  createAssetExtensionWithLinks,
  linkAssetExtension,
  normalizeAssetExtensionTargets,
  removeAssetExtensionLink,
  type AssetExtensionMutationResult,
  type AssetExtensionTarget,
} from "./asset-extensions";
import type { AuthContext, WriteResult } from "./types";

export const STRUCTURED_SNIPPET_HEADERS = [
  "Brands",
  "Amenities",
  "Styles",
  "Types",
  "Destinations",
  "Services",
  "Courses",
  "Neighborhoods",
  "Shows",
  "Insurance coverage",
  "Degree programs",
  "Featured Hotels",
  "Models",
] as const;

export type StructuredSnippetHeader = (typeof STRUCTURED_SNIPPET_HEADERS)[number];

export type StructuredSnippetAsset = {
  assetId: string;
  resourceName: string;
  header: string;
  values: string[];
  linkedAtAccount: boolean;
  accountLinkResourceName: string | null;
};

export type StructuredSnippetParams = {
  header: string;
  values: string[];
};

export type AddStructuredSnippetAssetParams = StructuredSnippetParams & {
  targets?: AssetExtensionTarget[];
};

type StructuredSnippetAssetRow = {
  asset?: {
    id?: string | number;
    resource_name?: string;
    structured_snippet_asset?: {
      header?: string;
      values?: string[];
    };
  };
};
type CustomerAssetLinkRow = {
  customer_asset?: {
    asset?: string;
    resource_name?: string;
  };
};

const VALID_HEADER_BY_LOWER = new Map(
  STRUCTURED_SNIPPET_HEADERS.map((header) => [header.toLowerCase(), header]),
);
const STRUCTURED_SNIPPET_HEADER_ALIASES = new Map<string, StructuredSnippetHeader>([
  ["service catalog", "Services"],
  ["featured hotels", "Featured Hotels"],
]);

function validHeaderList(): string {
  return STRUCTURED_SNIPPET_HEADERS.join(", ");
}

export function normalizeStructuredSnippetInput(
  params: StructuredSnippetParams,
): { header?: StructuredSnippetHeader; values?: string[]; error?: string } {
  const rawHeader = params.header.trim();
  const lookupHeader = rawHeader.toLowerCase();
  const header =
    (VALID_HEADER_BY_LOWER.get(lookupHeader) as StructuredSnippetHeader | undefined) ??
    STRUCTURED_SNIPPET_HEADER_ALIASES.get(lookupHeader);
  if (!header) {
    return {
      error: `"${rawHeader || "(empty)"}" is not a valid structured snippet header. Valid headers are: ${validHeaderList()}.`,
    };
  }

  const values = params.values.map((value) => value.trim()).filter(Boolean);
  const deduped = [...new Set(values)];
  if (deduped.length < 3 || deduped.length > 10) {
    return {
      error: `Structured snippets require 3 to 10 non-empty values. You provided ${deduped.length}.`,
    };
  }

  const tooLong = deduped.find((value) => value.length > 25);
  if (tooLong) {
    return {
      error: `Structured snippet value "${tooLong}" is ${tooLong.length} characters. Each value must be 25 characters or fewer.`,
    };
  }

  return { header, values: deduped };
}

export async function listStructuredSnippetAssets(auth: AuthContext): Promise<StructuredSnippetAsset[]> {
  const customer = getCachedCustomer(auth);

  const assetsResult = await customer.query(`
    SELECT
      asset.id,
      asset.resource_name,
      asset.structured_snippet_asset.header,
      asset.structured_snippet_asset.values
    FROM asset
    WHERE asset.type = STRUCTURED_SNIPPET
    LIMIT 500
  `);

  const linksResult = await customer.query(`
    SELECT
      customer_asset.asset,
      customer_asset.resource_name,
      customer_asset.field_type,
      customer_asset.status
    FROM customer_asset
    WHERE customer_asset.field_type = STRUCTURED_SNIPPET
      AND customer_asset.status != REMOVED
  `);

  const linkByAsset = new Map<string, string>();
  for (const row of linksResult as CustomerAssetLinkRow[]) {
    const assetResource = row.customer_asset?.asset;
    const linkResource = row.customer_asset?.resource_name;
    if (assetResource && linkResource) linkByAsset.set(assetResource, linkResource);
  }

  return (assetsResult as StructuredSnippetAssetRow[]).map((row) => {
    const assetResource = row.asset?.resource_name ?? "";
    const linkResource = linkByAsset.get(assetResource) ?? null;
    return {
      assetId: String(row.asset?.id ?? ""),
      resourceName: assetResource,
      header: row.asset?.structured_snippet_asset?.header ?? "",
      values: row.asset?.structured_snippet_asset?.values ?? [],
      linkedAtAccount: linkResource !== null,
      accountLinkResourceName: linkResource,
    };
  });
}

export async function createStructuredSnippetAsset(
  auth: AuthContext,
  params: StructuredSnippetParams & { linkToAccount?: boolean },
): Promise<WriteResult> {
  const normalized = normalizeStructuredSnippetInput(params);
  if (normalized.error) {
    return {
      success: false,
      action: "create_structured_snippet_asset",
      entityId: "",
      beforeValue: "",
      afterValue: JSON.stringify({ header: params.header, values: params.values }),
      error: normalized.error,
    };
  }

  const { header, values } = normalized as { header: StructuredSnippetHeader; values: string[] };

  return createAssetExtensionWithLinks(auth, {
    assetType: "STRUCTURED_SNIPPET",
    assetResource: {
      structured_snippet_asset: { header, values },
    },
    targets: params.linkToAccount ? [{ level: "account" }] : [],
    action: "create_structured_snippet_asset",
    afterValue: `${header}: ${values.join(", ")}`,
    label: header,
  });
}

export async function addStructuredSnippetAsset(
  auth: AuthContext,
  params: AddStructuredSnippetAssetParams,
): Promise<AssetExtensionMutationResult> {
  const normalized = normalizeStructuredSnippetInput(params);
  const targets = normalizeAssetExtensionTargets(params.targets);
  if (normalized.error) {
    return {
      success: false,
      action: "add_structured_snippet_asset",
      entityId: "",
      beforeValue: "",
      afterValue: JSON.stringify({ header: params.header, values: params.values }),
      error: normalized.error,
      assetType: "STRUCTURED_SNIPPET",
      assetId: "",
      assetResourceName: "",
    };
  }

  const { header, values } = normalized as { header: StructuredSnippetHeader; values: string[] };

  return createAssetExtensionWithLinks(auth, {
    assetType: "STRUCTURED_SNIPPET",
    assetResource: {
      structured_snippet_asset: { header, values },
    },
    targets,
    action: "add_structured_snippet_asset",
    afterValue: `${header}: ${values.join(", ")}`,
    label: header,
  });
}

export async function linkStructuredSnippetAsset(
  auth: AuthContext,
  params: { assetId: string; target: AssetExtensionTarget },
): Promise<AssetExtensionMutationResult> {
  return linkAssetExtension(auth, {
    assetType: "STRUCTURED_SNIPPET",
    assetId: params.assetId,
    target: params.target,
    action: "link_structured_snippet_asset",
  });
}

export async function unlinkStructuredSnippetAsset(
  auth: AuthContext,
  params: { assetId: string; target: AssetExtensionTarget },
): Promise<AssetExtensionMutationResult> {
  return removeAssetExtensionLink(auth, {
    assetType: "STRUCTURED_SNIPPET",
    assetId: params.assetId,
    target: params.target,
    action: "unlink_structured_snippet_asset",
  });
}
