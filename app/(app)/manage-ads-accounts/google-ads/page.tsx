import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { listConnectableAccounts, parseCustomerIds } from "@/lib/google-ads";
import { AccountSelector, type SelectableAccount } from "@/components/account-selector";
import { ManageAdsAccountsShell } from "@/components/manage-ads-accounts-shell";

/**
 * Page for managing the user's Google ad-account selection.
 *
 * Mirrors the Meta page (/manage-ads-accounts/meta-ads) — both let a signed-in user
 * curate which ad accounts NotFair is allowed to touch on each platform.
 * Shares the AccountSelector UI with /welcome/google-ads/select?mode=update
 * so the management surface is identical no matter how the user arrives.
 *
 * The full universe of available Google accounts is computed at request
 * time via `listConnectableAccounts(refreshToken)`. One Google API roundtrip
 * per page load.
 */
export default async function AddGoogleAdsAccountPagePath() {
  let refreshToken: string | null = null;
  let customerIds: string | null = null;

  try {
    const ctx = await getAuthContext();
    refreshToken = ctx.session.refreshToken;
    customerIds = ctx.session.customerIds ?? null;
  } catch {
    redirect("/connect?next=%2Fmanage-ads-accounts%2Fgoogle-ads");
  }

  // Compute the full universe of accounts the user can target. Failures
  // surface as an empty list — the user can re-trigger Google OAuth from
  // /welcome to refresh.
  let availableAccounts: SelectableAccount[] = [];
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

  const preselectedIds = parseCustomerIds(customerIds ?? "[]").map((a) => a.id);

  return (
    <ManageAdsAccountsShell error={enumerationError}>
      <AccountSelector
        accounts={availableAccounts}
        mode="update"
        preselectedIds={preselectedIds}
        next="/connect"
        submitEndpoint="/api/auth/select-account"
        headline="Manage Google Ads accounts"
        body="Which Google Ads accounts do you want to manage?"
      />
    </ManageAdsAccountsShell>
  );
}
