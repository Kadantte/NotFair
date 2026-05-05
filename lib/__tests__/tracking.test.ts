import { beforeEach, describe, expect, it, vi } from "vitest";

const valuesMock = vi.fn();
const returningMock = vi.fn();
const insertMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: () => ({
    insert: (...args: unknown[]) => {
      insertMock(...args);
      return {
        values: (...valueArgs: unknown[]) => {
          valuesMock(...valueArgs);
          return {
            returning: (...returnArgs: unknown[]) => {
              returningMock(...returnArgs);
              return [{ id: 123 }];
            },
          };
        },
      };
    },
  }),
  schema: {
    operations: "operations",
  },
}));

import { buildChangeGroups, logChange, logRead } from "@/lib/db/tracking";

describe("tracking userId propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes userId on change logs", async () => {
    await logChange({
      accountId: "acct-1",
      userId: "user-1",
      campaignId: "camp-1",
      writeResult: {
        success: true,
        action: "pause_campaign",
        entityId: "entity-1",
        beforeValue: "ENABLED",
        afterValue: "PAUSED",
      },
      reasoning: "reason",
    });

    expect(insertMock).toHaveBeenCalledWith("operations");
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acct-1",
        userId: "user-1",
        campaignId: "camp-1",
      }),
    );
  });

  it("writes userId on read logs", async () => {
    await logRead({
      accountId: "acct-1",
      userId: "user-1",
      toolName: "list_campaigns",
      campaignId: "camp-1",
    });

    expect(insertMock).toHaveBeenCalledWith("operations");
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acct-1",
        userId: "user-1",
        campaignId: "camp-1",
      }),
    );
  });

  it("writes success=1 and no errorMessage for successful changes", async () => {
    await logChange({
      accountId: "acct-1",
      userId: "user-1",
      campaignId: "camp-1",
      writeResult: {
        success: true,
        action: "pause_campaign",
        entityId: "entity-1",
        beforeValue: "ENABLED",
        afterValue: "PAUSED",
      },
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ success: 1, errorMessage: null }),
    );
  });

  it("writes success=0 and errorMessage for failed writes", async () => {
    await logChange({
      accountId: "acct-1",
      userId: "user-1",
      campaignId: "camp-1",
      writeResult: {
        success: false,
        action: "pause_keyword",
        entityId: "kw-1",
        beforeValue: "ENABLED",
        afterValue: "ENABLED",
        error: "INVALID_ARGUMENT: criterion not found",
      },
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: 0,
        errorMessage: "INVALID_ARGUMENT: criterion not found",
      }),
    );
  });
});

describe("buildChangeGroups", () => {
  type TestOperationRow = Parameters<typeof buildChangeGroups>[0][number];

  const baseRow = (overrides: Partial<TestOperationRow>): TestOperationRow => ({
    id: 1,
    accountId: "acct-1",
    userId: "user-1",
    campaignId: "camp-1",
    platform: "google_ads",
    opType: 1,
    toolCode: null,
    entityCode: 0,
    entityId: null,
    label: null,
    beforeValue: null,
    afterValue: null,
    reasoning: null,
    rolledBack: 0,
    success: 1,
    errorMessage: null,
    clientSource: "claude-code",
    sessionId: 42,
    requestId: null,
    toolName: "addNegativeKeyword",
    args: { campaignId: "camp-1" },
    argsSha256: null,
    latencyMs: null,
    bytesOut: null,
    createdAt: new Date("2026-05-04T10:00:00Z"),
    ...overrides,
  }) as TestOperationRow;

  it("groups adjacent same-scope negative keyword writes into one derived episode", () => {
    const groups = buildChangeGroups([
      baseRow({ id: 1, label: "iv therapy" }),
      baseRow({ id: 2, label: "iv hydration", createdAt: new Date("2026-05-04T10:03:00Z") }),
      baseRow({ id: 3, toolName: "updateCampaignBudget", args: { campaignId: "camp-1" }, createdAt: new Date("2026-05-04T10:04:00Z") }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].actionFamily).toBe("budget_change");
    expect(groups[1]).toMatchObject({
      actionFamily: "negative_keyword",
      theme: "search_intent_hygiene",
      operationCount: 2,
      operationIds: [1, 2],
      sampleLabels: ["iv therapy", "iv hydration"],
    });
  });



  it("keeps distinct requestIds and untagged nearby writes in separate groups", () => {
    const groups = buildChangeGroups([
      baseRow({ id: 20, requestId: "r-1", toolName: "addNegativeKeyword", args: { campaignId: "camp-1" } }),
      baseRow({ id: 21, requestId: "r-2", toolName: "addNegativeKeyword", args: { campaignId: "camp-1" }, createdAt: new Date("2026-05-04T10:01:00Z") }),
      baseRow({ id: 22, requestId: null, toolName: "addNegativeKeyword", args: { campaignId: "camp-1" }, createdAt: new Date("2026-05-04T10:02:00Z") }),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.operationIds)).toEqual([[22], [21], [20]]);
    expect(groups.map((group) => group.grouping)).toEqual(["heuristic", "request", "request"]);
  });

  it("does not summarize negative keyword removals as additions", () => {
    const groups = buildChangeGroups([
      baseRow({ id: 4, toolName: "removeNegativeKeyword", label: "free", args: { campaignId: "camp-1" } }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      actionFamily: "remove_negative_keyword",
      theme: "search_intent_hygiene",
      summary: "Removed 1 negative keyword/list operation (e.g. free)",
    });
  });

  it("uses requestId as the strongest grouping signal", () => {
    const groups = buildChangeGroups([
      baseRow({ id: 10, requestId: "r-1", toolName: "addNegativeKeyword", args: { campaignId: "camp-1" } }),
      baseRow({ id: 11, requestId: "r-1", toolName: "pauseKeyword", args: { campaignId: "camp-2" }, createdAt: new Date("2026-05-04T11:00:00Z") }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].grouping).toBe("request");
    expect(groups[0].actionFamily).toBe("mixed");
    expect(groups[0].scope).toBe("multi_scope");
    expect(groups[0].requestIds).toEqual(["r-1"]);
    expect(groups[0].operationIds).toEqual([10, 11]);
  });
});
