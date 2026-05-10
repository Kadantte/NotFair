import dns from "node:dns/promises";
import net from "node:net";
import { createAssetWithLinks, type AssetLinkMutationResult, type AssetLinkTarget, type FieldTypeName } from "./asset-links";
import type { AuthContext } from "./types";

export type ImageAssetFieldType = Extract<FieldTypeName, "MARKETING_IMAGE" | "SQUARE_MARKETING_IMAGE">;
export type ImageAssetMimeType = "IMAGE_JPEG" | "IMAGE_PNG";

export type ImageDimensions = {
  width: number;
  height: number;
};

export type FetchedImageAsset = {
  imageBytes: Buffer;
  mimeType: ImageAssetMimeType;
  dimensions: ImageDimensions;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIME_TYPE: Record<ImageAssetMimeType, number> = {
  IMAGE_JPEG: 2,
  IMAGE_PNG: 4,
};

const PRIVATE_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

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
    if (width < 300 || height < 300) return { dimensions, error: `SQUARE_MARKETING_IMAGE must be at least 300x300; got ${width}x${height}. Retry with a square PNG/JPEG such as 1200x1200.` };
    if (width !== height) return { dimensions, error: `SQUARE_MARKETING_IMAGE must be exactly 1:1; got ${width}x${height}. Retry with a square PNG/JPEG such as 1200x1200.` };
  } else {
    if (width < 600 || height < 314) return { dimensions, error: `MARKETING_IMAGE must be at least 600x314; got ${width}x${height}. Retry with a landscape PNG/JPEG such as 1200x628.` };
    if (width * 157 !== height * 300) {
      return { dimensions, error: `MARKETING_IMAGE must be exactly 1.91:1; got ${width}x${height}. Retry with a landscape PNG/JPEG such as 1200x628, or use SQUARE_MARKETING_IMAGE for a 1:1 asset.` };
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
  if (!mimeType) throw new Error("Image must be a PNG or JPEG. Retry with a direct HTTPS URL to a PNG/JPEG file; convert WebP/SVG/HTML image pages to PNG or JPEG before calling createImageAsset.");
  const dimensions = readImageDimensions(imageBytes, mimeType);
  if (!dimensions) throw new Error("Could not read image dimensions; use a valid PNG or JPEG");
  return { imageBytes, mimeType, dimensions };
}

/**
 * Upload an image asset (and optionally link it to one or more serving targets
 * in the same atomic mutate). Without `targets`, only the asset is created —
 * use `linkAsset` later to attach it.
 */
export async function createImageAsset(
  auth: AuthContext,
  params: {
    imageBytes: Buffer;
    mimeType: ImageAssetMimeType;
    fieldType: ImageAssetFieldType;
    name: string;
    targets?: AssetLinkTarget[];
  },
): Promise<AssetLinkMutationResult> {
  const name = params.name.trim();
  const { dimensions, error } = validateImageAssetInput(params.imageBytes, params.mimeType, params.fieldType);
  const action = "create_image_asset";

  if (!name) {
    return {
      success: false,
      action,
      entityId: "",
      beforeValue: "",
      afterValue: "",
      error: "Image asset name cannot be empty",
      fieldType: params.fieldType,
      assetId: "",
      assetResourceName: "",
    };
  }
  if (error) {
    return {
      success: false,
      action,
      entityId: "",
      beforeValue: "",
      afterValue: name,
      error,
      fieldType: params.fieldType,
      assetId: "",
      assetResourceName: "",
    };
  }

  return createAssetWithLinks(auth, {
    fieldType: params.fieldType,
    assetResource: {
      name,
      image_asset: {
        data: params.imageBytes,
        mime_type: MIME_TYPE[params.mimeType],
      },
    },
    targets: params.targets ?? [],
    action,
    afterValue: `${name} (${params.fieldType}, ${dimensions?.width ?? "?"}x${dimensions?.height ?? "?"})`,
    label: name,
  });
}
