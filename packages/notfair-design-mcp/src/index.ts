#!/usr/bin/env node
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";

type Provider = "openai" | "nano_banana";
type UserStatus = "free" | "growth";

const DEFAULT_OPENAI_MODEL = "gpt-image-2";
const DEFAULT_NANO_BANANA_MODEL = "gemini-3-pro-image-preview";
const DEFAULT_OUT_DIR = "out";
const DEFAULT_PROVIDER: Provider = "nano_banana";
const DEFAULT_USER_ID = "local";
const MONTHLY_LIMITS: Record<UserStatus, number> = {
  free: 10,
  growth: 200,
};
const QUOTA_RESERVATION_TTL_MS = 60 * 60 * 1000;
const LOCK_RETRY_DELAY_MS = 50;
const LOCK_TIMEOUT_MS = 10_000;

const providerSchema = z.enum(["openai", "nano_banana"]);
const userStatusSchema = z.enum(["free", "growth"]);
const outputFormatSchema = z.enum(["png", "jpeg", "webp"]);
const openAiSizeSchema = z.enum([
  "auto",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "2048x2048",
  "2048x1152",
  "3840x2160",
  "2160x3840",
]);
const openAiQualitySchema = z.enum(["auto", "high", "medium", "low"]);
const backgroundSchema = z.enum(["auto", "transparent", "opaque"]);
const aspectRatioSchema = z.enum([
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
  "1.91:1",
]);
const nanoResolutionSchema = z.enum(["1K", "2K", "4K"]);
const usageReservationSchema = z.object({
  createdAt: z.string(),
});
const usageEntrySchema = z.object({
  userId: z.string(),
  month: z.string(),
  count: z.number().int().nonnegative().catch(0),
  reservations: z.record(z.string(), usageReservationSchema).optional().catch({}),
  updatedAt: z.string().optional(),
});
const usageStoreSchema = z.record(z.string(), usageEntrySchema).catch({});

const generateImageSchema = {
  prompt: z
    .string()
    .min(1)
    .max(32000)
    .describe("Image prompt. Include desired subject, style, composition, constraints, and text/no-text requirements."),
  provider: providerSchema
    .optional()
    .describe("Image provider. Defaults to NOTFAIR_DESIGN_PROVIDER or nano_banana."),
  model: z
    .string()
    .optional()
    .describe("Provider model override. OpenAI default is gpt-image-2. Nano Banana default is gemini-3-pro-image-preview."),
  outputPath: z
    .string()
    .optional()
    .describe("Relative file path to write under NOTFAIR_DESIGN_OUTPUT_DIR. Defaults to <timestamp>-<slug>.<format>."),
  allowAbsolutePath: z
    .boolean()
    .optional()
    .describe("Allow outputPath to be an absolute path outside NOTFAIR_DESIGN_OUTPUT_DIR. Defaults to false."),
  overwrite: z
    .boolean()
    .optional()
    .describe("Allow replacing an existing output file. Defaults to false."),
  outputFormat: outputFormatSchema
    .optional()
    .describe("OpenAI output format and output filename extension. Defaults to png."),
  size: openAiSizeSchema
    .optional()
    .describe("OpenAI size. Defaults to 1024x1024, or inferred from aspectRatio when provided. GPT Image 2 supports 2K/4K options listed here."),
  quality: openAiQualitySchema
    .optional()
    .describe("OpenAI quality. Defaults to high."),
  background: backgroundSchema
    .optional()
    .describe("OpenAI background option for GPT Image models. Use transparent only with png/webp."),
  aspectRatio: aspectRatioSchema
    .optional()
    .describe("Nano Banana aspect ratio. For OpenAI, maps common ratios to supported sizes."),
  resolution: nanoResolutionSchema
    .optional()
    .describe("Nano Banana output resolution. Defaults to 1K."),
};

type GenerateImageArgs = z.infer<z.ZodObject<typeof generateImageSchema>>;

const server = new McpServer(
  {
    name: "notfair-design",
    version: "0.1.0",
  },
  {
    instructions:
      "NotFair Design generates production-oriented visual assets. Prefer direct, specific prompts with brand, use case, composition, aspect ratio, and no-text constraints. Save generated files and return paths.",
  },
);

