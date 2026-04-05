import {
  pgTable,
  text,
  smallint,
  integer,
  boolean,
  doublePrecision,
  serial,
  uniqueIndex,
  index,
  timestamp,
} from "drizzle-orm/pg-core";

// ─── Goals & Guardrails ──────────────────────────────────────────────

export const goals = pgTable(
  "goals",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id").notNull(),
    campaignId: text("campaign_id").notNull().default(""),
    targetCpa: doublePrecision("target_cpa"),
    monthlyCap: doublePrecision("monthly_cap"),
    maxBidChangePct: doublePrecision("max_bid_change_pct").default(0.25),
    maxBudgetChangePct: doublePrecision("max_budget_change_pct").default(0.50),
    maxKeywordPausePct: doublePrecision("max_keyword_pause_pct").default(0.30),
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

// ─── Operations (unified read + write tracking) ─────────────────────

export const operations = pgTable("operations", {
  id: serial("id").primaryKey(),
  accountId: text("account_id").notNull(),
  userId: text("user_id"),
  campaignId: text("campaign_id"),
  /** 0=read, 1=write — see OP_TYPE in tracking.ts */
  opType: smallint("op_type").notNull(),
  /** Compact tool code — see TOOL_CODE in tracking.ts */
  toolCode: smallint("tool_code").notNull(),
  /** Compact entity type — see ENTITY_CODE in tracking.ts */
  entityCode: smallint("entity_code"),
  entityId: text("entity_id"),
  /** Human-readable label for the entity (e.g. keyword text) */
  label: text("label"),
  beforeValue: text("before_value"),
  afterValue: text("after_value"),
  reasoning: text("reasoning"),
  rolledBack: smallint("rolled_back").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("ops_account_created_idx").on(table.accountId, table.createdAt),
  index("ops_account_type_idx").on(table.accountId, table.opType, table.createdAt),
  index("ops_user_created_idx").on(table.userId, table.createdAt),
]);

// ─── Performance Snapshots ───────────────────────────────────────────

export const performanceSnapshots = pgTable(
  "performance_snapshots",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    snapshotDate: text("snapshot_date").notNull(),
    impressions: integer("impressions").default(0),
    clicks: integer("clicks").default(0),
    costMicros: integer("cost_micros").default(0),
    conversions: doublePrecision("conversions").default(0),
    cpa: doublePrecision("cpa"),
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

// ─── OAuth Clients (per-user credentials for Claude Connector) ──────

export const oauthClients = pgTable("oauth_clients", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret").notNull(),
  clientSecretHash: text("client_secret_hash").notNull(),
  sessionId: integer("session_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── OAuth Authorization Codes (for Claude Connector flow) ──────────

export const authorizationCodes = pgTable("authorization_codes", {
  code: text("code").primaryKey(),
  sessionId: integer("session_id").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  clientId: text("client_id").notNull(),
  codeChallenge: text("code_challenge"),
  codeChallengeMethod: text("code_challenge_method"),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── MCP Auth Sessions ───────────────────────────────────────────────

export const mcpSessions = pgTable("mcp_sessions", {
  id: serial("id").primaryKey(),
  accessToken: text("access_token").notNull().unique(),
  refreshToken: text("refresh_token").notNull(),
  customerId: text("customer_id").notNull(),
  customerIds: text("customer_ids").notNull().default("[]"),
  userId: text("user_id"),
  googleEmail: text("google_email"),
  expiresAt: text("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
