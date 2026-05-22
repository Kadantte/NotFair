import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelectLimit } = vi.hoisted(() => ({
  mockSelectLimit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: () => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: (...args: unknown[]) => mockSelectLimit(...args),
        })),
      })),
    })),
  }),
  schema: {
    adPlatformConnections: {
      userId: "user_id",
      platform: "platform",
      refreshToken: "refresh_token",
      activeAccountId: "active_account_id",
      accountIds: "account_ids",
      platformMetadata: "platform_metadata",
    },
  },
}));

import {
  activeLoginCustomerIdFor,
  loadGoogleConnection,
} from "@/lib/connections/google-read";

describe("activeLoginCustomerIdFor", () => {
  it("returns null when no active account", () => {
    expect(activeLoginCustomerIdFor(null, [])).toBeNull();
  });

  it("returns null when active account is not in the list", () => {
    expect(
      activeLoginCustomerIdFor("999", [{ id: "111", name: "A" }]),
    ).toBeNull();
  });

  it("returns null when active account has no loginCustomerId field", () => {
    expect(
      activeLoginCustomerIdFor("111", [{ id: "111", name: "A" }]),
    ).toBeNull();
  });

  it("returns null when loginCustomerId is explicit-null (direct-access)", () => {
    expect(
      activeLoginCustomerIdFor("111", [
        { id: "111", name: "A", loginCustomerId: null },
      ]),
    ).toBeNull();
  });

  it("returns the manager id when active account is manager-routed", () => {
    expect(
      activeLoginCustomerIdFor("111", [
        { id: "111", name: "A", loginCustomerId: "999" },
        { id: "222", name: "B" },
      ]),
    ).toBe("999");
  });
});

describe("loadGoogleConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no row exists", async () => {
    mockSelectLimit.mockResolvedValueOnce([]);
    expect(await loadGoogleConnection("user-1")).toBeNull();
  });

  it("projects accountIds preserving the absent-vs-null loginCustomerId distinction", async () => {
    mockSelectLimit.mockResolvedValueOnce([
      {
        refreshToken: "rt",
        activeAccountId: "111",
        accountIds: [
          { id: "111", name: "Direct" },
          { id: "222", name: "Manager-routed", loginCustomerId: "999" },
          { id: "333", name: "Explicit-direct", loginCustomerId: null },
        ],
        platformMetadata: { googleEmail: "user@example.com" },
      },
    ]);

    const conn = await loadGoogleConnection("user-1");
    expect(conn).not.toBeNull();
    expect(conn!.refreshToken).toBe("rt");
    expect(conn!.customerId).toBe("111");
    expect(conn!.googleEmail).toBe("user@example.com");

    expect(conn!.customerIds).toHaveLength(3);

    // Field absent on row → field absent on projection.
    expect("loginCustomerId" in conn!.customerIds[0]).toBe(false);

    // Field set string → preserved as string.
    expect(conn!.customerIds[1].loginCustomerId).toBe("999");

    // Field set null → preserved as null (the absent-vs-null distinction).
    expect("loginCustomerId" in conn!.customerIds[2]).toBe(true);
    expect(conn!.customerIds[2].loginCustomerId).toBeNull();
  });

  it("derives session-level loginCustomerId from the active account row", async () => {
    mockSelectLimit.mockResolvedValueOnce([
      {
        refreshToken: "rt",
        activeAccountId: "222",
        accountIds: [
          { id: "111", name: "A" },
          { id: "222", name: "B", loginCustomerId: "9999" },
        ],
        platformMetadata: {},
      },
    ]);

    const conn = await loadGoogleConnection("user-1");
    expect(conn!.loginCustomerId).toBe("9999");
  });

  it("collapses ads-less rows (activeAccountId null) into customerId=''", async () => {
    mockSelectLimit.mockResolvedValueOnce([
      {
        refreshToken: "rt",
        activeAccountId: null,
        accountIds: [],
        platformMetadata: {},
      },
    ]);

    const conn = await loadGoogleConnection("user-1");
    expect(conn!.customerId).toBe("");
    expect(conn!.loginCustomerId).toBeNull();
  });

  it("returns googleEmail null when platformMetadata is missing or non-string", async () => {
    mockSelectLimit.mockResolvedValueOnce([
      {
        refreshToken: "rt",
        activeAccountId: "111",
        accountIds: [{ id: "111", name: "A" }],
        platformMetadata: { googleEmail: 42 }, // wrong type
      },
    ]);

    const conn = await loadGoogleConnection("user-1");
    expect(conn!.googleEmail).toBeNull();
  });
});

