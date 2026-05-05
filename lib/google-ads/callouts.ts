/**
 * Callout extensions (RMF C.75).
 *
 * Callouts are short (≤25 char) snippets that appear below text ads, e.g.
 * "Free shipping", "24/7 support". In the Google Ads API they are modeled
 * as `asset` resources with `asset.callout_asset`, then linked at the
 * customer (account), campaign, or ad-group level via `customer_asset`,
 * `campaign_asset`, or `ad_group_asset` respectively.
 *
 * RMF requires support at the **account level**, so we link via
 * `customer_asset` with `field_type = CALLOUT`.
 */

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

// ─── Reads ──────────────────────────────────────────────────────────

export type CalloutAsset = {
  assetId: string;
  resourceName: string;
  text: string;
  linkedAtAccount: boolean;
  accountLinkResourceName: string | null;
};

export type AddCalloutAssetParams = {
  text: string;
  targets?: AssetExtensionTarget[];
};

type CalloutAssetRow = {
  asset?: {
    id?: string | number;
    resource_name?: string;
    callout_asset?: { callout_text?: string };
  };
};
type CustomerAssetLinkRow = {
  customer_asset?: {
    asset?: string;
    resource_name?: string;
  };
};

/** List all callout assets on the account, with whether each is linked at the customer level. */
export async function listCalloutAssets(auth: AuthContext): Promise<CalloutAsset[]> {
  const customer = getCachedCustomer(auth);

  // 1. All CALLOUT-typed assets on the account.
  // GAQL enum literals are bare identifiers (no quotes).
  const assetsResult = await customer.query(`
    SELECT
      asset.id,
      asset.resource_name,
      asset.callout_asset.callout_text
    FROM asset
    WHERE asset.type = CALLOUT
    LIMIT 500
  `);

  // 2. All customer_asset links with field_type = CALLOUT, excluding REMOVED links
  // (Google Ads returns removed rows by default unless explicitly filtered.)
  const linksResult = await customer.query(`
    SELECT
      customer_asset.asset,
      customer_asset.resource_name,
      customer_asset.field_type,
      customer_asset.status
    FROM customer_asset
    WHERE customer_asset.field_type = CALLOUT
      AND customer_asset.status != REMOVED
  `);

  const linkByAsset = new Map<string, string>();
  for (const row of linksResult as CustomerAssetLinkRow[]) {
    const assetResource = row.customer_asset?.asset;
    const linkResource = row.customer_asset?.resource_name;
    if (assetResource && linkResource) linkByAsset.set(assetResource, linkResource);
  }

  return (assetsResult as CalloutAssetRow[]).map((row) => {
    const assetResource = row.asset?.resource_name ?? "";
    const linkResource = linkByAsset.get(assetResource) ?? null;
    return {
      assetId: String(row.asset?.id ?? ""),
      resourceName: assetResource,
      text: row.asset?.callout_asset?.callout_text ?? "",
      linkedAtAccount: linkResource !== null,
      accountLinkResourceName: linkResource,
    };
  });
}

// ─── Writes ─────────────────────────────────────────────────────────

/**
 * Create a callout asset. The asset must be separately linked to the customer,
 * a campaign, or an ad group before it will serve. For RMF compliance we
 * expose a convenience flag `linkToAccount` that also creates the customer_asset
 * link in the same call.
 */
export async function createCalloutAsset(
  auth: AuthContext,
  params: { text: string; linkToAccount?: boolean },
): Promise<WriteResult> {
  const text = params.text.trim();

  if (!text) {
    return {
      success: false,
      action: "create_callout_asset",
      entityId: "",
      beforeValue: "",
      afterValue: "",
      error: "Callout text cannot be empty",
    };
  }
  if (text.length > 25) {
    return {
      success: false,
      action: "create_callout_asset",
      entityId: "",
      beforeValue: "",
      afterValue: text,
      error: "Callout text must be 25 characters or fewer",
    };
  }

  return createAssetExtensionWithLinks(auth, {
    assetType: "CALLOUT",
    assetResource: {
      callout_asset: { callout_text: text },
    },
    targets: params.linkToAccount ? [{ level: "account" }] : [],
    action: "create_callout_asset",
    afterValue: text,
    label: text,
  });
}

/**
 * Agent-friendly callout workflow: create one callout asset and link it to
 * account/campaign/ad group targets in the same tool response.
 */
export async function addCalloutAsset(
  auth: AuthContext,
  params: AddCalloutAssetParams,
): Promise<AssetExtensionMutationResult> {
  const text = params.text.trim();
  const targets = normalizeAssetExtensionTargets(params.targets);

  if (!text) {
    return {
      success: false,
      action: "add_callout_asset",
      entityId: "",
      beforeValue: "",
      afterValue: "",
      error: "Callout text cannot be empty",
      assetType: "CALLOUT",
      assetId: "",
      assetResourceName: "",
    };
  }
  if (text.length > 25) {
    return {
      success: false,
      action: "add_callout_asset",
      entityId: "",
      beforeValue: "",
      afterValue: text,
      error: "Callout text must be 25 characters or fewer",
      assetType: "CALLOUT",
      assetId: "",
      assetResourceName: "",
    };
  }

  return createAssetExtensionWithLinks(auth, {
    assetType: "CALLOUT",
    assetResource: {
      callout_asset: { callout_text: text },
    },
    targets,
    action: "add_callout_asset",
    afterValue: text,
    label: text,
  });
}

export async function linkCalloutAsset(
  auth: AuthContext,
  params: { assetId: string; target: AssetExtensionTarget },
): Promise<AssetExtensionMutationResult> {
  return linkAssetExtension(auth, {
    assetType: "CALLOUT",
    assetId: params.assetId,
    target: params.target,
    action: "link_callout_asset",
  });
}

export async function unlinkCalloutAsset(
  auth: AuthContext,
  params: { assetId: string; target: AssetExtensionTarget },
): Promise<AssetExtensionMutationResult> {
  return removeAssetExtensionLink(auth, {
    assetType: "CALLOUT",
    assetId: params.assetId,
    target: params.target,
    action: "unlink_callout_asset",
  });
}

/** Link an existing callout asset to the customer (account level). */
export async function linkCalloutToAccount(
  auth: AuthContext,
  assetId: string,
): Promise<WriteResult> {
  return linkAssetExtension(auth, {
    assetType: "CALLOUT",
    assetId,
    target: { level: "account" },
    action: "link_callout_to_account",
  });
}

/**
 * Remove a callout's account-level link. The underlying asset is not deleted
 * (Google Ads assets are immutable/shared); only the customer_asset link is removed.
 */
export async function removeCalloutFromAccount(
  auth: AuthContext,
  assetId: string,
): Promise<WriteResult> {
  const result = await removeAssetExtensionLink(auth, {
    assetType: "CALLOUT",
    assetId,
    target: { level: "account" },
    action: "remove_callout_from_account",
  });

  if (!result.success && result.error?.startsWith("No CALLOUT account link")) {
    return { ...result, error: `No account-level callout link found for asset ${assetId}` };
  }
  return result;
}
