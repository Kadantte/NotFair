import "server-only";
import { google, gmail_v1 } from "googleapis";

const USER_ID = "me";

function getClient(): gmail_v1.Gmail {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Gmail not configured. Set GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN via `npx tsx scripts/gmail-auth.ts`.",
    );
  }
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth });
}

export function isGmailConfigured(): boolean {
  return !!process.env.GMAIL_REFRESH_TOKEN;
}

export type GmailMessageSummary = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  date: Date;
  isFromMe: boolean;
  bodyText: string;
};

export type GmailThreadSummary = {
  id: string;
  subject: string;
  snippet: string;
  lastDate: Date;
  messageCount: number;
  messages: GmailMessageSummary[];
};

function header(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  if (!headers) return "";
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

function decodeBody(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return "";
  if (part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf-8");
  }
  if (part.parts) {
    // Prefer text/plain, fall back to text/html (stripped)
    const plain = part.parts.find((p) => p.mimeType === "text/plain");
    if (plain) return decodeBody(plain);
    const html = part.parts.find((p) => p.mimeType === "text/html");
    if (html) return decodeBody(html).replace(/<[^>]+>/g, "");
    for (const p of part.parts) {
      const v = decodeBody(p);
      if (v) return v;
    }
  }
  return "";
}

function parseMessage(msg: gmail_v1.Schema$Message): GmailMessageSummary {
  const headers = msg.payload?.headers;
  const from = header(headers, "From");
  const to = header(headers, "To");
  const subject = header(headers, "Subject");
  const dateHeader = header(headers, "Date");
  const date = dateHeader ? new Date(dateHeader) : new Date(Number(msg.internalDate ?? 0));
  const bodyText = decodeBody(msg.payload ?? undefined);
  const isFromMe = (msg.labelIds ?? []).includes("SENT");
  return {
    id: msg.id ?? "",
    threadId: msg.threadId ?? "",
    from,
    to,
    subject,
    snippet: msg.snippet ?? "",
    date,
    isFromMe,
    bodyText,
  };
}

const THREAD_CACHE_TTL_MS = 45_000;
const threadCache = new Map<string, { at: number; threads: GmailThreadSummary[] }>();

function cacheKey(email: string, limit: number): string {
  return `${email.toLowerCase()}::${limit}`;
}

export function invalidateThreadCache(email?: string): void {
  if (!email) {
    threadCache.clear();
    return;
  }
  const prefix = `${email.toLowerCase()}::`;
  for (const key of threadCache.keys()) {
    if (key.startsWith(prefix)) threadCache.delete(key);
  }
}

/**
 * List Gmail threads that involve `email` (either sent to or received from).
 * Gmail's `from:` and `to:` search matches on the participant.
 *
 * Cached for THREAD_CACHE_TTL_MS per (email, limit). Mutations should call
 * invalidateThreadCache(email) to force a refresh on the next read.
 */
export async function listThreadsForEmail(email: string, limit = 10): Promise<GmailThreadSummary[]> {
  const key = cacheKey(email, limit);
  const hit = threadCache.get(key);
  if (hit && Date.now() - hit.at < THREAD_CACHE_TTL_MS) {
    return hit.threads;
  }

  const gmail = getClient();
  const safe = email.replace(/"/g, "");
  const q = `(from:"${safe}" OR to:"${safe}")`;
  const { data } = await gmail.users.threads.list({
    userId: USER_ID,
    q,
    maxResults: limit,
  });
  const threads = data.threads ?? [];
  const full = await Promise.all(
    threads.map((t) =>
      gmail.users.threads.get({ userId: USER_ID, id: t.id!, format: "full" }),
    ),
  );
  const result = full
    .map((r) => {
      const messages = (r.data.messages ?? []).map(parseMessage);
      const last = messages[messages.length - 1];
      return {
        id: r.data.id ?? "",
        subject: messages[0]?.subject ?? "(no subject)",
        snippet: r.data.snippet ?? "",
        lastDate: last?.date ?? new Date(0),
        messageCount: messages.length,
        messages,
      };
    })
    .sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime());

  threadCache.set(key, { at: Date.now(), threads: result });
  return result;
}

function buildRawMessage(to: string, subject: string, body: string, from?: string): string {
  const lines = [
    from ? `From: <${from}>` : null,
    `To: <${to}>`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].filter(Boolean) as string[];
  return Buffer.from(lines.join("\r\n"), "utf-8").toString("base64url");
}

/**
 * Create or update a Gmail draft for `to`. If draftId is provided, the
 * existing draft is updated. Returns the Gmail draft id.
 */
export async function upsertDraft(args: {
  to: string;
  subject: string;
  body: string;
  draftId?: string | null;
}): Promise<string> {
  const gmail = getClient();
  const raw = buildRawMessage(args.to, args.subject, args.body);
  if (args.draftId) {
    const { data } = await gmail.users.drafts.update({
      userId: USER_ID,
      id: args.draftId,
      requestBody: { message: { raw } },
    });
    return data.id ?? args.draftId;
  }
  const { data } = await gmail.users.drafts.create({
    userId: USER_ID,
    requestBody: { message: { raw } },
  });
  return data.id ?? "";
}

export async function sendDraft(draftId: string): Promise<void> {
  const gmail = getClient();
  await gmail.users.drafts.send({ userId: USER_ID, requestBody: { id: draftId } });
}

export async function deleteDraft(draftId: string): Promise<void> {
  const gmail = getClient();
  await gmail.users.drafts.delete({ userId: USER_ID, id: draftId });
}
