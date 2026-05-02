import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { DEV_EMAILS } from "@/lib/dev-emails";
import { listConnectableAccounts, parseCustomerIds } from "@/lib/google-ads";
import { AccountSelector, type SelectableAccount } from "@/components/account-selector";

/**
 * Dev-gated page for managing the user's Google ad-account selection.
 *
 * Mirrors the Meta page (/add-meta-ads-account) — both let a signed-in user
 * curate which ad accounts NotFair is allowed to touch on each platform.
 * Shares the AccountSelector UI with /welcome/google-ads/select?mode=update
 * so the management surface is identical no matter how the user arrives.
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
  let customerIds: string | null = null;

  try {
    const ctx = await getAuthContext();
    realEmail = ctx.auth.realGoogleEmail ?? ctx.session.googleEmail;
    refreshToken = ctx.session.refreshToken;
    customerIds = ctx.session.customerIds ?? null;
  } catch {
    redirect("/connect?next=%2Fadd-google-ads-account");
  }

  if (!realEmail || !DEV_EMAILS.includes(realEmail)) {
    redirect("/connect");
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
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-4xl">
          {enumerationError && (
            <div className="mb-6 rounded-lg border border-[#D4882A]/40 bg-[#D4882A]/10 px-4 py-3 text-sm text-[#D4882A]">
              {enumerationError}
            </div>
          )}
          <AccountSelector
            accounts={availableAccounts}
            mode="update"
            preselectedIds={preselectedIds}
            next="/connect"
            submitEndpoint="/api/auth/select-account"
            headline="Manage Google Ads accounts"
            body="Which Google Ads accounts do you want to manage?"
          />
        </div>
      </div>
    </section>
  );
}
