-- Audit Applies — turns audit recommendations into auditable, idempotent,
-- undoable writes. Each row is one apply event:
-- (snapshot_id, pass_key, index) uniquely identifies a recommendation in an
-- AuditResult, so concurrent click-spam on the same card resolves to a single
-- apply via the unique index. user_id / account_id / action_type are
-- denormalized from the snapshot purely for cheap digest + analytics queries.
--
-- change_id and undo_change_id point at operations.id so we have a clean join
-- to "what actually happened" — payload + duration + error class are already
-- captured there. We don't enforce FK constraints because operations is a
-- high-churn table where we sometimes truncate via cron in dev.

CREATE TABLE IF NOT EXISTS "audit_applies" (
  "id" serial PRIMARY KEY,
  "snapshot_id" integer NOT NULL,
  "pass_key" text NOT NULL,
  "index" integer NOT NULL,
  "user_id" text,
  "account_id" text NOT NULL,
  "action_type" text NOT NULL,
  "change_id" integer,
  "undo_change_id" integer,
  "undo_tool_call" jsonb,
  "applied_at" timestamp NOT NULL DEFAULT now(),
  "undone_at" timestamp
);

-- Idempotency anchor: concurrent applies of the same recommendation collapse
-- to a single row. The apply route catches the unique-violation and returns
-- the existing row instead of double-writing.
CREATE UNIQUE INDEX IF NOT EXISTS "audit_applies_lookup_idx"
  ON "audit_applies" ("snapshot_id", "pass_key", "index");

-- Digest cron query path: "applies for user X ~7 days ago".
CREATE INDEX IF NOT EXISTS "audit_applies_user_applied_idx"
  ON "audit_applies" ("user_id", "applied_at" DESC);

-- Cross-link operations rows back to the audit that recommended them. Powers
-- "this change came from audit Y" attribution and the per-snapshot undo bar.
ALTER TABLE "operations" ADD COLUMN IF NOT EXISTS "audit_snapshot_id" integer;
CREATE INDEX IF NOT EXISTS "ops_audit_snapshot_idx"
  ON "operations" ("audit_snapshot_id")
  WHERE "audit_snapshot_id" IS NOT NULL;

-- Marks the most recent apply against a snapshot. Used by the audit page to
-- detect "this audit has stale state — re-run before applying more" and by
-- analytics ("% of audits with at least one apply"). Nullable because most
-- existing snapshots will never have an apply.
ALTER TABLE "audit_snapshots" ADD COLUMN IF NOT EXISTS "last_apply_at" timestamp;
