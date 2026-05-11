import { z } from "zod";
import { after } from "next/server";
import { db, schema } from "@/lib/db";
import { trackServerEvent } from "@/lib/analytics-server";
import { postToSlack } from "@/lib/slack";
import { typedResult } from "./types";
import { escapeSlack, quoteBlock, resolveUserEmail, truncate } from "./slack-format";
import type { ToolRegistrar } from "./types";

/**
 * `askSupport` — direct user-to-NotFair support channel.
 *
 * Fired when the user explicitly wants to reach the NotFair support team.
 * Generates a ticket ID, posts a formatted Slack message, and fires a
 * PostHog event as the durable record.
 *
 * Rate limit: 3 per session per hour. The session-based counter (same
 * Map pattern as agent-feedback.ts) is the runaway-loop safety net; the
 * prompt-side guidance is the primary control.
 */

const ASK_SUPPORT_DESCRIPTION = `Contact NotFair support. Use this tool when the user explicitly wants to reach the support team — for example, they say "contact support", "file a bug", "report an issue", "I need help from the NotFair team", or "this is a NotFair problem not a Google Ads problem".

This sends a message directly to the NotFair team and generates a ticket. The user will receive a response via email within 1 business day.

DO NOT use this for:
- Routine Google Ads questions you can answer yourself.
- Internal tool quality issues — use fileInternalNotFairToolFeedback for those.
- Questions you haven't tried to answer yet.

Only call this when the user has explicitly asked to contact support, or when you've exhausted your ability to help and the user agrees escalation is the right move.`;

const PER_SESSION_LIMIT = 3;
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

function generateTicketId(): string {
  const ts = Date.now().toString(36).slice(-6).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `NF-${ts}${rand}`;
}

export const registerUserSupportTools: ToolRegistrar = (server, currentAuth) => {
  server.registerTool(
    "askSupport",
    {
      description: ASK_SUPPORT_DESCRIPTION,
      inputSchema: {
        message: z
          .string()
          .min(10)
          .max(2000)
          .describe(
            "The user's message to the support team. Write it in first person as if the user wrote it.",
          ),
        context: z
          .string()
          .max(500)
          .optional()
          .describe(
            "Brief context about what the user was trying to do. Omit PII except what the user explicitly included.",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ message, context }) => {
      const auth = currentAuth();

      const { allowed, remaining } = recordCall(auth.sessionId, auth.userId);
      if (!allowed) {
        return typedResult(
          { recorded: false, reason: "rate_limited", remaining_calls: 0 },
          "Support limit reached for this session. If this is urgent, email support@notfair.co directly.",
        );
      }

      const ticketId = generateTicketId();
      const truncatedMessage = truncate(message, 2000) ?? "";
      const truncatedContext = truncate(context, 500);

      const userEmail = await resolveUserEmail(auth.sessionId, auth.userId);

      // Write to DB before returning so the ticket survives Slack/PostHog
      // delivery failures. Errors are non-fatal — the tool still confirms
      // to the user, and the Slack + PostHog paths fire regardless.
      try {
        await db().insert(schema.supportTickets).values({
          ticketId,
          userId: auth.userId ?? null,
          sessionId: auth.sessionId ?? null,
          message: truncatedMessage,
          context: truncatedContext ?? null,
          userEmail,
          clientName: auth.clientName ?? null,
        });
      } catch (err) {
        console.error("[askSupport] DB insert failed:", err);
      }

      const clientLabel = [
        auth.clientName ?? "unknown-client",
        auth.clientVersion ? `v${auth.clientVersion}` : null,
      ]
        .filter(Boolean)
        .join(" ");

      trackServerEvent(auth.userId, "mcp_support_requested", {
        ticket_id: ticketId,
        message: truncatedMessage,
        context: truncatedContext,
        user_email: userEmail,
        client_name: auth.clientName ?? null,
        client_version: auth.clientVersion ?? null,
        auth_method: auth.authMethod ?? null,
        session_id: auth.sessionId ?? null,
        remaining_calls: remaining,
      });

      const slackText = [
        `:sos: *Support request — ${ticketId}*`,
        `*User:* ${userEmail ? escapeSlack(userEmail) : "unknown"}  ·  *Client:* ${escapeSlack(clientLabel)}  ·  *Session:* ${auth.sessionId ?? "n/a"}`,
        ``,
        `*Message:*`,
        quoteBlock(truncatedMessage, 2000),
        truncatedContext ? `\n*Context:*\n${quoteBlock(truncatedContext)}` : null,
      ]
        .filter((line) => line !== null)
        .join("\n");

      // Defer the Slack post via `after()` so it runs after the response is
      // sent. Errors are swallowed — the DB row is the durable record.
      // Slack is the human-visible mirror; PostHog is for analytics.
      after(async () => {
        try {
          await postToSlack(slackText);
        } catch (err) {
          console.error("[askSupport] Slack post failed:", err);
        }
      });

      return typedResult(
        { recorded: true, ticket_id: ticketId, remaining_calls: remaining },
        `Support request received (ticket: ${ticketId}). The NotFair team will respond to ${userEmail ?? "your email"} within 1 business day.`,
      );
    },
  );
};
