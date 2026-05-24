/**
 * Price assets (price extensions).
 *
 * Price assets display a table of products or services with prices in search
 * ads. In the Google Ads API they are modeled as `asset` resources with
 * `asset.price_asset`, then linked at the customer (account), campaign, or
 * ad-group level via `customer_asset`, `campaign_asset`, or `ad_group_asset`.
 *
 * Requirements:
 *  - 3–8 price offerings per asset
 *  - Each offering: header ≤25 chars, description ≤25 chars, amountMicros ≥0,
 *    currencyCode (3-letter ISO 4217), finalUrl
 *  - language_code required (e.g. "en")
 *  - type required (PriceExtensionType)
 */

import {
  createAssetWithLinks,
  type AssetLinkMutationResult,
  type AssetLinkTarget,
} from "./asset-links";
import type { AuthContext } from "./types";

// ─── Constants ──────────────────────────────────────────────────────

export const PRICE_EXTENSION_TYPES = [
  "BRANDS",
  "EVENTS",
  "LOCATIONS",
  "NEIGHBORHOODS",
  "PRODUCT_CATEGORIES",
  "PRODUCT_TIERS",
  "SERVICES",
  "SERVICE_CATEGORIES",
  "SERVICE_TIERS",
] as const;

export type PriceExtensionType = (typeof PRICE_EXTENSION_TYPES)[number];

export const PRICE_EXTENSION_PRICE_UNITS = [
  "PER_HOUR",
  "PER_DAY",
  "PER_WEEK",
  "PER_MONTH",
  "PER_YEAR",
  "PER_NIGHT",
] as const;

export type PriceExtensionPriceUnit = (typeof PRICE_EXTENSION_PRICE_UNITS)[number];

export const PRICE_EXTENSION_PRICE_QUALIFIERS = ["FROM", "UP_TO", "AVERAGE"] as const;

export type PriceExtensionPriceQualifier = (typeof PRICE_EXTENSION_PRICE_QUALIFIERS)[number];

// ─── Types ──────────────────────────────────────────────────────────

export type PriceOffering = {
  header: string;
  description: string;
  /** Price amount in micros (1 USD = 1_000_000). Must be ≥ 0. */
  amountMicros: number;
  currencyCode: string;
  finalUrl: string;
  unit?: PriceExtensionPriceUnit;
};

export type CreatePriceAssetParams = {
  type: PriceExtensionType;
  languageCode: string;
  priceOfferings: PriceOffering[];
  priceQualifier?: PriceExtensionPriceQualifier;
  targets?: AssetLinkTarget[];
};

// ─── Validation ─────────────────────────────────────────────────────

function validatePriceOffering(offering: PriceOffering, index: number): string | null {
  const header = offering.header.trim();
  if (!header) return `Offering[${index}]: header cannot be empty`;
  if (header.length > 25) return `Offering[${index}]: header "${header}" exceeds 25 characters (${header.length})`;

  const description = offering.description.trim();
  if (!description) return `Offering[${index}]: description cannot be empty`;
  if (description.length > 25) return `Offering[${index}]: description "${description}" exceeds 25 characters (${description.length})`;

  if (!Number.isInteger(offering.amountMicros) || offering.amountMicros < 0) {
    return `Offering[${index}]: amountMicros must be a non-negative integer (got ${offering.amountMicros})`;
  }

  const currencyCode = offering.currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    return `Offering[${index}]: currencyCode must be a 3-letter ISO 4217 code (got "${offering.currencyCode}")`;
  }

  if (!offering.finalUrl || !offering.finalUrl.startsWith("http")) {
    return `Offering[${index}]: finalUrl is required and must be a valid URL`;
  }

  return null;
}

// ─── Writes ─────────────────────────────────────────────────────────

/**
 * Create a price asset (3–8 offerings with header, description, price, URL).
 * With `targets`, also link it at customer/campaign/ad-group levels in the
 * same atomic mutate. Without `targets`, the asset is created but not linked
 * — use `linkAsset` later.
 */
export async function createPriceAsset(
  auth: AuthContext,
  params: CreatePriceAssetParams,
): Promise<AssetLinkMutationResult> {
  const action = "create_price_asset";
  const fieldType = "PRICE";

  const offerings = params.priceOfferings;
  if (!offerings || offerings.length < 3 || offerings.length > 8) {
    return {
      success: false,
      action,
      entityId: "",
      beforeValue: "",
      afterValue: JSON.stringify({ type: params.type, offeringsCount: offerings?.length ?? 0 }),
      error: `Price assets require 3–8 price offerings. You provided ${offerings?.length ?? 0}.`,
      fieldType,
      assetId: "",
      assetResourceName: "",
    };
  }

  for (let i = 0; i < offerings.length; i++) {
    const error = validatePriceOffering(offerings[i], i);
    if (error) {
      return {
        success: false,
        action,
        entityId: "",
        beforeValue: "",
        afterValue: JSON.stringify({ type: params.type }),
        error,
        fieldType,
        assetId: "",
        assetResourceName: "",
      };
    }
  }

  const languageCode = params.languageCode.trim();
  if (!languageCode) {
    return {
      success: false,
      action,
      entityId: "",
      beforeValue: "",
      afterValue: "",
      error: "languageCode cannot be empty (e.g. 'en')",
      fieldType,
      assetId: "",
      assetResourceName: "",
    };
  }

  const priceAssetResource: Record<string, unknown> = {
    type: params.type,
    language_code: languageCode,
    price_offerings: offerings.map((o) => {
      const offering: Record<string, unknown> = {
        header: o.header.trim(),
        description: o.description.trim(),
        price: {
          amount_micros: o.amountMicros,
          currency_code: o.currencyCode.trim().toUpperCase(),
        },
        final_urls: [o.finalUrl],
      };
      if (o.unit) offering.unit = o.unit;
      return offering;
    }),
  };
  if (params.priceQualifier) {
    priceAssetResource.price_qualifier = params.priceQualifier;
  }

  const label = `${params.type}: ${offerings.map((o) => o.header).join(", ")}`;

  return createAssetWithLinks(auth, {
    fieldType,
    assetResource: { price_asset: priceAssetResource },
    targets: params.targets ?? [],
    action,
    afterValue: label,
    label,
  });
}
