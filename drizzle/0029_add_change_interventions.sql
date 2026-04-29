CREATE TABLE IF NOT EXISTS "change_interventions" (
  "id" serial PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "campaign_id" text NOT NULL,
  "intervention_date" text NOT NULL,
  "name" text NOT NULL,
  "change_summary" text DEFAULT '' NOT NULL,
  "hypothesis" text,
  "primary_metric" text,
  "goal_direction" text,
  "trigger_source" text DEFAULT 'write_flow_auto' NOT NULL,
  "status" text DEFAULT 'watching' NOT NULL,
  "request_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "started_at" timestamp NOT NULL,
  "ended_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "change_interventions_account_started_idx" ON "change_interventions" ("account_id", "started_at");
CREATE INDEX IF NOT EXISTS "change_interventions_account_status_started_idx" ON "change_interventions" ("account_id", "status", "started_at");
CREATE INDEX IF NOT EXISTS "change_interventions_campaign_date_idx" ON "change_interventions" ("account_id", "campaign_id", "intervention_date");

CREATE TABLE IF NOT EXISTS "change_intervention_operations" (
  "id" serial PRIMARY KEY NOT NULL,
  "change_intervention_id" integer NOT NULL,
  "operation_id" integer NOT NULL,
  "operation_order" integer DEFAULT 0 NOT NULL,
  "request_id" text,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_ref" text,
  "label" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "change_intervention_operations_operation_idx" ON "change_intervention_operations" ("operation_id");
CREATE INDEX IF NOT EXISTS "change_intervention_operations_intervention_idx" ON "change_intervention_operations" ("change_intervention_id", "operation_order");

CREATE TABLE IF NOT EXISTS "change_intervention_evaluations" (
  "id" serial PRIMARY KEY NOT NULL,
  "change_intervention_id" integer NOT NULL,
  "evaluation_version" integer DEFAULT 1 NOT NULL,
  "baseline_window_days" integer DEFAULT 7 NOT NULL,
  "after_window_days" integer DEFAULT 7 NOT NULL,
  "days_since_start" integer DEFAULT 0 NOT NULL,
  "confounder_count_internal" integer DEFAULT 0 NOT NULL,
  "confidence" text NOT NULL,
  "result_label" text NOT NULL,
  "primary_metric_name" text NOT NULL,
  "primary_metric_before" double precision,
  "primary_metric_after" double precision,
  "primary_metric_delta_pct" double precision,
  "supporting_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "reason_summary" text NOT NULL,
  "reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "change_intervention_evaluations_intervention_created_idx" ON "change_intervention_evaluations" ("change_intervention_id", "created_at");
