CREATE TABLE "changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"campaign_id" text,
	"tool_name" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before_value" text NOT NULL,
	"after_value" text NOT NULL,
	"reasoning" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"campaign_id" text DEFAULT '' NOT NULL,
	"target_cpa" double precision,
	"monthly_cap" double precision,
	"max_bid_change_pct" double precision DEFAULT 0.25,
	"max_budget_change_pct" double precision DEFAULT 0.5,
	"max_keyword_pause_pct" double precision DEFAULT 0.3,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"customer_id" text NOT NULL,
	"customer_ids" text DEFAULT '[]' NOT NULL,
	"expires_at" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_sessions_access_token_unique" UNIQUE("access_token")
);
--> statement-breakpoint
CREATE TABLE "performance_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"snapshot_date" text NOT NULL,
	"impressions" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"cost_micros" integer DEFAULT 0,
	"conversions" double precision DEFAULT 0,
	"cpa" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "goals_account_campaign_idx" ON "goals" USING btree ("account_id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_account_campaign_date_idx" ON "performance_snapshots" USING btree ("account_id","campaign_id","snapshot_date");