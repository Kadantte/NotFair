/**
 * Call assets (phone number extensions).
 *
 * Call assets display a phone number in search ads and enable call tracking.
 * In the Google Ads API they are modeled as `asset` resources with
 * `asset.call_asset`, then linked at the customer (account), campaign, or
 * ad-group level via `customer_asset`, `campaign_asset`, or `ad_group_asset`.
 *
 * Note: asset_group (Performance Max) is NOT supported for CALL assets —
 * `AssetFieldType.CALL = 16` is an extension type, not a PMax asset type.
 */

import {
  createAssetWithLinks,
  type AssetLinkMutationResult,
  type AssetLinkTarget,
} from "./asset-links";
import type { AuthContext } from "./types";

// ─── Types ──────────────────────────────────────────────────────────

/**
 * Valid values for `call_conversion_reporting_state` in the wire format.
 * The proto enum is stored as a string name in the Google Ads API library
 * (same pattern as other GAQL string enums).
 */
export const CALL_CONVERSION_REPORTING_STATES = [
  "DISABLED",
  "USE_ACCOUNT_LEVEL_CALL_CONVERSION_ACTION",
  "USE_RESOURCE_LEVEL_CALL_CONVERSION_ACTION",
] as const;

export type CallConversionReportingState = (typeof CALL_CONVERSION_REPORTING_STATES)[number];

export type CreateCallAssetParams = {
  phoneNumber: string;
  countryCode: string;
  callConversionReportingState?: CallConversionReportingState;
  callConversionAction?: string;
  targets?: AssetLinkTarget[];
};

// ─── Writes ─────────────────────────────────────────────────────────

/**
 * Create a call asset (phone number + country code). With `targets`, also
 * link it at customer/campaign/ad-group levels in the same atomic mutate.
 * Without `targets`, the asset is created but not linked — use `linkAsset`
 * later.
 *
 * `callConversionReportingState` defaults to account-level tracking when
 * omitted; pass `USE_RESOURCE_LEVEL_CALL_CONVERSION_ACTION` together with
 * `callConversionAction` to route to a specific conversion action.
 */
export async function createCallAsset(
  auth: AuthContext,
  params: CreateCallAssetParams,
): Promise<AssetLinkMutationResult> {
  const phoneNumber = params.phoneNumber.trim();
  const countryCode = params.countryCode.trim().toUpperCase();
  const action = "create_call_asset";

  if (!phoneNumber) {
    return {
      success: false,
      action,
      entityId: "",
      beforeValue: "",
      afterValue: "",
      error: "Phone number cannot be empty",
      fieldType: "CALL",
      assetId: "",
      assetResourceName: "",
    };
  }

  if (!countryCode) {
    return {
      success: false,
      action,
      entityId: "",
      beforeValue: "",
      afterValue: "",
      error: "Country code cannot be empty",
      fieldType: "CALL",
      assetId: "",
      assetResourceName: "",
    };
  }

  if (
    params.callConversionReportingState !== undefined &&
    !CALL_CONVERSION_REPORTING_STATES.includes(params.callConversionReportingState)
  ) {
    return {
      success: false,
      action,
      entityId: "",
      beforeValue: "",
      afterValue: "",
      error: `Invalid callConversionReportingState "${params.callConversionReportingState}". Valid values: ${CALL_CONVERSION_REPORTING_STATES.join(", ")}`,
      fieldType: "CALL",
      assetId: "",
      assetResourceName: "",
    };
  }

  if (
    params.callConversionReportingState === "USE_RESOURCE_LEVEL_CALL_CONVERSION_ACTION" &&
    !params.callConversionAction
  ) {
    return {
      success: false,
      action,
      entityId: "",
      beforeValue: "",
      afterValue: "",
      error: "callConversionAction is required when callConversionReportingState is USE_RESOURCE_LEVEL_CALL_CONVERSION_ACTION",
      fieldType: "CALL",
      assetId: "",
      assetResourceName: "",
    };
  }

  const label = `${phoneNumber} (${countryCode})`;

  return createAssetWithLinks(auth, {
    fieldType: "CALL",
    assetResource: {
      call_asset: {
        phone_number: phoneNumber,
        country_code: countryCode,
        ...(params.callConversionReportingState !== undefined && {
          call_conversion_reporting_state: params.callConversionReportingState,
        }),
        ...(params.callConversionAction !== undefined && {
          call_conversion_action: params.callConversionAction,
        }),
      },
    },
    targets: params.targets ?? [],
    action,
    afterValue: label,
    label,
  });
}
