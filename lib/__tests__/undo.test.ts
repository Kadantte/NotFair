import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────
const {
  mockEnableKeyword,
  mockPauseKeyword,
  mockUpdateBid,
  mockUpdateCampaignBudget,
  mockRemoveNegativeKeyword,
  mockAddNegativeKeyword,
  mockEnableCampaign,
  mockPauseCampaign,
  mockRemoveCampaign,
  mockRemoveKeyword,
  mockSetTrackingTemplate,
  mockDecodeTrackingEntityId,
  mockGetCustomer,
  mockSafeEntityId,
  mockPauseAd,
  mockEnableAd,
  mockUpdateAdFinalUrl,
  mockUpdateAdAssets,
  mockRenameCampaign,
  mockRenameAdGroup,
  mockUpdateCampaignSettings,
} = vi.hoisted(() => ({
  mockEnableKeyword: vi.fn(),
  mockPauseKeyword: vi.fn(),
  mockUpdateBid: vi.fn(),
  mockUpdateCampaignBudget: vi.fn(),
  mockRemoveNegativeKeyword: vi.fn(),
  mockAddNegativeKeyword: vi.fn(),
  mockEnableCampaign: vi.fn(),
  mockPauseCampaign: vi.fn(),
  mockRemoveCampaign: vi.fn(),
  mockRemoveKeyword: vi.fn(),
  mockSetTrackingTemplate: vi.fn(),
  mockDecodeTrackingEntityId: vi.fn(),
  mockGetCustomer: vi.fn(),
  mockSafeEntityId: vi.fn(),
  mockPauseAd: vi.fn(),
  mockEnableAd: vi.fn(),
  mockUpdateAdFinalUrl: vi.fn(),
  mockUpdateAdAssets: vi.fn(),
  mockRenameCampaign: vi.fn(),
  mockRenameAdGroup: vi.fn(),
  mockUpdateCampaignSettings: vi.fn(),
}));

vi.mock("@/lib/google-ads", () => ({
  enableKeyword: mockEnableKeyword,
  pauseKeyword: mockPauseKeyword,
  updateBid: mockUpdateBid,
  updateCampaignBudget: mockUpdateCampaignBudget,
  removeNegativeKeyword: mockRemoveNegativeKeyword,
  addNegativeKeyword: mockAddNegativeKeyword,
  enableCampaign: mockEnableCampaign,
  pauseCampaign: mockPauseCampaign,
  removeCampaign: mockRemoveCampaign,
  removeKeyword: mockRemoveKeyword,
  setTrackingTemplate: mockSetTrackingTemplate,
  decodeTrackingEntityId: mockDecodeTrackingEntityId,
  getCustomer: mockGetCustomer,
  safeEntityId: mockSafeEntityId,
  pauseAd: mockPauseAd,
  enableAd: mockEnableAd,
  updateAdFinalUrl: mockUpdateAdFinalUrl,
  updateAdAssets: mockUpdateAdAssets,
  renameCampaign: mockRenameCampaign,
  renameAdGroup: mockRenameAdGroup,
  updateCampaignSettings: mockUpdateCampaignSettings,
  // Stubs for other imports the module needs
  addKeyword: vi.fn(),
  createSearchCampaign: vi.fn(),
  toMicros: vi.fn(),
  authForAccount: vi.fn(),
  resolveAccountId: vi.fn(),
  createAdGroup: vi.fn(),
  createAd: vi.fn(),
  bulkUpdateBids: vi.fn(),
  bulkPauseKeywords: vi.fn(),
  bulkAddKeywords: vi.fn(),
  moveKeywords: vi.fn(),
  invalidateCache: vi.fn(),
  getClient: vi.fn(),
}));

vi.mock("@/lib/db/tracking", () => ({
  logChange: vi.fn(),
  getUndoableChange: vi.fn(),
  markRolledBack: vi.fn(),
}));

vi.mock("@/lib/tools/execute", () => ({
  execWrite: vi.fn(),
}));

vi.mock("@/lib/mcp/rate-limit", () => ({
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/mcp/types", () => ({
  typedResult: vi.fn(),
  safeHandler: vi.fn((fn: any) => fn),
  accountIdParam: {},
  WRITE_ANNOTATIONS: {},
  DESTRUCTIVE_WRITE_ANNOTATIONS: {},
}));

