CREATE TABLE IF NOT EXISTS "audit_snapshots" (
  "id" serial PRIMARY KEY,
  "account_id" text NOT NULL,
  "user_id" text,
  "overall_score" smallint NOT NULL,
  "category" text NOT NULL,
  "waste_rate" double precision NOT NULL DEFAULT 0,
  "demand_captured" double precision,
  "cpa" double precision,
  "wasted_spend" double precision NOT NULL DEFAULT 0,
  "total_spend" double precision NOT NULL DEFAULT 0,
  "campaign_count" smallint NOT NULL DEFAULT 0,
  "top_actions" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "audit_snapshots_account_idx" ON "audit_snapshots" ("account_id", "created_at" DESC);
