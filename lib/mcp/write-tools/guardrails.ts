import { z } from "zod";
import { setGoals, getGoals } from "@/lib/db/tracking";
import { enforceRateLimit } from "@/lib/mcp/rate-limit";
import { typedResult, safeHandler, accountIdParam, READ_ANNOTATIONS, WRITE_ANNOTATIONS } from "../types";
import { resolveToolAuth } from "../helpers";
import type { WriteToolDeps } from "./_deps";

export function registerGuardrailsTools(deps: WriteToolDeps) {
  const { server, currentAuth } = deps;

  // ─── Guardrails ─────────────────────────────────────────────────

  server.registerTool("setGuardrails", {
    description: "Set guardrail limits for bid changes, budget changes, and keyword pauses. Can be set at account level (omit campaignId) or per-campaign. These limits cap how much the AI can change in a single operation.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().optional().describe("Campaign ID for campaign-specific guardrails (omit for account-level defaults)"),
      targetCpa: z.number().positive().optional().describe("Target CPA in dollars"),
      monthlyCap: z.number().positive().optional().describe("Monthly spend cap in dollars"),
      maxBidChangePct: z.number().min(0.01).max(1.0).optional().describe("Max bid change per adjustment as decimal (e.g. 0.25 = 25%)"),
      maxBudgetChangePct: z.number().min(0.01).max(1.0).optional().describe("Max budget change per adjustment as decimal (e.g. 0.50 = 50%)"),
      maxKeywordPausePct: z.number().min(0.01).max(1.0).optional().describe("Max fraction of keywords that can be paused at once (e.g. 0.30 = 30%)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId, targetCpa, monthlyCap, maxBidChangePct, maxBudgetChangePct, maxKeywordPausePct }) => {
    const { auth, targetId } = resolveToolAuth(currentAuth, accountId);
    await enforceRateLimit(auth.userId);
    const goals: Parameters<typeof setGoals>[2] = {};
    if (targetCpa !== undefined) goals.targetCpa = targetCpa;
    if (monthlyCap !== undefined) goals.monthlyCap = monthlyCap;
    if (maxBidChangePct !== undefined) goals.maxBidChangePct = maxBidChangePct;
    if (maxBudgetChangePct !== undefined) goals.maxBudgetChangePct = maxBudgetChangePct;
    if (maxKeywordPausePct !== undefined) goals.maxKeywordPausePct = maxKeywordPausePct;
    const result = await setGoals(targetId, campaignId ?? null, goals);
    return typedResult({ success: true, ...result });
  }));

  server.registerTool("getGuardrails", {
    description: "Get current guardrail limits. Returns campaign-specific guardrails if set, otherwise account-level defaults. Shows target CPA, monthly cap, and max change percentages for bids, budgets, and keyword pauses.",
    inputSchema: {
      accountId: accountIdParam,
      campaignId: z.string().optional().describe("Campaign ID to check campaign-specific guardrails"),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, campaignId }) => {
    const { targetId } = resolveToolAuth(currentAuth, accountId);
    const goals = await getGoals(targetId, campaignId);
    if (!goals) {
      return typedResult({
        source: "defaults",
        targetCpa: null,
        monthlyCap: null,
        maxBidChangePct: 0.25,
        maxBudgetChangePct: 0.50,
        maxKeywordPausePct: 0.30,
      });
    }
    return typedResult({
      source: campaignId && goals.campaignId === campaignId ? "campaign" : "account",
      ...goals,
    });
  }));
}
