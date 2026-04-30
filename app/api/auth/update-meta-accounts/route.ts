/**
 * Update the user's Meta ad-account selection (which accounts are LINKED).
 *
 * Body:
 *   {
 *     selectedIds: string[]   // subset of platform_metadata.available_account_ids
 *   }
 *
 * `account_ids` is the curated subset NotFair is allowed to touch — same
 * role as Google's `mcp_sessions.customerIds`. The full Meta-side
 * enumeration lives in `platform_metadata.available_account_ids` and is
 * refreshed only on re-OAuth.
 *
 * `active_account_id` is the per-session default and is changed via the
 * navbar account switcher (`/api/auth/select-meta-account`), NOT here.
 * This endpoint preserves the existing active selection if it's still in
 * the new subset; if the user just unchecked their active account, the
 * server falls back to the first selected account as the default. Active
 * goes to null if the selection is empty.
 *
 * Validation:
 *   - selectedIds must be a subset of available_account_ids — defends
 *     against a stale UI or attacker submitting an arbitrary id.
 *   - Empty selection is allowed but parks the connection in a "no usable
 *     accounts" state — tools 401 until the user picks at least one.
 */

import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuthContext } from "@/lib/session";

type AccountEntry = {
  id: string;
  name?: string;
  currency?: string;
  timezone?: string;
  business_id?: string;
};

export async function POST(request: Request) {
  let userId: string | null = null;
  try {
    const ctx = await getAuthContext();
    userId = ctx.session.userId;
  } catch {
    return NextResponse.json({ error: "not_authenticated" }, { status: 403 });
  }
  if (!userId) {
    return NextResponse.json({ error: "no_user_id" }, { status: 403 });
  }

  let body: { selectedIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (
    !Array.isArray(body.selectedIds)
    || !body.selectedIds.every((id) => typeof id === "string")
  ) {
    return NextResponse.json(
      { error: "selectedIds must be string[]" },
      { status: 400 },
    );
  }
  const selectedIds = body.selectedIds as string[];

  // Load the user's connection to validate against `available_account_ids`
  // and to compute the new active default.
  const [conn] = await db()
    .select({
      id: schema.adPlatformConnections.id,
      accountIds: schema.adPlatformConnections.accountIds,
      activeAccountId: schema.adPlatformConnections.activeAccountId,
      platformMetadata: schema.adPlatformConnections.platformMetadata,
    })
    .from(schema.adPlatformConnections)
    .where(
      and(
        eq(schema.adPlatformConnections.userId, userId),
        eq(schema.adPlatformConnections.platform, "meta_ads"),
      ),
    )
    .limit(1);

  if (!conn) {
    return NextResponse.json({ error: "no_meta_connection" }, { status: 404 });
  }

  // Available accounts come from platform_metadata.available_account_ids
  // (refreshed at OAuth callback time). Fall back to the current account_ids
  // for legacy rows that predate the available/selected split.
  const meta = (conn.platformMetadata ?? {}) as Record<string, unknown>;
  const availableRaw = meta.available_account_ids;
  const available: AccountEntry[] = Array.isArray(availableRaw)
    ? (availableRaw as AccountEntry[])
    : (conn.accountIds ?? []);
  const availableMap = new Map(available.map((a) => [a.id, a]));

  // Validate every selected id is in `available`.
  for (const id of selectedIds) {
    if (!availableMap.has(id)) {
      return NextResponse.json(
        {
          error: "id_not_available",
          error_description: `Account id ${id} isn't in the user's enumerated Meta ad accounts. Re-authorize Meta if it's missing.`,
        },
        { status: 400 },
      );
    }
  }

  // Build the new curated subset, carrying over the full account metadata
  // (name, currency, timezone, business_id) from `available`.
  const newAccountIds: AccountEntry[] = selectedIds.map((id) => availableMap.get(id)!);

  // Preserve active selection if it's still in the new subset; otherwise
  // fall back to the first selected account, or null if empty. Active
  // selection is per-session default — changed via the navbar dropdown
  // (/api/auth/select-meta-account), not here.
  const selectedSet = new Set(selectedIds);
  const newActiveId =
    conn.activeAccountId && selectedSet.has(conn.activeAccountId)
      ? conn.activeAccountId
      : (newAccountIds[0]?.id ?? null);

  await db()
    .update(schema.adPlatformConnections)
    .set({
      accountIds: newAccountIds,
      activeAccountId: newActiveId,
      updatedAt: sql`now()`,
    })
    .where(eq(schema.adPlatformConnections.id, conn.id));

  return NextResponse.json({
    ok: true,
    selectedCount: newAccountIds.length,
    activeAccountId: newActiveId,
  });
}
