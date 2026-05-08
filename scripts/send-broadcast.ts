/**
 * Send a product-update broadcast to all NotFair users.
 *
 * Workflow:
 *   1. Author the broadcast at scripts/broadcasts/<slug>.ts
 *   2. Dry run:  npx tsx scripts/send-broadcast.ts <slug> --dry-run
 *   3. Test:     npx tsx scripts/send-broadcast.ts <slug> --test you@notfair.co
 *   4. Send:     npx tsx scripts/send-broadcast.ts <slug>
 *
 * Idempotency: re-running after a crash/partial send only sends to recipients
 * that don't yet have a resend_id, thanks to the
 * broadcast_recipients (broadcast_id, user_id) unique index.
 */

import { loadEnvLocal } from "./_load-env";
loadEnvLocal();

import { resolve } from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, isNull } from "drizzle-orm";
import { Resend } from "resend";
import { render } from "@react-email/render";
import * as schema from "../lib/db/schema";
import { OUTREACH_EMAIL, OUTREACH_FROM } from "../lib/brand";
import { renderBroadcastText } from "../lib/email/broadcast-content";
import { buildUnsubscribeUrl } from "../lib/email/broadcast-token";
import { BroadcastEmail } from "../emails/broadcast";
import { getActiveUserAudience } from "../lib/email/audience";
import type { BroadcastDefinition } from "./send-broadcast-types";

type Args = {
  slug: string;
  dryRun: boolean;
  testEmail: string | null;
};

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let dryRun = false;
  let testEmail: string | null = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--test") testEmail = argv[++i] ?? null;
    else if (a.startsWith("--")) {
      console.error(`Unknown flag: ${a}`);
      process.exit(1);
    } else positional.push(a);
  }
  if (positional.length !== 1) {
    console.error("Usage: send-broadcast <slug> [--dry-run] [--test <email>]");
    process.exit(1);
  }
  return { slug: positional[0], dryRun, testEmail };
}

async function loadDefinition(slug: string): Promise<BroadcastDefinition> {
  const path = resolve(process.cwd(), "scripts/broadcasts", `${slug}.ts`);
  let mod: { broadcast?: BroadcastDefinition };
  try {
    mod = (await import(path)) as { broadcast?: BroadcastDefinition };
  } catch (err) {
    console.error(`Failed to load broadcast at ${path}:`, err);
    process.exit(1);
  }
  if (!mod.broadcast) {
    console.error(`scripts/broadcasts/${slug}.ts must export a named \`broadcast\``);
    process.exit(1);
  }
  if (mod.broadcast.slug !== slug) {
    console.error(
      `Slug mismatch: filename "${slug}" vs export.slug "${mod.broadcast.slug}"`,
    );
    process.exit(1);
  }
  return mod.broadcast;
}

