/**
 * Gmail draft helper — list, create, update, delete, send.
 *
 * Prefers GMAIL_SERVICE_ACCOUNT_JSON + GMAIL_IMPERSONATE_USER for Workspace
 * domain-wide delegation. Falls back to the legacy GMAIL_REFRESH_TOKEN flow set
 * up by scripts/gmail-auth.ts.
 *
 * Usage:
 *   bunx tsx scripts/gmail-draft.ts list [gmail-query]
 *   bunx tsx scripts/gmail-draft.ts get <draft-id>
 *   bunx tsx scripts/gmail-draft.ts create --to x@y.com --subject "..." --body "..."
 *   bunx tsx scripts/gmail-draft.ts update <draft-id> --to x@y.com --subject "..." --body "..."
 *   bunx tsx scripts/gmail-draft.ts delete <draft-id>
 *   bunx tsx scripts/gmail-draft.ts delete-by-to <email>     # deletes ALL drafts to that recipient
 *   bunx tsx scripts/gmail-draft.ts send <draft-id>
 *
 * Body can be supplied with --body "inline" or --body-file path/to/body.txt.
 * Subjects and bodies with newlines: use --body-file.
 */

import { readFileSync } from "fs";
import { google } from "googleapis";
import { loadEnvLocal } from "./_load-env";

loadEnvLocal();

const {
  GMAIL_OAUTH_CLIENT_ID,
  GMAIL_OAUTH_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN,
  GMAIL_SERVICE_ACCOUNT_JSON,
  GMAIL_IMPERSONATE_USER,
} = process.env;

