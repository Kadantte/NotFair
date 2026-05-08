import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getAppOrigin } from "@/lib/app-url";

export type UploadResult = {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
};

let _s3: S3Client | null = null;
function getS3Client(): S3Client {
  if (!_s3) {
    const region = process.env.AWS_REGION;
    if (!region) {
      throw new Error("AWS_REGION is not configured on the server.");
    }
    _s3 = new S3Client({ region });
  }
  return _s3;
}

// Default to png — Gemini almost always returns image/png.
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/png": "png",
};

function mimeTypeToExtension(mimeType: string): string {
  return MIME_TO_EXT[mimeType] ?? "png";
}

/**
 * Upload an image buffer to S3 and return the public URL.
 *
 * Object key pattern: `design/<userId>/<timestamp>-<random>.<ext>`
 *
 * Production path: PutObject to `AWS_S3_BUCKET` in `AWS_REGION`. The bucket
 * must have a policy granting `s3:GetObject` to the public for the
 * `design/*` prefix; this code does NOT set per-object ACLs (deprecated by
 * S3 Object Ownership defaults).
 *
 * Dev fallback: if `AWS_S3_BUCKET` is unset AND `NODE_ENV === "development"`,
 * write to `public/design-dev/<userId>/<file>.<ext>` so Next.js serves it
 * back at `${appOrigin}/design-dev/...` without any AWS setup.
 */
export async function uploadImage(
  buffer: Buffer,
  mimeType: string,
  userId: string,
): Promise<UploadResult> {
  const ext = mimeTypeToExtension(mimeType);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).slice(2, 8);
  const filename = `${timestamp}-${random}.${ext}`;
  const key = `design/${userId}/${filename}`;

  if (!process.env.AWS_S3_BUCKET && process.env.NODE_ENV === "development") {
    const absDir = path.join(process.cwd(), "public", "design-dev", userId);
    await mkdir(absDir, { recursive: true });
    await writeFile(path.join(absDir, filename), buffer);
    const urlPath = `/design-dev/${userId}/${filename}`;
    return {
      url: `${getAppOrigin()}${urlPath}`,
      pathname: urlPath,
      contentType: mimeType,
      size: buffer.length,
    };
  }

  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error("AWS_S3_BUCKET is not configured on the server.");
  }
  const region = process.env.AWS_REGION;
  if (!region) {
    throw new Error("AWS_REGION is not configured on the server.");
  }

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      // Generated images are content-addressed by random suffix and never
      // overwritten, so they can be cached aggressively at the edge.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return {
    url: `https://${bucket}.s3.${region}.amazonaws.com/${key}`,
    pathname: key,
    contentType: mimeType,
    size: buffer.length,
  };
}
