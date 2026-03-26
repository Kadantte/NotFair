import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  const { pendingToken, customerId, customerName } = await request.json();

  if (!pendingToken || !customerId) {
    return NextResponse.json(
      { error: "Missing pendingToken or customerId" },
      { status: 400 },
    );
  }

  // Find the pending session and update with selected account
  const [session] = await db()
    .update(schema.mcpSessions)
    .set({ customerId })
    .where(eq(schema.mcpSessions.accessToken, pendingToken))
    .returning();

  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    redirectUrl: `${getAppOrigin()}/connect?token=${pendingToken}&customer_name=${encodeURIComponent(customerName || "Google Ads Account")}`,
  });
}