function parseServiceAccount() {
  if (!GMAIL_SERVICE_ACCOUNT_JSON) return null;
  try {
    const decoded = GMAIL_SERVICE_ACCOUNT_JSON.trim().startsWith("{")
      ? GMAIL_SERVICE_ACCOUNT_JSON
      : Buffer.from(GMAIL_SERVICE_ACCOUNT_JSON, "base64").toString("utf8");
    return JSON.parse(decoded) as { client_email?: string; private_key?: string };
  } catch (error) {
    throw new Error(
      `GMAIL_SERVICE_ACCOUNT_JSON must be raw JSON or base64-encoded JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function getImpersonatedUser(): string {
  const subject = GMAIL_IMPERSONATE_USER?.trim();
  if (!subject) {
    throw new Error("GMAIL_IMPERSONATE_USER is required when using GMAIL_SERVICE_ACCOUNT_JSON");
  }
  return subject;
}

function gmailClient() {
  const serviceAccount = parseServiceAccount();
  if (serviceAccount) {
    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error("GMAIL_SERVICE_ACCOUNT_JSON is missing client_email or private_key");
    }
    const auth = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ["https://www.googleapis.com/auth/gmail.compose"],
      subject: getImpersonatedUser(),
    });
    return google.gmail({ version: "v1", auth });
  }

  if (!GMAIL_OAUTH_CLIENT_ID || !GMAIL_OAUTH_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    console.error("Missing Gmail auth. Set GMAIL_SERVICE_ACCOUNT_JSON + GMAIL_IMPERSONATE_USER, or legacy GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN in .env.local");
    console.error("Legacy OAuth setup: bunx tsx scripts/gmail-auth.ts");
    process.exit(1);
  }

  const oauth2 = new google.auth.OAuth2(GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth: oauth2 });
}

const gmail = gmailClient();

function parseFlags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--") && i + 1 < argv.length) {
      out[argv[i].slice(2)] = argv[++i];
    }
  }
  return out;
}

function buildRfc822(to: string, subject: string, body: string): string {
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
  ].join("\r\n");
  const rfc822 = `${headers}\r\n\r\n${body}`;
  return Buffer.from(rfc822, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function resolveBody(flags: Record<string, string>): string {
  if (flags["body-file"]) return readFileSync(flags["body-file"], "utf-8");
  if (flags.body !== undefined) return flags.body;
  throw new Error("Required: --body <inline> or --body-file <path>");
}

function requireStr(val: string | undefined, name: string): string {
  if (!val) throw new Error(`Required: --${name}`);
  return val;
}

async function list(query: string | undefined) {
  const res = await gmail.users.drafts.list({ userId: "me", q: query, maxResults: 50 });
  const drafts = res.data.drafts ?? [];
  if (drafts.length === 0) {
    console.log("No drafts found.");
    return;
  }
  for (const d of drafts) {
    const full = await gmail.users.drafts.get({ userId: "me", id: d.id!, format: "metadata" });
    const headers = full.data.message?.payload?.headers ?? [];
    const to = headers.find((h) => h.name === "To")?.value ?? "";
    const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
    console.log(`${d.id}\t${to}\t${subject}`);
  }
}

async function get(id: string) {
  const res = await gmail.users.drafts.get({ userId: "me", id, format: "full" });
  const headers = res.data.message?.payload?.headers ?? [];
  const to = headers.find((h) => h.name === "To")?.value ?? "";
  const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
  const part = res.data.message?.payload;
  let bodyData = part?.body?.data;
  if (!bodyData && part?.parts) {
    const textPart = part.parts.find((p) => p.mimeType === "text/plain");
    bodyData = textPart?.body?.data;
  }
  const body = bodyData ? Buffer.from(bodyData, "base64").toString("utf-8") : "";
  console.log(`ID: ${id}\nTo: ${to}\nSubject: ${subject}\n---\n${body}`);
}

async function create(flags: Record<string, string>) {
  const to = requireStr(flags.to, "to");
  const subject = requireStr(flags.subject, "subject");
  const body = resolveBody(flags);
  const raw = buildRfc822(to, subject, body);
  const res = await gmail.users.drafts.create({ userId: "me", requestBody: { message: { raw } } });
  console.log(`created ${res.data.id}`);
}

async function update(id: string, flags: Record<string, string>) {
  const to = requireStr(flags.to, "to");
  const subject = requireStr(flags.subject, "subject");
  const body = resolveBody(flags);
  const raw = buildRfc822(to, subject, body);
  const res = await gmail.users.drafts.update({ userId: "me", id, requestBody: { message: { raw } } });
  console.log(`updated ${res.data.id}`);
}

async function del(id: string) {
  await gmail.users.drafts.delete({ userId: "me", id });
  console.log(`deleted ${id}`);
}

async function deleteByTo(email: string) {
  const res = await gmail.users.drafts.list({ userId: "me", q: `to:${email}`, maxResults: 50 });
  const drafts = res.data.drafts ?? [];
  if (drafts.length === 0) {
    console.log(`No drafts to ${email}.`);
    return;
  }
  for (const d of drafts) {
    await gmail.users.drafts.delete({ userId: "me", id: d.id! });
    console.log(`deleted ${d.id}`);
  }
  console.log(`Removed ${drafts.length} draft(s) to ${email}.`);
}

async function send(id: string) {
  const res = await gmail.users.drafts.send({ userId: "me", requestBody: { id } });
  console.log(`sent ${res.data.id}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  const positional = rest.filter((a, i) => !a.startsWith("--") && !(i > 0 && rest[i - 1].startsWith("--")));

  switch (cmd) {
    case "list":
      return list(positional[0]);
    case "get":
      return get(requireStr(positional[0], "draft-id"));
    case "create":
      return create(flags);
    case "update":
      return update(requireStr(positional[0], "draft-id"), flags);
    case "delete":
      return del(requireStr(positional[0], "draft-id"));
    case "delete-by-to":
      return deleteByTo(requireStr(positional[0], "email"));
    case "send":
      return send(requireStr(positional[0], "draft-id"));
    default:
      console.error("Unknown command. See file header for usage.");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err?.message ?? err);
  process.exit(1);
});
