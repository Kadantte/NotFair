import dns from "node:dns/promises";
import net from "node:net";
import { getCustomer } from "./client";
import { extractErrorMessage, normalizeCustomerId, safeEntityId } from "./helpers";
import type { AuthContext, WriteResult } from "./types";

export type ImageAssetFieldType = "MARKETING_IMAGE" | "SQUARE_MARKETING_IMAGE";
export type ImageAssetMimeType = "IMAGE_JPEG" | "IMAGE_PNG";
export type LinkImageAssetLevel = "customer" | "campaign" | "ad_group" | "asset_group";

export type ImageDimensions = {
  width: number;
  height: number;
};

export type FetchedImageAsset = {
  imageBytes: Buffer;
  mimeType: ImageAssetMimeType;
  dimensions: ImageDimensions;
};

type MutateResultRecord = { resource_name?: string };
type MutateResourcesResponse = {
  mutate_operation_responses?: Array<Record<string, MutateResultRecord | undefined>>;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIME_TYPE: Record<ImageAssetMimeType, number> = {
  IMAGE_JPEG: 2,
  IMAGE_PNG: 4,
};
const ASSET_FIELD_TYPE: Record<ImageAssetFieldType, number> = {
  MARKETING_IMAGE: 5,
  SQUARE_MARKETING_IMAGE: 19,
};

const PRIVATE_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);
const LINK_TARGET: Record<LinkImageAssetLevel, {
  entity: string;
  resultKey: string;
  requiredParam: "campaignId" | "adGroupId" | "assetGroupId" | null;
  idLabel: string;
  resourceField: "campaign" | "ad_group" | "asset_group" | null;
  resourceCollection: "campaigns" | "adGroups" | "assetGroups" | null;
}> = {
  customer: {
    entity: "customer_asset",
    resultKey: "customer_asset_result",
    requiredParam: null,
    idLabel: "customer",
    resourceField: null,
    resourceCollection: null,
  },
  campaign: {
    entity: "campaign_asset",
    resultKey: "campaign_asset_result",
    requiredParam: "campaignId",
    idLabel: "campaign",
    resourceField: "campaign",
    resourceCollection: "campaigns",
  },
  ad_group: {
    entity: "ad_group_asset",
    resultKey: "ad_group_asset_result",
    requiredParam: "adGroupId",
    idLabel: "ad group",
    resourceField: "ad_group",
    resourceCollection: "adGroups",
  },
  asset_group: {
    entity: "asset_group_asset",
    resultKey: "asset_group_asset_result",
    requiredParam: "assetGroupId",
    idLabel: "asset group",
    resourceField: "asset_group",
    resourceCollection: "assetGroups",
  },
};

function isPrivateIp(address: string): boolean {
  const kind = net.isIP(address);
  if (kind === 4) {
    const parts = address.split(".").map(Number);
    const [a = 0, b = 0] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a === 0
    );
  }
  if (kind === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }
  return false;
}

async function assertSafeImageUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("imageUrl must be a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("imageUrl must be an HTTPS URL");
  }
  const hostname = url.hostname.toLowerCase();
  if (PRIVATE_HOSTNAMES.has(hostname) || isPrivateIp(hostname)) {
    throw new Error("imageUrl cannot point to localhost or private network addresses");
  }

  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (records.some((record) => isPrivateIp(record.address))) {
    throw new Error("imageUrl resolved to a private network address");
  }
  return url;
}

function detectMimeType(bytes: Buffer, contentType?: string | null): ImageAssetMimeType | null {
  if (bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return "IMAGE_PNG";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "IMAGE_JPEG";
  }
  const normalized = (contentType ?? "").split(";")[0]?.trim().toLowerCase();
  if (normalized === "image/png") return "IMAGE_PNG";
  if (normalized === "image/jpeg" || normalized === "image/jpg") return "IMAGE_JPEG";
  return null;
}

function readPngDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.length < 24) return null;
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null;
  if (bytes.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function readJpegDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    const segmentStart = offset + 2;
    const isStartOfFrame = (
      marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3 ||
      marker === 0xc5 || marker === 0xc6 || marker === 0xc7 ||
      marker === 0xc9 || marker === 0xca || marker === 0xcb ||
      marker === 0xcd || marker === 0xce || marker === 0xcf
    );
    if (isStartOfFrame && segmentStart + 5 <= bytes.length) {
      return {
        height: bytes.readUInt16BE(segmentStart + 1),
        width: bytes.readUInt16BE(segmentStart + 3),
      };
    }
    offset += length;
  }
  return null;
}

function readImageDimensions(bytes: Buffer, mimeType: ImageAssetMimeType): ImageDimensions | null {
  return mimeType === "IMAGE_PNG" ? readPngDimensions(bytes) : readJpegDimensions(bytes);
}

function validateImageAssetInput(
  imageBytes: Buffer,
  mimeType: ImageAssetMimeType,
  fieldType: ImageAssetFieldType,
): { dimensions?: ImageDimensions; error?: string } {
  if (imageBytes.length === 0) return { error: "Image file is empty" };
  if (imageBytes.length > MAX_IMAGE_BYTES) return { error: "Image file must be 5 MB or smaller" };

  const dimensions = readImageDimensions(imageBytes, mimeType);
  if (!dimensions) return { error: "Could not read image dimensions; use a valid PNG or JPEG" };
  const { width, height } = dimensions;

  if (fieldType === "SQUARE_MARKETING_IMAGE") {
    if (width < 300 || height < 300) return { dimensions, error: "SQUARE_MARKETING_IMAGE must be at least 300x300" };
    if (width !== height) return { dimensions, error: "SQUARE_MARKETING_IMAGE must be exactly 1:1" };
  } else {
    if (width < 600 || height < 314) return { dimensions, error: "MARKETING_IMAGE must be at least 600x314" };
    if (width * 157 !== height * 300) {
      return { dimensions, error: "MARKETING_IMAGE must be exactly 1.91:1, e.g. 1200x628" };
    }
  }
  return { dimensions };
}

