import { z } from "zod";
import {
  createAdGroup,
  renameAdGroup,
  resolveAccountId,
  toMicros,
  updateAdGroup,
} from "@/lib/google-ads";
import { safeHandler, accountIdParam, WRITE_ANNOTATIONS } from "../types";
import type { WriteToolDeps } from "./_deps";
import { experimentImpactAcknowledgementSchema, resolveGuardrails } from "./_deps";

export function registerAdGroupWriteTools(deps: WriteToolDeps) {
  const { server, currentAuth, writeToolCall } = deps;

  // ─── Ad Group Management ────────────────────────────────────────

  server.registerTool("createAdGroup", {
    description: "Create an ad group in a campaign (starts enabled). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupName: z.string().min(1),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupName }) =>
    writeToolCall({ accountId, campaignId }, (a) => createAdGroup(a, campaignId, adGroupName)),
  ));

  // ─── Rename Campaign / Ad Group ────────────────────────────────────

  server.registerTool("renameAdGroup", {
    description: "Rename an ad group. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string(),
      adGroupId: z.string(),
      newName: z.string().min(1),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, newName }) =>
    writeToolCall({ accountId, campaignId }, (a) => renameAdGroup(a, campaignId, adGroupId, newName)),
  ));

  // ─── Ad Group Status Aliases ───────────────────────────────────────

  server.registerTool("enableAdGroup", {
    description:
      "Enable a paused standard Search ad group. Thin alias for updateAdGroup with status=ENABLED; " +
      "use when account diagnosis says a paused ad group is blocking serving. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging and experiment-impact guardrails)"),
      adGroupId: z.string(),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const guardrails = await resolveGuardrails(targetId, campaignId);
    return writeToolCall({ accountId, campaignId }, (a) =>
      updateAdGroup(a, adGroupId, { status: "ENABLED" }, guardrails),
    );
  }));

  server.registerTool("pauseAdGroup", {
    description:
      "Pause a standard Search ad group. Thin alias for updateAdGroup with status=PAUSED; " +
      "use for surgical pausing within a campaign without pausing ads one-by-one. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging and experiment-impact guardrails)"),
      adGroupId: z.string(),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const guardrails = await resolveGuardrails(targetId, campaignId);
    return writeToolCall({ accountId, campaignId }, (a) =>
      updateAdGroup(a, adGroupId, { status: "PAUSED" }, guardrails),
    );
  }));

  // ─── Update Ad Group Bid / Settings ────────────────────────────────

  server.registerTool("updateAdGroup", {
    description:
      "Update an ad group's default max CPC bid, target CPA, status, and/or name in one call. " +
      "Use cpcBidDollars to set the ad-group default bid (only effective on MANUAL_CPC / ENHANCED_CPC campaigns); " +
      "use targetCpaDollars to override the campaign's target CPA at the ad-group level (only effective on " +
      "TARGET_CPA / MAXIMIZE_CONVERSIONS campaigns — surfaces a warning otherwise, no error). " +
      "Subject to the per-account `maxBidChangePct` guardrail (default 25%, raise with `setGuardrails`). " +
      "The guardrail is bypassed only when there's no real ad-group-level bid yet — `cpc_bid_micros` is " +
      "either null (inheriting the campaign default) or 0 (set-but-unset). Any positive existing bid — " +
      "including Google's €0.01 (10,000 micros) placeholder on newly-created MANUAL_CPC ad groups — is " +
      "treated as a real value and the cap applies. To ramp a freshly-launched ad group from the " +
      "placeholder, call `setGuardrails` ({ maxBidChangePct: 1.0 }) first, do the bumps, then restore " +
      "the guardrail. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().describe("Campaign ID (for logging and guardrail resolution)"),
      adGroupId: z.string(),
      cpcBidDollars: z.number().positive().optional()
        .describe("New ad-group default max CPC in dollars (e.g. 1.50). Only honored for MANUAL_CPC/ENHANCED_CPC campaigns."),
      targetCpaDollars: z.number().min(0.1).optional()
        .describe("Override the campaign's target CPA at the ad-group level, in dollars (minimum 0.10). Only effective on TARGET_CPA / MAXIMIZE_CONVERSIONS campaigns."),
      status: z.enum(["ENABLED", "PAUSED"]).optional()
        .describe("Set ad group status."),
      newName: z.string().min(1).optional()
        .describe("Rename the ad group. Use this OR renameAdGroup — equivalent behavior."),
      ...experimentImpactAcknowledgementSchema,
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, adGroupId, cpcBidDollars, targetCpaDollars, status, newName }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);
    const guardrails = await resolveGuardrails(targetId, campaignId);
    return writeToolCall({ accountId, campaignId }, (a) =>
      updateAdGroup(a, adGroupId, {
        ...(cpcBidDollars !== undefined ? { cpcBidMicros: toMicros(cpcBidDollars) } : {}),
        ...(targetCpaDollars !== undefined ? { targetCpaMicros: toMicros(targetCpaDollars) } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(newName !== undefined ? { name: newName } : {}),
      }, guardrails),
    );
  }));
}
