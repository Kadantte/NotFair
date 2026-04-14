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

import { getCachedCustomer, getCustomer } from "./client";
import { extractErrorMessage, normalizeCustomerId } from "./helpers";
import type { AuthContext, WriteResult } from "./types";

// AssetFieldType enum: CALLOUT = 11 (per google-ads-api build/src/protos/autogen/enums.js)
const CALLOUT_FIELD_TYPE = 11;

// ─── Reads ──────────────────────────────────────────────────────────

export type CalloutAsset = {
  assetId: string;
  resourceName: string;
  text: string;
  linkedAtAccount: boolean;
  accountLinkResourceName: string | null;
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
  for (const row of linksResult as any[]) {
    const assetResource = row.customer_asset?.asset;
    const linkResource = row.customer_asset?.resource_name;
    if (assetResource && linkResource) linkByAsset.set(assetResource, linkResource);
  }

  return (assetsResult as any[]).map((row) => {
    const assetResource = row.asset?.resource_name as string;
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
  const customer = getCustomer(auth);
  const customerId = normalizeCustomerId(auth.customerId);
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

  try {
    // Step 1: create the asset
    const assetResponse = await customer.mutateResources([
      {
        entity: "asset" as any,
        operation: "create",
        resource: {
          callout_asset: { callout_text: text },
        },
      },
    ]);

    const responses = (assetResponse as any)?.mutate_operation_responses ?? [];
    const assetResourceName = responses[0]?.asset_result?.resource_name as string | undefined;
    if (!assetResourceName) {
      return {
        success: false,
        action: "create_callout_asset",
        entityId: "",
        beforeValue: "",
        afterValue: text,
        error: "Asset created but no resource_name returned",
      };
    }
    const assetId = assetResourceName.split("/").pop() ?? "";

    // Step 2: optionally link to the customer (account-level)
    if (params.linkToAccount) {
      await customer.mutateResources([
        {
          entity: "customer_asset" as any,
          operation: "create",
          resource: {
            asset: assetResourceName,
            field_type: CALLOUT_FIELD_TYPE,
          },
        },
      ]);
    }

    return {
      success: true,
      action: "create_callout_asset",
      entityId: assetId,
      beforeValue: "",
      afterValue: text,
      label: text,
    };
  } catch (error) {
    return {
      success: false,
      action: "create_callout_asset",
      entityId: "",
      beforeValue: "",
      afterValue: text,
      error: extractErrorMessage(error),
    };
  }
}

/** Link an existing callout asset to the customer (account level). */
export async function linkCalloutToAccount(
  auth: AuthContext,
  assetId: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const customerId = normalizeCustomerId(auth.customerId);
  const assetResourceName = `customers/${customerId}/assets/${assetId}`;

  try {
    const response = await customer.mutateResources([
      {
        entity: "customer_asset" as any,
        operation: "create",
        resource: {
          asset: assetResourceName,
          field_type: CALLOUT_FIELD_TYPE,
        },
      },
    ]);

    const responses = (response as any)?.mutate_operation_responses ?? [];
    const linkResource = responses[0]?.customer_asset_result?.resource_name as string | undefined;

    return {
      success: true,
      action: "link_callout_to_account",
      entityId: assetId,
      beforeValue: "",
      afterValue: linkResource ?? `customer_asset for asset ${assetId}`,
    };
  } catch (error) {
    return {
      success: false,
      action: "link_callout_to_account",
      entityId: assetId,
      beforeValue: "",
      afterValue: "",
      error: extractErrorMessage(error),
    };
  }
}

/**
 * Remove a callout's account-level link. The underlying asset is not deleted
 * (Google Ads assets are immutable/shared); only the customer_asset link is removed.
 */
export async function removeCalloutFromAccount(
  auth: AuthContext,
  assetId: string,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const customerId = normalizeCustomerId(auth.customerId);
  const assetResourceName = `customers/${customerId}/assets/${assetId}`;

  try {
    // Find the customer_asset link for this asset at CALLOUT field_type
    const linkResult = await customer.query(`
      SELECT customer_asset.resource_name
      FROM customer_asset
      WHERE customer_asset.asset = '${assetResourceName}'
        AND customer_asset.field_type = CALLOUT
        AND customer_asset.status != REMOVED
      LIMIT 1
    `);
    const linkResource = (linkResult as any[])[0]?.customer_asset?.resource_name as string | undefined;
    if (!linkResource) {
      return {
        success: false,
        action: "remove_callout_from_account",
        entityId: assetId,
        beforeValue: "",
        afterValue: "",
        error: `No account-level callout link found for asset ${assetId}`,
      };
    }

    await customer.mutateResources([
      {
        entity: "customer_asset" as any,
        operation: "remove",
        resource: linkResource as any,
      },
    ]);

    return {
      success: true,
      action: "remove_callout_from_account",
      entityId: assetId,
      beforeValue: linkResource,
      afterValue: "",
    };
  } catch (error) {
    return {
      success: false,
      action: "remove_callout_from_account",
      entityId: assetId,
      beforeValue: "",
      afterValue: "",
      error: extractErrorMessage(error),
    };
  }
}
