import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
}));

const resolveApprovalMock = vi.fn();
vi.mock("@/server/db/approvals", () => ({
  resolveApproval: (...a: unknown[]) => resolveApprovalMock(...a),
}));

import { approveAction, rejectAction } from "./approvals";

function makeApproval(overrides: Record<string, unknown> = {}) {
  return {
    id: "ap-1",
    project_slug: "demo",
    agent_id: "demo-cmo",
    action_summary: "raise bid",
    action_type: "bid_change",
    cost_estimate_usd: 0,
    reasoning: null,
    payload_json: "{}",
    status: "approved",
    created_at: "2026-05-01T00:00:00Z",
    resolved_at: "2026-05-02T00:00:00Z",
    ...overrides,
  };
}

describe("approveAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls resolveApproval with 'approved' and revalidates layout on success", async () => {
    resolveApprovalMock.mockReturnValue(makeApproval({ status: "approved" }));
    const out = await approveAction("ap-1");
    expect(out).toEqual({ ok: true });
    expect(resolveApprovalMock).toHaveBeenCalledWith("ap-1", "approved");
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });

  it("returns ok:false with descriptive error when resolveApproval returns null", async () => {
    resolveApprovalMock.mockReturnValue(null);
    const out = await approveAction("missing");
    expect(out).toEqual({
      ok: false,
      error: "Approval not found or already resolved.",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("rejectAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls resolveApproval with 'rejected' and revalidates layout on success", async () => {
    resolveApprovalMock.mockReturnValue(makeApproval({ status: "rejected" }));
    const out = await rejectAction("ap-1");
    expect(out).toEqual({ ok: true });
    expect(resolveApprovalMock).toHaveBeenCalledWith("ap-1", "rejected");
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });

  it("returns ok:false with descriptive error when resolveApproval returns null", async () => {
    resolveApprovalMock.mockReturnValue(null);
    const out = await rejectAction("missing");
    expect(out).toEqual({
      ok: false,
      error: "Approval not found or already resolved.",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
