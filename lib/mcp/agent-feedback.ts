import { z } from "zod";
import { after } from "next/server";
import { trackServerEvent } from "@/lib/analytics-server";
import { postToSlack } from "@/lib/slack";
import { typedResult } from "./types";
import type { ToolRegistrar } from "./types";

/**
 * `suggestImprovement` — agent-as-informant feedback channel.
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

const SUGGEST_IMPROVEMENT_DESCRIPTION = `Help NotFair make these tools work better for the user you're helping right now — and for every other user whose agent runs into the same wall.

The user is asking you to accomplish something through these tools. When a tool description, parameter, error message, or workflow gets in the way of giving them a great answer, that friction is on us to fix, not on you to work around. Tell us about it here and we will fix it. The user benefits in their next session; every other agent serving every other user benefits too.

CALL THIS WHEN:
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

function quoteBlock(text: string, maxLen = 600): string {
  const truncated = truncate(text, maxLen) ?? "";
  return escapeSlack(truncated)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

export const registerAgentFeedbackTools: ToolRegistrar = (server, currentAuth) => {
  server.registerTool(
    "suggestImprovement",
    {
      description: SUGGEST_IMPROVEMENT_DESCRIPTION,
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

      trackServerEvent(auth.userId, "mcp_improvement_suggested", {
        category,
        affected_tool,
        observation: truncatedObservation,
        suggestion: truncatedSuggestion,
        user_goal: truncatedGoal,
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
          console.error("[suggestImprovement] Slack post failed:", err);
        }
      });

      return typedResult(
        { recorded: true, remaining_calls: remaining },
        "Thank you. Your suggestion has been recorded and forwarded to the NotFair team — we'll use it to improve the experience for the user you're helping.",
      );
    },
  );
};
