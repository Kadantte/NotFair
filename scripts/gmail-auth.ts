/**
 * One-time Gmail OAuth token grab for the internal mini-CRM.
 *
 * Usage:
 *   npx tsx scripts/gmail-auth.ts
 *
 * Requires GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET in .env.local —
 * a dedicated "Desktop app" OAuth client (separate from the Ads OAuth client
 * so user-facing sign-in is untouched). The script spins up a localhost
 * callback on port 53682, opens your browser, and after you sign in as
 * the mailbox you want NotFair to send from it prints a GMAIL_REFRESH_TOKEN
 * line to paste into .env.local and `vercel env add GMAIL_REFRESH_TOKEN`.
 *
 * Desktop clients implicitly allow http://localhost loopback redirects, so no
 * redirect URI whitelisting is needed. The OAuth consent screen must have the
 * Gmail scopes added and be published (not in Testing) — otherwise the
 * refresh token expires after 7 days.
 */
import { google } from "googleapis";
import http from "node:http";
import { URL } from "node:url";
import { exec } from "node:child_process";
import { loadEnvLocal } from "./_load-env";

loadEnvLocal();

const CLIENT_ID = process.env.GMAIL_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_OAUTH_CLIENT_SECRET;
const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing GMAIL_OAUTH_CLIENT_ID or GMAIL_OAUTH_CLIENT_SECRET in .env.local");
  console.error("Create a Desktop OAuth client in GCP and paste the ID/secret into .env.local.");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) {
    res.writeHead(404).end();
    return;
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("missing code");
    return;
  }
  try {
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>Done.</h1><p>You can close this tab and return to the terminal.</p>");
    console.log("\n✅ Success. Add to .env.local and Vercel:\n");
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    if (!tokens.refresh_token) {
      console.log("\n⚠️  No refresh_token returned. Revoke prior consent at https://myaccount.google.com/permissions and re-run.");
    }
    console.log("\nAlso add to Vercel:");
    console.log("  vercel env add GMAIL_REFRESH_TOKEN\n");
    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500).end(String(err));
    console.error(err);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Listening on ${REDIRECT_URI}`);
  console.log("Opening browser...\n");
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${opener} "${authUrl}"`);
  console.log("If browser did not open, visit:\n" + authUrl);
});
