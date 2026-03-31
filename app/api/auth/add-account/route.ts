import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";
import { db, schema } from "@/lib/db";
import { listAccessibleCustomers, parseCustomerIds } from "@/lib/google-ads";
import { getSessionAuth } from "@/lib/session";

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
    const usableAccounts = customers.filter(
      (customer) => !("error" in customer) && !customer.isManager,
    );

    if (usableAccounts.length === 0) {
      return redirectWithError(
        "No Google Ads accounts found. You may only have manager accounts, which aren't supported yet.",
      );
    }

    const pendingToken = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await db().insert(schema.mcpSessions).values({
      accessToken: pendingToken,
      refreshToken: session.refreshToken,
      customerId: "",
      customerIds: session.customerIds,
      userId: session.userId,
      googleEmail: session.googleEmail,
      expiresAt: expiresAt.toISOString(),
    });

    const accountsParam = encodeURIComponent(
      JSON.stringify(
        usableAccounts.map((account) => ({ id: account.id, name: account.name })),
      ),
    );
    const selectedParam = encodeURIComponent(
      JSON.stringify(parseCustomerIds(session.customerIds).map((account) => account.id)),
    );

    return NextResponse.redirect(
      `${getAppOrigin()}/connect?pending=${pendingToken}&accounts=${accountsParam}&selected=${selectedParam}`,
    );
  } catch (error) {
    return redirectWithError(
      `Failed to prepare account selection: ${describeError(error)}`,
    );
  }
}
