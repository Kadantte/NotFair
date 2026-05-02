import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";
import { listConnectableAccounts, parseCustomerIds } from "@/lib/google-ads";
import { getSessionAuth } from "@/lib/session";

function redirectWithError(reason: string, message?: string) {
  // No-accounts cases route to /manage-ads-accounts (the platform picker).
  // /connect remains for genuinely connection-flow errors.
  if (reason === "no_accounts" || reason === "no_client_accounts") {
    return NextResponse.redirect(`${getAppOrigin()}/manage-ads-accounts`);
  }
  const params = new URLSearchParams({ reason });
  if (message) params.set("error", message);
  return NextResponse.redirect(`${getAppOrigin()}/connect?${params.toString()}`);
}

function describeError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
}

export async function GET() {
  try {
    const session = await getSessionAuth();
    const { accounts: usableAccounts, managers } = await listConnectableAccounts(session.refreshToken);

    if (usableAccounts.length === 0) {
      return redirectWithError(managers.length > 0 ? "no_client_accounts" : "no_accounts");
    }

    const accountsParam = encodeURIComponent(
      JSON.stringify(
        usableAccounts.map((a) => ({
          id: a.id,
          name: a.name,
          ...(a.loginCustomerId ? { loginCustomerId: a.loginCustomerId, loginCustomerName: a.loginCustomerName } : {}),
        })),
      ),
    );
    const selectedParam = encodeURIComponent(
      JSON.stringify(parseCustomerIds(session.customerIds).map((account) => account.id)),
    );

    return NextResponse.redirect(
      `${getAppOrigin()}/manage-ads-accounts/google-ads/select?mode=update&accounts=${accountsParam}&selected=${selectedParam}`,
    );
  } catch (error) {
    return redirectWithError(
      "load_accounts_failed",
      `Failed to prepare account selection: ${describeError(error)}`,
    );
  }
}
