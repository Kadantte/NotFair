import "server-only";

import { cookies } from "next/headers";
import { db, schema } from "@/lib/db";
import { eq, gte, and } from "drizzle-orm";
import { COOKIE_NAMES } from "@/lib/auth-cookies";
import { deriveCustomerName, parseCustomerIds, type AuthContext, type ConnectedAccount } from "@/lib/google-ads";
import { DEV_EMAILS } from "@/lib/dev-access";

export type Session = {
  connected: true;
  token: string;
  userId: string | null;
  customerId: string;
  customerName: string;
  customerIds: { id: string; name: string }[];
  googleEmail: string | null;
  isDev: boolean;
  impersonating?: boolean;
} | {
  connected: false;
};

type SessionRow = {
  refreshToken: string;
  customerId: string;
  customerIds: string;
  loginCustomerId: string | null;
  userId: string | null;
  googleEmail: string | null;
};

type LoadSessionResult = {
  token: string;
  row: SessionRow;
  impersonating?: { sessionId: number; realEmail: string };
};

async function loadSessionRow(): Promise<LoadSessionResult | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAMES.token)?.value;

  if (!token) return null;

  const [realRow] = await db()
    .select({
      refreshToken: schema.mcpSessions.refreshToken,
      customerId: schema.mcpSessions.customerId,
      customerIds: schema.mcpSessions.customerIds,
      loginCustomerId: schema.mcpSessions.loginCustomerId,
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

  if (!realRow || !realRow.customerId) return null;

  const row: SessionRow = { ...realRow, userId: realRow.userId ?? null, loginCustomerId: realRow.loginCustomerId ?? null };

  // Check for dev impersonation
  const impersonateId = cookieStore.get(COOKIE_NAMES.impersonate)?.value;
  if (impersonateId && row.googleEmail && DEV_EMAILS.includes(row.googleEmail)) {
    if (!/^\d+$/.test(impersonateId)) return { token, row }; // malformed cookie → ignore, return real session
    const sessionId = parseInt(impersonateId, 10);

    const [targetRow] = await db()
      .select({
        refreshToken: schema.mcpSessions.refreshToken,
        customerId: schema.mcpSessions.customerId,
        customerIds: schema.mcpSessions.customerIds,
        loginCustomerId: schema.mcpSessions.loginCustomerId,
        userId: schema.mcpSessions.userId,
        googleEmail: schema.mcpSessions.googleEmail,
      })
      .from(schema.mcpSessions)
      .where(
        and(
          eq(schema.mcpSessions.id, sessionId),
          gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
        ),
      )
      .limit(1);

    if (!targetRow || !targetRow.customerId) return { token, row }; // target expired/missing → graceful fallback to real session

    return {
      token,
      row: { ...targetRow, userId: targetRow.userId ?? null, loginCustomerId: targetRow.loginCustomerId ?? null },
      impersonating: { sessionId, realEmail: row.googleEmail },
    };
  }

  return { token, row };
}

export async function getSession(): Promise<Session> {
  const result = await loadSessionRow();
  if (!result) return { connected: false };

  // isDev is always based on the real user's email, not the impersonated one
  const devEmail = result.impersonating?.realEmail ?? result.row.googleEmail;

  return {
    connected: true,
    token: result.token,
    userId: result.row.userId,
    customerId: result.row.customerId,
    customerName: deriveCustomerName(result.row.customerIds),
    customerIds: parseCustomerIds(result.row.customerIds),
    googleEmail: result.row.googleEmail,
    isDev: !!devEmail && DEV_EMAILS.includes(devEmail),
    ...(result.impersonating && { impersonating: true }),
  };
}

export async function getSessionAuth(): Promise<SessionRow> {
  const result = await loadSessionRow();
  if (!result) throw new Error("Not authenticated");
  return result.row;
}

export async function getAuthContext(): Promise<{ auth: AuthContext; session: SessionRow }> {
  const result = await loadSessionRow();
  if (!result) throw new Error("Not authenticated");
  return {
    auth: {
      refreshToken: result.row.refreshToken,
      customerId: result.row.customerId,
      customerIds: parseCustomerIds(result.row.customerIds),
      loginCustomerId: result.row.loginCustomerId,
      ...(result.impersonating && { realGoogleEmail: result.impersonating.realEmail }),
    },
    session: result.row,
  };
}
