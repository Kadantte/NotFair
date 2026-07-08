import { getDb } from "./db";

/**
 * "Needs you" signal for the sidebar — the Slack-unread-badge model.
 * An agent demands attention when it has a pending question
 * (`ask_user_question`) or an actionable approval (`request_approval`)
 * waiting on the user. Both park the task in `blocked`, where it is
 * invisible unless the user happens to open that agent's Tasks tab —
 * this module powers the red badge that makes it visible everywhere.
 */
export type AgentAttention = {
  /** Pending questions + actionable approvals waiting on the user. */
  count: number;
  /**
   * Task id of the OLDEST waiting item that is anchored to a task — the
   * deep-link target so clicking the badge lands directly in the
   * decision space (`/agents/<slug>/tasks?task=<id>`). Null when no
   * waiting item names a task (free-standing questions).
   */
  task_id: string | null;
};

/**
 * Per-task variant for the task rail: task_id → count of pending
 * questions + actionable approvals on that task. Rows without a task
 * anchor are skipped — the rail can only badge rows it renders.
 */
export function attentionByTaskForAgent(
  project_slug: string,
  agent_id: string,
): Record<string, number> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT task_id FROM questions
        WHERE project_slug = ? AND agent_id = ? AND status = 'pending'
          AND task_id IS NOT NULL
       UNION ALL
       SELECT task_id FROM approvals
        WHERE project_slug = ? AND agent_id = ? AND status IN ('pending','revision_requested')
          AND task_id IS NOT NULL`,
    )
    .all(project_slug, agent_id, project_slug, agent_id) as Array<{
    task_id: string;
  }>;

  const out: Record<string, number> = {};
  for (const r of rows) out[r.task_id] = (out[r.task_id] ?? 0) + 1;
  return out;
}

export function attentionByAgent(
  project_slug: string,
): Record<string, AgentAttention> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT agent_id, task_id, created_at FROM questions
        WHERE project_slug = ? AND status = 'pending'
       UNION ALL
       SELECT agent_id, task_id, created_at FROM approvals
        WHERE project_slug = ? AND status IN ('pending','revision_requested')
       ORDER BY created_at ASC`,
    )
    .all(project_slug, project_slug) as Array<{
    agent_id: string;
    task_id: string | null;
    created_at: string;
  }>;

  const out: Record<string, AgentAttention> = {};
  for (const r of rows) {
    const entry = (out[r.agent_id] ??= { count: 0, task_id: null });
    entry.count += 1;
    // Rows arrive oldest-first, so the first anchored one wins — answer
    // the item the agent has been waiting on longest.
    if (entry.task_id === null && r.task_id) entry.task_id = r.task_id;
  }
  return out;
}
