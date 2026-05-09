import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetKeyCacheForTests } from "@/lib/crypto/secrets";

const { insertCalls, updateSetCalls, selectRows } = vi.hoisted(() => ({
  insertCalls: vi.fn(),
  updateSetCalls: vi.fn(),
  selectRows: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: () => ({
    insert: vi.fn(() => ({
      values: (vals: unknown) => {
        insertCalls(vals);
        return {
          onConflictDoUpdate: vi.fn(async () => undefined),
        };
      },
    })),
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
  }),
  schema: {
    goHighLevelConnections: {
      id: "id",
      userId: "user_id",
      connectionKey: "connection_key",
      companyId: "company_id",
      locationId: "location_id",
      userType: "user_type",
      locationName: "location_name",
      agencyConnectionId: "agency_connection_id",
      updatedAt: "updated_at",
    },
  },
}));

vi.mock("@/lib/env", () => ({
  getEnv: () => undefined,
  getRequiredEnv: (name: string) => {
    if (name === "GOHIGHLEVEL_CLIENT_ID") return "client-id";
    if (name === "GOHIGHLEVEL_CLIENT_SECRET") return "client-secret";
    return "stub";
  },
}));

import { upsertGoHighLevelConnection, expandBulkInstall } from "@/lib/gohighlevel/install";

describe("upsertGoHighLevelConnection", () => {
  beforeEach(() => {
    delete process.env.SECRET_ENCRYPTION_KEY;
    _resetKeyCacheForTests();
    insertCalls.mockReset();
    updateSetCalls.mockReset();
    selectRows.mockReset();
  });

  it("encrypts both refresh and access tokens before insertion", async () => {
    selectRows.mockResolvedValueOnce([{
      id: 1,
      userId: "u1",
      connectionKey: "company:co1",
      companyId: "co1",
      locationId: null,
      userType: "Company",
      agencyConnectionId: null,
    }]);

    const persisted = await upsertGoHighLevelConnection({
      userId: "u1",
      token: {
        access_token: "ACCESS",
        refresh_token: "REFRESH",
        expires_in: 3600,
        userType: "Company",
        companyId: "co1",
        userId: "uuser1",
        scope: "locations.readonly contacts.readonly",
      },
      appId: "app123",
    });

    expect(persisted.id).toBe(1);
    const insert = insertCalls.mock.calls[0][0];
    expect(insert.userId).toBe("u1");
    expect(insert.connectionKey).toBe("company:co1");
    expect(insert.refreshToken.startsWith("enc:v1:")).toBe(true);
    expect(insert.accessToken.startsWith("enc:v1:")).toBe(true);
    expect(insert.scopes).toEqual(["locations.readonly", "contacts.readonly"]);
    expect(insert.appId).toBe("app123");
    expect(insert.uninstalledAt).toBeNull();
  });

  it("derives Location user type when locationId is present", async () => {
    selectRows.mockResolvedValueOnce([{
      id: 2,
      userId: "u1",
      connectionKey: "location:co1:loc1",
      companyId: "co1",
      locationId: "loc1",
      userType: "Location",
      agencyConnectionId: 99,
    }]);

    await upsertGoHighLevelConnection({
      userId: "u1",
      token: {
        access_token: "A",
        refresh_token: "R",
        expires_in: 3600,
        // userType deliberately omitted — should fall through to Location.
        companyId: "co1",
        locationId: "loc1",
      },
      agencyConnectionId: 99,
    });

    const insert = insertCalls.mock.calls[0][0];
    expect(insert.userType).toBe("Location");
    expect(insert.connectionKey).toBe("location:co1:loc1");
    expect(insert.agencyConnectionId).toBe(99);
  });
});

