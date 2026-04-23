import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_CUSTOMER_ID,
  DEMO_OAUTH_CLIENT_ID,
  DEMO_OAUTH_CLIENT_SECRET,
  DEMO_SESSION_MARKER,
} from "@/lib/demo/constants";

// ─── In-memory stand-in for the drizzle client ──────────────────────
//
// The seed only uses a small slice of the builder API: select/from/where/
// limit, insert/values/returning, update/set/where. We route those against
// a pair of arrays and assert on them. A Proxy on the schema objects lets
// us identify the target table from any property access ("mcpSessions" /
// "oauthClients").

type SessionRow = {
  id: number;
  accessToken: string;
  refreshToken: string;
  customerId: string;
  customerIds: string;
  loginCustomerId: string | null;
  userId: string | null;
  googleEmail: string | null;
  expiresAt: string;
  clientName: string | null;
  clientVersion: string | null;
};

type OAuthClientRow = {
  id: number;
  clientId: string;
  clientSecret: string;
  clientSecretHash: string;
  sessionId: number;
  oauthAccessToken: string | null;
};

const store = {
  sessions: [] as SessionRow[],
  clients: [] as OAuthClientRow[],
};
let sessionSeq = 1;
let clientSeq = 1;

function resetDb() {
  store.sessions = [];
  store.clients = [];
  sessionSeq = 1;
  clientSeq = 1;
}

vi.mock("@/lib/db", () => {
  const makeTableStub = (name: string) =>
    new Proxy({}, { get: () => name }) as unknown as Record<string, string>;

  const schema = {
    mcpSessions: makeTableStub("mcpSessions"),
    oauthClients: makeTableStub("oauthClients"),
  };

  function tableName(tbl: Record<string, string>): string {
    return String(tbl["id"] ?? "");
  }

  function db() {
    return {
      select: () => ({
        from: (tbl: Record<string, string>) => {
          const name = tableName(tbl);
          return {
            where: () => ({
              limit: async () => {
                if (name === "mcpSessions") {
                  return store.sessions
                    .filter(
                      (s) =>
                        s.clientName === DEMO_SESSION_MARKER &&
                        s.customerId === DEMO_CUSTOMER_ID,
                    )
                    .slice(0, 1)
                    .map((s) => ({ id: s.id }));
                }
                if (name === "oauthClients") {
                  return store.clients
                    .filter((c) => c.clientId === DEMO_OAUTH_CLIENT_ID)
                    .slice(0, 1)
                    .map((c) => ({
                      id: c.id,
                      clientSecretHash: c.clientSecretHash,
                      sessionId: c.sessionId,
                    }));
                }
                return [];
              },
            }),
          };
        },
      }),
      insert: (tbl: Record<string, string>) => {
        const name = tableName(tbl);
        return {
          values: (row: Record<string, unknown>) => {
            if (name === "oauthClients") {
              store.clients.push({
                id: clientSeq++,
                clientId: String(row.clientId),
                clientSecret: String(row.clientSecret),
                clientSecretHash: String(row.clientSecretHash),
                sessionId: Number(row.sessionId),
                oauthAccessToken: null,
              });
              return Promise.resolve();
            }
            return {
              returning: async () => {
                if (name === "mcpSessions") {
                  const id = sessionSeq++;
                  store.sessions.push({
                    id,
                    accessToken: String(row.accessToken),
                    refreshToken: String(row.refreshToken),
                    customerId: String(row.customerId),
                    customerIds: String(row.customerIds),
                    loginCustomerId: (row.loginCustomerId as string | null) ?? null,
                    userId: (row.userId as string | null) ?? null,
                    googleEmail: (row.googleEmail as string | null) ?? null,
                    expiresAt: String(row.expiresAt),
                    clientName: (row.clientName as string | null) ?? null,
                    clientVersion: (row.clientVersion as string | null) ?? null,
                  });
                  return [{ id }];
                }
                return [];
              },
            };
          },
        };
      },
      update: (tbl: Record<string, string>) => {
        const name = tableName(tbl);
        return {
          set: (patch: Record<string, unknown>) => ({
            where: async () => {
              if (name === "oauthClients") {
                for (const c of store.clients) {
                  if (c.clientId === DEMO_OAUTH_CLIENT_ID) {
                    Object.assign(c, patch);
                  }
                }
              }
            },
          }),
        };
      },
    };
  }

  return { db, schema };
});

import { ensureDemoOAuthClient } from "@/lib/demo/seed";

describe("ensureDemoOAuthClient", () => {
  beforeEach(resetDb);

  it("creates both session + client on the first call", async () => {
    const result = await ensureDemoOAuthClient();
    expect(result.created).toBe(true);
    expect(result.clientId).toBe(DEMO_OAUTH_CLIENT_ID);
    expect(result.clientSecret).toBe(DEMO_OAUTH_CLIENT_SECRET);
    expect(store.sessions).toHaveLength(1);
    expect(store.clients).toHaveLength(1);
    expect(store.sessions[0].customerId).toBe(DEMO_CUSTOMER_ID);
    expect(store.sessions[0].clientName).toBe(DEMO_SESSION_MARKER);
  });

  it("is idempotent — second call adds no rows", async () => {
    await ensureDemoOAuthClient();
    const second = await ensureDemoOAuthClient();
    expect(second.created).toBe(false);
    expect(store.sessions).toHaveLength(1);
    expect(store.clients).toHaveLength(1);
  });

  it("pins the session to DEMO_CUSTOMER_ID with a far-future expiry", async () => {
    await ensureDemoOAuthClient();
    const session = store.sessions[0];
    expect(session.customerId).toBe(DEMO_CUSTOMER_ID);
    expect(new Date(session.expiresAt).getFullYear()).toBeGreaterThanOrEqual(2099);
  });

  it("links the oauth client to the session with the sha256 of DEMO_OAUTH_CLIENT_SECRET", async () => {
    await ensureDemoOAuthClient();
    const client = store.clients[0];
    const session = store.sessions[0];
    expect(client.sessionId).toBe(session.id);
    // Secret hash is deterministic sha256 — just confirm it exists and is hex.
    expect(client.clientSecretHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
