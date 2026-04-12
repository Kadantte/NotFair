import { getAuthContext } from "@/lib/session";
import { db, schema } from "@/lib/db";
import { sql, desc } from "drizzle-orm";
import { DEV_EMAILS } from "@/lib/dev-access";

export async function GET(request: Request) {
  let googleEmail: string | null = null;
  try {
    const ctx = await getAuthContext();
    googleEmail = ctx.auth.realGoogleEmail ?? ctx.session.googleEmail;
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
  if (!googleEmail || !DEV_EMAILS.includes(googleEmail)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const tz = url.searchParams.get("tz") || "America/Los_Angeles";
  // Sanitize: only allow IANA timezone names (letters, digits, underscores, slashes, hyphens)
  if (!/^[A-Za-z0-9_/+-]+$/.test(tz)) {
    return Response.json({ error: "Invalid timezone" }, { status: 400 });
  }

  // tz is already sanitized above via regex — safe to use sql.raw
  const tzLiteral = sql.raw(`'${tz}'`);
  const localDate = sql`date((${schema.operations.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE ${tzLiteral})`;

  const dailyUsage = await db()
    .select({
      date: sql<string>`${localDate}`.as("date"),
      reads: sql<number>`count(*) filter (where ${schema.operations.opType} = 0)`.as("reads"),
      writes: sql<number>`count(*) filter (where ${schema.operations.opType} = 1)`.as("writes"),
      total: sql<number>`count(*)`.as("total"),
    })
    .from(schema.operations)
    .where(sql`${schema.operations.createdAt} >= now() - interval '30 days'`)
    .groupBy(localDate)
    .orderBy(desc(localDate));

  return Response.json({ dailyUsage });
}
