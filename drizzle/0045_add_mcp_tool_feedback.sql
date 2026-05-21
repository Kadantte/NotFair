-- Durable queue for internal MCP/tool feedback filed by agents.
-- Slack/PostHog remain notification/analytics mirrors; this table drives
-- triage, issue creation, repair PRs, and close-the-loop reporting.
CREATE TABLE IF NOT EXISTS "mcp_tool_feedback" (
  "id" serial PRIMARY KEY,
  "user_id" text,
  "session_id" integer,
  "category" text NOT NULL,
  "affected_tool" text NOT NULL,
  "observation" text NOT NULL,
  "suggestion" text NOT NULL,
  "user_goal" text,
  "user_email" text,
  "client_name" text,
  "client_version" text,
  "auth_method" text,
  "status" text NOT NULL DEFAULT 'new',
  "triage_category" text,
  "priority" text,
  "triage_summary" text,
  "github_issue_url" text,
  "github_pr_url" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- The first 0045 rollout may have created an older shape of this table before
-- triage fields were added. Keep this migration idempotent and forward-fix any
-- partially-created table instead of silently accepting the old shape.
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "user_id" text;
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "session_id" integer;
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "affected_tool" text;
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "observation" text;
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "suggestion" text;
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "user_goal" text;
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "user_email" text;
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "client_name" text;
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "client_version" text;
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "auth_method" text;
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'new';
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "triage_category" text;
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "priority" text;
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "triage_summary" text;
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "github_issue_url" text;
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "github_pr_url" text;
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "created_at" timestamp NOT NULL DEFAULT now();
ALTER TABLE "mcp_tool_feedback" ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT now();

-- Internal queue only. Keep private even though it lives in public schema:
-- observations/suggestions may contain accidental customer PII or sensitive
-- account context. Server-side direct DB/service-role code writes this table;
-- browser Data API roles should not see it.
ALTER TABLE "mcp_tool_feedback" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "mcp_tool_feedback" FROM anon, authenticated;
REVOKE ALL ON SEQUENCE "mcp_tool_feedback_id_seq" FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS "mcp_tool_feedback_status_created_idx"
  ON "mcp_tool_feedback" ("status", "created_at");

CREATE INDEX IF NOT EXISTS "mcp_tool_feedback_tool_created_idx"
  ON "mcp_tool_feedback" ("affected_tool", "created_at");

CREATE INDEX IF NOT EXISTS "mcp_tool_feedback_session_created_idx"
  ON "mcp_tool_feedback" ("session_id", "created_at");
