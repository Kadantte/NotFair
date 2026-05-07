import { z } from "zod";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { trackServerEvent } from "@/lib/analytics-server";
import { postToSlack } from "@/lib/slack";
import { getUserEmail } from "@/lib/auth/get-user-email";
import { typedResult } from "./types";
import type { ToolRegistrar } from "./types";

/**
 * `fileInternalNotFairToolFeedback` — internal agent-as-informant feedback channel.
 *
 * The AI agent is the actual "user" of an MCP, and uniquely positioned to
 * critique tool design: it reads tool descriptions, executes workflows, and
 * has to act on error messages. This tool lets the agent surface tool-quality
 * feedback (unclear descriptions, missing capabilities, ergonomic friction,
 * confusing duplicates) that per-event telemetry cannot reconstruct.
 *
 * Scope is narrow on purpose:
 * - NOT a satisfaction/rating tool. Self-rating is biased and silent.
 * - NOT for individual operation errors — those are already captured in
 *   `ai_change_failed`. This is the layer above: design-level observations.
 *
 * Each call fires `mcp_improvement_suggested` to PostHog and posts a formatted
 * message to Slack. A simple in-memory per-session counter prevents runaway
 * call loops; the cap is generous because the prompt-side guidance ("at most 2
 * per session") already does most of the work.
 *
 * Rate-limit scope: the counter Map lives in the Lambda instance's memory, so
 * the 5/hour ceiling is per-process, not global. A session that fans out
 * across N warm Lambda instances can effectively call up to 5×N times/hour.
 * That's acceptable here — the prompt cap is the primary control and the
 * server cap is just a runaway-loop safety net. If you ever need a true
 * global cap, swap to Redis.
 */

const FEEDBACK_CATEGORIES = [
  "description_unclear",
  "missing_capability",
  "ergonomic",
  "error_message_unclear",
  "workflow_gap",
  "duplicate_tools",
  "other",
] as const;

const FILE_INTERNAL_TOOL_FEEDBACK_DESCRIPTION = `Internal NotFair tool-feedback channel. Privately report MCP/tool friction that got in the way of helping the user — unclear descriptions, missing capabilities, clunky workflows, confusing errors, or duplicate tools.

This is not customer support, not user feedback, and not a success/quality rating. It is an internal NotFair engineering signal. When tool design gets in the way of a real user task, file one concrete report here so we can fix the tool surface. The user benefits in their next session; every other agent serving every other user benefits too.

AUTO-SURFACE THIS WHEN:
- A tool description was unclear and you weren't sure how to use it.
- You wanted to accomplish something for the user but no tool existed for it.
- A workflow took many tool calls when one bulk operation could have replaced them.
- An error message returned by a tool didn't help you debug or recover.
- Two tools have overlapping purposes and the choice was confusing.

DO NOT call this for:
- Individual operation errors (those are tracked automatically — never call this just because a tool returned an error).
- Confirming that a task succeeded.
- Rating your own output quality.
- Anything the user explicitly asked you to escalate (use the in-app feedback form for that).

Be specific. Reference tools by name and propose a concrete change. Keep yourself to at most 2 calls per session. Submissions go directly to the NotFair team; the user does not see this channel.`;

const PER_SESSION_LIMIT = 5;
const PER_SESSION_WINDOW_MS = 60 * 60 * 1000;

type SessionCounter = { count: number; windowStart: number };
const sessionCounts = new Map<number | string, SessionCounter>();

/** Test-only — clears the per-session counter map. */
export function _resetSessionCountsForTest() {
  sessionCounts.clear();
}

function recordCall(
  sessionId: number | null | undefined,
  userId: string | null | undefined,
): { allowed: boolean; remaining: number } {
  // Rate-limit by session when present, otherwise by userId. If neither is
  // available we fall through to userId="anonymous", which still rate-limits
  // collectively rather than letting an unauthed caller spam the channel.
  const key = sessionId ?? userId ?? "anonymous";
  const now = Date.now();
  const entry = sessionCounts.get(key);
  if (!entry || now - entry.windowStart > PER_SESSION_WINDOW_MS) {
    sessionCounts.delete(key);
    sessionCounts.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: PER_SESSION_LIMIT - 1 };
  }
  if (entry.count >= PER_SESSION_LIMIT) {
    return { allowed: false, remaining: 0 };
  }
  entry.count += 1;
  return { allowed: true, remaining: PER_SESSION_LIMIT - entry.count };
}

