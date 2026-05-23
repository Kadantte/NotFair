/**
 * Manual end-to-end send of the trial-end alert email + email_sends row.
 *
 * Usage:
 *   pnpm tsx scripts/test-send-trial-end-email.ts <to-address>
 *
 * What it does:
 *   1. Sends the trial-end email via Resend HTTP API.
 *   2. INSERTs an email_sends row with kind='trial_end' so the send shows up
 *      in /dev/email/trial-end-alert.
 *
 * What it does NOT do:
 *   - Update any subscriptions latch. This is a synthetic test send — it
 *     won't suppress a future cron send for the recipient's real account.
 *   - Verify Resend webhook flow. Delivered / opened / clicked / bounced
 *     events only land on the email_sends row if the Resend webhook is
 *     configured to POST to /api/webhooks/resend and RESEND_WEBHOOK_SECRET
 *     is set in the runtime env that receives those callbacks.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as schema from "../lib/db/schema";
import { FREE_MONTHLY_OP_LIMIT } from "../lib/free-quota";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

const FROM = "NotFair <alert@updates.notfair.co>";
const REPLY_TO = "tong@notfair.co";
const UPGRADE_URL = "https://notfair.co/pricing";

function buildEmail() {
  const subject = "Your NotFair trial just ended";
  const text = [
    "Hey there,",
    "",
    "Your 7-day NotFair trial just ended. Your account stays active on the Free plan, which includes:",
    "",
    `  • ${FREE_MONTHLY_OP_LIMIT} MCP operations per month (Google Ads + Meta Ads combined)`,
    "  • All read tools (audits, search-term reports, performance queries)",
    "  • Write tools subject to the monthly cap",
    "",
    "Upgrade to Growth for unlimited Google Ads + Meta Ads MCP operations:",
    UPGRADE_URL,
    "",
    "If you have any questions, just reply to this email.",
    "",
    "— NotFair (TEST SEND)",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${subject}</title></head>
  <body style="margin:0;padding:0;background:#F5F3EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1917;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F3EE;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#FFFFFF;border:1px solid #E5E1D8;border-radius:6px;">
          <tr><td style="padding:32px 32px 8px 32px;">
            <div style="font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6B6862;line-height:1.5;">
              NotFair.co &mdash; Google Ads MCP &mdash; Meta Ads MCP &middot; Test send
            </div>
          </td></tr>
          <tr><td style="padding:8px 32px 0 32px;"><h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700;color:#1A1917;">Your trial just ended</h1></td></tr>
          <tr><td style="padding:16px 32px 0 32px;font-size:15px;line-height:1.55;color:#2E2D28;">Your 7-day NotFair trial is up. Your account stays active on the <strong>Free plan</strong>, which gives you:</td></tr>
          <tr><td style="padding:12px 32px 0 32px;font-size:15px;line-height:1.6;color:#2E2D28;">
            <ul style="margin:0;padding-left:20px;">
              <li><strong>${FREE_MONTHLY_OP_LIMIT} MCP operations per month</strong> &mdash; Google Ads and Meta Ads combined</li>
              <li>All read tools (audits, search-term reports, performance queries)</li>
              <li>Write tools, subject to the monthly cap</li>
            </ul>
          </td></tr>
          <tr><td style="padding:24px 32px 0 32px;font-size:15px;line-height:1.55;color:#2E2D28;">Need more headroom? Growth removes the cap entirely &mdash; unlimited Google Ads and Meta Ads MCP operations.</td></tr>
          <tr><td style="padding:24px 32px 0 32px;">
            <a href="${UPGRADE_URL}" style="display:inline-block;background:#4CAF6E;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:4px;">Upgrade to Growth →</a>
          </td></tr>
          <tr><td style="padding:24px 32px 32px 32px;font-size:13px;line-height:1.55;color:#6B6862;">Questions? Just reply to this email and we'll get back to you.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  return { subject, html, text };
}

async function main() {
  loadEnvLocal();

  const to = process.argv[2];
  if (!to) {
    console.error("Usage: pnpm tsx scripts/test-send-trial-end-email.ts <to-address>");
    process.exit(1);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY missing");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL missing");

  const { subject, html, text } = buildEmail();
  console.log(`[test-send] POSTing to Resend (to=${to})…`);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to,
      reply_to: REPLY_TO,
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  const { id } = (await res.json()) as { id: string };
  console.log(`[test-send] Resend accepted. id=${id}`);

  const sql = postgres(dbUrl, { prepare: false, max: 1 });
  try {
    const db = drizzle(sql, { schema });
    const now = new Date();
    const env = process.env.NODE_ENV === "production" ? "live" : "test";
    const inserted = await db
      .insert(schema.emailSends)
      .values({
        kind: "trial_end",
        // Synthetic userId so this row doesn't collide with real subscriptions
        // lookups. The dashboard's "paid?" column will show Free for this row.
        userId: `test:${to}`,
        env,
        email: to,
        resendId: id,
        status: "sent",
        sentAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: schema.emailSends.resendId })
      .returning({ id: schema.emailSends.id });
    console.log(`[test-send] email_sends row id=${inserted[0]?.id ?? "(conflict)"} env=${env}`);
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log("[test-send] DONE");
}

main().catch((err) => {
  console.error("[test-send] FAILED:", err);
  process.exit(1);
});
