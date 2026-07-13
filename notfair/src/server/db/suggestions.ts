import { randomUUID } from "node:crypto";
import { getDb } from "./db";

/**
 * Goal suggestions: proposals NotFair mints from a mechanical audit of a
 * freshly connected ads account. One row per (project, source, kind) —
 * regeneration refreshes open rows in place; accepted and dismissed rows
 * keep their status so the same idea never resurfaces uninvited.
 */

export type GoalSuggestion = {
  id: string;
  project_slug: string;
  source_key: string;
  kind: string;
  title: string;
  statement: string;
  mode: "achieve" | "maintain";
  rationale: string;
  status: "open" | "accepted" | "dismissed";
  accepted_goal_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SuggestionDraft = {
  kind: string;
  title: string;
  statement: string;
  mode: "achieve" | "maintain";
  rationale: string;
};

/**
 * Write a fresh batch for one source. Open rows for kinds NOT in the new
 * batch are deleted (the data no longer supports them); accepted and
 * dismissed rows are never touched.
 */
export function replaceOpenSuggestions(
  project_slug: string,
  source_key: string,
  drafts: SuggestionDraft[],
): void {
  const db = getDb();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const keep = drafts.map((d) => d.kind);
    const placeholders = keep.map(() => "?").join(",");
    db.prepare(
      `DELETE FROM goal_suggestions
       WHERE project_slug = ? AND source_key = ? AND status = 'open'
       ${keep.length > 0 ? `AND kind NOT IN (${placeholders})` : ""}`,
    ).run(project_slug, source_key, ...keep);
    for (const d of drafts) {
      db.prepare(
        `INSERT INTO goal_suggestions
           (id, project_slug, source_key, kind, title, statement, mode, rationale, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
         ON CONFLICT(project_slug, source_key, kind) DO UPDATE SET
           title = excluded.title,
           statement = excluded.statement,
           mode = excluded.mode,
           rationale = excluded.rationale,
           updated_at = excluded.updated_at
         WHERE goal_suggestions.status = 'open'`,
      ).run(
        randomUUID(),
        project_slug,
        source_key,
        d.kind,
        d.title,
        d.statement,
        d.mode,
        d.rationale,
        now,
        now,
      );
    }
  });
  tx();
}

export function listOpenSuggestions(project_slug: string): GoalSuggestion[] {
  return getDb()
    .prepare(
      "SELECT * FROM goal_suggestions WHERE project_slug = ? AND status = 'open' ORDER BY created_at ASC, kind ASC",
    )
    .all(project_slug) as GoalSuggestion[];
}

export function getSuggestion(id: string): GoalSuggestion | null {
  const row = getDb()
    .prepare("SELECT * FROM goal_suggestions WHERE id = ?")
    .get(id) as GoalSuggestion | undefined;
  return row ?? null;
}

/** True when this source has EVER produced rows for the project. */
export function hasSuggestionsForSource(
  project_slug: string,
  source_key: string,
): boolean {
  return (
    getDb()
      .prepare(
        "SELECT 1 FROM goal_suggestions WHERE project_slug = ? AND source_key = ? LIMIT 1",
      )
      .get(project_slug, source_key) !== undefined
  );
}

export function markSuggestionAccepted(id: string, goal_id: string): void {
  getDb()
    .prepare(
      "UPDATE goal_suggestions SET status = 'accepted', accepted_goal_id = ?, updated_at = ? WHERE id = ?",
    )
    .run(goal_id, new Date().toISOString(), id);
}

export function markSuggestionDismissed(id: string): void {
  getDb()
    .prepare(
      "UPDATE goal_suggestions SET status = 'dismissed', updated_at = ? WHERE id = ?",
    )
    .run(new Date().toISOString(), id);
}
