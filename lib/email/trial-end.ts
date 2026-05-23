import "server-only";

import { getRequiredEnv } from "@/lib/env";
import { FREE_MONTHLY_OP_LIMIT } from "@/lib/free-quota";

/**
 * Trial-end notification email.
 *
 * Sent by the daily /api/cron/trial-end-emails job when a user's 7-day trial
 * lapses without an entitled Stripe subscription. Tells them what they still
 * have on the Free plan and points to /pricing to upgrade.
 *
 * Transactional in intent (one-time account state change), but treated as
 * marketing for unsubscribe purposes — callers must filter out users with
 * `email_preferences.unsubscribed_marketing_at IS NOT NULL`.
 */

const FROM = "NotFair <alert@updates.notfair.co>";
const REPLY_TO = "tong@notfair.co";
const UPGRADE_URL = "https://notfair.co/pricing";

export interface TrialEndEmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface BuildTrialEndEmailOptions {
  /** Recipient's first name for personalized greeting. Null → generic "Hey there,". */
  firstName?: string | null;
}

export function buildTrialEndEmail(opts: BuildTrialEndEmailOptions = {}): TrialEndEmailContent {
  const subject = "Your NotFair trial just ended";

  // Greeting personalization: prefer first name if we have it, fall back
  // to "Hey there," (avoid awkward "Hey ," empty-string artifacts).
  const safeFirstName = opts.firstName?.trim();
  const greeting = safeFirstName ? `Hey ${safeFirstName},` : "Hey there,";
  const greetingHtml = safeFirstName
    ? `Hey ${escapeHtml(safeFirstName)},`
    : "Hey there,";

  const text = [
    greeting,
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
    "— NotFair",
  ].join("\n");

  // Inline styles only — email clients strip <style> blocks unpredictably.
  // Light background; the brand green (#4CAF6E) carries the CTA.
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F5F3EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1917;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F3EE;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#FFFFFF;border:1px solid #E5E1D8;border-radius:6px;">
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <div style="font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6B6862;line-height:1.5;">
                  NotFair.co &mdash; Google Ads MCP &mdash; Meta Ads MCP
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;">
                <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:700;color:#1A1917;">Your trial just ended</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;font-size:15px;line-height:1.55;color:#2E2D28;">
                ${greetingHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;font-size:15px;line-height:1.55;color:#2E2D28;">
                Your 7-day NotFair trial is up. Your account stays active on the <strong>Free plan</strong>, which gives you:
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 0 32px;font-size:15px;line-height:1.6;color:#2E2D28;">
                <ul style="margin:0;padding-left:20px;">
                  <li><strong>${FREE_MONTHLY_OP_LIMIT} MCP operations per month</strong> &mdash; Google Ads and Meta Ads combined</li>
                  <li>All read tools (audits, search-term reports, performance queries)</li>
                  <li>Write tools, subject to the monthly cap</li>
                </ul>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0 32px;font-size:15px;line-height:1.55;color:#2E2D28;">
                Need more headroom? Growth removes the cap entirely &mdash; unlimited Google Ads and Meta Ads MCP operations.
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0 32px;">
                <a href="${UPGRADE_URL}" style="display:inline-block;background:#4CAF6E;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:4px;">Upgrade to Growth →</a>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px 32px;font-size:13px;line-height:1.55;color:#6B6862;">
                Questions? Just reply to this email and we'll get back to you.
              </td>
            </tr>
          </table>
          <div style="max-width:560px;width:100%;padding:16px 8px 0 8px;font-size:12px;line-height:1.5;color:#8B877F;text-align:center;">
            You're receiving this because your NotFair trial ended. Manage notifications in your account settings.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

export interface SendTrialEndEmailOptions {
  to: string;
  /** Optional first name for personalized greeting; passed through to the
   *  builder. Null/undefined → generic "Hey there," fallback. */
  firstName?: string | null;
}

/**
 * POST one email to Resend. Throws on non-2xx; on success returns the
 * Resend message id (caller stamps `trial_end_email_sent_at` only after
 * this resolves, so a Resend outage doesn't permanently mark a user
 * "emailed").
 */
export async function sendTrialEndEmail(opts: SendTrialEndEmailOptions): Promise<string> {
  const apiKey = getRequiredEnv("RESEND_API_KEY");
  const { subject, html, text } = buildTrialEndEmail({ firstName: opts.firstName ?? null });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: opts.to,
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
  const json = (await res.json()) as { id?: string };
  if (!json.id) {
    throw new Error("Resend response missing id");
  }
  return json.id;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
