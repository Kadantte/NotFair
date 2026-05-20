/**
 * Structured-block protocol the agents emit in their replies. Server-side
 * parses them out of the assistant text after the chat stream completes;
 * client-side strips them from the rendered markdown so the user never sees
 * the raw <create_task>...</create_task> tags.
 *
 * Block types in V1 — mirror paperclip's MCP orchestrator tools (createIssue,
 * updateIssue, addComment, askUserQuestions, createApproval):
 *   - <create_task>     CMO spawns tasks for specialists. (paperclipCreateIssue)
 *   - <task_status>     Specialists update task state. (paperclipUpdateIssue)
 *   - <add_comment>     Cross-agent comms on an existing task. (paperclipAddComment)
 *   - <ask_user>        Agent blocked on user input — needs an answer. (paperclipAskUserQuestions)
 *   - <request_approval> Agent needs a governed action approved. (paperclipCreateApproval)
 *
 * All blocks use the same key:value-per-line shape (mirrors <propose_cron>)
 * so the parser is one shared implementation.
 */

export type CreateTaskBlock = {
  title: string;
  /** Template key of the assignee (e.g., "google_ads"). */
  assignee: string;
  brief: string;
  success_criteria?: string;
};

export type TaskStatusBlock = {
  /** Task ID — the specialist receives this in its kickoff context. */
  task_id: string;
  status: "working" | "done" | "blocked" | "failed";
  summary?: string;
};

export type AddCommentBlock = {
  task_id: string;
  body: string;
};

export type AskUserBlock = {
  /** Optional task scope. When set, the question is anchored to a task. */
  task_id?: string;
  question: string;
  /** Optional comma-separated multiple-choice hints to render as buttons. */
  options?: string;
};

export type RequestApprovalBlock = {
  task_id?: string;
  action_summary: string;
  action_type:
    | "spend"
    | "content_publishing"
    | "new_channel"
    | "bid_change"
    | "audience_change"
    | "other";
  cost_estimate_usd?: number;
  reasoning?: string;
};

const CREATE_TASK_RE = /<create_task>([\s\S]*?)<\/create_task>/gi;
const TASK_STATUS_RE = /<task_status>([\s\S]*?)<\/task_status>/gi;
const ADD_COMMENT_RE = /<add_comment>([\s\S]*?)<\/add_comment>/gi;
const ASK_USER_RE = /<ask_user>([\s\S]*?)<\/ask_user>/gi;
const REQUEST_APPROVAL_RE = /<request_approval>([\s\S]*?)<\/request_approval>/gi;

/**
 * Strip every recognized orchestration block out of an assistant message so
 * the client renders clean prose. Used by the chat UI as a markdown
 * preprocessor.
 */
export function stripOrchestrationBlocks(text: string): string {
  return text
    .replace(CREATE_TASK_RE, "")
    .replace(TASK_STATUS_RE, "")
    .replace(ADD_COMMENT_RE, "")
    .replace(ASK_USER_RE, "")
    .replace(REQUEST_APPROVAL_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Parse the body of one block into a {key: value} map. Lines are trimmed;
 * multi-line values are supported by indenting the continuation lines.
 * Keys are lowercased.
 */
function parseBlockBody(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = body.split(/\r?\n/);
  let currentKey: string | null = null;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      currentKey = null;
      continue;
    }
    // New key — "key: value" on one line (value can be empty for multi-line keys below).
    const m = trimmed.match(/^([a-z_][a-z0-9_]*)\s*:\s*(.*)$/i);
    if (m) {
      const key = m[1]!.toLowerCase();
      const value = m[2]!.trim();
      out[key] = value;
      currentKey = key;
      continue;
    }
    // Continuation line for the current key.
    if (currentKey) {
      out[currentKey] = `${out[currentKey] ?? ""}\n${trimmed}`.trim();
    }
  }
  return out;
}

export function parseCreateTaskBlocks(text: string): CreateTaskBlock[] {
  const out: CreateTaskBlock[] = [];
  for (const match of text.matchAll(CREATE_TASK_RE)) {
    const fields = parseBlockBody(match[1] ?? "");
    const title = fields.title?.trim();
    const assignee = fields.assignee?.trim();
    const brief = fields.brief?.trim();
    if (!title || !assignee || !brief) continue;
    const block: CreateTaskBlock = { title, assignee, brief };
    if (fields.success_criteria) {
      block.success_criteria = fields.success_criteria.trim();
    }
    out.push(block);
  }
  return out;
}

export function parseTaskStatusBlocks(text: string): TaskStatusBlock[] {
  const out: TaskStatusBlock[] = [];
  for (const match of text.matchAll(TASK_STATUS_RE)) {
    const fields = parseBlockBody(match[1] ?? "");
    const task_id = fields.task_id?.trim();
    const status = fields.status?.trim().toLowerCase();
    if (!task_id) continue;
    if (
      status !== "working" &&
      status !== "done" &&
      status !== "blocked" &&
      status !== "failed"
    ) {
      continue;
    }
    const block: TaskStatusBlock = { task_id, status };
    if (fields.summary) block.summary = fields.summary.trim();
    out.push(block);
  }
  return out;
}

export function parseAddCommentBlocks(text: string): AddCommentBlock[] {
  const out: AddCommentBlock[] = [];
  for (const match of text.matchAll(ADD_COMMENT_RE)) {
    const fields = parseBlockBody(match[1] ?? "");
    const task_id = fields.task_id?.trim();
    const body = fields.body?.trim();
    if (!task_id || !body) continue;
    out.push({ task_id, body });
  }
  return out;
}

export function parseAskUserBlocks(text: string): AskUserBlock[] {
  const out: AskUserBlock[] = [];
  for (const match of text.matchAll(ASK_USER_RE)) {
    const fields = parseBlockBody(match[1] ?? "");
    const question = fields.question?.trim();
    if (!question) continue;
    const block: AskUserBlock = { question };
    if (fields.task_id) block.task_id = fields.task_id.trim();
    if (fields.options) block.options = fields.options.trim();
    out.push(block);
  }
  return out;
}

export function parseRequestApprovalBlocks(text: string): RequestApprovalBlock[] {
  const out: RequestApprovalBlock[] = [];
  const ALLOWED_TYPES = new Set([
    "spend",
    "content_publishing",
    "new_channel",
    "bid_change",
    "audience_change",
    "other",
  ]);
  for (const match of text.matchAll(REQUEST_APPROVAL_RE)) {
    const fields = parseBlockBody(match[1] ?? "");
    const action_summary = fields.action_summary?.trim();
    const action_type = fields.action_type?.trim().toLowerCase();
    if (!action_summary || !action_type || !ALLOWED_TYPES.has(action_type)) continue;
    const block: RequestApprovalBlock = {
      action_summary,
      action_type: action_type as RequestApprovalBlock["action_type"],
    };
    if (fields.task_id) block.task_id = fields.task_id.trim();
    if (fields.cost_estimate_usd) {
      const n = Number(fields.cost_estimate_usd);
      if (Number.isFinite(n)) block.cost_estimate_usd = n;
    }
    if (fields.reasoning) block.reasoning = fields.reasoning.trim();
    out.push(block);
  }
  return out;
}
