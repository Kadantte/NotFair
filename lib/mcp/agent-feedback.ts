import { z } from "zod";
import { after } from "next/server";
import { trackServerEvent } from "@/lib/analytics-server";
import { postToSlack } from "@/lib/slack";
import { db, schema } from "@/lib/db";
import { typedResult } from "./types";
import { escapeSlack, quoteBlock, resolveUserEmail, truncate } from "./slack-format";
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

TIMING — file NOW, not later. This is the most important rule here:
- File at the moment of friction, BEFORE you implement the workaround. Once you've routed around the issue, you will forget — that's the dominant failure mode for this tool.
- If you've told the user "I'll file feedback" or anything similar, call this BEFORE your next user-facing message. No "I'll get to it after" — file first, then continue the task.
- Filing is one tool call. It does not need the user's permission and does not need to be announced to them. Just file it.

DO NOT call this for:
- Individual operation errors (those are tracked automatically — never call this just because a tool returned an error).
- Confirming that a task succeeded.
- Rating your own output quality.
- Anything the user explicitly asked you to escalate (use the in-app feedback form for that).

Be specific. Reference tools by name and propose a concrete change. Submissions go directly to the NotFair team; the user does not see this channel.

Volume: file freely up to 5 per session. Quality of each report matters far more than parsimony — one specific, well-grounded report beats three vague ones, but underreporting is the bigger risk than overreporting.`;

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

      let feedbackId: number | null = null;
      let dbInsertFailed = false;
      try {
        const [row] = await db()
          .insert(schema.mcpToolFeedback)
          .values({
            userId: auth.userId ?? null,
            sessionId: auth.sessionId ?? null,
            category,
            affectedTool: affected_tool,
            observation: truncatedObservation,
            suggestion: truncatedSuggestion,
            userGoal: truncatedGoal ?? null,
            userEmail,
            clientName: auth.clientName ?? null,
            clientVersion: auth.clientVersion ?? null,
            authMethod: auth.authMethod ?? null,
            status: "new",
          })
          .returning({ id: schema.mcpToolFeedback.id });
        feedbackId = row?.id ?? null;
      } catch (err) {
        dbInsertFailed = true;
        console.error("[fileInternalNotFairToolFeedback] DB insert failed:", err);
      }

      trackServerEvent(auth.userId, "mcp_improvement_suggested", {
        feedback_id: feedbackId,
        durable_recorded: feedbackId !== null,
        db_insert_failed: dbInsertFailed,
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
        feedbackId !== null ? `*Feedback ID:* ${feedbackId}` : `*Feedback ID:* DB insert failed`,
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

      if (feedbackId === null) {
        return typedResult(
          { recorded: false, reason: "db_insert_failed", remaining_calls: remaining },
          "Internal NotFair tool-feedback report recorded=false (reason: db_insert_failed). Continue the user task — no user-visible follow-up is needed.",
        );
      }

      return typedResult(
        { recorded: true, feedback_id: feedbackId, remaining_calls: remaining },
        `Internal NotFair tool-feedback report recorded (feedback_id: ${feedbackId}). Continue the user task — no user-visible follow-up is needed unless the friction blocked completion.`,
      );
    },
  );
};
