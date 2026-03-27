import { describe, expect, it } from "vitest";
import {
  buildAccountUserMap,
  planOperationUserBackfill,
  type BackfillOperationRow,
  type BackfillSessionRow,
} from "@/lib/db/operation-user-backfill";

describe("buildAccountUserMap", () => {
  it("includes both primary and additional connected accounts", () => {
    const sessions: BackfillSessionRow[] = [
      {
        userId: "user-1",
        customerId: "acct-primary",
        customerIds: JSON.stringify([
          { id: "acct-primary", name: "Primary" },
          { id: "acct-extra", name: "Extra" },
        ]),
      },
    ];

    const map = buildAccountUserMap(sessions);

    expect([...map.get("acct-primary") ?? []]).toEqual(["user-1"]);
    expect([...map.get("acct-extra") ?? []]).toEqual(["user-1"]);
  });

  it("deduplicates repeated sessions for the same user", () => {
    const sessions: BackfillSessionRow[] = [
      { userId: "user-1", customerId: "acct-1", customerIds: "[]" },
      { userId: "user-1", customerId: "acct-1", customerIds: "[]" },
    ];

    const map = buildAccountUserMap(sessions);

    expect([...map.get("acct-1") ?? []]).toEqual(["user-1"]);
  });

  it("ignores sessions without a userId and malformed customerIds payloads", () => {
    const sessions: BackfillSessionRow[] = [
      { userId: null, customerId: "acct-null", customerIds: "[]" },
      { userId: "user-1", customerId: "acct-1", customerIds: "{bad json" },
    ];

    const map = buildAccountUserMap(sessions);

    expect(map.has("acct-null")).toBe(false);
    expect([...map.get("acct-1") ?? []]).toEqual(["user-1"]);
  });
});

describe("planOperationUserBackfill", () => {
  it("assigns rows only when the account maps to exactly one user", () => {
    const sessions: BackfillSessionRow[] = [
      { userId: "user-1", customerId: "acct-1", customerIds: "[]" },
      { userId: "user-2", customerId: "acct-2", customerIds: "[]" },
    ];
    const operations: BackfillOperationRow[] = [
      { id: 1, accountId: "acct-1", userId: null },
      { id: 2, accountId: "acct-2", userId: null },
    ];

    const plan = planOperationUserBackfill(operations, sessions);

    expect(plan.assignments).toEqual([
      { operationId: 1, accountId: "acct-1", userId: "user-1" },
      { operationId: 2, accountId: "acct-2", userId: "user-2" },
    ]);
    expect(plan.ambiguousAccountIds).toEqual([]);
    expect(plan.unresolvedAccountIds).toEqual([]);
  });

  it("skips rows that already have a userId", () => {
    const sessions: BackfillSessionRow[] = [
      { userId: "user-1", customerId: "acct-1", customerIds: "[]" },
    ];
    const operations: BackfillOperationRow[] = [
      { id: 1, accountId: "acct-1", userId: "already-set" },
      { id: 2, accountId: "acct-1", userId: null },
    ];

    const plan = planOperationUserBackfill(operations, sessions);

    expect(plan.assignments).toEqual([
      { operationId: 2, accountId: "acct-1", userId: "user-1" },
    ]);
  });

  it("marks accounts ambiguous when multiple distinct users can own them", () => {
    const sessions: BackfillSessionRow[] = [
      { userId: "user-1", customerId: "acct-1", customerIds: "[]" },
      { userId: "user-2", customerId: "acct-1", customerIds: "[]" },
    ];
    const operations: BackfillOperationRow[] = [
      { id: 1, accountId: "acct-1", userId: null },
    ];

    const plan = planOperationUserBackfill(operations, sessions);

    expect(plan.assignments).toEqual([]);
    expect(plan.ambiguousAccountIds).toEqual(["acct-1"]);
    expect(plan.unresolvedAccountIds).toEqual([]);
  });

  it("marks accounts unresolved when no session can attribute them", () => {
    const sessions: BackfillSessionRow[] = [
      { userId: "user-1", customerId: "acct-1", customerIds: "[]" },
    ];
    const operations: BackfillOperationRow[] = [
      { id: 1, accountId: "acct-missing", userId: null },
    ];

    const plan = planOperationUserBackfill(operations, sessions);

    expect(plan.assignments).toEqual([]);
    expect(plan.ambiguousAccountIds).toEqual([]);
    expect(plan.unresolvedAccountIds).toEqual(["acct-missing"]);
  });

  it("treats multi-account session coverage as a valid unique attribution", () => {
    const sessions: BackfillSessionRow[] = [
      {
        userId: "user-1",
        customerId: "acct-1",
        customerIds: JSON.stringify([
          { id: "acct-1", name: "One" },
          { id: "acct-2", name: "Two" },
        ]),
      },
    ];
    const operations: BackfillOperationRow[] = [
      { id: 1, accountId: "acct-2", userId: null },
    ];

    const plan = planOperationUserBackfill(operations, sessions);

    expect(plan.assignments).toEqual([
      { operationId: 1, accountId: "acct-2", userId: "user-1" },
    ]);
  });
});
