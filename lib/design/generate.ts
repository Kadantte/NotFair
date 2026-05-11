import "server-only";

export const DEFAULT_MODEL = "gpt-image-2";

export type AspectRatio =
  | "1:1"
  | "2:3"
  | "3:2"
  | "3:4"
  | "4:3"
  | "4:5"
  | "5:4"
  | "9:16"
  | "16:9"
  | "21:9"
  | "1.91:1";

export type ImageQuality = "auto" | "low" | "medium" | "high";
export type ImageOutputFormat = "png" | "jpeg" | "webp";
export type ImageBackground = "auto" | "transparent" | "opaque";

export type GenerateImageOptions = {
  prompt: string;
  model?: string;
  aspectRatio?: AspectRatio;
  /**
   * Explicit "WIDTHxHEIGHT" override. When provided, takes precedence over
   * aspectRatio. gpt-image-2 requires both dimensions divisible by 16,
   * aspect ratio between 1:3 and 3:1, and max 3840x2160.
   */
  size?: string;
  quality?: ImageQuality;
  outputFormat?: ImageOutputFormat;
  background?: ImageBackground;
};

export type GenerateImageResult = {
  buffer: Buffer;
  mimeType: string;
  model: string;
  aspectRatio: AspectRatio | null;
  size: string;
  quality: ImageQuality;
  outputFormat: ImageOutputFormat;
  bytes: number;
  revisedPrompt: string | null;
};

// gpt-image-2 documented size limit is 3840x2160 (8,294,400 px). Arbitrary
// sizes above 2560x1440 are flagged "experimental" in the API docs, so the
// cap is enforced by total pixel area, not per-dimension — a 3840x3840
// request is within neither.
const MAX_SIZE_PIXELS = 3840 * 2160;

/**
 * Map a user-facing aspect ratio to a gpt-image-2 native size string.
 * gpt-image-2 supports arbitrary 16-aligned sizes, but the three documented
 * native sizes (1024x1024, 1536x1024, 1024x1536) are most thoroughly tested
 * and avoid the "experimental resolution" path. We snap each ratio to the
 * nearest native size — exact landscape/portrait composition is preserved
 * by the model's framing, not by emitting bespoke widths.
 */
export function sizeFromAspectRatio(aspectRatio: AspectRatio): string {
  if (aspectRatio === "1:1") return "1024x1024";
  const [w, h] = aspectRatio.split(":").map(Number);
  return w >= h ? "1536x1024" : "1024x1536";
}

const VALID_SIZE = /^(\d+)x(\d+)$/;

function assertValidSize(size: string): void {
  const match = VALID_SIZE.exec(size);
  if (!match) {
    throw new Error(`Invalid size "${size}". Expected "WIDTHxHEIGHT" (e.g. "1024x1024").`);
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width % 16 !== 0 || height % 16 !== 0) {
    throw new Error(`Size ${size} is not supported: both dimensions must be divisible by 16.`);
  }
  const ratio = width / height;
  if (ratio < 1 / 3 || ratio > 3) {
    throw new Error(`Size ${size} aspect ratio is outside the supported 1:3 to 3:1 range.`);
  }
  if (width * height > MAX_SIZE_PIXELS) {
    throw new Error(`Size ${size} exceeds the maximum supported area of 3840x2160 (${MAX_SIZE_PIXELS} pixels).`);
  }
}

function mimeTypeFromOutputFormat(format: ImageOutputFormat): string {
  if (format === "png") return "image/png";
  if (format === "jpeg") return "image/jpeg";
  return "image/webp";
}

/**
 * Generate an image using OpenAI's GPT Image 2 model.
 *
 * Returns the decoded image as a Buffer — no disk writes — so the caller can
 * pipe it to Vercel Blob / S3 or stream it back directly. Uses the server's
 * OPENAI_API_KEY; callers must NOT pass user-supplied API keys here.
 *
 * gpt-image-2 always returns base64 (the API does not support
 * response_format=url for GPT Image models), so we read b64_json directly.
 */
export async function generateImage(opts: GenerateImageOptions): Promise<GenerateImageResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }

  const model = opts.model ?? DEFAULT_MODEL;
  // OpenAI's documented default is "auto" — we mirror that by omitting
  // `quality` from the body when the caller doesn't specify one, rather
  // than choosing a default on their behalf.
  const quality: ImageQuality = opts.quality ?? "auto";
  const outputFormat: ImageOutputFormat = opts.outputFormat ?? "png";
  const size = opts.size ?? (opts.aspectRatio ? sizeFromAspectRatio(opts.aspectRatio) : "1024x1024");
  assertValidSize(size);

  const body: OpenAiImageRequest = {
    model,
    prompt: opts.prompt,
    n: 1,
    size,
    quality,
    output_format: outputFormat,
  };
  if (opts.background) {
    body.background = opts.background;
  }

  // gpt-image-2 at quality="high" runs the four-stage Understand/Plan/
  // Generate/Review pipeline and can take 150–250s. We cap the upstream
  // call below the route's 300s maxDuration so timeouts surface as a
  // structured error rather than a Vercel function termination.
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(280_000),
  });

  if (!response.ok) {
    const text = (await response.text()).slice(0, 500);
    throw new Error(`OpenAI Images API failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as OpenAiImageResponse;
  const image = data.data?.[0];
  if (!image?.b64_json) {
    throw new Error("OpenAI Images API returned no image data.");
  }

  const buffer = Buffer.from(image.b64_json, "base64");
  return {
    buffer,
    mimeType: mimeTypeFromOutputFormat(outputFormat),
    model,
    aspectRatio: opts.aspectRatio ?? null,
    size,
    quality,
    outputFormat,
    bytes: buffer.length,
    revisedPrompt: image.revised_prompt ?? null,
  };
}

type OpenAiImageRequest = {
  model: string;
  prompt: string;
  n: number;
  size: string;
  quality: ImageQuality;
  output_format: ImageOutputFormat;
  background?: ImageBackground;
};

type OpenAiImageResponse = {
  data?: Array<{ b64_json?: string; revised_prompt?: string }>;
};