vi.mock("@/lib/mcp/helpers", () => ({
  resolveToolAuth: vi.fn(),
}));

import { executeUndoForChange } from "@/lib/mcp/write-tools";
import type { AuthContext, WriteResult } from "@/lib/google-ads";

const auth: AuthContext = {
  refreshToken: "test-refresh-token",
  customerId: "123456",
  customerIds: [{ id: "123456", name: "Test" }],
};

// For keyword undo cases, getCustomer().query is used by findKeywordContext
function setupFindKeywordContext(adGroupId: string, campaignId: string) {
  const mockQuery = vi.fn().mockResolvedValue([
    { ad_group: { id: adGroupId }, campaign: { id: campaignId } },
  ]);
  mockGetCustomer.mockReturnValue({ query: mockQuery });
  mockSafeEntityId.mockImplementation((v: string) => Number(v));
}

const successResult: WriteResult = {
  success: true,
  action: "test",
  entityId: "e1",
  beforeValue: "before",
  afterValue: "after",
};

describe("executeUndoForChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── pause_keyword → enableKeyword ──────────────────────────────
  it("pause_keyword → calls enableKeyword", async () => {
    setupFindKeywordContext("ag-1", "camp-1");
    mockEnableKeyword.mockResolvedValue(successResult);

    const result = await executeUndoForChange(auth, {
      toolName: "pause_keyword",
      entityId: "kw-123",
      campaignId: "camp-1",
      beforeValue: "ENABLED",
      afterValue: "PAUSED",
    });

    expect(mockEnableKeyword).toHaveBeenCalledWith(auth, "ag-1", "kw-123");
    expect(result.success).toBe(true);
  });

  // ─── enable_keyword → pauseKeyword ──────────────────────────────
  it("enable_keyword → calls pauseKeyword", async () => {
    setupFindKeywordContext("ag-1", "camp-1");
    mockPauseKeyword.mockResolvedValue(successResult);

    const result = await executeUndoForChange(auth, {
      toolName: "enable_keyword",
      entityId: "kw-123",
      campaignId: "camp-1",
      beforeValue: "PAUSED",
      afterValue: "ENABLED",
    });

    expect(mockPauseKeyword).toHaveBeenCalledWith(auth, "camp-1", "ag-1", "kw-123");
    expect(result.success).toBe(true);
  });

  // ─── update_bid → restore previous bid ──────────────────────────
  it("update_bid → restores previous bid from beforeValue", async () => {
    setupFindKeywordContext("ag-1", "camp-1");
    mockUpdateBid.mockResolvedValue(successResult);

    const result = await executeUndoForChange(auth, {
      toolName: "update_bid",
      entityId: "kw-123",
      campaignId: "camp-1",
      beforeValue: "1500000",
      afterValue: "2000000",
    });

    expect(mockUpdateBid).toHaveBeenCalledWith(
      auth, "camp-1", "ag-1", "kw-123", 1500000,
      { maxBidChangePct: 1.0, maxBudgetChangePct: 1.0, maxKeywordPausePct: 1.0 },
    );
    expect(result.success).toBe(true);
  });

  it("update_bid with invalid beforeValue → returns error", async () => {
    const result = await executeUndoForChange(auth, {
      toolName: "update_bid",
      entityId: "kw-123",
      campaignId: "camp-1",
      beforeValue: "not-a-number",
      afterValue: "2000000",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("invalid previous bid");
    expect(mockUpdateBid).not.toHaveBeenCalled();
  });

  it("update_bid with zero beforeValue → returns error", async () => {
    const result = await executeUndoForChange(auth, {
      toolName: "update_bid",
      entityId: "kw-123",
      campaignId: "camp-1",
      beforeValue: "0",
      afterValue: "2000000",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("invalid previous bid");
  });

  // ─── update_budget → restore previous budget ───────────────────
  it("update_budget → restores previous budget", async () => {
    mockUpdateCampaignBudget.mockResolvedValue(successResult);

    const result = await executeUndoForChange(auth, {
      toolName: "update_budget",
      entityId: "camp-1",
      campaignId: "camp-1",
      beforeValue: "5000000",
      afterValue: "10000000",
    });

    expect(mockUpdateCampaignBudget).toHaveBeenCalledWith(
      auth, "camp-1", 5000000,
      { maxBidChangePct: 1.0, maxBudgetChangePct: 1.0, maxKeywordPausePct: 1.0 },
    );
    expect(result.success).toBe(true);
  });

  it("update_budget with invalid beforeValue → returns error", async () => {
    const result = await executeUndoForChange(auth, {
      toolName: "update_budget",
      entityId: "camp-1",
      campaignId: "camp-1",
      beforeValue: "abc",
      afterValue: "10000000",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("invalid previous budget");
  });

  // ─── add_negative_keyword → removeNegativeKeyword ───────────────
  it("add_negative_keyword → calls removeNegativeKeyword with matchType from afterValue pipe format", async () => {
    mockRemoveNegativeKeyword.mockResolvedValue(successResult);

    const result = await executeUndoForChange(auth, {
      toolName: "add_negative_keyword",
      entityId: "bad term",
      campaignId: "camp-1",
      beforeValue: null,
      afterValue: "bad term|EXACT",
    });

    expect(mockRemoveNegativeKeyword).toHaveBeenCalledWith(auth, "camp-1", "bad term", "EXACT");
    expect(result.success).toBe(true);
  });

  it("add_negative_keyword without pipe in afterValue → passes undefined matchType", async () => {
    mockRemoveNegativeKeyword.mockResolvedValue(successResult);

    await executeUndoForChange(auth, {
      toolName: "add_negative_keyword",
      entityId: "bad term",
      campaignId: "camp-1",
      beforeValue: null,
      afterValue: "bad term",
    });

    expect(mockRemoveNegativeKeyword).toHaveBeenCalledWith(auth, "camp-1", "bad term", undefined);
  });

  // ─── remove_negative_keyword → addNegativeKeyword ───────────────
  it("remove_negative_keyword → re-adds with matchType from beforeValue pipe format", async () => {
    mockAddNegativeKeyword.mockResolvedValue(successResult);

    const result = await executeUndoForChange(auth, {
      toolName: "remove_negative_keyword",
      entityId: "bad term",
      campaignId: "camp-1",
      beforeValue: "bad term|PHRASE",
      afterValue: null,
    });

    expect(mockAddNegativeKeyword).toHaveBeenCalledWith(auth, "camp-1", "bad term", "PHRASE");
    expect(result.success).toBe(true);
  });

  it("remove_negative_keyword without pipe → defaults to PHRASE matchType using entityId as text", async () => {
    mockAddNegativeKeyword.mockResolvedValue(successResult);

    await executeUndoForChange(auth, {
      toolName: "remove_negative_keyword",
      entityId: "bad term",
      campaignId: "camp-1",
      beforeValue: "no-pipe-here",
      afterValue: null,
    });

    expect(mockAddNegativeKeyword).toHaveBeenCalledWith(auth, "camp-1", "bad term", "PHRASE");
  });

  // ─── pause_campaign → enableCampaign ────────────────────────────
  it("pause_campaign → calls enableCampaign", async () => {
    mockEnableCampaign.mockResolvedValue(successResult);

    const result = await executeUndoForChange(auth, {
      toolName: "pause_campaign",
      entityId: "camp-1",
      campaignId: "camp-1",
      beforeValue: "ENABLED",
      afterValue: "PAUSED",
    });

    expect(mockEnableCampaign).toHaveBeenCalledWith(auth, "camp-1");
    expect(result.success).toBe(true);
  });

  // ─── enable_campaign → pauseCampaign ────────────────────────────
  it("enable_campaign → calls pauseCampaign", async () => {
    mockPauseCampaign.mockResolvedValue(successResult);

    const result = await executeUndoForChange(auth, {
      toolName: "enable_campaign",
      entityId: "camp-1",
      campaignId: "camp-1",
      beforeValue: "PAUSED",
      afterValue: "ENABLED",
    });

    expect(mockPauseCampaign).toHaveBeenCalledWith(auth, "camp-1");
    expect(result.success).toBe(true);
  });

  // ─── create_campaign → removeCampaign ───────────────────────────
  it("create_campaign → calls removeCampaign", async () => {
    mockRemoveCampaign.mockResolvedValue(successResult);

    const result = await executeUndoForChange(auth, {
      toolName: "create_campaign",
      entityId: "camp-new",
      campaignId: "camp-new",
      beforeValue: null,
      afterValue: "ENABLED",
    });

    expect(mockRemoveCampaign).toHaveBeenCalledWith(auth, "camp-new");
    expect(result.success).toBe(true);
  });

  // ─── remove_campaign → permanent error ──────────────────────────
  it("remove_campaign → returns permanent error", async () => {
    const result = await executeUndoForChange(auth, {
      toolName: "remove_campaign",
      entityId: "camp-1",
      campaignId: "camp-1",
      beforeValue: "PAUSED",
      afterValue: "REMOVED",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("permanent");
    expect(mockRemoveCampaign).not.toHaveBeenCalled();
  });

  // ─── set_tracking_template → restore previous template ──────────
  it("set_tracking_template → restores previous template", async () => {
    mockDecodeTrackingEntityId.mockReturnValue({ level: "campaign", entityId: "camp-1" });
    mockSetTrackingTemplate.mockResolvedValue(successResult);

    const result = await executeUndoForChange(auth, {
      toolName: "set_tracking_template",
      entityId: "campaign:camp-1",
      campaignId: "camp-1",
      beforeValue: "{lpurl}?utm_source=old",
      afterValue: "{lpurl}?utm_source=new",
    });

    expect(mockDecodeTrackingEntityId).toHaveBeenCalledWith("campaign:camp-1");
    expect(mockSetTrackingTemplate).toHaveBeenCalledWith(auth, "campaign", "{lpurl}?utm_source=old", "camp-1");
    expect(result.success).toBe(true);
  });

  // ─── create_ad → pauseAd ────────────────────────────────────────
  it("create_ad → calls pauseAd", async () => {
    mockPauseAd.mockResolvedValue(successResult);

    const result = await executeUndoForChange(auth, {
      toolName: "create_ad",
      entityId: "ad-123",
      campaignId: "camp-1",
      beforeValue: "ag-1",
      afterValue: "ENABLED",
    });

    expect(mockPauseAd).toHaveBeenCalledWith(auth, "ag-1", "ad-123");
    expect(result.success).toBe(true);
  });

  // ─── pause_ad → enableAd ────────────────────────────────────────
  it("pause_ad → calls enableAd", async () => {
    mockEnableAd.mockResolvedValue(successResult);

    const result = await executeUndoForChange(auth, {
      toolName: "pause_ad",
      entityId: "ad-123",
      campaignId: "camp-1",
      beforeValue: "ag-1",
      afterValue: "PAUSED",
    });

    expect(mockEnableAd).toHaveBeenCalledWith(auth, "ag-1", "ad-123");
    expect(result.success).toBe(true);
  });

  // ─── rename_campaign → restore previous name ────────────────────
  it("rename_campaign → restores previous name", async () => {
    mockRenameCampaign.mockResolvedValue(successResult);

    const result = await executeUndoForChange(auth, {
      toolName: "rename_campaign",
      entityId: "camp-1",
      campaignId: "camp-1",
      beforeValue: "Old Campaign Name",
      afterValue: "New Campaign Name",
    });

    expect(mockRenameCampaign).toHaveBeenCalledWith(auth, "camp-1", "Old Campaign Name");
    expect(result.success).toBe(true);
  });

  it("rename_campaign with no beforeValue → returns error", async () => {
    const result = await executeUndoForChange(auth, {
      toolName: "rename_campaign",
      entityId: "camp-1",
      campaignId: "camp-1",
      beforeValue: null,
      afterValue: "New Name",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("previous name");
    expect(mockRenameCampaign).not.toHaveBeenCalled();
  });

  // ─── Missing entityId → error ───────────────────────────────────
  it("missing entityId → returns error", async () => {
    const result = await executeUndoForChange(auth, {
      toolName: "pause_campaign",
      entityId: null,
      campaignId: "camp-1",
      beforeValue: "ENABLED",
      afterValue: "PAUSED",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("missing entity ID");
  });

  it("empty entityId → returns error", async () => {
    const result = await executeUndoForChange(auth, {
      toolName: "pause_campaign",
      entityId: "",
      campaignId: "camp-1",
      beforeValue: "ENABLED",
      afterValue: "PAUSED",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("missing entity ID");
  });

  // ─── Unknown tool → error ───────────────────────────────────────
  it("unknown toolName → returns error", async () => {
    const result = await executeUndoForChange(auth, {
      toolName: "some_unknown_tool",
      entityId: "e-1",
      campaignId: "camp-1",
      beforeValue: null,
      afterValue: null,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Don\'t know how to undo');
    expect(result.error).toContain("some_unknown_tool");
  });
});
