import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db/db";
import { getProject } from "@/server/db/projects";
import { DEFAULT_HARNESS_ADAPTER } from "@/server/adapters/registry";
import type { Session } from "./index";
import { getOrCreateSession, listAgentSessions } from "./index";

/** UI-facing session shape for the goal page's thread views. */
export interface SessionView {
  /** Stable thread label used in URLs. */
  sessionId: string;
  /** Short label shown in thread lists. */
  label: string;
  /** The sessions row's DB primary key. */
  sessionKey: string;
  /** Last interaction (ms epoch). 0 when freshly minted. */
  lastInteractionAt: number;
  /** True when the row exists only in our cookie (no turns yet). */
  pending: boolean;
  /** User-set display title (thread rename). Null = derive from content. */
  title: string | null;
  /** True when the user pinned this thread to the top of the rail. */
  pinned: boolean;
}

function sessionRowToView(s: Session): SessionView {
  return {
    sessionId: s.label,
    label: s.label,
    sessionKey: s.id,
    lastInteractionAt: Date.parse(s.updated_at) || 0,
    pending: false,
    title: s.title,
    pinned: s.pinned_at !== null,
  };
}

export function listSessionsForAgent(
  project_slug: string,
  agent_id: string,
): SessionView[] {
  const rows = listAgentSessions(project_slug, agent_id);
  return rows.map(sessionRowToView);
}

export function newSessionId(): string {
  return randomUUID();
}

export function findSessionBySessionId(
  project_slug: string,
  agent_id: string,
  label: string,
): SessionView | null {
  // Always scope by project_slug — even though agent_id encodes the slug,
  // a project whose slug is a prefix of another's (e.g. "acme" vs "acme-q4")
  // can produce overlapping agent_id patterns. Querying by project_slug
  // closes that hole.
  const row = getDb()
    .prepare(
      "SELECT * FROM sessions WHERE project_slug = ? AND agent_id = ? AND label = ? LIMIT 1",
    )
    .get(project_slug, agent_id, label) as Session | undefined;
  return row ? sessionRowToView(row) : null;
}

/**
 * Materialize a session row immediately (used when the first chat turn is
 * about to fire and the caller wants the session UUID to exist). Falls back
 * to the project's chosen harness adapter when one isn't passed.
 */
export function materializeSession(input: {
  project_slug: string;
  agent_id: string;
  label: string;
}): Session {
  const project = getProject(input.project_slug);
  const harness = project?.harness_adapter ?? DEFAULT_HARNESS_ADAPTER;
  return getOrCreateSession({
    project_slug: input.project_slug,
    agent_id: input.agent_id,
    label: input.label,
    harness_adapter: harness,
  });
}

// ── Thread origins ──────────────────────────────────────────────────

export type SessionOrigin =
  | { kind: "tick"; tick_number: number }
  | { kind: "chat"; preview: string };

const TICK_LABEL_RE = /^tick-(\d+)$/;

/** Tick-originated sessions (not user-initiated chats). */
export function isSystemSession(label: string): boolean {
  return TICK_LABEL_RE.test(label);
}

export function pickLatestChatSession<S extends { label: string }>(
  sessions: readonly S[],
): S | undefined {
  return sessions.find((s) => !isSystemSession(s.label));
}

// Generous cap: the rail shows ~40 chars at rest and reveals the rest by
// scrolling the text horizontally on hover — a 40-char preview would give
// the marquee nothing to reveal.
const PREVIEW_MAX_CHARS = 140;

/**
 * Classify each session by origin so the thread rail can show meaningful
 * labels. Goal-loop ticks use a `tick-<n>` label; free chats fall back to
 * a preview of the first user message.
 */
export async function classifySessions(
  agent_id: string,
  project_slug: string,
  sessions: SessionView[],
): Promise<Map<string, SessionOrigin>> {
  const out = new Map<string, SessionOrigin>();
  if (sessions.length === 0) return out;

  for (const s of sessions) {
    if (s.pending) continue;
    const tickMatch = s.label.match(TICK_LABEL_RE);
    if (tickMatch) {
      out.set(s.label, { kind: "tick", tick_number: Number(tickMatch[1]) });
      continue;
    }
    const preview = readFirstUserMessagePreview(project_slug, agent_id, s.label);
    out.set(s.label, {
      kind: "chat",
      // The intake kickoff is platform-generated — label the thread by
      // what it is rather than the raw brief text.
      preview: preview.startsWith("[INTAKE]") ? "Goal kickoff" : preview,
    });
  }
  return out;
}

function readFirstUserMessagePreview(
  project_slug: string,
  agent_id: string,
  label: string,
): string {
  const session = getDb()
    .prepare(
      "SELECT id FROM sessions WHERE project_slug = ? AND agent_id = ? AND label = ?",
    )
    .get(project_slug, agent_id, label) as { id: string } | undefined;
  if (!session) return "";
  const row = getDb()
    .prepare(
      "SELECT payload_json FROM transcript_events WHERE session_id = ? AND kind = 'user' ORDER BY seq ASC LIMIT 1",
    )
    .get(session.id) as { payload_json: string } | undefined;
  if (!row) return "";
  try {
    const payload = JSON.parse(row.payload_json) as { text?: string };
    if (typeof payload.text !== "string") return "";
    return shorten(payload.text);
  } catch {
    return "";
  }
}

function shorten(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= PREVIEW_MAX_CHARS) return flat;
  return flat.slice(0, PREVIEW_MAX_CHARS - 1) + "…";
}
