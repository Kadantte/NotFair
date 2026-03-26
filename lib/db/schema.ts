import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── Goals & Guardrails ──────────────────────────────────────────────

export const goals = sqliteTable(
  "goals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: text("account_id").notNull(),
    campaignId: text("campaign_id").notNull().default(""),
    targetCpa: real("target_cpa"),
    monthlyCap: real("monthly_cap"),
    maxBidChangePct: real("max_bid_change_pct").default(0.25),
    maxBudgetChangePct: real("max_budget_change_pct").default(0.50),
    maxKeywordPausePct: real("max_keyword_pause_pct").default(0.30),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => [
    uniqueIndex("goals_account_campaign_idx").on(
      table.accountId,
      table.campaignId,
    ),
  ],
);

// ─── Change Tracking ─────────────────────────────────────────────────

export const changes = sqliteTable("changes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: text("account_id").notNull(),
  campaignId: text("campaign_id"),
  toolName: text("tool_name").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  beforeValue: text("before_value").notNull(),
  afterValue: text("after_value").notNull(),
  reasoning: text("reasoning"),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});

// ─── Performance Snapshots ───────────────────────────────────────────

export const performanceSnapshots = sqliteTable(
  "performance_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: text("account_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    snapshotDate: text("snapshot_date").notNull(),
    impressions: integer("impressions").default(0),
    clicks: integer("clicks").default(0),
    costMicros: integer("cost_micros").default(0),
    conversions: real("conversions").default(0),
    cpa: real("cpa"),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => [
    uniqueIndex("snapshot_account_campaign_date_idx").on(
      table.accountId,
      table.campaignId,
      table.snapshotDate,
    ),
  ],
);

// ─── MCP Auth Sessions ───────────────────────────────────────────────

export const mcpSessions = sqliteTable("mcp_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accessToken: text("access_token").notNull().unique(),
  refreshToken: text("refresh_token").notNull(),
  customerId: text("customer_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
});
