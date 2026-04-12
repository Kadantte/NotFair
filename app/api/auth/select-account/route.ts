import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { getAppOrigin } from "@/lib/app-url";
import { db, schema } from "@/lib/db";
import { eq, and, gte, ne } from "drizzle-orm";
import { listAccessibleCustomers, deriveCustomerName, parseCustomerIds, syncAccountSnapshots } from "@/lib/google-ads";
import { COOKIE_NAMES, setSessionCookies } from "@/lib/auth-cookies";

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { pendingToken, accounts, next: rawNext } = body;
  const next = typeof rawNext === 'string' && rawNext.startsWith('/') ? rawNext : '/connect';

  if (!Array.isArray(accounts) || accounts.length === 0) {
    return NextResponse.json(
      { error: "Missing accounts array" },
      { status: 400 },
    );
  }

  // Validate accounts shape — accept optional loginCustomerId for manager-routed accounts
  const validAccounts = accounts.filter(
    (a: unknown): a is { id: string; name: string; loginCustomerId?: string } =>
      typeof a === "object" &&
      a !== null &&
      "id" in a &&
      typeof (a as any).id === "string",
  );

  if (validAccounts.length === 0) {
    return NextResponse.json(
      { error: "No valid accounts provided" },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const currentToken = cookieStore.get(COOKIE_NAMES.token)?.value ?? null;

  const sessionWhere = pendingToken
    ? and(
        eq(schema.mcpSessions.accessToken, pendingToken),
        eq(schema.mcpSessions.customerId, ""),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
      )
    : currentToken
      ? and(
          eq(schema.mcpSessions.accessToken, currentToken),
          gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
        )
      : null;

  if (!sessionWhere) {
    return NextResponse.json(
      { error: "No active session found" },
      { status: 401 },
    );
  }

  const [session] = await db()
    .select({
      id: schema.mcpSessions.id,
      accessToken: schema.mcpSessions.accessToken,
      refreshToken: schema.mcpSessions.refreshToken,
      customerId: schema.mcpSessions.customerId,
      customerIds: schema.mcpSessions.customerIds,
      userId: schema.mcpSessions.userId,
    })
    .from(schema.mcpSessions)
    .where(sessionWhere)
    .limit(1);

  if (!session) {
    return NextResponse.json(
      { error: pendingToken ? "Pending session not found" : "Session not found" },
      { status: 404 },
    );
  }

  // Verify all selected account IDs are accessible.
  // For pending sessions, we stored pre-validated accounts (including manager-routed ones)
  // in customerIds during the OAuth callback — verify against those to avoid re-querying Google.
  // For existing sessions (account switcher), fall back to listAccessibleCustomers.
  const storedAccounts = parseCustomerIds(session.customerIds ?? "[]");
  const isPreValidated = pendingToken && storedAccounts.length > 0;

  if (isPreValidated) {
    const storedIds = new Set(storedAccounts.map((a) => a.id));
    const inaccessible = validAccounts.filter((a) => !storedIds.has(a.id));
    if (inaccessible.length > 0) {
      return NextResponse.json(
        { error: `Account(s) not in authorized set: ${inaccessible.map((a) => a.id).join(", ")}` },
        { status: 403 },
      );
    }
  } else {
    const accessible = await listAccessibleCustomers(session.refreshToken);
    const accessibleIds = new Set(
      accessible.filter((c) => !("error" in c)).map((c) => c.id),
    );
    const inaccessible = validAccounts.filter((a) => !accessibleIds.has(a.id));
    if (inaccessible.length > 0) {
      return NextResponse.json(
        { error: `Account(s) not accessible: ${inaccessible.map((a) => a.id).join(", ")}` },
        { status: 403 },
      );
    }
  }

  // Keep the current primary account if it remains selected; otherwise use the first selected account.
  const primaryAccount =
    validAccounts.find((account) => account.id === session.customerId) ??
    validAccounts[0];

  // For manager-routed accounts: look up loginCustomerId from the server-stored pre-validated
  // data — do NOT trust loginCustomerId from the request body (client strips it, and it could
  // be forged). Also enforce that all selected accounts belong to the same manager account.
  let loginCustomerId: string | null = null;
  if (isPreValidated && session.customerIds) {
    try {
      const stored: Array<{ id: string; name: string; loginCustomerId?: string }> = JSON.parse(
        session.customerIds,
      );
      const managerIds = new Set(
        validAccounts
          .map((a) => stored.find((s) => s.id === a.id)?.loginCustomerId)
          .filter((id): id is string => !!id),
      );
      if (managerIds.size > 1) {
        return NextResponse.json(
          { error: "Cannot connect accounts from different manager accounts in a single session." },
          { status: 400 },
        );
      }
      loginCustomerId = stored.find((s) => s.id === primaryAccount.id)?.loginCustomerId ?? null;
    } catch {
      // Malformed stored data — proceed without loginCustomerId
    }
  }
  const customerIds = JSON.stringify(
    validAccounts.map((a) => ({ id: a.id, name: a.name || "" })),
  );

  await db()
    .update(schema.mcpSessions)
    .set({
      customerId: primaryAccount.id,
      customerIds,
      loginCustomerId,
    })
    .where(eq(schema.mcpSessions.id, session.id));

  if (session.userId) {
    await db()
      .delete(schema.mcpSessions)
      .where(
        and(
          eq(schema.mcpSessions.userId, session.userId),
          ne(schema.mcpSessions.id, session.id),
        ),
      );
  }

  // Snapshot account budget/info for dev dashboard (runs after response is sent)
  const selectedIds = validAccounts.map((a) => a.id);
  after(async () => {
    syncAccountSnapshots(session.refreshToken, selectedIds).catch((err) => {
      console.error("[sync-account] Failed to snapshot on select:", err);
    });
  });

  const accountNames = deriveCustomerName(customerIds);

  const isNewSignup = pendingToken && !session.customerId;
  const response = NextResponse.json({
    redirectUrl: `${getAppOrigin()}${isNewSignup ? next : '/connect'}`,
  });
  setSessionCookies(response, session.accessToken, accountNames);
  if (isNewSignup) {
    response.cookies.set("gads_new_signup", "1", { path: "/", maxAge: 60 });
  }
  response.cookies.set(
    "gads_connect_event",
    JSON.stringify({
      count: validAccounts.length,
      first: !!isNewSignup,
      destination: isNewSignup ? next : "/connect",
    }),
    { path: "/", maxAge: 120 },
  );
  return response;
}
