import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";
import { getUsableAccounts, hasManagerAccount, listAccessibleCustomers, parseCustomerIds } from "@/lib/google-ads";
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
    const customers = await listAccessibleCustomers(session.refreshToken);
    const usableAccounts = getUsableAccounts(customers);

    if (usableAccounts.length === 0) {
      return redirectWithError(
        hasManagerAccount(customers)
          ? AUTH_ERROR_MESSAGES.NO_CLIENT_ACCOUNTS
          : AUTH_ERROR_MESSAGES.NO_ACCOUNTS,
      );
    }

    const accountsParam = encodeURIComponent(
      JSON.stringify(
        usableAccounts.map((account) => ({ id: account.id, name: account.name })),
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