server.registerTool(
  "list_providers",
  {
    description:
      "List NotFair Design image providers, whether their API keys are configured, and their default models.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  async () => jsonResult({
    quota: await getQuotaSnapshot(),
    providers: [
      {
        id: "openai",
        configured: Boolean(openAiApiKey()),
        defaultModel: DEFAULT_OPENAI_MODEL,
        env: "OPENAI_API_KEY",
        notes:
          "Uses the OpenAI Images API. Current default is GPT Image 2; gpt-image-1.5 can be passed as an explicit model override.",
      },
      {
        id: "nano_banana",
        configured: Boolean(geminiApiKey()),
        defaultModel: DEFAULT_NANO_BANANA_MODEL,
        env: "GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY",
        notes: "Uses Gemini 3 Pro Image / Nano Banana Pro. This is the default provider for now.",
      },
    ],
    defaultProvider: normalizeProvider(process.env.NOTFAIR_DESIGN_PROVIDER),
  }),
);

server.registerTool(
  "get_usage",
  {
    description:
      "Show the current NotFair Design monthly image generation quota and usage for this configured local user.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  async () => jsonResult(await getQuotaSnapshot()),
);

server.registerTool(
  "generate_image",
  {
    description:
      "Generate one image from a prompt using OpenAI GPT Image or Nano Banana Pro. Writes the image to disk and returns the saved path. This is an external API call and may take up to several minutes.",
    inputSchema: generateImageSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (args) => {
    try {
      const parsed = z.object(generateImageSchema).parse(args);
      const provider = parsed.provider ?? normalizeProvider(process.env.NOTFAIR_DESIGN_PROVIDER);
      const outputFormat = parsed.outputFormat ?? "png";
      const pathFormat = provider === "nano_banana" ? "png" : outputFormat;
      const outputPath = resolveOutputPath(parsed, pathFormat);
      if (provider === "nano_banana") {
        ensureOutputPathMatchesFormat(outputPath, "png");
      } else {
        ensureOutputPathMatchesFormat(outputPath, outputFormat);
      }
      const reservation = await reserveQuota();

      try {
        await mkdir(path.dirname(outputPath), { recursive: true });
        await assertOutputWritable(outputPath, parsed.overwrite ?? false);

        let metadata: Record<string, unknown>;
        if (provider === "nano_banana") {
          metadata = await generateWithNanoBanana(parsed, outputPath);
        } else {
          metadata = await generateWithOpenAI(parsed, outputPath, outputFormat);
        }
        const quotaAfter = await finalizeQuotaReservation(reservation);

        return jsonResult({
          ok: true,
          provider,
          outputPath,
          quota: {
            ...quotaAfter,
            remainingBeforeThisGeneration: reservation.quota.remaining,
          },
          ...metadata,
        });
      } catch (error) {
        await releaseQuotaReservation(reservation.id);
        throw error;
      }
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  },
);

async function generateWithOpenAI(
  args: GenerateImageArgs,
  outputPath: string,
  outputFormat: "png" | "jpeg" | "webp",
): Promise<Record<string, unknown>> {
  const apiKey = openAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for provider=openai.");
  }

  const model = args.model ?? DEFAULT_OPENAI_MODEL;
  const size = args.size ?? openAiSizeFromAspectRatio(args.aspectRatio) ?? "1024x1024";
  const quality = args.quality ?? "high";
  const body: Record<string, unknown> = {
    model,
    prompt: args.prompt,
    n: 1,
    size,
    quality,
  };

  if (model.startsWith("gpt-image") || model === "chatgpt-image-latest") {
    body.output_format = outputFormat;
    if (args.background) {
      if (model === "gpt-image-2" && args.background === "transparent") {
        throw new Error('gpt-image-2 does not support background="transparent"; use "auto" or "opaque".');
      }
      body.background = args.background;
    }
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI Images API failed (${response.status}): ${text}`);
  }

  const data = await response.json() as {
    data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
    usage?: unknown;
  };
  const image = data.data?.[0];
  if (!image) {
    throw new Error("OpenAI Images API returned no image.");
  }

  let bytes: Buffer;
  if (image.b64_json) {
    bytes = Buffer.from(image.b64_json, "base64");
  } else if (image.url) {
    const imageResponse = await fetch(image.url);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download OpenAI image URL (${imageResponse.status}).`);
    }
    bytes = Buffer.from(await imageResponse.arrayBuffer());
  } else {
    throw new Error("OpenAI Images API returned neither b64_json nor url.");
  }

  ensureOutputPathMatchesFormat(outputPath, outputFormat);
  await writeImageFile(outputPath, bytes, args.overwrite ?? false);
  return {
    model,
    size,
    quality,
    outputFormat,
    bytes: bytes.length,
    revisedPrompt: image.revised_prompt ?? null,
    usage: data.usage ?? null,
  };
}

