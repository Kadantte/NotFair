import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetSessionAuth,
  mockGetAuthContext,
  mockGetChanges,
  mockGetUndoableChange,
  mockMarkRolledBack,
  mockLogChange,
  mockLogRead,
  mockExecuteUndoForChange,
  mockListCampaigns,
  mockPauseCampaign,
  mockRemoveCampaign,
} = vi.hoisted(() => ({
  mockGetSessionAuth: vi.fn(),
  mockGetAuthContext: vi.fn(),
  mockGetChanges: vi.fn(),
  mockGetUndoableChange: vi.fn(),
  mockMarkRolledBack: vi.fn(),
  mockLogChange: vi.fn(),
  mockLogRead: vi.fn(),
  mockExecuteUndoForChange: vi.fn(),
  mockListCampaigns: vi.fn(),
  mockPauseCampaign: vi.fn(),
  mockRemoveCampaign: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

// `after()` requires a real request scope at runtime. In tests we just
// execute the callback immediately so flush paths still run synchronously.
vi.mock("next/server", () => ({
  after: (fn: () => void | Promise<void>) => {
    if (typeof fn === "function") void fn();
  },
}));

vi.mock("@/lib/session", () => ({
  getSessionAuth: mockGetSessionAuth,
  getAuthContext: mockGetAuthContext,
}));

vi.mock("@/lib/db/tracking", () => ({
  getChanges: mockGetChanges,
  getUndoableChange: mockGetUndoableChange,
  markRolledBack: mockMarkRolledBack,
  logChange: mockLogChange,
  logRead: mockLogRead,
}));

vi.mock("@/lib/mcp/write-tools", () => ({
  executeUndoForChange: mockExecuteUndoForChange,
}));

vi.mock("@/lib/google-ads", () => ({
  getCustomer: vi.fn(),
  listCampaigns: mockListCampaigns,
  pauseCampaign: mockPauseCampaign,
  removeCampaign: mockRemoveCampaign,
}));

import { listCampaignsAction, removeCampaignAction } from "@/app/actions";

describe("app/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetSessionAuth.mockResolvedValue({
      refreshToken: "refresh-token",
      customerId: "1301265570",
      customerIds: '[{"id":"1301265570","name":"Test Account"}]',
      userId: "user-1",
      loginCustomerId: null,
      googleEmail: null,
    });

    mockGetAuthContext.mockResolvedValue({
      auth: {
        refreshToken: "refresh-token",
        customerId: "1301265570",
        customerIds: [{ id: "1301265570", name: "Test Account", loginCustomerId: null }],
        loginCustomerId: null,
      },
      session: {
        refreshToken: "refresh-token",
        customerId: "1301265570",
        customerIds: '[{"id":"1301265570","name":"Test Account"}]',
        userId: "user-1",
        loginCustomerId: null,
        googleEmail: null,
      },
    });

    mockLogChange.mockResolvedValue(null);
    mockLogRead.mockResolvedValue(undefined);
  });

  it("normalizes numeric campaign statuses for the campaigns page", async () => {
    mockListCampaigns.mockResolvedValue([
      {
        id: "1",
        name: "Enabled Campaign",
        status: "2",
        channelType: "SEARCH",
        impressions: 10,
        clicks: 2,
        cost: 1.23,
      },
      {
        id: "2",
        name: "Paused Campaign",
        status: 3,
        channelType: "SEARCH",
        impressions: 20,
        clicks: 4,
        cost: 4.56,
      },
      {
        id: "3",
        name: "Removed Campaign",
        status: "4",
        channelType: "SEARCH",
        impressions: 0,
        clicks: 0,
        cost: 0,
      },
    ]);

    const result = await listCampaignsAction();

    expect(result.map((campaign) => campaign.status)).toEqual([
      "ENABLED",
      "PAUSED",
      "REMOVED",
    ]);
    expect(mockLogRead).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "1301265570",
      userId: "user-1",
      toolName: "list_campaigns",
      clientSource: "web-app",
    }));
  });

  it("logs and returns success when deleting a campaign succeeds", async () => {
    mockRemoveCampaign.mockResolvedValue({
      success: true,
      action: "remove_campaign",
      entityId: "999",
      beforeValue: "PAUSED",
      afterValue: "REMOVED",
    });

    const result = await removeCampaignAction("999");

    expect(mockRemoveCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshToken: "refresh-token",
        customerId: "1301265570",
        loginCustomerId: null,
      }),
      "999",
    );
    expect(mockLogChange).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "1301265570",
      userId: "user-1",
      campaignId: "999",
      writeResult: expect.objectContaining({ action: "remove_campaign", success: true }),
      reasoning: "Deleted from campaigns page",
    }));
    expect(result).toEqual({ success: true, campaignId: "999" });
  });

  it("forwards loginCustomerId to Google Ads calls for manager-routed accounts", async () => {
    // Regression: actions.ts used to drop loginCustomerId when building the
    // AuthContext, so every call against a client-via-manager account hit
    // "User doesn't have permission to access customer" from the API.
    mockGetAuthContext.mockResolvedValue({
      auth: {
        refreshToken: "refresh-token",
        customerId: "2222222222",
        customerIds: [
          { id: "2222222222", name: "Manager-routed Client", loginCustomerId: "9999999999" },
        ],
        loginCustomerId: "9999999999",
      },
      session: {
        refreshToken: "refresh-token",
        customerId: "2222222222",
        customerIds: '[{"id":"2222222222","name":"Manager-routed Client","loginCustomerId":"9999999999"}]',
        userId: "user-1",
        loginCustomerId: "9999999999",
        googleEmail: null,
      },
    });
    mockListCampaigns.mockResolvedValue([]);

    await listCampaignsAction({ skipCache: true });

    expect(mockListCampaigns).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "2222222222",
        loginCustomerId: "9999999999",
      }),
      expect.anything(),
    );
  });

  describe("describeGoogleAdsError mapping", () => {
    // Drives describeGoogleAdsError through listCampaignsAction's catch block.
    async function listCampaignsCatch(error: unknown): Promise<string> {
      mockListCampaigns.mockRejectedValueOnce(error);
      try {
        await listCampaignsAction({ skipCache: true });
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
      throw new Error("expected listCampaignsAction to reject");
    }

    it("maps GoogleAdsFailure with authorization_error to friendly auth hint", async () => {
      const msg = await listCampaignsCatch({
        errors: [
          {
            message: "Some opaque internal phrasing",
            error_code: { authorization_error: 24 },
          },
        ],
      });
      expect(msg).toBe(
        "We couldn't access this Google Ads account. Reconnect it from Settings, or pick a different account.",
      );
    });

    it("maps the 'doesn't have permission to access customer' phrase even without error_code", async () => {
      const msg = await listCampaignsCatch({
        errors: [
          { message: "User doesn't have permission to access customer 1234567890." },
        ],
      });
      expect(msg).toContain("Reconnect it from Settings");
    });

    it("maps phrase-anchored login-customer-id complaints, not bare references", async () => {
      const required = await listCampaignsCatch({
        errors: [{ message: "login-customer-id header is required for manager accounts." }],
      });
      expect(required).toContain("Reconnect it from Settings");

      // Bare token in an unrelated context must NOT trigger the auth mapping —
      // the message should pass through verbatim.
      const benign = await listCampaignsCatch({
        errors: [{ message: "The login-customer-id was set correctly but quota exceeded." }],
      });
      expect(benign).toBe(
        "The login-customer-id was set correctly but quota exceeded.",
      );
    });

    it("surfaces other API messages verbatim instead of swallowing them", async () => {
      const msg = await listCampaignsCatch({
        errors: [
          {
            message: "Billing setup not configured for customer 1234567890.",
            error_code: { billing_setup_error: 7 },
          },
        ],
      });
      expect(msg).toBe("Billing setup not configured for customer 1234567890.");
    });

    it("falls back to the generic message when the error has no extractable text", async () => {
      const msg = await listCampaignsCatch({});
      expect(msg).toBe("Failed to list campaigns.");
    });
  });
});