export async function fetchImageAssetFromUrl(imageUrl: string): Promise<FetchedImageAsset> {
  let url = await assertSafeImageUrl(imageUrl);
  let response: Response | null = null;

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    response = await fetch(url, { redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) break;
    url = await assertSafeImageUrl(new URL(location, url).toString());
  }

  if (!response || !response.ok) {
    throw new Error(`Could not fetch imageUrl: HTTP ${response?.status ?? "unknown"}`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_IMAGE_BYTES) throw new Error("Image file must be 5 MB or smaller");

  const imageBytes = Buffer.from(await response.arrayBuffer());
  if (imageBytes.length > MAX_IMAGE_BYTES) throw new Error("Image file must be 5 MB or smaller");
  const mimeType = detectMimeType(imageBytes, response.headers.get("content-type"));
  if (!mimeType) throw new Error("Image must be a PNG or JPEG");
  const dimensions = readImageDimensions(imageBytes, mimeType);
  if (!dimensions) throw new Error("Could not read image dimensions; use a valid PNG or JPEG");
  return { imageBytes, mimeType, dimensions };
}

export async function createImageAsset(
  auth: AuthContext,
  params: {
    imageBytes: Buffer;
    mimeType: ImageAssetMimeType;
    fieldType: ImageAssetFieldType;
    name: string;
  },
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const name = params.name.trim();
  const { dimensions, error } = validateImageAssetInput(params.imageBytes, params.mimeType, params.fieldType);

  if (!name) {
    return { success: false, action: "create_image_asset", entityId: "", beforeValue: "", afterValue: "", error: "Image asset name cannot be empty" };
  }
  if (error) {
    return { success: false, action: "create_image_asset", entityId: "", beforeValue: "", afterValue: name, error };
  }

  try {
    const operations = [
      {
        entity: "asset",
        operation: "create",
        resource: {
          name,
          image_asset: {
            data: params.imageBytes,
            mime_type: MIME_TYPE[params.mimeType],
          },
        },
      },
    ] as Parameters<typeof customer.mutateResources>[0];
    const response = await customer.mutateResources(operations);

    const responses = (response as unknown as MutateResourcesResponse)?.mutate_operation_responses ?? [];
    const assetResourceName = responses[0]?.asset_result?.resource_name as string | undefined;
    if (!assetResourceName) {
      return {
        success: false,
        action: "create_image_asset",
        entityId: "",
        beforeValue: "",
        afterValue: name,
        error: "Image asset created but no resource_name returned",
      };
    }

    const assetId = assetResourceName.split("/").pop() ?? "";
    return {
      success: true,
      action: "create_image_asset",
      entityId: assetId,
      beforeValue: "",
      afterValue: `${name} (${params.fieldType}, ${dimensions?.width ?? "?"}x${dimensions?.height ?? "?"})`,
      label: name,
    };
  } catch (error) {
    return {
      success: false,
      action: "create_image_asset",
      entityId: "",
      beforeValue: "",
      afterValue: name,
      error: extractErrorMessage(error),
    };
  }
}

export async function linkImageAsset(
  auth: AuthContext,
  params: {
    assetId: string;
    fieldType: ImageAssetFieldType;
    level: LinkImageAssetLevel;
    campaignId?: string;
    adGroupId?: string;
    assetGroupId?: string;
  },
): Promise<WriteResult> {
  const customer = getCustomer(auth);
  const customerId = normalizeCustomerId(auth.customerId);
  const assetId = String(safeEntityId(params.assetId, "asset"));
  const asset = `customers/${customerId}/assets/${assetId}`;
  const fieldType = ASSET_FIELD_TYPE[params.fieldType];
  const target = LINK_TARGET[params.level];
  const resource: Record<string, unknown> = { asset, field_type: fieldType };
  let targetLabel = "customer";

  if (target.requiredParam) {
    const targetId = params[target.requiredParam];
    if (!targetId) {
      return {
        success: false,
        action: "link_image_asset",
        entityId: assetId,
        beforeValue: "",
        afterValue: "",
        error: `${target.requiredParam} is required when level is ${params.level}`,
      };
    }
    const id = safeEntityId(targetId, target.idLabel);
    resource[target.resourceField!] = `customers/${customerId}/${target.resourceCollection}/${id}`;
    targetLabel = `${target.idLabel} ${id}`;
  }

  try {
    const operations = [
      {
        entity: target.entity,
        operation: "create",
        resource,
      },
    ] as Parameters<typeof customer.mutateResources>[0];
    const response = await customer.mutateResources(operations);
    const responses = (response as unknown as MutateResourcesResponse)?.mutate_operation_responses ?? [];
    const linkResource = responses[0]?.[target.resultKey]?.resource_name as string | undefined;

    return {
      success: true,
      action: "link_image_asset",
      entityId: assetId,
      beforeValue: "",
      afterValue: linkResource ?? `${params.fieldType} image asset ${assetId} linked to ${targetLabel}`,
      label: `${params.fieldType} image ${assetId}`,
      campaignId: params.campaignId ?? null,
    };
  } catch (error) {
    return {
      success: false,
      action: "link_image_asset",
      entityId: assetId,
      beforeValue: "",
      afterValue: "",
      error: extractErrorMessage(error),
    };
  }
}
