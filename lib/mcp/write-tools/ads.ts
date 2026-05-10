import { z } from "zod";
import {
  createAd,
  pauseAd,
  enableAd,
  removeAd,
  updateAdFinalUrl,
  updateAdAssets,
} from "@/lib/google-ads";
import { safeHandler, accountIdParam, WRITE_ANNOTATIONS, DESTRUCTIVE_WRITE_ANNOTATIONS } from "../types";
import type { WriteToolDeps } from "./_deps";
import { experimentImpactAcknowledgementSchema } from "./_deps";

export function registerAdWriteTools(deps: WriteToolDeps) {
  const { server, writeToolCall } = deps;

  // ─── Ad Management ──────────────────────────────────────────────

  server.registerTool("createAd", {
    description: "Create a Responsive Search Ad (RSA) in an ad group. Optionally include path1/path2 for the display URL (the segments shown after the domain, e.g. example.com/path1/path2). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging/undo tracking)"),
      adGroupId: z.string(),
      headlines: z
        .array(z.string().min(1).max(30))
        .min(3)
        .max(15)
        .describe("3-15 headlines, max 30 chars each"),
      descriptions: z
        .array(z.string().min(1).max(90))
        .min(2)
        .max(4)
        .describe("2-4 descriptions, max 90 chars each"),
      finalUrl: z.string().url(),
      path1: z
        .string()
        .min(1)
        .max(15)
        .regex(/^\S+$/, "path1 must not contain whitespace")
        .optional()
        .describe("Display URL path 1 (max 15 chars, no spaces). Shown after the domain."),
      path2: z
        .string()
        .min(1)
        .max(15)
        .regex(/^\S+$/, "path2 must not contain whitespace")
        .optional()
        .describe("Display URL path 2 (max 15 chars, no spaces). Requires path1."),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, headlines, descriptions, finalUrl, path1, path2 }) =>
    writeToolCall({ accountId, campaignId }, (a) => createAd(a, adGroupId, { headlines, descriptions, finalUrl, path1, path2 })),
  ));

  server.registerTool("pauseAd", {
    description: "Pause an active ad. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string(),
      adId: z.string(),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, adId }) =>
    writeToolCall({ accountId, campaignId }, (a) => pauseAd(a, adGroupId, adId)),
  ));

  server.registerTool("enableAd", {
    description: "Re-enable a paused ad. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string(),
      adId: z.string(),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, adId }) =>
    writeToolCall({ accountId, campaignId }, (a) => enableAd(a, adGroupId, adId)),
  ));

  server.registerTool("removeAd", {
    description: "Permanently remove an ad from an ad group. This cannot be undone. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string(),
      adId: z.string(),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, adId }) =>
    writeToolCall({ accountId, campaignId }, (a) => removeAd(a, adGroupId, adId)),
  ));

  server.registerTool("updateAdFinalUrl", {
    description: "Update the landing page URL for an ad. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string(),
      adId: z.string(),
      finalUrl: z.string().url(),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, adId, finalUrl }) =>
    writeToolCall({ accountId, campaignId }, (a) => updateAdFinalUrl(a, adGroupId, adId, finalUrl)),
  ));

  server.registerTool("updateAdAssets", {
    description: "Replace headlines and descriptions for a Responsive Search Ad. Headlines and descriptions are COMPLETE replacement — provide every asset, not just changed ones. Display URL paths (path1/path2) are partial: omit them and existing values are preserved; provide them to override. Optionally pin assets to fixed positions. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging)"),
      adGroupId: z.string(),
      adId: z.string(),
      headlines: z
        .array(
          z.object({
            text: z.string().min(1).max(30),
            pin: z.number().int().min(1).max(3).optional().describe("Pin to position 1, 2, or 3"),
          }),
        )
        .min(3)
        .max(15)
        .describe("Complete replacement headlines (3-15, max 30 chars each)"),
      descriptions: z
        .array(
          z.object({
            text: z.string().min(1).max(90),
            pin: z.number().int().min(1).max(2).optional().describe("Pin to position 1 or 2"),
          }),
        )
        .min(2)
        .max(4)
        .describe("Complete replacement descriptions (2-4, max 90 chars each)"),
      path1: z
        .string()
        .min(1)
        .max(15)
        .regex(/^\S+$/, "path1 must not contain whitespace")
        .optional()
        .describe("Display URL path 1 (max 15 chars, no spaces). Omit to preserve the existing path."),
      path2: z
        .string()
        .min(1)
        .max(15)
        .regex(/^\S+$/, "path2 must not contain whitespace")
        .optional()
        .describe("Display URL path 2 (max 15 chars, no spaces). Requires path1. Omit to preserve the existing path."),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, adId, headlines, descriptions, path1, path2 }) =>
    writeToolCall({ accountId, campaignId }, (a) => updateAdAssets(a, adGroupId, adId, { headlines, descriptions, path1, path2 })),
  ));
}
