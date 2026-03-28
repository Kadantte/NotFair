import "server-only";

import { cookies } from "next/headers";
import { db, schema } from "@/lib/db";
import { eq, gte, and } from "drizzle-orm";
import { COOKIE_NAMES } from "@/lib/auth-cookies";
import { deriveCustomerName } from "@/lib/google-ads";

export type Session = {
  connected: true;
  token: string;
  customerId: string;
  customerName: string;
} | {
  connected: false;
};

type SessionRow = {
  refreshToken: string;
  customerId: string;
  customerIds: string;
  userId: string | null;
};

async function loadSessionRow(): Promise<{ token: string; row: SessionRow } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAMES.token)?.value;

  if (!token) return null;

  const [row] = await db()
    .select({
      refreshToken: schema.mcpSessions.refreshToken,
      customerId: schema.mcpSessions.customerId,
      customerIds: schema.mcpSessions.customerIds,
      userId: schema.mcpSessions.userId,
      googleEmail: schema.mcpSessions.googleEmail,
    })
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.accessToken, token),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
      ),
    )
    .limit(1);

  if (!row || !row.customerId) return null;

  return {
    token,
    row: {
      ...row,
      userId: row.userId ?? row.googleEmail ?? null,
    },
  };
}

export async function getSession(): Promise<Session> {
  const result = await loadSessionRow();
  if (!result) return { connected: false };

  return {
    connected: true,
    token: result.token,
    customerId: result.row.customerId,
    customerName: deriveCustomerName(result.row.customerIds),
  };
}

export async function getSessionAuth(): Promise<SessionRow> {
  const result = await loadSessionRow();
  if (!result) throw new Error("Not authenticated");
  return result.row;
}
