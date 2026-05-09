import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectRows, updateSetCalls, updateWhereCalls } = vi.hoisted(() => ({
  selectRows: vi.fn(),
  updateSetCalls: vi.fn(),
  updateWhereCalls: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: () => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => selectRows()),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((vals: unknown) => {
        updateSetCalls(vals);
        return {
          where: vi.fn(async (...args: unknown[]) => {
            updateWhereCalls(...args);
          }),
        };
      }),
    })),
    // UNINSTALL also hard-deletes oauth_access_tokens + authorization_codes
    // bound to the affected connections so an issued Claude OAuth token can't
    // continue authenticating against a tombstoned connection.
    delete: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  }),
  schema: {
    goHighLevelConnections: {
      id: "id",
      companyId: "company_id",
      locationId: "location_id",
      appId: "app_id",
      uninstalledAt: "uninstalled_at",
      updatedAt: "updated_at",
    },
    goHighLevelAccessTokens: {
      connectionId: "connection_id",
      revokedAt: "revoked_at",
    },
    oauthAccessTokens: {
      gohighlevelConnectionId: "gohighlevel_connection_id",
    },
    authorizationCodes: {
      gohighlevelConnectionId: "gohighlevel_connection_id",
    },
  },
}));

import { handleWebhookEvent } from "@/lib/gohighlevel/webhook";

describe("handleWebhookEvent", () => {
  beforeEach(() => {
    selectRows.mockReset();
    updateSetCalls.mockReset();
    updateWhereCalls.mockReset();
  });

  it("UNINSTALL by locationId soft-deletes matching rows + revokes PATs", async () => {
    selectRows.mockResolvedValueOnce([{ id: 5 }, { id: 6 }]);
    const result = await handleWebhookEvent({
      type: "UNINSTALL",
      companyId: "co1",
      locationId: "loc1",
    });
    expect(result.applied).toBe(2);
    // Two updates: connections soft-delete + PATs revoke.
    expect(updateSetCalls.mock.calls.length).toBe(2);
    const conn = updateSetCalls.mock.calls[0][0];
    expect(conn.uninstalledAt).toBeInstanceOf(Date);
    const pat = updateSetCalls.mock.calls[1][0];
    expect(pat.revokedAt).toBeInstanceOf(Date);
  });

  it("UNINSTALL with no matching rows is a no-op", async () => {
    selectRows.mockResolvedValueOnce([]);
    const result = await handleWebhookEvent({
      type: "UNINSTALL",
      companyId: "co_unknown",
    });
    expect(result.applied).toBe(0);
    expect(updateSetCalls).not.toHaveBeenCalled();
  });

  it("INSTALL_DELETE matches the same UNINSTALL semantics", async () => {
    selectRows.mockResolvedValueOnce([{ id: 9 }]);
    const result = await handleWebhookEvent({
      type: "INSTALL_DELETE",
      companyId: "co1",
      appId: "app123",
    });
    expect(result.applied).toBe(1);
  });

  it("INSTALL is a noop (handled by OAuth callback)", async () => {
    const result = await handleWebhookEvent({ type: "INSTALL", companyId: "x" });
    expect(result.applied).toBe(0);
    expect(result.notes?.[0]).toMatch(/noop/);
    expect(updateSetCalls).not.toHaveBeenCalled();
  });

  it("unknown event types are acknowledged but not applied", async () => {
    const result = await handleWebhookEvent({ type: "MYSTERY", companyId: "x" });
    expect(result.applied).toBe(0);
    expect(result.notes?.[0]).toMatch(/unknown event type/);
  });

  it("missing companyId AND locationId returns 0 (defensive)", async () => {
    const result = await handleWebhookEvent({ type: "UNINSTALL" });
    expect(result.applied).toBe(0);
  });
});
