import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  generateImage,
  type AspectRatio,
  type ImageBackground,
  type ImageOutputFormat,
  type ImageQuality,
} from "@/lib/design/generate";
import { uploadImage } from "@/lib/design/storage";
import { checkAndIncrementQuota, getQuotaState, releaseQuota } from "@/lib/design/quota";

/**
 * Compact server-instructions snippet appended to each ad-platform MCP's main
 * instructions block. Kept short on purpose — the full prompt-craft guidance
 * lives in the tool description so it triggers contextually when the model
 * actually picks `generate_image`, instead of bloating every system prompt.
 */
export const DESIGN_TOOLS_INSTRUCTION = `Image generation (cross-platform creative):
- \`generate_image\` — produce a public PNG/JPEG/WebP from a prompt via OpenAI GPT Image 2. Returns a permanent S3 URL you can embed in markdown or hand to the user. Counts against the user's monthly quota.
- \`get_usage\` — current monthly image quota and remaining count.
Use these whenever the user needs visual ad creative generated from scratch — banners, social posts, hero images, product mockups. Return the URL to the user; on platforms that expose an image-asset upload tool (e.g. Google Ads \`createImageAsset\`), pass the URL to that tool to put the asset into the account.`;

const aspectRatioSchema = z.enum([
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "1.91:1",
]);
const qualitySchema = z.enum(["auto", "low", "medium", "high"]);
const outputFormatSchema = z.enum(["png", "jpeg", "webp"]);
const backgroundSchema = z.enum(["auto", "transparent", "opaque"]);

/**
 * Register the cross-platform design tool surface (`generate_image`,
 * `get_usage`) on the given McpServer. Embeds in any MCP whose auth context
 * exposes a NotFair `userId` — currently Google Ads and Meta Ads.
 *
 * Throws on missing userId rather than falling back to a default — quota is
 * keyed on userId, and a missing one silently shared a quota across users in
 * an earlier draft.
 */
export function registerDesignTools(
  server: McpServer,
  currentAuth: () => { userId?: string | null },
  reconnectPath: string,
): void {
  const getUserId = (): string => {
    const userId = currentAuth().userId;
    if (!userId) {
      throw new Error(
        `No NotFair userId on this session — image generation requires a NotFair-authenticated session. Reconnect at ${reconnectPath}.`,
      );
    }
    return userId;
  };

  server.registerTool(
    "generate_image",
    {
      description:
        "Generate one image from a prompt using OpenAI GPT Image 2. Returns a public URL you can embed in markdown or pass to a creative-asset tool. Counts against the user's monthly quota.\n\n" +
        "Prompt guidance (GPT Image 2 is strong at instruction-following — be specific):\n" +
        "- Include subject, style, composition, lighting, and aspect ratio.\n" +
        "- Always specify \"no text\" unless the user explicitly asks for text.\n" +
        "- For marketing assets: mention brand tone and use case (hero, social post, mockup).\n" +
        "- For diagrams/infographics: prefer a clean, minimal style.\n\n" +
        "Aspect ratio cheat sheet: stories \"9:16\"; feed posts \"4:5\" or \"1:1\"; hero/banners \"16:9\" or \"3:2\"; portrait \"2:3\".\n\n" +
        "Quality vs latency: \"low\" ~5s drafts; \"medium\" balanced; \"high\" runs the four-stage Understand/Plan/Generate/Review pipeline (30–50× slower than low) — use only for production-final fidelity.\n\n" +
        "Output format: default \"png\" (lossless). Use \"webp\"/\"jpeg\" for smaller photographic assets. background=\"transparent\" requires png/webp (use for logos, cutouts, UI assets).",
      inputSchema: {
        prompt: z
          .string()
          .min(1)
          .max(32000)
          .describe(
            "Image prompt. Include subject, style, composition, lighting, aspect ratio, and 'no text' if text-free. GPT Image 2 supports up to 32K characters and is strong at instruction-following.",
          ),
        aspectRatio: aspectRatioSchema
          .optional()
          .describe(
            "Aspect ratio. Common values: '1:1' (square), '16:9' (landscape), '9:16' (portrait/story), '4:5' (feed post). Defaults to '1:1'. Mapped to a 16-aligned WxH size server-side.",
          ),
        quality: qualitySchema
          .optional()
          .describe(
            "Generation quality. Defaults to 'auto' (OpenAI picks). 'low' is fastest (~5s), 'medium' is balanced, 'high' runs the four-stage Understand/Plan/Generate/Review pipeline (30–50× slower than low) and produces the most refined output.",
          ),
        outputFormat: outputFormatSchema
          .optional()
          .describe("Image file format. Defaults to 'png'. Use 'webp' or 'jpeg' for smaller photographic assets."),
        background: backgroundSchema
          .optional()
          .describe(
            "Background handling. 'transparent' requires outputFormat='png' or 'webp' (use for logos, cutouts, UI assets). 'opaque' forces a solid background. 'auto' (default) lets the model decide.",
          ),
        model: z
          .string()
          .optional()
          .describe("OpenAI image model override. Defaults to gpt-image-2. Use 'gpt-image-1.5' or 'gpt-image-1-mini' to opt into older/cheaper models."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        // getUserId() throws when the session has no userId (legacy Google
        // sessions can have nullable user_id). Calling it inside the try
        // block converts the throw into a structured MCP error envelope
        // instead of escaping to mcp-handler as an unstructured 500.
        const userId = getUserId();
        // Reserve-then-release: increment first to keep the limit check
        // race-free, then decrement on any downstream failure so users
        // aren't charged for failed generations.
        await checkAndIncrementQuota(userId);

        let generated, upload;
        try {
          generated = await generateImage({
            prompt: args.prompt,
            model: args.model,
            aspectRatio: args.aspectRatio as AspectRatio | undefined,
            quality: args.quality as ImageQuality | undefined,
            outputFormat: args.outputFormat as ImageOutputFormat | undefined,
            background: args.background as ImageBackground | undefined,
          });
          upload = await uploadImage(generated.buffer, generated.mimeType, userId);
        } catch (e) {
          // Release the reserved slot, but never mask the original error.
          await releaseQuota(userId).catch(() => {});
          throw e;
        }

        const output = {
          ok: true,
          url: upload.url,
          model: generated.model,
          aspectRatio: generated.aspectRatio,
          size: generated.size,
          quality: generated.quality,
          outputFormat: generated.outputFormat,
          bytes: generated.bytes,
          mimeType: generated.mimeType,
          ...(generated.revisedPrompt ? { revisedPrompt: generated.revisedPrompt } : {}),
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(output, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? error.message : String(error),
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "get_usage",
    {
      description:
        "Show the current monthly image generation quota and usage for this account.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const userId = getUserId();
        const state = await getQuotaState(userId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(state, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? error.message : String(error),
            },
          ],
        };
      }
    },
  );
}
