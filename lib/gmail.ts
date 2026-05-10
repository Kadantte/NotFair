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
  // -in:drafts so unsent drafts (which we render in the editor above) don't
  // also appear in thread history. Drafts carry the DRAFT label and lack SENT,
  // which would otherwise render them as "Received".
  const q = `(from:"${safe}" OR to:"${safe}") -in:drafts`;
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
      const messages = (r.data.messages ?? [])
        .filter((m) => !(m.labelIds ?? []).includes("DRAFT"))
        .map(parseMessage);
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
    .filter((t) => t.messageCount > 0)
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

export type GmailDraftLookup = {
  draftId: string;
  subject: string;
  body: string;
};

/**
 * Find the most recent Gmail draft addressed to `email`, if any. Used so the
 * Reach out panel surfaces drafts created out-of-band (e.g., via the Gmail MCP
 * directly) instead of showing an empty editor.
 */
export async function findDraftForEmail(email: string): Promise<GmailDraftLookup | null> {
  const gmail = getClient();
  const safe = email.replace(/"/g, "");
  const { data } = await gmail.users.drafts.list({
    userId: USER_ID,
    q: `to:"${safe}"`,
    maxResults: 10,
  });
  const drafts = data.drafts ?? [];
  if (drafts.length === 0) return null;
  // Drafts list doesn't include headers — fetch each and pick the newest by
  // internalDate. 10 fetches is fine for the rare lookup path.
  const full = await Promise.all(
    drafts
      .filter((d) => d.id)
      .map((d) =>
        gmail.users.drafts.get({ userId: USER_ID, id: d.id!, format: "full" }),
      ),
  );
  let newest: { draftId: string; msg: gmail_v1.Schema$Message; ts: number } | null = null;
  for (const r of full) {
    const draftId = r.data.id;
    const msg = r.data.message;
    if (!draftId || !msg) continue;
    const ts = Number(msg.internalDate ?? 0);
    if (!newest || ts > newest.ts) newest = { draftId, msg, ts };
  }
  if (!newest) return null;
  const subject = header(newest.msg.payload?.headers ?? undefined, "Subject");
  const body = decodeBody(newest.msg.payload ?? undefined);
  return { draftId: newest.draftId, subject, body };
}

/**
 * List the lowercased recipient emails of every Gmail draft in the mailbox.
 * Used by the dev customers page to tag rows that already have an outreach
 * draft prepared (including ones created out-of-band via the Gmail MCP, which
 * never touch our contacts table). Caps at 500 drafts which is well above
 * anything we'd realistically have queued.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    results.push(...(await Promise.all(chunk.map(fn))));
  }
  return results;
}

export async function listDraftRecipientEmails(): Promise<Set<string>> {
  const gmail = getClient();
  const out = new Set<string>();
  let pageToken: string | undefined = undefined;
  let pages = 0;
  do {
    const listResp: { data: gmail_v1.Schema$ListDraftsResponse } =
      await gmail.users.drafts.list({
        userId: USER_ID,
        maxResults: 100,
        pageToken,
      });
    const drafts: gmail_v1.Schema$Draft[] = listResp.data.drafts ?? [];
    if (drafts.length === 0) break;
    const headers = await mapWithConcurrency(
      drafts.filter((d) => !!d.id),
      8,
      async (d) => {
        try {
          return await gmail.users.drafts.get({
            userId: USER_ID,
            id: d.id as string,
            format: "metadata",
          });
        } catch {
          return null;
        }
      },
    );
    for (const r of headers) {
      if (!r) continue;
      const to = header(r.data.message?.payload?.headers ?? undefined, "To");
      if (!to) continue;
      // "Name <email>" or bare "email" — extract the email portion
      const match = to.match(/<([^>]+)>/);
      const email = (match ? match[1] : to).trim().toLowerCase();
      if (email.includes("@")) out.add(email);
    }
    pageToken = listResp.data.nextPageToken ?? undefined;
    pages += 1;
  } while (pageToken && pages < 5);
  return out;
}

export async function sendDraft(draftId: string): Promise<void> {
  const gmail = getClient();
  await gmail.users.drafts.send({ userId: USER_ID, requestBody: { id: draftId } });
}

export async function deleteDraft(draftId: string): Promise<void> {
  const gmail = getClient();
  await gmail.users.drafts.delete({ userId: USER_ID, id: draftId });
}
