import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { listAccessibleCustomers } from "@/lib/google-ads";

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { pendingToken, accounts } = body;

  if (!pendingToken || !Array.isArray(accounts) || accounts.length === 0) {
    return NextResponse.json(
      { error: "Missing pendingToken or accounts array" },
      { status: 400 },
    );
  }

  // Validate accounts shape
  const validAccounts = accounts.filter(
    (a: unknown): a is { id: string; name: string } =>
      typeof a === "object" && a !== null && typeof (a as any).id === "string",
  );

  if (validAccounts.length === 0) {
    return NextResponse.json(
      { error: "No valid accounts provided" },
      { status: 400 },
    );
  }

  // Only update sessions that are actually pending (empty customerId)
  const [session] = await db()
    .select()
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.accessToken, pendingToken),
        eq(schema.mcpSessions.customerId, ""),
      ),
    )
    .limit(1);

  if (!session) {
    return NextResponse.json(
      { error: "Pending session not found" },
      { status: 404 },
    );
  }

  // Verify all selected account IDs are accessible
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

  // Set first selected as default, store all in customerIds
  const primaryAccount = validAccounts[0];
  const customerIds = JSON.stringify(
    validAccounts.map((a) => ({ id: a.id, name: a.name || "" })),
  );

  await db()
    .update(schema.mcpSessions)
    .set({
      customerId: primaryAccount.id,
      customerIds,
    })
    .where(eq(schema.mcpSessions.accessToken, pendingToken));

  const accountNames = validAccounts
    .map((a) => a.name || a.id)
    .join(", ");

  return NextResponse.json({
    redirectUrl: `${getAppOrigin()}/connect?token=${pendingToken}&customer_name=${encodeURIComponent(accountNames)}`,
  });
}
