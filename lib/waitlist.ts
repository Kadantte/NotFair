import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * Allowlist of valid waitlist keys. Adding a key here is the only change
 * needed to wire up a new waitlist UI — the table itself is generic.
 */
export const WAITLIST_KEYS = ["meta_ads"] as const;
export type WaitlistKey = (typeof WAITLIST_KEYS)[number];

export function isWaitlistKey(value: unknown): value is WaitlistKey {
  return typeof value === "string" && (WAITLIST_KEYS as readonly string[]).includes(value);
}

export type JoinWaitlistResult = {
  joined: boolean;
  /** True when this exact (key, user_id) was already on the list. */
  alreadyOnList: boolean;
};

/**
 * Record a waitlist signup for the current session. Idempotent per
 * (key, userId) — a second click reports `alreadyOnList: true` so the UI
 * can render "You're on the list" without flipping back to the CTA.
 *
 * Anonymous callers (no session) are rejected — every entry point we
 * have today is behind the (app) layout. If we add a public landing-page
 * capture later, lift this gate and pass through `email`.
 */
export async function joinWaitlist(
  key: WaitlistKey,
  metadata: Record<string, unknown> = {},
): Promise<JoinWaitlistResult> {
  const session = await getSession();
  if (!session.connected) {
    throw new Error("Not authenticated");
  }
  const userId = session.userId;
  const email = session.googleEmail;

  if (!userId) {
    // Pending-setup sessions can have no userId yet. Insert without dedupe;
    // anonymous rows pile up and get cleaned up by email later if needed.
    await db().insert(schema.waitlistSignups).values({
      key,
      userId: null,
      email,
      metadata,
    });
    return { joined: true, alreadyOnList: false };
  }

  // Look-then-insert. Postgres `ON CONFLICT` on a partial unique index needs
  // a matching predicate clause that drizzle-orm 0.45 doesn't surface; the
  // partial unique index in 0035 still defends against races at the DB
  // level — duplicate inserts will throw and we treat the throw as
  // "already on list" so the UX stays idempotent.
  const [existing] = await db()
    .select({ id: schema.waitlistSignups.id })
    .from(schema.waitlistSignups)
    .where(
      and(
        eq(schema.waitlistSignups.key, key),
        eq(schema.waitlistSignups.userId, userId),
      ),
    )
    .limit(1);

  if (existing) return { joined: true, alreadyOnList: true };

  try {
    await db().insert(schema.waitlistSignups).values({ key, userId, email, metadata });
    return { joined: true, alreadyOnList: false };
  } catch (err) {
    // Race: someone else inserted between SELECT and INSERT. Partial unique
    // index threw; treat as "already on list" so the UI stays stable.
    if (isUniqueViolation(err)) return { joined: true, alreadyOnList: true };
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

/**
 * Has the current session already joined `key`? Drives the hub + wall UI
 * so a returning user sees "You're on the list" instead of the CTA.
 */
export async function hasJoinedWaitlist(key: WaitlistKey): Promise<boolean> {
  const session = await getSession();
  if (!session.connected || !session.userId) return false;

  const [row] = await db()
    .select({ id: schema.waitlistSignups.id })
    .from(schema.waitlistSignups)
    .where(
      and(
        eq(schema.waitlistSignups.key, key),
        eq(schema.waitlistSignups.userId, session.userId),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Has the current session been manually approved off the waitlist for
 * `key`? Approved users bypass the waitlist wall and can use the gated
 * feature. Approval is granted from /dev/waitlist.
 */
export async function isWaitlistApproved(key: WaitlistKey): Promise<boolean> {
  const session = await getSession();
  if (!session.connected || !session.userId) return false;

  const [row] = await db()
    .select({ id: schema.waitlistSignups.id })
    .from(schema.waitlistSignups)
    .where(
      and(
        eq(schema.waitlistSignups.key, key),
        eq(schema.waitlistSignups.userId, session.userId),
        isNotNull(schema.waitlistSignups.approvedAt),
      ),
    )
    .limit(1);
  return !!row;
}
