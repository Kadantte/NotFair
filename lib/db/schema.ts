import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  serial,
  jsonb,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Goals & Guardrails ──────────────────────────────────────────────

export const goals = pgTable(
  "goals",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id").notNull(),
    campaignId: text("campaign_id"), // null = account-level default
    targetCpa: real("target_cpa"),   // in dollars
    monthlyCap: real("monthly_cap"), // in dollars
    maxBidChangePct: real("max_bid_change_pct").default(0.25),
    maxBudgetChangePct: real("max_budget_change_pct").default(0.50),
    maxKeywordPausePct: real("max_keyword_pause_pct").default(0.30),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("goals_account_campaign_idx").on(
      table.accountId,
      table.campaignId,
    ),
  ],
);

// ─── Change Tracking ─────────────────────────────────────────────────

export const changes = pgTable("changes", {
  id: serial("id").primaryKey(),
  accountId: text("account_id").notNull(),
  campaignId: text("campaign_id"),
  toolName: text("tool_name").notNull(),       // e.g. "pause_keyword"
  entityType: text("entity_type").notNull(),   // e.g. "keyword", "campaign", "budget"
  entityId: text("entity_id").notNull(),        // criterion_id, campaign_id, etc.
  beforeValue: text("before_value").notNull(),
  afterValue: text("after_value").notNull(),
  reasoning: text("reasoning"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Performance Snapshots ───────────────────────────────────────────

export const performanceSnapshots = pgTable(
  "performance_snapshots",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    snapshotDate: date("snapshot_date").notNull(),
    impressions: integer("impressions").default(0),
    clicks: integer("clicks").default(0),
    costMicros: integer("cost_micros").default(0),
    conversions: real("conversions").default(0),
    cpa: real("cpa"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
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

export const mcpSessions = pgTable("mcp_sessions", {
  id: serial("id").primaryKey(),
  accessToken: text("access_token").notNull().unique(),
  refreshToken: text("refresh_token").notNull(), // Google Ads refresh token
  customerId: text("customer_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
