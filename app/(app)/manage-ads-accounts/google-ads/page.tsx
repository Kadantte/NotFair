import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { getCurrentRefreshToken, getSession } from "@/lib/session";
import { listConnectableAccounts } from "@/lib/google-ads";
import { AccountSelector, type SelectableAccount } from "@/components/account-selector";
import { ManageAdsAccountsShell } from "@/components/manage-ads-accounts-shell";

/**
 * Page for managing the user's Google ad-account selection.
 *
 * Mirrors the Meta page (/manage-ads-accounts/meta-ads) — both let a signed-in
 * user curate which ad accounts NotFair is allowed to touch on each platform.
 *
 * Three states are handled in-place:
 *   1. Connected user (customerId set) — render the account picker with the
 *      curated subset preselected.
 *   2. Pending Google user with candidate accounts — render the picker so they
 *      can commit a selection (the index page forwards multi-account flows
 *      directly to /select with URL-borne candidates, but a pending user who
 *      lands here directly still gets the same UI).
 *   3. Ads-less Google user — the Google identity has zero Ads accounts on
 *      it. Render a "no accounts found" empty state with a CTA to re-OAuth
 *      and pick a different Google identity.
 */
export default async function AddGoogleAdsAccountPagePath() {
  const t = await getTranslations("ManageAdsAccounts");
  const session = await getSession();
  if (!session.connected) {
    redirect("/login?next=%2Fmanage-ads-accounts%2Fgoogle-ads");
  }

  const refreshToken = await getCurrentRefreshToken();

  // Compute the full universe of accounts the user can target. Failures
  // surface as an empty list with the error banner.
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
      enumerationError = e instanceof Error ? e.message : t("enumerationError");
    }
  }

  // Already-selected ids only matter for connected users — pending users have
  // an empty `customerIds` (the candidate list is intentionally hidden from
  // getSession() so the navbar switcher doesn't pre-show every option).
  const preselectedIds = session.customerIds.map((a) => a.id);

  // Ads-less / empty enumeration → useful empty state instead of an empty
  // checkbox list. Re-OAuth with `select_account` so the user can swap to a
  // different Google identity that owns Ads accounts.
  if (availableAccounts.length === 0 && !enumerationError) {
    return (
      <ManageAdsAccountsShell>
        <div className="rounded-2xl border border-[#3D3C36] bg-[#24231F] p-6">
          <h2 className="text-lg font-semibold text-[#E8E4DD]">{t("noGoogleHeadline")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#C4C0B6]">
            {t("noGoogleBodyBefore")}{" "}
            <a
              href="https://ads.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[#E8E4DD]"
            >
              ads.google.com
            </a>
            {t("noGoogleBodyAfter")}
          </p>
          <Link
            href="/api/auth/signin?prompt=select_account+consent&next=%2Fmanage-ads-accounts%2Fgoogle-ads"
            className="mt-5 inline-flex h-10 items-center rounded-lg bg-[#4CAF6E] px-5 text-sm font-semibold text-[#1A1917] hover:bg-[#3D9A5C]"
          >
            {t("tryDifferentGoogle")}
          </Link>
        </div>
      </ManageAdsAccountsShell>
    );
  }

  // The "Connect to MCP" CTA is only useful once the user has at least one
  // Google account selected — before that, the MCP would have nothing to
  // bind to. Show it when the user is past pendingSetup.
  const showMcpCta = !session.pendingSetup;

  return (
    <ManageAdsAccountsShell error={enumerationError}>
      <AccountSelector
        accounts={availableAccounts}
        mode={session.pendingSetup ? "create" : "update"}
        preselectedIds={preselectedIds}
        next="/connect/google-ads?connected=1"
        submitEndpoint="/api/auth/select-account"
        headline={session.pendingSetup ? t("selectGoogleHeadline") : t("manageGoogleHeadline")}
        body={t("googleSelectorBody")}
      />
      {showMcpCta && (
        <div className="mt-6 rounded-2xl border border-[#3D3C36] bg-[#24231F] p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#E8E4DD]">{t("connectMcpTitle")}</p>
              <p className="mt-1 text-sm text-[#C4C0B6]">
                {t("connectMcpBody")}
              </p>
            </div>
            <Link
              href="/connect/google-ads"
              prefetch
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-[#4CAF6E] px-4 text-sm font-semibold text-[#1A1917] transition hover:bg-[#3D9A5C]"
            >
              {t("connectMcpCta")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </ManageAdsAccountsShell>
  );
}