async function upsertBroadcastRow(
  database: ReturnType<typeof drizzle<typeof schema>>,
  def: BroadcastDefinition,
): Promise<{ id: number; status: string }> {
  const existing = await database
    .select({ id: schema.broadcasts.id, status: schema.broadcasts.status })
    .from(schema.broadcasts)
    .where(eq(schema.broadcasts.slug, def.slug));
  if (existing.length > 0) return existing[0];

  const [inserted] = await database
    .insert(schema.broadcasts)
    .values({
      slug: def.slug,
      subject: def.subject,
      preheader: def.preheader,
      content: def.content,
      status: "draft",
      fromAddress: OUTREACH_FROM,
      replyTo: OUTREACH_EMAIL,
    })
    .returning({ id: schema.broadcasts.id, status: schema.broadcasts.status });
  return inserted;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function listUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  // RFC 8058 one-click unsubscribe: Gmail and Outlook surface a native button
  // when both headers are present and the POST endpoint accepts the form post.
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

async function renderForRecipient(
  def: BroadcastDefinition,
  unsubscribeUrl: string,
): Promise<{ html: string; text: string }> {
  const html = await render(
    BroadcastEmail({
      preheader: def.preheader,
      content: def.content,
      unsubscribeUrl,
    }),
  );
  const text = renderBroadcastText(def.content, unsubscribeUrl);
  return { html, text };
}

async function runTestSend(
  resend: Resend,
  def: BroadcastDefinition,
  testEmail: string,
): Promise<void> {
  const fakeUserId = `test-${Buffer.from(testEmail).toString("hex").slice(0, 8)}`;
  const unsubscribeUrl = buildUnsubscribeUrl(fakeUserId, 0);
  const { html, text } = await renderForRecipient(def, unsubscribeUrl);

  console.log(`\n📧 Test send → ${testEmail}`);
  console.log(`   Subject: ${def.subject}\n`);
  const { data, error } = await resend.emails.send({
    from: OUTREACH_FROM,
    to: testEmail,
    subject: def.subject,
    replyTo: OUTREACH_EMAIL,
    html,
    text,
    headers: listUnsubscribeHeaders(unsubscribeUrl),
  });
  if (error) {
    console.error("❌ Test send failed:", error.message);
    process.exit(1);
  }
  console.log(`✅ Sent. Resend id: ${data?.id}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const def = await loadDefinition(args.slug);

  const dbUrl = process.env.DATABASE_URL;
  const apiKey = process.env.RESEND_API_KEY;
  if (!dbUrl) { console.error("Missing DATABASE_URL"); process.exit(1); }
  if (!apiKey) { console.error("Missing RESEND_API_KEY"); process.exit(1); }
  if (!process.env.BROADCAST_UNSUBSCRIBE_SECRET) {
    console.error("Missing BROADCAST_UNSUBSCRIBE_SECRET — required to sign unsubscribe links");
    process.exit(1);
  }

  const client = postgres(dbUrl, { prepare: false });
  const database = drizzle(client, { schema });
  const resend = new Resend(apiKey);

  if (args.testEmail) {
    await runTestSend(resend, def, args.testEmail);
    await client.end();
    return;
  }

  const broadcastRow = await upsertBroadcastRow(database, def);
  const broadcastId = broadcastRow.id;
  console.log(`\nBroadcast row: id=${broadcastId} status=${broadcastRow.status} slug=${def.slug}`);

  const audience = await getActiveUserAudience();
  console.log(`Audience size: ${audience.length} eligible user(s)`);

  if (audience.length === 0) {
    console.log("Nothing to send.");
    await client.end();
    return;
  }

  // Insert recipient rows up-front so the unique index governs idempotency.
  await database
    .insert(schema.broadcastRecipients)
    .values(audience.map((u) => ({ broadcastId, userId: u.userId, email: u.email })))
    .onConflictDoNothing({
      target: [schema.broadcastRecipients.broadcastId, schema.broadcastRecipients.userId],
    });

  // Pull only recipients that haven't been sent yet on this broadcast.
  const queued = await database
    .select()
    .from(schema.broadcastRecipients)
    .where(
      and(
        eq(schema.broadcastRecipients.broadcastId, broadcastId),
        isNull(schema.broadcastRecipients.resendId),
      ),
    );
  console.log(`Queued (not yet sent): ${queued.length}`);

  if (args.dryRun) {
    const sample = queued.slice(0, 5).map((r) => r.email).join(", ");
    console.log(`\n--- DRY RUN ---`);
    console.log(`Would send to ${queued.length} recipient(s).`);
    if (sample) console.log(`Sample: ${sample}${queued.length > 5 ? ", …" : ""}`);
    console.log(`Subject: ${def.subject}`);
    console.log(`From: ${OUTREACH_FROM}`);
    console.log(`Reply-To: ${OUTREACH_EMAIL}\n`);
    await client.end();
    return;
  }

  await database
    .update(schema.broadcasts)
    .set({ status: "sending", updatedAt: new Date() })
    .where(eq(schema.broadcasts.id, broadcastId));

  const batches = chunk(queued, 100);
  let sent = 0;
  let failed = 0;

  for (const [i, batchRows] of batches.entries()) {
    const rendered = await Promise.all(
      batchRows.map(async (r) => {
        const unsubscribeUrl = buildUnsubscribeUrl(r.userId, broadcastId);
        const { html, text } = await renderForRecipient(def, unsubscribeUrl);
        return { row: r, unsubscribeUrl, html, text };
      }),
    );

    const apiPayload = rendered.map((item) => ({
      from: OUTREACH_FROM,
      to: item.row.email,
      subject: def.subject,
      replyTo: OUTREACH_EMAIL,
      html: item.html,
      text: item.text,
      headers: listUnsubscribeHeaders(item.unsubscribeUrl),
    }));

    console.log(`Batch ${i + 1}/${batches.length} — sending ${apiPayload.length}…`);
    const { data, error } = await resend.batch.send(apiPayload);
    if (error || !data) {
      console.error(`  ❌ Batch failed: ${error?.message ?? "unknown error"}`);
      failed += apiPayload.length;
      const now = new Date();
      const errorMessage = error?.message ?? "batch_error";
      await Promise.all(
        rendered.map((item) =>
          database
            .update(schema.broadcastRecipients)
            .set({ status: "failed", errorMessage, sentAt: now })
            .where(eq(schema.broadcastRecipients.id, item.row.id)),
        ),
      );
      continue;
    }

    const ids = (data as { data?: { id: string }[] }).data ?? [];
    const now = new Date();
    const updates = await Promise.all(
      rendered.map(async (item, j) => {
        const id = ids[j]?.id;
        if (!id) {
          await database
            .update(schema.broadcastRecipients)
            .set({ status: "failed", errorMessage: "no id returned" })
            .where(eq(schema.broadcastRecipients.id, item.row.id));
          return false;
        }
        await database
          .update(schema.broadcastRecipients)
          .set({ resendId: id, status: "sent", sentAt: now })
          .where(eq(schema.broadcastRecipients.id, item.row.id));
        return true;
      }),
    );
    for (const ok of updates) {
      if (ok) sent++;
      else failed++;
    }
    console.log(`  ✅ Batch ${i + 1} done (sent so far: ${sent})`);
  }

  await database
    .update(schema.broadcasts)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.broadcasts.id, broadcastId));

  console.log(`\n✅ ${sent} sent, ${failed} failed (queued: ${queued.length})`);
  await client.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
