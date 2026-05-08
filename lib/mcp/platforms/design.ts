import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { generateImage, type AspectRatio, type ImageResolution } from "@/lib/design/generate";
import { uploadImage } from "@/lib/design/storage";
import { checkAndIncrementQuota, getQuotaState, releaseQuota } from "@/lib/design/quota";

export type DesignAuthContext = {
  userId: string;
};

/**
 * Server-level instructions surfaced to the LLM at `initialize`.
 */
export const DESIGN_MCP_INSTRUCTIONS = `NotFair Design is a hosted image generation MCP. You generate production-quality visual assets from prompts using Gemini image models.

Tool-selection heuristic:
1. To generate an image → \`generate_image\`. Returns a public URL you can embed in markdown or pass to the user.
2. To check how many images remain this month → \`get_usage\`.

Prompt guidance:
- Include subject, style, composition, lighting, and aspect ratio.
- Always specify "no text" unless the user explicitly asks for text in the image.
- For marketing assets: mention the brand tone and use case (hero image, social post, product mockup).
- For diagrams/infographics: prefer a clean, minimal style.

Aspect ratio selection:
- Social posts / stories: "9:16"
- Feed posts: "4:5" or "1:1"
- Hero images / banners: "16:9" or "3:2"
- Portrait: "2:3" or "4:5"
- Square: "1:1"

The returned URL is public and permanent (Vercel Blob). You can display it inline with markdown: \`![alt](url)\`.`;

const aspectRatioSchema = z.enum([
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "1.91:1",
]);

const resolutionSchema = z.enum(["1K", "2K", "4K"]);

/**
 * Register Design MCP tools on the given McpServer instance.
 * `currentAuth` is an AsyncLocalStorage getter — call it inside each tool
 * handler to retrieve the userId for the current request.
 */
export function registerDesignTools(
  server: McpServer,
  currentAuth: () => DesignAuthContext,
): void {
  server.registerTool(
    "generate_image",
    {
      description:
        "Generate one image from a prompt using the Gemini image model. Returns a public URL you can embed in markdown. Counts against the monthly quota. May take up to 30 seconds.",
      inputSchema: {
        prompt: z
          .string()
          .min(1)
          .max(8000)
          .describe(
            "Image prompt. Include subject, style, composition, lighting, aspect ratio, and 'no text' if text-free.",
          ),
        aspectRatio: aspectRatioSchema
          .optional()
          .describe(
            "Aspect ratio. Common values: '1:1' (square), '16:9' (landscape), '9:16' (portrait/story), '4:5' (feed post). Defaults to '1:1'.",
          ),
        resolution: resolutionSchema
          .optional()
          .describe("Output resolution. '1K' (default), '2K', or '4K'. Higher resolutions use more quota."),
        model: z
          .string()
          .optional()
          .describe("Gemini model override. Defaults to gemini-3-pro-image-preview."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const { userId } = currentAuth();
      try {
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
            resolution: args.resolution as ImageResolution | undefined,
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
          resolution: generated.resolution,
          bytes: generated.bytes,
          mimeType: generated.mimeType,
          ...(generated.modelText ? { modelText: generated.modelText } : {}),
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
      const { userId } = currentAuth();
      try {
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
