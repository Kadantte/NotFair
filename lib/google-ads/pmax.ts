import { getCachedCustomer, getCustomer, STATUS } from "./client";
import { extractErrorMessage, normalizeCustomerId, safeEntityId } from "./helpers";
import type { AuthContext, WriteResult } from "./types";

// ─── Types ───────────────────────────────────────────────────────────

export type PmaxAssetGroup = {
  id: string;
  name: string;
  status: string;
  finalUrls: string[];
  finalMobileUrls: string[];
};

export type PmaxAsset = {
  assetId: string;
  fieldType: string;
  status: string;
  assetType: string;
  text?: string;
  imageUrl?: string;
  videoId?: string;
  callToAction?: string;
  name?: string;
};

// Text fields first, then images, then video/CTA
const FIELD_ORDER: Record<string, number> = {
  HEADLINE: 1, LONG_HEADLINE: 2, DESCRIPTION: 3, BUSINESS_NAME: 4,
  MARKETING_IMAGE: 5, SQUARE_MARKETING_IMAGE: 6, PORTRAIT_MARKETING_IMAGE: 7,
  LOGO: 8, LANDSCAPE_LOGO: 9, YOUTUBE_VIDEO: 10, CALL_TO_ACTION_SELECTION: 11,
  SITELINK: 12, CALL: 13,
};

// ─── Read Functions ──────────────────────────────────────────────────

/**
 * List all asset groups in a Performance Max campaign.
 * Asset groups are the PMAX equivalent of ad groups — each contains a set
 * of headlines, descriptions, images, and videos that Google combines to
 * form ads across all eligible placements.
 */
export async function getPmaxAssetGroups(
  auth: AuthContext,
  campaignId: string,
  limit = 50,
): Promise<PmaxAssetGroup[]> {
  const customer = getCachedCustomer(auth);
  const id = safeEntityId(campaignId);
  const bounded = Math.min(Math.max(limit, 1), 100);

  const result = await customer.query(`
    SELECT
      asset_group.id,
      asset_group.name,
      asset_group.status,
      asset_group.final_urls,
      asset_group.final_mobile_urls
    FROM asset_group
    WHERE campaign.id = ${id}
      AND asset_group.status != 'REMOVED'
    ORDER BY asset_group.id ASC
    LIMIT ${bounded}
  `);

  return (result as any[]).map((row) => ({
    id: String(row.asset_group?.id ?? ""),
    name: row.asset_group?.name ?? "Untitled asset group",
    status: row.asset_group?.status ?? "UNKNOWN",
    finalUrls: row.asset_group?.final_urls ?? [],
    finalMobileUrls: row.asset_group?.final_mobile_urls ?? [],
  }));
}

/**
 * List all assets in a PMAX asset group, including text (headlines,
 * descriptions), images, videos, logos, and call-to-actions.
 * Asset group IDs are account-unique so no campaignId is needed.
 */
export async function getPmaxAssets(
  auth: AuthContext,
  assetGroupId: string,
  limit = 100,
): Promise<{ assetGroupId: string; assetGroupName: string; assets: PmaxAsset[] }> {
  const customer = getCachedCustomer(auth);
  const agid = safeEntityId(assetGroupId);
  const bounded = Math.min(Math.max(limit, 1), 200); // higher ceiling: many assets per group

  const result = await customer.query(`
    SELECT
      asset_group.id,
      asset_group.name,
      asset_group_asset.field_type,
      asset_group_asset.status,
      asset.id,
      asset.name,
      asset.type,
      asset.text_asset.text,
      asset.image_asset.full_size.url,
      asset.youtube_video_asset.youtube_video_id,
      asset.call_to_action_asset.call_to_action
    FROM asset_group_asset
    WHERE asset_group.id = ${agid}
      AND asset_group_asset.status != 'REMOVED'
    LIMIT ${bounded}
  `);

  const rows = result as any[];
  const assetGroupName = rows[0]?.asset_group?.name ?? "Untitled asset group";

  const assets: PmaxAsset[] = rows.map((row) => {
    const asset = row.asset ?? {};
    const fieldType = String(row.asset_group_asset?.field_type ?? "UNKNOWN");
    const assetType = String(asset.type ?? "UNKNOWN");
    const entry: PmaxAsset = {
      assetId: String(asset.id ?? ""),
      fieldType,
      status: String(row.asset_group_asset?.status ?? "UNKNOWN"),
      assetType,
      name: asset.name ?? undefined,
    };
    if (asset.text_asset?.text != null) entry.text = asset.text_asset.text;
    if (asset.image_asset?.full_size?.url != null) entry.imageUrl = asset.image_asset.full_size.url;
    if (asset.youtube_video_asset?.youtube_video_id != null) entry.videoId = asset.youtube_video_asset.youtube_video_id;
    if (asset.call_to_action_asset?.call_to_action != null) entry.callToAction = String(asset.call_to_action_asset.call_to_action);
    return entry;
  });

  assets.sort((a, b) => (FIELD_ORDER[a.fieldType] ?? 99) - (FIELD_ORDER[b.fieldType] ?? 99));

  return { assetGroupId, assetGroupName, assets };
}

// ─── Write Functions ─────────────────────────────────────────────────

async function mutateAssetGroupStatus(
  auth: AuthContext,
  campaignId: string,
  assetGroupId: string,
  targetStatus: typeof STATUS.PAUSED | typeof STATUS.ENABLED,
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  safeEntityId(campaignId);
  const agid = safeEntityId(assetGroupId);
  const cid = normalizeCustomerId(auth.customerId);
  const isPause = targetStatus === STATUS.PAUSED;
  const action = isPause ? "pause_pmax_asset_group" : "enable_pmax_asset_group";
  const beforeValue = isPause ? "ENABLED" : "PAUSED";
  const afterValue = isPause ? "PAUSED" : "ENABLED";

  try {
    await customer.mutateResources([
      {
        entity: "asset_group" as any,
        operation: "update",
        resource: {
          resource_name: `customers/${cid}/assetGroups/${agid}`,
          status: targetStatus,
        },
      },
    ]);

    return { success: true, action, entityId: String(agid), beforeValue, afterValue, campaignId };
  } catch (error) {
    return { success: false, action, entityId: String(agid), beforeValue, afterValue: beforeValue, campaignId, error: extractErrorMessage(error) };
  }
}

/**
 * Pause a PMAX asset group. When paused, Google stops serving ads from
 * this asset group while keeping the campaign and other asset groups active.
 */
export function pausePmaxAssetGroup(
  auth: AuthContext,
  campaignId: string,
  assetGroupId: string,
): Promise<WriteResult> {
  return mutateAssetGroupStatus(auth, campaignId, assetGroupId, STATUS.PAUSED);
}

export function enablePmaxAssetGroup(
  auth: AuthContext,
  campaignId: string,
  assetGroupId: string,
): Promise<WriteResult> {
  return mutateAssetGroupStatus(auth, campaignId, assetGroupId, STATUS.ENABLED);
}