function truncate(s: string | undefined | null, max: number): string | null {
  if (s == null) return null;
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/**
 * Neutralize Slack control sequences in user-supplied text. Slack's webhook
 * parser interprets `<!channel>`, `<!here>`, `<@USERID>`, `<#CHANNEL>`, and
 * `<URL>` patterns as real notifications/links — an adversarial agent (or one
 * under prompt injection) could otherwise mass-ping the team via the feedback
 * channel. Per Slack's docs we escape `&`, `<`, `>` in user content; static
 * formatting tokens we control (mrkdwn, blockquote `>`) are interpolated
 * around the escaped values, so they remain intact.
 */
function escapeSlack(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * Resolve the user's email so triage can reach the affected user. Tries
 * sources in order of reliability:
 *   1. `mcp_sessions.google_email` — the Google account the agent is acting
 *      on behalf of. Authoritative for OAuth/MCP paths and the dev bypass.
 *   2. `subscriptions.email` — Stripe billing email. Covers chat-only paths
 *      where the user has no MCP session yet but did pay.
 *
 * Returns null when neither lookup matches (anon/seed/test flows). Failures
 * are swallowed — Slack/PostHog enrichment is never load-bearing on the
 * tool's primary success.
 */
async function resolveUserEmail(
  sessionId: number | null | undefined,
  userId: string | null | undefined,
): Promise<string | null> {
  try {
    // Phase-4 step 2: prefer auth.users via userId — that's the canonical
    // identity for every active user. The legacy mcp_sessions lookup by
    // sessionId is kept as a fallback for OAuth tokens still bound via
    // sessionId; once those age out (phase 5), this can drop the branch.
    if (userId) {
      const email = await getUserEmail(userId);
      if (email) return email;
      const [row] = await db()
        .select({ email: schema.subscriptions.email })
        .from(schema.subscriptions)
        .where(and(eq(schema.subscriptions.userId, userId), eq(schema.subscriptions.env, "live")))
        .limit(1);
      if (row?.email) return row.email;
    }
    if (sessionId != null) {
      const [row] = await db()
        .select({ email: schema.mcpSessions.googleEmail })
        .from(schema.mcpSessions)
        .where(eq(schema.mcpSessions.id, sessionId))
        .limit(1);
      if (row?.email) return row.email;
    }
  } catch (err) {
    console.error("[fileInternalNotFairToolFeedback] email lookup failed:", err);
  }
  return null;
}

function quoteBlock(text: string, maxLen = 600): string {
  const truncated = truncate(text, maxLen) ?? "";
  return escapeSlack(truncated)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

export const registerAgentFeedbackTools: ToolRegistrar = (server, currentAuth) => {
  server.registerTool(
    "fileInternalNotFairToolFeedback",
    {
      description: FILE_INTERNAL_TOOL_FEEDBACK_DESCRIPTION,
      inputSchema: {
        category: z
          .enum(FEEDBACK_CATEGORIES)
          .describe(
            "Type of feedback. description_unclear=tool docs were ambiguous; missing_capability=no tool for the intent; ergonomic=workflow took too many calls; error_message_unclear=error didn't help debugging; workflow_gap=tools couldn't be composed for the goal; duplicate_tools=two tools confusingly overlap; other=anything else.",
          ),
        affected_tool: z
          .string()
          .min(1)
          .max(120)
          .describe("Tool name (e.g. 'pauseKeyword'), or 'general' if cross-cutting."),
        observation: z
          .string()
          .min(10)
          .max(1000)
          .describe(
            "What was confusing, painful, or missing. Be specific — quote what tripped you up.",
          ),
        suggestion: z
          .string()
          .min(10)
          .max(1000)
          .describe("Concrete change you'd recommend."),
        user_goal: z
          .string()
          .max(500)
          .optional()
          .describe(
            "What the user was trying to accomplish — gives the team the use case context. Avoid PII.",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ category, affected_tool, observation, suggestion, user_goal }) => {
      const auth = currentAuth();

      const { allowed, remaining } = recordCall(auth.sessionId, auth.userId);
      if (!allowed) {
        return typedResult(
          { recorded: false, reason: "rate_limited", remaining_calls: 0 },
          "Suggestion limit reached for this session (5/hour). Continue your task — no further calls needed.",
        );
      }

      const truncatedObservation = truncate(observation, 1000) ?? "";
      const truncatedSuggestion = truncate(suggestion, 1000) ?? "";
      const truncatedGoal = truncate(user_goal, 500);

      const userEmail = await resolveUserEmail(auth.sessionId, auth.userId);

      trackServerEvent(auth.userId, "mcp_improvement_suggested", {
        category,
        affected_tool,
        observation: truncatedObservation,
        suggestion: truncatedSuggestion,
        user_goal: truncatedGoal,
        user_email: userEmail,
        client_name: auth.clientName ?? null,
        client_version: auth.clientVersion ?? null,
        auth_method: auth.authMethod ?? null,
        session_id: auth.sessionId ?? null,
        remaining_calls: remaining,
      });

      const clientLabel = [
        auth.clientName ?? "unknown-client",
        auth.clientVersion ? `v${auth.clientVersion}` : null,
      ]
        .filter(Boolean)
        .join(" ");

      // category comes from a Zod enum (closed set, no escape needed). Every
      // other interpolated string is agent-supplied — escape it before it
      // reaches Slack's webhook parser.
      const slackText = [
        `:robot_face: *Agent feedback — \`${category}\`*`,
        `*Tool:* \`${escapeSlack(affected_tool)}\`  ·  *Client:* ${escapeSlack(clientLabel)}  ·  *Session:* ${auth.sessionId ?? "n/a"}`,
        userEmail ? `*User:* ${escapeSlack(userEmail)}` : null,
        ``,
        `*Observation:*`,
        quoteBlock(truncatedObservation),
        ``,
        `*Suggestion:*`,
        quoteBlock(truncatedSuggestion),
        truncatedGoal ? `\n*User goal:* _${escapeSlack(truncatedGoal)}_` : null,
      ]
        .filter((line) => line !== null)
        .join("\n");

      // Defer the Slack post via `after()` so it runs after the response is
      // sent — same pattern as `flushServerEvents` in handler-factory.ts.
      // Without this the Vercel Lambda can freeze mid-fetch and drop the
      // message (the bug that lost 43% of `user_signed_up` events in Apr
      // 2026; see lib/analytics-server.ts). Errors are swallowed because
      // the PostHog event is the durable record — Slack is the human-visible
      // mirror, never load-bearing.
      after(async () => {
        try {
          await postToSlack(slackText);
        } catch (err) {
          console.error("[fileInternalNotFairToolFeedback] Slack post failed:", err);
        }
      });

      return typedResult(
        { recorded: true, remaining_calls: remaining },
        "Internal NotFair tool-feedback report recorded. Continue the user task — no user-visible follow-up is needed unless the friction blocked completion.",
      );
    },
  );
};
