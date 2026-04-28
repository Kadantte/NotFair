/**
 * Private auto-save for the shared_audits table (Phase 1).
 *
 * Every time a signed-in user runs an audit on notfair.co, we save the
 * anonymized result here under `visibility='private'` so they can browse
 * their history. Phase 2 (public sharing) will read the same row once
 * visibility is flipped — the anonymizer already ran, so no data leaks
 * on that upgrade path.
 *
 * This is fire-and-forget: callers should `.catch(console.error)` and
 * never await. The audit UI must not be blocked on DB writes.
 */

import "server-only";
import { db, schema } from "@/lib/db";
import { eq, and, gte, desc } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { getEnv } from "@/lib/env";
import type { AuditResult } from "./scoring";
import {
  anonymizeAuditResult,
  DEFAULT_SHARE_SETTINGS,
  type ShareSettings,
} from "./anonymize";

/** Skip saving if the same user saved the same account in the last 60s. */
const DEDUP_WINDOW_MS = 60 * 1000;

/**
 * nanoid-like slug (10 chars, URL-safe). We don't pull a dep because this
 * is the only consumer. ~58 bits of entropy — negligible collision risk at
 * Phase 1 volume; we retry on unique-constraint violation just in case.
 */
const SLUG_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";

function genSlug(len = 10): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += SLUG_ALPHABET[buf[i] % SLUG_ALPHABET.length];
  }
  return out;
}

/**
 * sha256(accountId + salt), hex. The salt is a secret env var — without it,
 * an attacker who later saw a public row couldn't enumerate account
 * fingerprints by guessing customer IDs.
 */
function fingerprintAccount(accountId: string): string {
  const salt = getEnv("AUDIT_SHARE_SALT") ?? "";
  if (!salt) {
    // Non-fatal: we still write a fingerprint, just a weaker one. Throwing
    // here would break the audit save on misconfigured envs.
    console.warn(
      "[shared-audits] AUDIT_SHARE_SALT is not set — fingerprints are unsalted",
    );
  }
  return createHash("sha256").update(`${accountId}:${salt}`).digest("hex");
}

export type SaveAuditToHistoryArgs = {
  userId: string | null;
  accountId: string;
  result: AuditResult;
  source?: "web" | "cli" | "chat";
  /** Phase 1 always uses DEFAULT_SHARE_SETTINGS. Phase 2 will let users toggle. */
  settings?: ShareSettings;
};

/**
 * Fire-and-forget. Never throws on normal paths; callers can still attach
 * .catch for visibility. Returns the inserted slug, or null if skipped.
 */
export async function saveAuditToHistory(
  args: SaveAuditToHistoryArgs,
): Promise<string | null> {
  const {
    userId,
    accountId,
    result,
    source = "web",
    settings = DEFAULT_SHARE_SETTINGS,
  } = args;

  // Phase 1 requires a signed-in user — anonymous/CLI path is Phase 2.
  if (!userId) return null;

  const fingerprint = fingerprintAccount(accountId);

  // Dedup: skip if this user has saved the same account fingerprint in
  // the last 60s. Prevents double-saves from the audit page re-rendering
  // or the user hitting refresh.
  const since = new Date(Date.now() - DEDUP_WINDOW_MS);
  const [recent] = await db()
    .select({ id: schema.sharedAudits.id })
    .from(schema.sharedAudits)
    .where(
      and(
        eq(schema.sharedAudits.ownerUserId, userId),
        eq(schema.sharedAudits.accountFingerprint, fingerprint),
        gte(schema.sharedAudits.createdAt, since),
      ),
    )
    .orderBy(desc(schema.sharedAudits.createdAt))
    .limit(1);
  if (recent) return null;

  const payload = anonymizeAuditResult(result, settings);

  // Small retry loop for the vanishingly unlikely slug collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = genSlug();
    try {
      await db().insert(schema.sharedAudits).values({
        id: randomUUID(),
        slug,
        ownerUserId: userId,
        source,
        visibility: "private",
        accountFingerprint: fingerprint,
        payload,
        showCampaignNames: settings.showCampaignNames,
        showSpend: settings.showSpend,
        showExactSpend: settings.showExactSpend,
      });
      return slug;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Postgres unique-violation on slug → try a fresh one.
      if (/duplicate key/i.test(msg) && /slug/i.test(msg) && attempt < 2) {
        continue;
      }
      throw err;
    }
  }
  return null;
}
