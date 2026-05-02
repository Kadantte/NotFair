import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuthContext } from "@/lib/session";
import { AddMetaAdsAccountPage } from "@/components/add-meta-ads-account-page";

/**
 * Page for adding/managing Meta ad accounts. Open to any signed-in user;
 * Meta App Review approval is what gates *successful* OAuth, not this route.
 */
export default async function AddMetaAdsAccountPagePath() {
  let userId: string | null = null;
  try {
    const ctx = await getAuthContext();
    userId = ctx.session.userId;
  } catch {
    // Not authenticated — bounce through Google sign-in. The /connect page
    // exists; layout handles the post-signin redirect.
    redirect("/connect?next=%2Fmanage-ads-accounts%2Fmeta-ads");
  }

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

  return <AddMetaAdsAccountPage initialConnection={connection} />;
}
