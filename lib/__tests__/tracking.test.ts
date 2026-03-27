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

import { logChange, logRead } from "@/lib/db/tracking";

describe("tracking userId propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes userId on change logs", async () => {
    await logChange(
      "acct-1",
      "user-1",
      "camp-1",
      {
        success: true,
        action: "pause_campaign",
        entityId: "entity-1",
        beforeValue: "ENABLED",
        afterValue: "PAUSED",
      },
      "reason",
    );

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
    await logRead("acct-1", "user-1", "list_campaigns", "camp-1");

    expect(insertMock).toHaveBeenCalledWith("operations");
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acct-1",
        userId: "user-1",
        campaignId: "camp-1",
      }),
    );
  });
});
