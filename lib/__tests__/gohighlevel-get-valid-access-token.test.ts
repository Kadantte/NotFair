import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret, _resetKeyCacheForTests } from "@/lib/crypto/secrets";

const {
  selectRows,
  updateSetCalls,
} = vi.hoisted(() => ({
  selectRows: vi.fn(),
  updateSetCalls: vi.fn(),
}));

// The mock models both the fast-path (top-level `select`) and the slow-path
// (`transaction(tx => ...)`) the implementation uses. Inside the transaction
// callback we re-read via the same `selectRows` mock — tests that expect a
// refresh queue a SECOND mockResolvedValueOnce so the post-lock re-check
// returns the same row (or simulate a peer-refresh by returning fresh tokens).
vi.mock("@/lib/db", () => {
  const transactionImpl = (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      execute: vi.fn(async () => undefined),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => selectRows()),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((vals: unknown) => {
          updateSetCalls(vals);
          return { where: vi.fn(async () => undefined) };
        }),
      })),
    };
    return cb(tx);
  };
  return {
    db: () => ({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => selectRows()),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((vals: unknown) => {
          updateSetCalls(vals);
          return { where: vi.fn(async () => undefined) };
        }),
      })),
      transaction: vi.fn(transactionImpl),
    }),
    schema: {
      goHighLevelConnections: {
        id: "id",
        userType: "user_type",
        refreshToken: "refresh_token",
        accessToken: "access_token",
        accessTokenExpiresAt: "access_token_expires_at",
        updatedAt: "updated_at",
      },
    },
  };
});

vi.mock("@/lib/env", () => ({
  getEnv: (name: string) => {
    if (name === "GOHIGHLEVEL_REDIRECT_URI") return "http://localhost/cb";
    if (name === "NEXT_PUBLIC_APP_URL") return "http://localhost";
    return undefined;
  },
  getRequiredEnv: (name: string) => {
    if (name === "GOHIGHLEVEL_CLIENT_ID") return "client-id";
    if (name === "GOHIGHLEVEL_CLIENT_SECRET") return "client-secret";
    if (name === "GOHIGHLEVEL_INSTALL_URL") return "https://example.com/install";
    throw new Error(`Missing env ${name}`);
  },
  getEnvBool: () => false,
}));

import { getValidAccessToken } from "@/lib/gohighlevel/oauth";

const realFetch = global.fetch;

