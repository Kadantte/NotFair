import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetSessionAuth,
  mockGetChanges,
  mockGetUndoableChange,
  mockMarkRolledBack,
  mockLogChange,
  mockExecuteUndoForChange,
  mockParseCustomerIds,
  mockListCampaigns,
  mockPauseCampaign,
  mockRemoveCampaign,
} = vi.hoisted(() => ({
  mockGetSessionAuth: vi.fn(),
  mockGetChanges: vi.fn(),
  mockGetUndoableChange: vi.fn(),
  mockMarkRolledBack: vi.fn(),
  mockLogChange: vi.fn(),
  mockExecuteUndoForChange: vi.fn(),
  mockParseCustomerIds: vi.fn(),
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
}));

vi.mock("@/lib/db/tracking", () => ({
  getChanges: mockGetChanges,
  getUndoableChange: mockGetUndoableChange,
  markRolledBack: mockMarkRolledBack,
  logChange: mockLogChange,
}));

vi.mock("@/lib/mcp/write-tools", () => ({
  executeUndoForChange: mockExecuteUndoForChange,
}));

vi.mock("@/lib/google-ads", () => ({
  getClient: vi.fn(),
  parseCustomerIds: mockParseCustomerIds,
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
    });

    mockParseCustomerIds.mockReturnValue([{ id: "1301265570", name: "Test Account" }]);
    mockLogChange.mockResolvedValue(null);
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
      {
        refreshToken: "refresh-token",
        customerId: "1301265570",
        customerIds: [{ id: "1301265570", name: "Test Account" }],
      },
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
});
