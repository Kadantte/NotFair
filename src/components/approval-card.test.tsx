// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const approveMock = vi.fn();
const rejectMock = vi.fn();
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock("@/server/actions/approvals", () => ({
  approveAction: (...a: unknown[]) => approveMock(...a),
  rejectAction: (...a: unknown[]) => rejectMock(...a),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastErrorMock(...a),
    success: (...a: unknown[]) => toastSuccessMock(...a),
  },
}));

import { ApprovalCard } from "./approval-card";
import type { Approval } from "@/types";

function makeApproval(overrides: Partial<Approval> = {}): Approval {
  return {
    id: "ap-1",
    project_slug: "demo",
    agent_id: "demo-google-ads",
    action_summary: "Raise CPC bid on /signup keyword",
    action_type: "bid_change",
    cost_estimate_usd: 12.5,
    reasoning: null,
    payload_json: "{}",
    status: "pending",
    created_at: new Date(Date.now() - 90_000).toISOString(),
    resolved_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  approveMock.mockReset();
  rejectMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
});

describe("ApprovalCard", () => {
  it("renders summary, action-type label, cost, agent, and a relative timestamp", () => {
    render(<ApprovalCard approval={makeApproval()} />);
    expect(screen.getByText("Raise CPC bid on /signup keyword")).toBeInTheDocument();
    expect(screen.getByText("Bid change")).toBeInTheDocument();
    expect(screen.getByText("$12.50")).toBeInTheDocument();
    expect(screen.getByText("demo-google-ads")).toBeInTheDocument();
    expect(screen.getByText(/m ago|s ago/)).toBeInTheDocument();
  });

  it("hides the cost line when cost_estimate_usd is zero", () => {
    render(<ApprovalCard approval={makeApproval({ cost_estimate_usd: 0 })} />);
    expect(screen.queryByText(/Cost:/)).not.toBeInTheDocument();
  });

  it("hides the Why? toggle when reasoning is null", () => {
    render(<ApprovalCard approval={makeApproval({ reasoning: null })} />);
    expect(screen.queryByText("Why?")).not.toBeInTheDocument();
  });

  it("toggles reasoning visibility when Why? is clicked", () => {
    render(
      <ApprovalCard
        approval={makeApproval({ reasoning: "Predicted +18% CTR" })}
      />,
    );
    expect(screen.queryByText("Predicted +18% CTR")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Why?"));
    expect(screen.getByText("Predicted +18% CTR")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Why?"));
    expect(screen.queryByText("Predicted +18% CTR")).not.toBeInTheDocument();
  });

  it("approve button calls approveAction and shows success toast on ok", async () => {
    approveMock.mockResolvedValue({ ok: true });
    render(<ApprovalCard approval={makeApproval()} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => {
      expect(approveMock).toHaveBeenCalledWith("ap-1");
      expect(toastSuccessMock).toHaveBeenCalledWith("Approved — running now");
    });
  });

  it("approve button surfaces server error via toast", async () => {
    approveMock.mockResolvedValue({ ok: false, error: "boom" });
    render(<ApprovalCard approval={makeApproval()} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("boom");
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("approve uses fallback error string when server omits one", async () => {
    approveMock.mockResolvedValue({ ok: false });
    render(<ApprovalCard approval={makeApproval()} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Failed to approve");
    });
  });

  it("reject button calls rejectAction and shows success toast", async () => {
    rejectMock.mockResolvedValue({ ok: true });
    render(<ApprovalCard approval={makeApproval()} />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => {
      expect(rejectMock).toHaveBeenCalledWith("ap-1");
      expect(toastSuccessMock).toHaveBeenCalledWith("Rejected");
    });
  });

  it("reject surfaces server error with fallback string", async () => {
    rejectMock.mockResolvedValue({ ok: false });
    render(<ApprovalCard approval={makeApproval()} />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Failed to reject");
    });
  });

  it("renders different action-type labels", () => {
    const { rerender } = render(
      <ApprovalCard approval={makeApproval({ action_type: "spend" })} />,
    );
    expect(screen.getByText("Spend")).toBeInTheDocument();
    rerender(
      <ApprovalCard approval={makeApproval({ action_type: "content_publishing" })} />,
    );
    expect(screen.getByText("Content")).toBeInTheDocument();
    rerender(
      <ApprovalCard approval={makeApproval({ action_type: "new_channel" })} />,
    );
    expect(screen.getByText("New channel")).toBeInTheDocument();
    rerender(<ApprovalCard approval={makeApproval({ action_type: "other" })} />);
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("sets the region aria-label to action_summary", () => {
    render(<ApprovalCard approval={makeApproval({ action_summary: "X-summary" })} />);
    expect(
      screen.getByRole("region", { name: "X-summary" }),
    ).toBeInTheDocument();
  });
});