describe("expandBulkInstall", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    insertCalls.mockReset();
    selectRows.mockReset();
    updateSetCalls.mockReset();
  });

  it("fans out per-location tokens and reports per-location status", async () => {
    // listInstalledLocations returns 2 locations
    // createLocationAccessToken (twice) returns location tokens
    let fetchCount = 0;
    global.fetch = vi.fn(async (input) => {
      fetchCount++;
      const url = String(input);
      if (url.includes("/oauth/installedLocations")) {
        return new Response(JSON.stringify({
          locations: [
            { _id: "loc1", name: "Loc One", isInstalled: true },
            { _id: "loc2", name: "Loc Two", isInstalled: true },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      // /oauth/locationToken
      return new Response(JSON.stringify({
        access_token: `LOC_ACCESS_${fetchCount}`,
        refresh_token: `LOC_REFRESH_${fetchCount}`,
        expires_in: 3600,
        userType: "Location",
        companyId: "co1",
        locationId: fetchCount === 2 ? "loc1" : "loc2",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    // Each upsert call returns a row.
    selectRows.mockResolvedValueOnce([{
      id: 100, userId: "u1", connectionKey: "location:co1:loc1",
      companyId: "co1", locationId: "loc1", userType: "Location",
      agencyConnectionId: 1,
    }]);
    selectRows.mockResolvedValueOnce([{
      id: 101, userId: "u1", connectionKey: "location:co1:loc2",
      companyId: "co1", locationId: "loc2", userType: "Location",
      agencyConnectionId: 1,
    }]);

    const result = await expandBulkInstall({
      agency: {
        id: 1, userId: "u1",
        connectionKey: "company:co1",
        companyId: "co1", locationId: null, userType: "Company",
        agencyConnectionId: null,
      },
      agencyAccessToken: "AGENCY_TOKEN",
      appId: "app123",
    });

    expect(result.locations).toHaveLength(2);
    expect(result.locations.every((l) => l.status === "ok")).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(3); // 1 list + 2 mints
    global.fetch = realFetch;
  });

  it("ignores locations with isInstalled: false", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      locations: [
        { _id: "loc1", name: "uninstalled", isInstalled: false },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

    const result = await expandBulkInstall({
      agency: {
        id: 1, userId: "u1", connectionKey: "company:co1",
        companyId: "co1", locationId: null, userType: "Company",
        agencyConnectionId: null,
      },
      agencyAccessToken: "T",
      appId: "app",
    });
    expect(result.locations).toHaveLength(0);
    global.fetch = realFetch;
  });

  it("returns empty result when listInstalledLocations fails", async () => {
    global.fetch = vi.fn(async () => new Response("err", { status: 500 })) as unknown as typeof fetch;
    const result = await expandBulkInstall({
      agency: {
        id: 1, userId: "u1", connectionKey: "company:co1",
        companyId: "co1", locationId: null, userType: "Company",
        agencyConnectionId: null,
      },
      agencyAccessToken: "T",
      appId: "app",
    });
    expect(result.locations).toEqual([]);
    global.fetch = realFetch;
  });

  it("captures per-location failure without aborting the loop", async () => {
    let count = 0;
    global.fetch = vi.fn(async (input) => {
      count++;
      const url = String(input);
      if (url.includes("/oauth/installedLocations")) {
        return new Response(JSON.stringify({
          locations: [
            { _id: "loc-bad", isInstalled: true },
            { _id: "loc-good", isInstalled: true },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      // First locationToken fails, second succeeds
      if (count === 2) {
        return new Response(JSON.stringify({ message: "broken" }), { status: 400 });
      }
      return new Response(JSON.stringify({
        access_token: "OK", refresh_token: "OK", expires_in: 3600,
        userType: "Location", companyId: "co1", locationId: "loc-good",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    selectRows.mockResolvedValueOnce([{
      id: 200, userId: "u1", connectionKey: "location:co1:loc-good",
      companyId: "co1", locationId: "loc-good", userType: "Location",
      agencyConnectionId: 1,
    }]);

    const result = await expandBulkInstall({
      agency: {
        id: 1, userId: "u1", connectionKey: "company:co1",
        companyId: "co1", locationId: null, userType: "Company",
        agencyConnectionId: null,
      },
      agencyAccessToken: "T",
      appId: "app",
    });
    expect(result.locations).toHaveLength(2);
    expect(result.locations[0].status).toBe("failed");
    expect(result.locations[1].status).toBe("ok");
    global.fetch = realFetch;
  });
});
