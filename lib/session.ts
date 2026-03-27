import "server-only";

import { cookies } from "next/headers";
import { db, schema } from "@/lib/db";
import { eq, gte, and } from "drizzle-orm";
import { COOKIE_NAMES } from "@/lib/auth-cookies";

export type Session = {
  connected: true;
  token: string;
  customerName: string;
} | {
  connected: false;
};

export async function getSession(): Promise<Session> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAMES.token)?.value;

  if (!token) {
    return { connected: false };
  }

  const [session] = await db()
    .select({
      customerId: schema.mcpSessions.customerId,
      customerIds: schema.mcpSessions.customerIds,
    })
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.accessToken, token),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
      ),
    )
    .limit(1);

  if (!session || !session.customerId) {
    return { connected: false };
  }

  // Derive customer name from customerIds JSON stored in DB
  let customerName = "Google Ads Account";
  try {
    const accounts: { id: string; name: string }[] = JSON.parse(session.customerIds || "[]");
    if (accounts.length > 0) {
      customerName = accounts.map((a) => a.name || a.id).join(", ");
    }
  } catch {
    // fall through with default name
  }

  return { connected: true, token, customerName };
}
