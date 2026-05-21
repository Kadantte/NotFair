import { describe, expect, it } from "vitest";
import { buildMcpFeedbackTriage, buildMcpFeedbackTriageReport, classifyMcpFeedback } from "../feedback-triage";

const baseFeedback = {
  id: 7,
  category: "workflow_friction",
  affectedTool: "addNegativeKeyword",
  observation: "The tool description did not mention the bulk variant, so I called this 200 times.",
  suggestion: "Mention addKeywordToNegativeList in the description.",
  userGoal: "Add 12 negative keywords from a search-term audit.",
  status: "new",
  createdAt: new Date("2026-05-21T00:00:00.000Z"),
};

describe("MCP feedback triage", () => {
  it("classifies description/doc improvements as safe low-risk PR candidates", () => {
    expect(classifyMcpFeedback(baseFeedback)).toEqual({
      triage_category: "tool_description_fix",
      priority: "low",
      safe_autonomous_pr: true,
    });
  });

  it("routes auth, billing, and credential feedback to human review", () => {
    expect(
      classifyMcpFeedback({
        ...baseFeedback,
        observation: "OAuth token scope failed when changing billing budget settings.",
        suggestion: "Change the permission scopes automatically.",
      }),
    ).toEqual({
      triage_category: "needs_human_review",
      priority: "high",
      safe_autonomous_pr: false,
    });
  });

  it("treats missing tools as issue-first rather than autonomous PR work", () => {
    expect(
      classifyMcpFeedback({
        ...baseFeedback,
        category: "missing_capability",
        observation: "I needed a new tool to bulk pause placements but no tool exists.",
      }),
    ).toMatchObject({
      triage_category: "missing_tool",
      safe_autonomous_pr: false,
    });
  });

  it("does not misroute missing docs or schema details as a missing tool", () => {
    expect(
      classifyMcpFeedback({
        ...baseFeedback,
        category: "tool_feedback",
        observation: "The description is missing the required campaign_id parameter details.",
        suggestion: "Document the missing field and improve the schema validation message.",
      }),
    ).toEqual({
      triage_category: "input_schema_fix",
      priority: "medium",
      safe_autonomous_pr: true,
    });
  });

  it("builds deterministic issue-ready triage items", () => {
    const triage = buildMcpFeedbackTriage(baseFeedback);
    expect(triage).toMatchObject({
      feedback_id: 7,
      affected_tool: "addNegativeKeyword",
      status: "new",
      priority: "low",
      triage_category: "tool_description_fix",
      safe_autonomous_pr: true,
    });
    expect(triage.issue_title).toContain("[MCP feedback #7]");
    expect(triage.summary).toContain("Observation:");
    expect(triage.recommended_next_step).toContain("small PR");
  });

  it("summarizes read-only dry-run reports without mutating state", () => {
    const report = buildMcpFeedbackTriageReport([
      baseFeedback,
      {
        ...baseFeedback,
        id: 8,
        observation: "The input schema required campaign_id but the error was unclear.",
        suggestion: "Describe required fields and improve the validation message.",
      },
    ]);

    expect(report.mode).toBe("read_only_dry_run");
    expect(report.count).toBe(2);
    expect(report.by_priority).toMatchObject({ low: 1, medium: 1 });
    expect(report.items.map((item) => item.feedback_id)).toEqual([7, 8]);
  });
});
