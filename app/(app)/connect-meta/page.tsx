import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuthContext } from "@/lib/session";
import { DEV_EMAILS } from "@/lib/dev-emails";
import { ConnectMetaPage } from "@/components/connect-meta-page";

/**
 * Dev-gated page for connecting a NotFair user's Meta ad accounts.
 *
 * Two layers of protection:
 *   1. Sidebar link only renders when `isDev` is true (client-side filter).
 *   2. This server component re-checks `DEV_EMAILS` membership on every
 *      request — sidebar visibility is convenience; this is the actual gate.
 *
 * Available to anyone in `lib/dev-emails.ts` while Meta App Review is
 * pending. Once App Review approves advanced access on `ads_management`,
 * this page becomes generally available and the gate is removed.
 */
export default async function ConnectMetaPagePath() {
  let realEmail: string | null = null;
  try {
    const ctx = await getAuthContext();
    realEmail = ctx.auth.realGoogleEmail ?? ctx.session.googleEmail;
  } catch {
    // Not authenticated — bounce through Google sign-in. The /connect page
    // exists; layout handles the post-signin redirect.
    redirect("/connect?next=%2Fconnect-meta");
  }

  if (!realEmail || !DEV_EMAILS.includes(realEmail)) {
    // Logged in but not a dev — same shape as /dev access denial.
    redirect("/connect");
  }

  // Pull the user's existing Meta connection (if any) so the page can render
  // either the "Connect Meta" CTA or the connected-state UI on first paint.
  const ctx = await getAuthContext();
  const userId = ctx.session.userId;

  type AccountEntry = {
    id: string;
    name?: string;
    currency?: string;
    timezone?: string;
    business_id?: string;
  };

  let connection: {
    id: number;
    selectedAccountIds: AccountEntry[];
    availableAccountIds: AccountEntry[];
    activeAccountId: string | null;
    fbUserName: string | null;
    fbUserEmail: string | null;
    accessTokenExpiresAt: string | null;
  } | null = null;

  if (userId) {
    const [row] = await db()
      .select({
        id: schema.adPlatformConnections.id,
        accountIds: schema.adPlatformConnections.accountIds,
        activeAccountId: schema.adPlatformConnections.activeAccountId,
        platformMetadata: schema.adPlatformConnections.platformMetadata,
        accessTokenExpiresAt: schema.adPlatformConnections.accessTokenExpiresAt,
      })
      .from(schema.adPlatformConnections)
      .where(
        and(
          eq(schema.adPlatformConnections.userId, userId),
          eq(schema.adPlatformConnections.platform, "meta_ads"),
        ),
      )
      .limit(1);

    if (row) {
      const meta = (row.platformMetadata ?? {}) as Record<string, unknown>;
      const selected = (row.accountIds ?? []) as AccountEntry[];
      // Available comes from platform_metadata.available_account_ids
      // (populated on every OAuth callback). Legacy rows from before the
      // available/selected split fall back to the current account_ids.
      const available = Array.isArray(meta.available_account_ids)
        ? (meta.available_account_ids as AccountEntry[])
        : selected;
      connection = {
        id: row.id,
        selectedAccountIds: selected,
        availableAccountIds: available,
        activeAccountId: row.activeAccountId ?? null,
        fbUserName: typeof meta.fb_user_name === "string" ? meta.fb_user_name : null,
        fbUserEmail: typeof meta.fb_user_email === "string" ? meta.fb_user_email : null,
        accessTokenExpiresAt: row.accessTokenExpiresAt
          ? new Date(row.accessTokenExpiresAt).toISOString()
          : null,
      };
    }
  }

  return <ConnectMetaPage initialConnection={connection} userEmail={realEmail} />;
}
