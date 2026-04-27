import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";
import { listConnectableAccounts, parseCustomerIds } from "@/lib/google-ads";
import { getSessionAuth } from "@/lib/session";
import { AUTH_ERROR_MESSAGES } from "@/lib/auth-errors";

function redirectWithError(message: string) {
  return NextResponse.redirect(
    `${getAppOrigin()}/connect?error=${encodeURIComponent(message)}`,
  );
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
      return redirectWithError(
        managers.length > 0
          ? AUTH_ERROR_MESSAGES.NO_CLIENT_ACCOUNTS
          : AUTH_ERROR_MESSAGES.NO_ACCOUNTS,
      );
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
      `${getAppOrigin()}/connect?mode=update&accounts=${accountsParam}&selected=${selectedParam}`,
    );
  } catch (error) {
    return redirectWithError(
      `Failed to prepare account selection: ${describeError(error)}`,
    );
  }
}
