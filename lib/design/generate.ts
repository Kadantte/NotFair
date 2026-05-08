import "server-only";

import { GoogleGenAI } from "@google/genai";

export const DEFAULT_MODEL = "gemini-3-pro-image-preview";

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

export type ImageResolution = "1K" | "2K" | "4K";

export type GenerateImageOptions = {
  prompt: string;
  model?: string;
  aspectRatio?: AspectRatio;
  resolution?: ImageResolution;
};

export type GenerateImageResult = {
  buffer: Buffer;
  mimeType: string;
  model: string;
  aspectRatio: AspectRatio | null;
  resolution: ImageResolution;
  bytes: number;
  modelText: string | null;
};

/**
 * Generate an image using the Gemini image model.
 *
 * No disk writes — returns a Buffer so the caller can pipe it to
 * Vercel Blob or return it directly. Uses the server-side GEMINI_API_KEY
 * env var; callers must NOT pass user-supplied API keys here.
 */
export async function generateImage(opts: GenerateImageOptions): Promise<GenerateImageResult> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is not configured on the server.");
  }

  const model = opts.model ?? DEFAULT_MODEL;
  const resolution: ImageResolution = opts.resolution ?? "1K";
  const ai = new GoogleGenAI({ apiKey });

  const imageConfig: Record<string, unknown> = { imageSize: resolution };
  if (opts.aspectRatio) {
    // Gemini does not support "1.91:1" — map to "16:9" for API compat.
    imageConfig.aspectRatio = opts.aspectRatio === "1.91:1" ? "16:9" : opts.aspectRatio;
  }

  const response = await ai.models.generateContent({
    model,
    contents: opts.prompt,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig,
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const textParts: string[] = [];

  for (const part of parts) {
    if ("text" in part && part.text) {
      textParts.push(part.text as string);
      continue;
    }
    if ("inlineData" in part && (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData?.data) {
      const inlineData = (part as { inlineData: { data: string; mimeType?: string } }).inlineData;
      const buffer = Buffer.from(inlineData.data, "base64");
      const mimeType = inlineData.mimeType ?? "image/png";
      return {
        buffer,
        mimeType,
        model,
        aspectRatio: opts.aspectRatio ?? null,
        resolution,
        bytes: buffer.length,
        modelText: textParts.join("\n").trim() || null,
      };
    }
  }

  throw new Error("Gemini response did not include image data. The model may not support image generation in this configuration.");
}