describe("getValidAccessToken", () => {
  beforeEach(() => {
    delete process.env.SECRET_ENCRYPTION_KEY;
    _resetKeyCacheForTests();
    selectRows.mockReset();
    updateSetCalls.mockReset();
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("returns the cached access token when expiry is comfortably in the future", async () => {
    selectRows.mockResolvedValueOnce([{
      id: 7,
      userType: "Company",
      refreshToken: encryptSecret("REFRESH_OLD"),
      accessToken: encryptSecret("ACCESS_FRESH"),
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h ahead
    }]);
    global.fetch = vi.fn() as typeof fetch;

    const token = await getValidAccessToken(7);
    expect(token).toBe("ACCESS_FRESH");
    expect(global.fetch).not.toHaveBeenCalled();
    expect(updateSetCalls).not.toHaveBeenCalled();
  });

  it("refreshes when the access token is within the 5-minute leeway window", async () => {
    // Fast-path read AND post-lock re-check both return the same expired row.
    const expiredRow = {
      id: 9,
      userType: "Company",
      refreshToken: encryptSecret("REFRESH_OLD"),
      accessToken: encryptSecret("ACCESS_OLD"),
      accessTokenExpiresAt: new Date(Date.now() + 30 * 1000),
    };
    selectRows.mockResolvedValueOnce([expiredRow]);
    selectRows.mockResolvedValueOnce([expiredRow]);
    global.fetch = vi.fn(async () => new Response(
      JSON.stringify({
        access_token: "ACCESS_NEW",
        refresh_token: "REFRESH_NEW",
        expires_in: 86400,
        userType: "Company",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as unknown as typeof fetch;

    const token = await getValidAccessToken(9);
    expect(token).toBe("ACCESS_NEW");
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const persisted = updateSetCalls.mock.calls[0]?.[0];
    expect(persisted).toBeDefined();
    // Persisted refresh token must be re-encrypted, not stored plaintext.
    expect(persisted.refreshToken).not.toBe("REFRESH_NEW");
    expect(persisted.refreshToken.startsWith("enc:v1:")).toBe(true);
    expect(persisted.accessToken.startsWith("enc:v1:")).toBe(true);
    expect(persisted.accessTokenExpiresAt).toBeInstanceOf(Date);
  });

  it("refreshes when accessToken is null (post-encryption-migration row)", async () => {
    const row = {
      id: 11,
      userType: "Location",
      refreshToken: encryptSecret("REFRESH"),
      accessToken: null,
      accessTokenExpiresAt: null,
    };
    selectRows.mockResolvedValueOnce([row]);
    selectRows.mockResolvedValueOnce([row]);
    global.fetch = vi.fn(async (_url, init) => {
      const body = (init as RequestInit).body as URLSearchParams;
      // Defensive: confirm we're sending the right user_type for a Location-bound row.
      expect(String(body).includes("user_type=Location")).toBe(true);
      return new Response(
        JSON.stringify({
          access_token: "FRESH",
          refresh_token: "ROTATED",
          expires_in: 3600,
          userType: "Location",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const token = await getValidAccessToken(11);
    expect(token).toBe("FRESH");
  });

  it("propagates upstream error when HighLevel rejects the refresh", async () => {
    const row = {
      id: 13,
      userType: "Company",
      refreshToken: encryptSecret("R"),
      accessToken: null,
      accessTokenExpiresAt: null,
    };
    selectRows.mockResolvedValueOnce([row]);
    selectRows.mockResolvedValueOnce([row]);
    global.fetch = vi.fn(async () => new Response(
      JSON.stringify({ message: "invalid_grant" }),
      { status: 401, headers: { "content-type": "application/json" } },
    )) as unknown as typeof fetch;

    await expect(getValidAccessToken(13)).rejects.toThrow(/invalid_grant/);
    expect(updateSetCalls).not.toHaveBeenCalled();
  });

  it("decrypts a plaintext refresh-token (pre-encryption row) for back-compat", async () => {
    const row = {
      id: 17,
      userType: "Company",
      refreshToken: "PLAINTEXT_LEGACY", // pre-encryption row
      accessToken: null,
      accessTokenExpiresAt: null,
    };
    selectRows.mockResolvedValueOnce([row]);
    selectRows.mockResolvedValueOnce([row]);
    global.fetch = vi.fn(async (_url, init) => {
      const body = String((init as RequestInit).body);
      // Confirm we sent the plaintext (decrypted) refresh token.
      expect(body.includes("refresh_token=PLAINTEXT_LEGACY")).toBe(true);
      return new Response(
        JSON.stringify({
          access_token: "X",
          refresh_token: "Y",
          expires_in: 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    await getValidAccessToken(17);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("throws when the connection row is missing", async () => {
    selectRows.mockResolvedValueOnce([]);
    await expect(getValidAccessToken(99)).rejects.toThrow(/not found/);
  });

  it("under concurrent refresh, the lock-loser reuses the freshly-stored token without refetching", async () => {
    // Fast-path read: row IS expired so we'll enter the slow path.
    selectRows.mockResolvedValueOnce([{
      id: 19,
      userType: "Company",
      refreshToken: encryptSecret("OLD"),
      accessToken: encryptSecret("OLD_ACCESS"),
      accessTokenExpiresAt: new Date(Date.now() + 30 * 1000),
    }]);
    // Post-lock re-check: a peer already refreshed — token is now fresh.
    selectRows.mockResolvedValueOnce([{
      id: 19,
      userType: "Company",
      refreshToken: encryptSecret("NEW_REFRESH"),
      accessToken: encryptSecret("NEW_ACCESS"),
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    }]);
    global.fetch = vi.fn() as typeof fetch;

    const token = await getValidAccessToken(19);
    expect(token).toBe("NEW_ACCESS");
    // We MUST NOT have called the upstream refresh endpoint — the lock-winner
    // already did. This is the whole point of the advisory lock.
    expect(global.fetch).not.toHaveBeenCalled();
    expect(updateSetCalls).not.toHaveBeenCalled();
  });
});
