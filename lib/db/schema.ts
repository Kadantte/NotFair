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
  jsonb,
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
  /** Raw MCP clientInfo.name — e.g. "claude-code", "claude-desktop". Null for chat/agent. */
  clientSource: text("client_source"),
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
  oauthAccessToken: text("oauth_access_token"),
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

// ─── Leads ──────────────────────────────────────────────────────────

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  company: text("company"),
  /** 'lead' = cold prospect, 'customer' = already-connected user we're re-engaging */
  kind: text("kind").notNull().default("lead"),
  /** new, drafted, scheduled, contacted, delivered, opened, clicked, replied, bounced */
  status: text("status").notNull().default("new"),
  bounceCount: integer("bounce_count").default(0).notNull(),
  draftSubject: text("draft_subject"),
  draftBody: text("draft_body"),
  gmailDraftId: text("gmail_draft_id"),
  scheduledAt: timestamp("scheduled_at"),
  lastContactedAt: timestamp("last_contacted_at"),
  unsubscribed: boolean("unsubscribed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("contacts_email_idx").on(table.email),
  index("contacts_kind_idx").on(table.kind),
]);

// ─── OAuth Nonces (server-side CSRF protection) ─────────────────────

export const oauthNonces = pgTable("oauth_nonces", {
  nonce: text("nonce").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── MCP Auth Sessions ───────────────────────────────────────────────

export const mcpSessions = pgTable("mcp_sessions", {
  id: serial("id").primaryKey(),
  accessToken: text("access_token").notNull().unique(),
  refreshToken: text("refresh_token").notNull(),
  customerId: text("customer_id").notNull(),
  customerIds: text("customer_ids").notNull().default("[]"),
  loginCustomerId: text("login_customer_id"),
  userId: text("user_id"),
  googleEmail: text("google_email"),
  expiresAt: text("expires_at").notNull(),
  /** MCP clientInfo.name — set once on initialize, e.g. "claude-code". */
  clientName: text("client_name"),
  /** MCP clientInfo.version — set once on initialize. */
  clientVersion: text("client_version"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Account Snapshots ──────────────────────────────────────────────

export const accounts = pgTable("accounts", {
  accountId: text("account_id").primaryKey(),
  name: text("name"),
  currencyCode: text("currency_code"),
  dailyBudget: doublePrecision("daily_budget"),
  activeCampaigns: integer("active_campaigns"),
  timeZone: text("time_zone"),
  isTest: boolean("is_test").default(false).notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Subscriptions ──────────────────────────────────────────────────
//
// Canonical pattern: Stripe is the source of truth. We store ONLY the
// columns we need to query against (user_id, stripe_customer_id, email),
// plus the full Stripe Subscription object as `data` jsonb. Plan, status,
// interval, period end, cancel state, trial end, etc. are all derived
// from `data` at read time in lib/subscription.ts. Adding a new field that
// Stripe already exposes never requires a migration.

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  /** Our app's stable user id (matches mcp_sessions.user_id). */
  userId: text("user_id").notNull().unique(),
  /** Email on file at Stripe — kept flat for support/ops queries. */
  email: text("email"),
  /** Webhook lookup key — flat with a unique index for indexed lookups. */
  stripeCustomerId: text("stripe_customer_id").unique(),
  /** Full Stripe Subscription object, or null if the customer has none. */
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("subscriptions_stripe_customer_idx").on(table.stripeCustomerId),
]);

// ─── Processed Stripe webhook events (idempotency) ───────────────────

export const processedStripeEvents = pgTable("processed_stripe_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});

// ─── Chat Threads ───────────────────────────────────────────────────

export const chatThreads = pgTable("chat_threads", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  title: text("title"),
  shareId: text("share_id").unique(),
  isShared: boolean("is_shared").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("chat_threads_user_account_idx").on(table.userId, table.accountId, table.updatedAt),
]);

// ─── Audit Snapshots ────────────────────────────────────────────────

export const auditSnapshots = pgTable("audit_snapshots", {
  id: serial("id").primaryKey(),
  accountId: text("account_id").notNull(),
  userId: text("user_id"),
  overallScore: smallint("overall_score").notNull(),
  category: text("category").notNull(),
  wasteRate: doublePrecision("waste_rate").notNull().default(0),
  demandCaptured: doublePrecision("demand_captured"),
  cpa: doublePrecision("cpa"),
  wastedSpend: doublePrecision("wasted_spend").notNull().default(0),
  totalSpend: doublePrecision("total_spend").notNull().default(0),
  campaignCount: smallint("campaign_count").notNull().default(0),
  topActions: jsonb("top_actions").notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("audit_snapshots_account_idx").on(table.accountId, table.createdAt),
]);

// ─── Chat Messages ──────────────────────────────────────────────────

export const chatMessages = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  role: text("role").notNull(),
  parts: jsonb("parts").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("chat_messages_thread_idx").on(table.threadId, table.createdAt),
]);
