import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS } from "./migrations";

let testDb: Database.Database;

vi.mock("./db", () => ({
  getDb: () => testDb,
  getDbPath: () => ":memory:",
}));

import { attentionByAgent, attentionByTaskForAgent } from "./attention";
import { createQuestion, answerQuestion } from "./questions";

function applyMigrations(db: Database.Database): void {
  for (const m of MIGRATIONS) db.exec(m.sql);
}

function createDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  return db;
}

function seedProject(slug = "acme"): void {
  testDb
    .prepare(
      "INSERT INTO projects (id, slug, display_name, created_at) VALUES (?, ?, ?, ?)",
    )
    .run("p-" + slug, slug, slug, "2026-01-01T00:00:00.000Z");
}

/** questions.task_id carries a FK to tasks(id) — seed a real row. */
function seedTask(id: string, agent_id = "acme-cmo-greg"): void {
  testDb
    .prepare(
      `INSERT INTO tasks (id, project_slug, agent_id, brief, status, created_at, updated_at)
       VALUES (?, 'acme', ?, 'brief', 'blocked', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    )
    .run(id, agent_id);
}

function insertApproval(input: {
  id: string;
  agent_id: string;
  task_id?: string | null;
  status?: string;
  created_at?: string;
}): void {
  testDb
    .prepare(
      `INSERT INTO approvals
         (id, project_slug, agent_id, task_id, action_summary, action_type,
          cost_estimate_usd, payload_json, status, created_at)
       VALUES (?, 'acme', ?, ?, 'Raise budget', 'spend', 10, '{}', ?, ?)`,
    )
    .run(
      input.id,
      input.agent_id,
      input.task_id ?? null,
      input.status ?? "pending",
      input.created_at ?? "2026-01-02T00:00:00.000Z",
    );
}

beforeEach(() => {
  testDb = createDb();
  seedProject();
});

afterEach(() => {
  testDb.close();
});

describe("attentionByAgent", () => {
  it("returns an empty map when nothing waits on the user", () => {
    expect(attentionByAgent("acme")).toEqual({});
  });

  it("counts pending questions and actionable approvals per agent", () => {
    seedTask("t-1");
    createQuestion({
      project_slug: "acme",
      agent_id: "acme-cmo-greg",
      task_id: "t-1",
      prompt: "What does Demo1 sell?",
      options: [],
    });
    insertApproval({ id: "a-1", agent_id: "acme-cmo-greg", task_id: "t-1" });
    insertApproval({
      id: "a-2",
      agent_id: "acme-google-ads-ana",
      task_id: "t-9",
      status: "revision_requested",
    });

    const out = attentionByAgent("acme");
    expect(out["acme-cmo-greg"]?.count).toBe(2);
    expect(out["acme-google-ads-ana"]?.count).toBe(1);
    expect(out["acme-google-ads-ana"]?.task_id).toBe("t-9");
  });

  it("deep-links to the OLDEST task-anchored item", () => {
    insertApproval({
      id: "a-new",
      agent_id: "acme-cmo-greg",
      task_id: "t-new",
      created_at: "2026-01-05T00:00:00.000Z",
    });
    insertApproval({
      id: "a-old",
      agent_id: "acme-cmo-greg",
      task_id: "t-old",
      created_at: "2026-01-03T00:00:00.000Z",
    });

    expect(attentionByAgent("acme")["acme-cmo-greg"]?.task_id).toBe("t-old");
  });

  it("falls back past unanchored items to the first task-anchored one", () => {
    seedTask("t-2");
    createQuestion({
      project_slug: "acme",
      agent_id: "acme-cmo-greg",
      task_id: null,
      prompt: "Free-standing question",
      options: [],
    });
    insertApproval({
      id: "a-1",
      agent_id: "acme-cmo-greg",
      task_id: "t-2",
      created_at: "2099-01-01T00:00:00.000Z",
    });

    const entry = attentionByAgent("acme")["acme-cmo-greg"];
    expect(entry?.count).toBe(2);
    expect(entry?.task_id).toBe("t-2");
  });

  it("excludes resolved questions and decided approvals", () => {
    seedTask("t-1");
    const q = createQuestion({
      project_slug: "acme",
      agent_id: "acme-cmo-greg",
      task_id: "t-1",
      prompt: "Answered already",
      options: ["Yes"],
    });
    answerQuestion({ id: q.id, answer_option_index: 0, answer_text: null });
    insertApproval({
      id: "a-done",
      agent_id: "acme-cmo-greg",
      task_id: "t-1",
      status: "approved",
    });

    expect(attentionByAgent("acme")).toEqual({});
  });

  it("attentionByTaskForAgent maps task ids to their pending-item counts", () => {
    seedTask("t-1");
    seedTask("t-2");
    createQuestion({
      project_slug: "acme",
      agent_id: "acme-cmo-greg",
      task_id: "t-1",
      prompt: "One",
      options: [],
    });
    insertApproval({ id: "a-1", agent_id: "acme-cmo-greg", task_id: "t-1" });
    insertApproval({ id: "a-2", agent_id: "acme-cmo-greg", task_id: "t-2" });
    // Unanchored + other-agent rows don't leak in.
    createQuestion({
      project_slug: "acme",
      agent_id: "acme-cmo-greg",
      task_id: null,
      prompt: "Free-standing",
      options: [],
    });
    insertApproval({ id: "a-3", agent_id: "acme-google-ads-ana", task_id: "t-9" });

    expect(attentionByTaskForAgent("acme", "acme-cmo-greg")).toEqual({
      "t-1": 2,
      "t-2": 1,
    });
  });

  it("scopes to the requested project", () => {
    seedProject("other");
    testDb
      .prepare(
        `INSERT INTO questions
           (id, project_slug, agent_id, task_id, prompt, options_json,
            status, answer_option_index, answer_text, resolved_by_kind,
            created_at, resolved_at)
         VALUES ('q-x', 'other', 'other-cmo', NULL, 'p', '[]',
                 'pending', NULL, NULL, NULL, '2026-01-01T00:00:00.000Z', NULL)`,
      )
      .run();

    expect(attentionByAgent("acme")).toEqual({});
    expect(attentionByAgent("other")["other-cmo"]?.count).toBe(1);
  });
});
