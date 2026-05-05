import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { requireDevEmail } from "@/lib/dev-access";

export async function GET() {
  const denied = await requireDevEmail();
  if (denied) return denied;

  const rows = await db()
    .select({
      id: schema.waitlistSignups.id,
      key: schema.waitlistSignups.key,
      userId: schema.waitlistSignups.userId,
      email: schema.waitlistSignups.email,
      metadata: schema.waitlistSignups.metadata,
      createdAt: schema.waitlistSignups.createdAt,
      approvedAt: schema.waitlistSignups.approvedAt,
    })
    .from(schema.waitlistSignups)
    .orderBy(desc(schema.waitlistSignups.createdAt));

  return Response.json({
    rows: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
    })),
  });
}

/**
 * Toggle approval for a single waitlist signup. Approved users bypass the
 * waitlist wall for that key. Body: `{ id, approved }`.
 */
export async function PATCH(request: Request) {
  const denied = await requireDevEmail();
  if (denied) return denied;

  let body: { id?: unknown; approved?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; approved?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body.id !== "number" || typeof body.approved !== "boolean") {
    return NextResponse.json(
      { error: "Expected { id: number, approved: boolean }" },
      { status: 400 },
    );
  }

  const approvedAt = body.approved ? new Date() : null;
  const [row] = await db()
    .update(schema.waitlistSignups)
    .set({ approvedAt })
    .where(eq(schema.waitlistSignups.id, body.id))
    .returning({
      id: schema.waitlistSignups.id,
      approvedAt: schema.waitlistSignups.approvedAt,
    });

  if (!row) {
    return NextResponse.json({ error: "Signup not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: row.id,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
  });
}
