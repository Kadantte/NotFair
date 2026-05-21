export type McpFeedbackStatus =
  | "new"
  | "triaged"
  | "issue_opened"
  | "pr_opened"
  | "fixed"
  | "closed"
  | "wontfix"
  | "needs_info";

export type McpFeedbackPriority = "low" | "medium" | "high";

export type McpFeedbackTriageCategory =
  | "tool_description_fix"
  | "input_schema_fix"
  | "error_message_fix"
  | "missing_tool"
  | "workflow_ergonomics"
  | "eval_gap"
  | "product_or_strategy"
  | "needs_human_review";

export type McpToolFeedbackRow = {
  id: number;
  category: string;
  affectedTool: string;
  observation: string;
  suggestion: string;
  userGoal: string | null;
  userEmail?: string | null;
  clientName?: string | null;
  status: string;
  createdAt: Date | string;
};

export type McpFeedbackTriage = {
  feedback_id: number;
  affected_tool: string;
  status: string;
  priority: McpFeedbackPriority;
  triage_category: McpFeedbackTriageCategory;
  issue_title: string;
  summary: string;
  recommended_next_step: string;
  safe_autonomous_pr: boolean;
};

function normalizedText(row: McpToolFeedbackRow): string {
  return [row.category, row.affectedTool, row.observation, row.suggestion, row.userGoal ?? ""]
    .join("\n")
    .toLowerCase();
}

export function classifyMcpFeedback(row: McpToolFeedbackRow): Pick<McpFeedbackTriage, "triage_category" | "priority" | "safe_autonomous_pr"> {
  const text = normalizedText(row);

  if (/auth|oauth|token|permission|scope|credential|login|billing|budget|subscription|charge|payment/.test(text)) {
    return { triage_category: "needs_human_review", priority: "high", safe_autonomous_pr: false };
  }

  if (row.category === "missing_capability") {
    return { triage_category: "missing_tool", priority: "medium", safe_autonomous_pr: false };
  }

  if (/schema|parameter|param|field|zod|input|enum|required|validation/.test(text)) {
    return { triage_category: "input_schema_fix", priority: "medium", safe_autonomous_pr: true };
  }

  if (/error|exception|failed|failure|stack|message|unclear/.test(text)) {
    return { triage_category: "error_message_fix", priority: "medium", safe_autonomous_pr: true };
  }

  if (/eval|test|regression|expected behavior|benchmark/.test(text)) {
    return { triage_category: "eval_gap", priority: "medium", safe_autonomous_pr: true };
  }

  if (/description|describe|docs|instruction|prompt|confusing|ambiguous|discover|mention/.test(text)) {
    return { triage_category: "tool_description_fix", priority: "low", safe_autonomous_pr: true };
  }

  if (/workflow|too many|repetitive|redundant|batch|bulk|ergonomic|slow/.test(text)) {
    return { triage_category: "workflow_ergonomics", priority: "medium", safe_autonomous_pr: false };
  }

  if (
    /\b(?:need(?:ed)?|wish(?:ed)?) (?:there (?:was|were) )?(?:a |an |new )?tool\b/.test(text) ||
    /\b(?:no tool|new tool)\b/.test(text) ||
    /\b(?:can't|cannot)\b.*\b(?:because|since)\b.*\bno tool\b/.test(text)
  ) {
    return { triage_category: "missing_tool", priority: "medium", safe_autonomous_pr: false };
  }

  return { triage_category: "product_or_strategy", priority: "low", safe_autonomous_pr: false };
}

function cleanOneLine(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}…`;
}

export function buildMcpFeedbackTriage(row: McpToolFeedbackRow): McpFeedbackTriage {
  const classification = classifyMcpFeedback(row);
  const issueTitle = `[MCP feedback #${row.id}] ${row.affectedTool}: ${cleanOneLine(row.observation, 80)}`;
  const summary = [
    `Observation: ${cleanOneLine(row.observation, 240)}`,
    `Suggestion: ${cleanOneLine(row.suggestion, 240)}`,
    row.userGoal ? `User goal: ${cleanOneLine(row.userGoal, 180)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const recommendedNextStep = classification.safe_autonomous_pr
    ? "Candidate for a small PR after human issue review: update descriptions/schema/errors/docs/evals only."
    : "Open/review a GitHub issue before implementation; do not auto-PR without human approval.";

  return {
    feedback_id: row.id,
    affected_tool: row.affectedTool,
    status: row.status,
    priority: classification.priority,
    triage_category: classification.triage_category,
    issue_title: issueTitle,
    summary,
    recommended_next_step: recommendedNextStep,
    safe_autonomous_pr: classification.safe_autonomous_pr,
  };
}

export function buildMcpFeedbackTriageReport(rows: McpToolFeedbackRow[]) {
  const items = rows.map(buildMcpFeedbackTriage);
  const byCategory = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.triage_category] = (acc[item.triage_category] ?? 0) + 1;
    return acc;
  }, {});
  const byPriority = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.priority] = (acc[item.priority] ?? 0) + 1;
    return acc;
  }, {});

  return {
    generated_at: new Date().toISOString(),
    mode: "read_only_dry_run",
    count: items.length,
    by_category: byCategory,
    by_priority: byPriority,
    items,
  };
}
