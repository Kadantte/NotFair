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

  const { pendingToken, customerId, customerName } = body;

  if (!pendingToken || !customerId) {
    return NextResponse.json(
      { error: "Missing pendingToken or customerId" },
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

  // Verify the customerId is in the user's accessible accounts
  const customers = await listAccessibleCustomers(session.refreshToken);
  const isAccessible = customers.some(
    (c) => !("error" in c) && c.id === customerId,
  );

  if (!isAccessible) {
    return NextResponse.json(
      { error: "Account not accessible" },
      { status: 403 },
    );
  }

  await db()
    .update(schema.mcpSessions)
    .set({ customerId })
    .where(eq(schema.mcpSessions.accessToken, pendingToken));

  return NextResponse.json({
    redirectUrl: `${getAppOrigin()}/connect?token=${pendingToken}&customer_name=${encodeURIComponent(customerName || "Google Ads Account")}`,
  });
}
