import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/email/broadcast-token";

async function applyUnsubscribe(token: string | null): Promise<{ ok: boolean; reason?: string }> {
  if (!token) return { ok: false, reason: "missing_token" };
  const decoded = verifyUnsubscribeToken(token);
  if (!decoded) return { ok: false, reason: "invalid_token" };

  const { userId, broadcastId } = decoded;
  const now = new Date();

  await db()
    .insert(schema.emailPreferences)
    .values({ userId, unsubscribedMarketingAt: now })
    .onConflictDoUpdate({
      target: schema.emailPreferences.userId,
      set: { unsubscribedMarketingAt: now, updatedAt: now },
    });

  await db()
    .update(schema.broadcastRecipients)
    .set({ unsubscribedAt: now })
    .where(
      and(
        eq(schema.broadcastRecipients.userId, userId),
        eq(schema.broadcastRecipients.broadcastId, broadcastId),
      ),
    );

  return { ok: true };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await applyUnsubscribe(url.searchParams.get("token"));

  if (!result.ok) {
    return htmlPage(
      "This unsubscribe link is invalid or has expired. If you didn't mean to land here, you can safely close this tab.",
      400,
    );
  }
  return htmlPage(
    "You've been unsubscribed from NotFair product updates. We won't email you about new releases anymore — you'll still receive account-essential emails like login links and billing receipts.",
    200,
  );
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("token");
  if (!token) {
    try {
      const form = await request.formData();
      const fromForm = form.get("token");
      if (typeof fromForm === "string") token = fromForm;
    } catch {
      // ignore — fall through to invalid_token
    }
  }
  const result = await applyUnsubscribe(token);
  return new NextResponse(result.ok ? "ok" : "invalid", {
    status: result.ok ? 200 : 400,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function htmlPage(message: string, status: number): NextResponse {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Unsubscribe — NotFair</title>
  <style>
    body { font-family: ui-sans-serif, -apple-system, system-ui, sans-serif; background: #f8f9fa; margin: 0; padding: 48px 16px; color: #222; }
    .card { max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    h1 { font-size: 18px; margin: 0 0 16px; color: #111; }
    p { font-size: 15px; line-height: 1.55; margin: 0 0 12px; color: #333; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>NotFair</h1>
    <p>${message}</p>
    <p><a href="https://www.notfair.co">Back to NotFair</a></p>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
