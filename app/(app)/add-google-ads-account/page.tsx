import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { DEV_EMAILS } from "@/lib/dev-emails";
import { listConnectableAccounts, parseCustomerIds } from "@/lib/google-ads";
import { AddGoogleAdsAccountPage } from "@/components/add-google-ads-account-page";

/**
 * Dev-gated page for adding/managing the user's Google ad-account selection.
 *
 * Mirrors the Meta page (/add-meta-ads-account) — both let a signed-in user
 * curate which ad accounts NotFair is allowed to touch on each platform.
 *
 *   Google: `mcp_sessions.customerIds` (selected) + `mcp_sessions.customerId`
 *           (active default, switched via navbar AccountSwitcher).
 *   Meta:   `ad_platform_connections.account_ids` (selected) +
 *           `ad_platform_connections.active_account_id` (active default).
 *
 * The full universe of available Google accounts is computed at request
 * time via `listConnectableAccounts(refreshToken)` — there's no persisted
 * "available_account_ids" column for Google (unlike Meta's
 * platform_metadata). One Google API roundtrip per page load; tolerable
 * for a dev page.
 */
export default async function AddGoogleAdsAccountPagePath() {
  let realEmail: string | null = null;
  let refreshToken: string | null = null;
  let userId: string | null = null;
  let customerIds: string | null = null;
  let activeCustomerId: string | null = null;

  try {
    const ctx = await getAuthContext();
    realEmail = ctx.auth.realGoogleEmail ?? ctx.session.googleEmail;
    refreshToken = ctx.session.refreshToken;
    userId = ctx.session.userId;
    customerIds = ctx.session.customerIds ?? null;
    activeCustomerId = ctx.session.customerId;
  } catch {
    redirect("/connect?next=%2Fadd-google-ads-account");
  }

  if (!realEmail || !DEV_EMAILS.includes(realEmail)) {
    redirect("/connect");
  }

  // Compute the full universe of accounts the user can target. Failures are
  // surfaced to the UI as an empty available list — the user can hit
  // "Re-authorize Google" to retry.
  let availableAccounts: Array<{
    id: string;
    name: string;
    loginCustomerId?: string;
    loginCustomerName?: string;
  }> = [];
  let enumerationError: string | null = null;
  if (refreshToken) {
    try {
      const { accounts } = await listConnectableAccounts(refreshToken);
      availableAccounts = accounts.map((a) => ({
        id: a.id,
        name: a.name || `Customer ${a.id}`,
        ...(a.loginCustomerId ? { loginCustomerId: a.loginCustomerId } : {}),
        ...(a.loginCustomerName ? { loginCustomerName: a.loginCustomerName } : {}),
      }));
    } catch (e) {
      enumerationError = e instanceof Error ? e.message : "Failed to enumerate Google ad accounts";
    }
  }

  const selectedAccounts = parseCustomerIds(customerIds ?? "[]").map((a) => ({
    id: a.id,
    name: a.name || `Customer ${a.id}`,
    ...(a.loginCustomerId ? { loginCustomerId: a.loginCustomerId } : {}),
  }));

  return (
    <AddGoogleAdsAccountPage
      userEmail={realEmail}
      userId={userId}
      availableAccounts={availableAccounts}
      selectedAccounts={selectedAccounts}
      activeCustomerId={activeCustomerId}
      enumerationError={enumerationError}
    />
  );
}
