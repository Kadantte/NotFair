import { desc } from "drizzle-orm";
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
    })
    .from(schema.waitlistSignups)
    .orderBy(desc(schema.waitlistSignups.createdAt));

  return Response.json({
    rows: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