async function generateWithNanoBanana(
  args: GenerateImageArgs,
  outputPath: string,
): Promise<Record<string, unknown>> {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is required for provider=nano_banana.");
  }

  const model = args.model ?? DEFAULT_NANO_BANANA_MODEL;
  const ai = new GoogleGenAI({ apiKey });
  const config: Record<string, unknown> = {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: {
      imageSize: args.resolution ?? "1K",
    },
  };
  if (args.aspectRatio) {
    (config.imageConfig as Record<string, unknown>).aspectRatio =
      args.aspectRatio === "1.91:1" ? "16:9" : args.aspectRatio;
  }

  const response = await ai.models.generateContent({
    model,
    contents: args.prompt,
    config,
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const textParts: string[] = [];
  for (const part of parts) {
    if ("text" in part && part.text) {
      textParts.push(part.text);
      continue;
    }

    if ("inlineData" in part && part.inlineData?.data) {
      const bytes = Buffer.from(part.inlineData.data, "base64");
      const mimeType = part.inlineData.mimeType ?? "image/png";
      ensureOutputPathMatchesMimeType(outputPath, mimeType);
      await writeImageFile(outputPath, bytes, args.overwrite ?? false);
      return {
        model,
        aspectRatio: args.aspectRatio ?? null,
        resolution: args.resolution ?? "1K",
        bytes: bytes.length,
        mimeType,
        modelText: textParts.join("\n").trim() || null,
      };
    }
  }

  throw new Error("Nano Banana response did not include image data.");
}

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function openAiApiKey(): string | undefined {
  return nonEmpty(process.env.OPENAI_API_KEY);
}

function geminiApiKey(): string | undefined {
  return nonEmpty(process.env.GEMINI_API_KEY) ?? nonEmpty(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeProvider(value: string | undefined): Provider {
  if (value === "nano_banana" || value === "nanobanana" || value === "gemini") return "nano_banana";
  if (value === "openai") return "openai";
  return DEFAULT_PROVIDER;
}

function normalizeUserStatus(value: string | undefined): UserStatus {
  const parsed = userStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : "free";
}

function openAiSizeFromAspectRatio(aspectRatio: GenerateImageArgs["aspectRatio"]): z.infer<typeof openAiSizeSchema> | undefined {
  if (!aspectRatio) return undefined;
  if (aspectRatio === "1:1") return "1024x1024";
  if (["16:9", "1.91:1"].includes(aspectRatio)) return "2048x1152";
  if (["3:2", "4:3", "21:9"].includes(aspectRatio)) return "1536x1024";
  if (["2:3", "3:4", "4:5", "9:16"].includes(aspectRatio)) return "1024x1536";
  return "1024x1024";
}

function resolveOutputPath(args: GenerateImageArgs, outputFormat: string): string {
  const outputPath = args.outputPath ?? defaultOutputFilename(args.prompt, outputFormat);
  if (path.isAbsolute(outputPath)) {
    if (args.allowAbsolutePath) return outputPath;
    throw new Error("Absolute outputPath is not allowed unless allowAbsolutePath=true.");
  }

  const outputRoot = outputDir();
  const resolved = path.resolve(outputRoot, outputPath);
  const relative = path.relative(outputRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("outputPath must stay inside NOTFAIR_DESIGN_OUTPUT_DIR unless allowAbsolutePath=true.");
  }
  return resolved;
}

function outputDir(): string {
  return path.resolve(nonEmpty(process.env.NOTFAIR_DESIGN_OUTPUT_DIR) ?? path.join(process.cwd(), DEFAULT_OUT_DIR));
}

function defaultOutputFilename(prompt: string, outputFormat: string): string {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = slugify(prompt).slice(0, 64) || "image";
  return `${now}-${slug}.${outputFormat}`;
}

async function writeImageFile(outputPath: string, bytes: Buffer, overwrite: boolean): Promise<void> {
  try {
    await writeFile(outputPath, bytes, { flag: overwrite ? "w" : "wx" });
  } catch (error) {
    if (isFileExistsError(error)) {
      throw new Error(`Output file already exists: ${outputPath}. Pass overwrite=true to replace it.`);
    }
    throw error;
  }
}

async function assertOutputWritable(outputPath: string, overwrite: boolean): Promise<void> {
  if (overwrite) return;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(outputPath, "wx");
  } catch (error) {
    if (isFileExistsError(error)) {
      throw new Error(`Output file already exists: ${outputPath}. Pass overwrite=true to replace it.`);
    }
    throw error;
  } finally {
    if (handle) {
      await handle.close();
      await rm(outputPath, { force: true });
    }
  }
}

function ensureOutputPathMatchesFormat(outputPath: string, outputFormat: "png" | "jpeg" | "webp"): void {
  const extension = path.extname(outputPath).toLowerCase();
  const allowed = extensionsForFormat(outputFormat);
  if (!allowed.includes(extension)) {
    throw new Error(`outputPath extension ${extension || "(none)"} does not match outputFormat=${outputFormat}.`);
  }
}

function ensureOutputPathMatchesMimeType(outputPath: string, mimeType: string): void {
  const format = formatFromMimeType(mimeType);
  ensureOutputPathMatchesFormat(outputPath, format);
}

function formatFromMimeType(mimeType: string): "png" | "jpeg" | "webp" {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpeg";
  if (mimeType === "image/webp") return "webp";
  throw new Error(`Unsupported image MIME type from provider: ${mimeType}`);
}

function extensionsForFormat(format: "png" | "jpeg" | "webp"): string[] {
  if (format === "jpeg") return [".jpg", ".jpeg"];
  return [`.${format}`];
}

type UsageEntry = {
  userId: string;
  month: string;
  count: number;
  reservations?: Record<string, UsageReservation>;
  updatedAt?: string;
};

type UsageReservation = {
  createdAt: string;
};

type UsageStore = Record<string, UsageEntry>;

type QuotaSnapshot = {
  userId: string;
  userStatus: UserStatus;
  month: string;
  used: number;
  pending: number;
  limit: number;
  remaining: number;
  resetsAt: string;
  usagePath: string;
};

async function getQuotaSnapshot(): Promise<QuotaSnapshot> {
  return withUsageLock(async (store) => {
    const context = quotaContext();
    const entry = cleanUsageEntry(store[usageKey(context.userId, context.month)]);
    return quotaSnapshotFromEntry(context, entry);
  });
}

function quotaContext(): { userId: string; userStatus: UserStatus; month: string } {
  return {
    userId: nonEmpty(process.env.NOTFAIR_DESIGN_USER_ID) ?? DEFAULT_USER_ID,
    userStatus: normalizeUserStatus(process.env.NOTFAIR_DESIGN_USER_STATUS),
    month: currentUtcMonth(),
  };
}

function usageKey(userId: string, month: string): string {
  return `${encodeURIComponent(userId)}:${month}`;
}

async function readUsageStore(): Promise<UsageStore> {
  try {
    return usageStoreSchema.parse(JSON.parse(await readFile(usagePath(), "utf8")));
  } catch (error) {
    if (isMissingFileError(error)) return {};
    throw error;
  }
}

async function writeUsageStore(store: UsageStore): Promise<void> {
  const file = usagePath();
  await mkdir(path.dirname(file), { recursive: true });
  const tempFile = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempFile, JSON.stringify(store, null, 2));
  await rename(tempFile, file);
}

function usagePath(): string {
  const configured = nonEmpty(process.env.NOTFAIR_DESIGN_USAGE_PATH);
  return path.resolve(configured ?? path.join(os.homedir(), ".notfair-design-mcp", "usage.json"));
}

type QuotaReservation = {
  id: string;
  key: string;
  quota: QuotaSnapshot;
  context: { userId: string; userStatus: UserStatus; month: string };
};

async function reserveQuota(): Promise<QuotaReservation> {
  return withUsageLock(async (store) => {
    const context = quotaContext();
    const key = usageKey(context.userId, context.month);
    const entry = cleanUsageEntry(store[key]);
    const quota = quotaSnapshotFromEntry(context, entry);
    if (quota.remaining <= 0) {
      throw new Error(
        `NotFair Design monthly image limit reached for ${quota.userStatus} user ${quota.userId}: ` +
        `${quota.used}/${quota.limit} used and ${quota.pending} pending in ${quota.month}. Resets at ${quota.resetsAt}.`,
      );
    }

    const id = randomUUID();
    store[key] = {
      ...entry,
      reservations: {
        ...(entry.reservations ?? {}),
        [id]: { createdAt: new Date().toISOString() },
      },
      updatedAt: new Date().toISOString(),
    };
    await writeUsageStore(store);
    return { id, key, quota, context };
  });
}

async function finalizeQuotaReservation(reservation: QuotaReservation): Promise<QuotaSnapshot> {
  return withUsageLock(async (store) => {
    const entry = cleanUsageEntry(store[reservation.key]);
    const reservations = { ...(entry.reservations ?? {}) };
    delete reservations[reservation.id];
    const updatedEntry: UsageEntry = {
      ...entry,
      count: entry.count + 1,
      reservations,
      updatedAt: new Date().toISOString(),
    };
    store[reservation.key] = updatedEntry;
    await writeUsageStore(store);
    return quotaSnapshotFromEntry(reservation.context, updatedEntry);
  });
}

async function releaseQuotaReservation(reservationId: string): Promise<void> {
  await withUsageLock(async (store) => {
    let changed = false;
    for (const [key, entry] of Object.entries(store)) {
      if (!entry.reservations?.[reservationId]) continue;
      const reservations = { ...entry.reservations };
      delete reservations[reservationId];
      store[key] = {
        ...entry,
        reservations,
        updatedAt: new Date().toISOString(),
      };
      changed = true;
      break;
    }
    if (changed) await writeUsageStore(store);
  });
}

function cleanUsageEntry(entry: UsageEntry | undefined): UsageEntry {
  const context = quotaContext();
  const reservations = entry?.reservations ?? {};
  const now = Date.now();
  const activeReservations = Object.fromEntries(
    Object.entries(reservations).filter(([, reservation]) =>
      now - new Date(reservation.createdAt).getTime() < QUOTA_RESERVATION_TTL_MS,
    ),
  );
  return {
    userId: entry?.userId ?? context.userId,
    month: entry?.month ?? context.month,
    count: entry?.count ?? 0,
    reservations: activeReservations,
    updatedAt: entry?.updatedAt,
  };
}

function quotaSnapshotFromEntry(
  context: { userId: string; userStatus: UserStatus; month: string },
  entry: UsageEntry,
): QuotaSnapshot {
  const used = entry.count;
  const pending = Object.keys(entry.reservations ?? {}).length;
  const limit = MONTHLY_LIMITS[context.userStatus];
  return {
    ...context,
    used,
    pending,
    limit,
    remaining: Math.max(0, limit - used - pending),
    resetsAt: nextUtcMonthStart().toISOString(),
    usagePath: usagePath(),
  };
}

async function withUsageLock<T>(fn: (store: UsageStore) => Promise<T>): Promise<T> {
  const lockFile = `${usagePath()}.lock`;
  await mkdir(path.dirname(lockFile), { recursive: true });
  const startedAt = Date.now();
  while (true) {
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      handle = await open(lockFile, "wx");
      await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
      const store = await readUsageStore();
      return await fn(store);
    } catch (error) {
      if (!isFileExistsError(error)) throw error;
      if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for NotFair Design usage lock: ${lockFile}`);
      }
      await delay(LOCK_RETRY_DELAY_MS);
    } finally {
      if (handle) {
        await handle.close();
        await rm(lockFile, { force: true });
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function currentUtcMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextUtcMonthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
