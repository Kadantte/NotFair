import {
  pgTable,
  text,
  smallint,
  integer,
  bigint,
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
  /** Compact tool code — see TOOL_CODE in tracking.ts. Nullable for tools
   * not yet mapped — we still record tool_name so analytics don't lose rows. */
  toolCode: smallint("tool_code"),
  /** Compact entity type — see ENTITY_CODE in tracking.ts */
  entityCode: smallint("entity_code"),
  entityId: text("entity_id"),
  /** Human-readable label for the entity (e.g. keyword text) */
  label: text("label"),
  beforeValue: text("before_value"),
  afterValue: text("after_value"),
  reasoning: text("reasoning"),
  rolledBack: smallint("rolled_back").default(0),
  /**
   * 1 = successful change OR read. 0 = write attempt that reached Google's API and returned an error
   * (still counted against the user's monthly limit so our op count matches Google's mutate quota).
   * Change history / undo / impact queries filter success=1. Pre-validation rejections are never
   * logged, so every row is either a true change or a billable-by-Google attempt.
   */
  success: smallint("success").notNull().default(1),
  /** Error message for reached-but-failed writes (success=0). Null for successful rows. */
  errorMessage: text("error_message"),
  /** Raw MCP clientInfo.name — e.g. "claude-code", "claude-desktop". Null for chat/agent. */
  clientSource: text("client_source"),
  /** FK-ish to mcp_sessions.id. Null for chat/agent paths. */
  sessionId: integer("session_id"),
  /** UUID shared by a tool call and any sub-calls it fans out (e.g. audit). */
  requestId: text("request_id"),
  /** Raw camelCase MCP tool name. Works for tools not in TOOL_CODE. */
  toolName: text("tool_name"),
  /** Redacted + truncated args (jsonb). Null if not captured. */
  args: jsonb("args"),
  /** SHA-256 hex of canonicalized args — groups identical call shapes. */
  argsSha256: text("args_sha256"),
  /** Wall-clock duration of the underlying fn() call in ms. */
  latencyMs: integer("latency_ms"),
  /** UTF-8 byte length of the JSON-serialized result. */
  bytesOut: integer("bytes_out"),
  /** Coarse failure bucket — RATE_LIMIT, THROWN, WRITE_REJECTED, etc. */
  errorClass: text("error_class"),
  /** Set when this write was triggered by an audit Apply — links back to
   * audit_snapshots.id so we can show "from audit Y" attribution and aggregate
   * apply impact in the digest. Null for MCP / chat / cron writes. */
  auditSnapshotId: integer("audit_snapshot_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("ops_account_created_idx").on(table.accountId, table.createdAt),
  index("ops_account_type_idx").on(table.accountId, table.opType, table.createdAt),
  index("ops_user_created_idx").on(table.userId, table.createdAt),
  index("ops_session_created_idx").on(table.sessionId, table.createdAt),
  index("ops_tool_name_created_idx").on(table.toolName, table.createdAt),
  index("ops_args_sha_idx").on(table.argsSha256),
  index("ops_audit_snapshot_idx").on(table.auditSnapshotId),
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
    // bigint (signed 64-bit): int caps at ~$2,147/day/campaign in micros
    // and silently drops snapshots for high-spend campaigns when the cron
    // insert throws. mode: "number" keeps the JS type as `number`, which
    // is safe up to ~$9B/day in micros (2^53 safe-integer bound).
    costMicros: bigint("cost_micros", { mode: "number" }).default(0),
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

// ─── Impact Monitor ───────────────────────────────────────────────

export const changeInterventions = pgTable("change_interventions", {
  id: serial("id").primaryKey(),
  accountId: text("account_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  /** UTC day bucket for auto-merging same-campaign same-day write bursts. */
  interventionDate: text("intervention_date").notNull(),
  name: text("name").notNull(),
  changeSummary: text("change_summary").notNull().default(""),
  hypothesis: text("hypothesis"),
  primaryMetric: text("primary_metric"),
  goalDirection: text("goal_direction"),
  triggerSource: text("trigger_source").notNull().default("write_flow_auto"),
  status: text("status").notNull().default("watching"),
  /** Distinct request IDs (approval/write batches) merged into this episode. */
  requestIds: jsonb("request_ids").$type<string[]>().notNull().default([]),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("change_interventions_account_started_idx").on(table.accountId, table.startedAt),
  index("change_interventions_account_status_started_idx").on(table.accountId, table.status, table.startedAt),
  index("change_interventions_campaign_date_idx").on(table.accountId, table.campaignId, table.interventionDate),
]);

export const changeInterventionOperations = pgTable("change_intervention_operations", {
  id: serial("id").primaryKey(),
  changeInterventionId: integer("change_intervention_id").notNull(),
  operationId: integer("operation_id").notNull(),
  operationOrder: integer("operation_order").notNull().default(0),
  requestId: text("request_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityRef: text("entity_ref"),
  label: text("label"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("change_intervention_operations_operation_idx").on(table.operationId),
  index("change_intervention_operations_intervention_idx").on(table.changeInterventionId, table.operationOrder),
]);

export const changeInterventionEvaluations = pgTable("change_intervention_evaluations", {
  id: serial("id").primaryKey(),
  changeInterventionId: integer("change_intervention_id").notNull(),
  evaluationVersion: integer("evaluation_version").notNull().default(1),
  baselineWindowDays: integer("baseline_window_days").notNull().default(7),
  afterWindowDays: integer("after_window_days").notNull().default(7),
  daysSinceStart: integer("days_since_start").notNull().default(0),
  confounderCountInternal: integer("confounder_count_internal").notNull().default(0),
  confidence: text("confidence").notNull(),
  resultLabel: text("result_label").notNull(),
  primaryMetricName: text("primary_metric_name").notNull(),
  primaryMetricBefore: doublePrecision("primary_metric_before"),
  primaryMetricAfter: doublePrecision("primary_metric_after"),
  primaryMetricDeltaPct: doublePrecision("primary_metric_delta_pct"),
  supportingMetrics: jsonb("supporting_metrics").$type<Record<string, unknown>>().notNull().default({}),
  reasonSummary: text("reason_summary").notNull(),
  reasonCodes: jsonb("reason_codes").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("change_intervention_evaluations_intervention_created_idx").on(table.changeInterventionId, table.createdAt),
]);

// ─── OAuth Clients (per-user credentials for Claude Connector) ──────

export const oauthClients = pgTable("oauth_clients", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret").notNull(),
  clientSecretHash: text("client_secret_hash").notNull(),
  /**
   * @deprecated DO NOT READ OR WRITE THIS COLUMN.
   *
   * Tokens live in `oauth_access_tokens`. This column was a single-row
   * UPDATE-rotated slot, which silently invalidated whichever token was
   * issued first when two code exchanges for the same client_id ran
   * concurrently (Claude Desktop reconnect, shared pre-bound creds, etc.).
   * The result was a tight 401 → re-authorize retry loop on the affected
   * client.
   *
   * Retained one release for rollback safety only. A future migration
   * drops it. If you find yourself wanting to UPDATE this column in a
   * new code path, you are reintroducing the bug — write to
   * `oauth_access_tokens` instead.
   */
  oauthAccessToken: text("oauth_access_token"),
  // Pre-bound for the legacy in-app Claude Connector flow (the minting route
  // /api/oauth/clients was removed in 2026-04 — DB rows from before that
  // change still authenticate via the pre-bound branch in /api/oauth/authorize).
  // Null for clients minted via RFC 7591 Dynamic Client Registration
  // (`/api/oauth/register`) — those resolve the session from the user's
  // cookie at /authorize time.
  sessionId: integer("session_id"),
  redirectUris: jsonb("redirect_uris").$type<string[]>(),
  clientName: text("client_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── OAuth Access Tokens (per-token storage) ────────────────────────
//
// LOAD-BEARING INVARIANT: one row per issued `oat_…` token, append-only.
// Concurrent code exchanges for the same client_id MUST produce
// independently-valid tokens. The previous design stored a single token
// per client in `oauth_clients.oauth_access_token` and UPDATE-rotated it
// on every exchange — two parallel exchanges silently invalidated each
// other, producing a tight 401 → re-authorize loop on the affected
// client.
//
// Token issuance: INSERT a new row in `app/api/oauth/token/route.ts`.
// Token validation: SELECT joined to mcp_sessions in
// `app/api/[transport]/route.ts`, with `mcp_sessions.expires_at >= now()`
// enforcing validity.
//
// DO NOT add an UPDATE path that mutates `token` in place, and DO NOT
// fold token storage back onto `oauth_clients`. Both reintroduce the
// rotation race.

export const oauthAccessTokens = pgTable("oauth_access_tokens", {
  token: text("token").primaryKey(),
  clientId: text("client_id").notNull(),
  /**
   * Polymorphic connection FK — exactly one of `sessionId` / `connectionId`
   * is non-null, enforced by `oauth_access_tokens_target_xor` CHECK
   * constraint (migration 0032). Google Ads rows set `sessionId`
   * (→ mcp_sessions.id); Meta and future-platform rows set `connectionId`
   * (→ ad_platform_connections.id).
   */
  sessionId: integer("session_id"),
  connectionId: integer("connection_id"),
  /**
   * RFC 8707 audience. Resource URL the token is bound to (e.g. `/api/mcp`,
   * `/api/mcp/google_ads`, `/api/mcp/meta_ads`). NULL is treated as the
   * legacy `/api/mcp` value so pre-multi-platform tokens keep authenticating
   * against the Google MCP.
   */
  resourceUrl: text("resource_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── OAuth Authorization Codes (for Claude Connector flow) ──────────

export const authorizationCodes = pgTable("authorization_codes", {
  code: text("code").primaryKey(),
  /**
   * Polymorphic connection FK, mirrors oauth_access_tokens. Exactly one of
   * sessionId / connectionId is non-null per row, enforced by
   * `authorization_codes_target_xor` CHECK (migration 0032).
   */
  sessionId: integer("session_id"),
  connectionId: integer("connection_id"),
  redirectUri: text("redirect_uri").notNull(),
  clientId: text("client_id").notNull(),
  codeChallenge: text("code_challenge"),
  codeChallengeMethod: text("code_challenge_method"),
  /**
   * RFC 8707 resource the code was issued for. Carried through to the
   * token-exchange step so the resulting `oauth_access_tokens` row is
   * audience-stamped and prefix-stamped (oat_google_ads_*, oat_meta_ads_*,
   * or legacy oat_* for /api/mcp). NULL is treated as `/api/mcp`.
   */
  resourceUrl: text("resource_url"),
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

// ─── Multi-Platform Connections (non-Google MCPs) ────────────────────
//
// Houses Meta, TikTok, LinkedIn, etc. connections. Google Ads stays on
// `mcp_sessions` for back-compat. One row per (user_id, platform); the
// `account_ids` JSONB carries the enumerated ad accounts the user can
// target, and `active_account_id` is the sticky-with-override pick used
// by tools that don't take an explicit accountId.
//
// See drizzle/0031_add_ad_platform_connections.sql for the migration.

export const adPlatformConnections = pgTable("ad_platform_connections", {
  id: serial("id").primaryKey(),
  /** NotFair user id (matches mcp_sessions.user_id). */
  userId: text("user_id").notNull(),
  /** Platform identifier — 'meta_ads' for now; 'tiktok_ads' / 'linkedin_ads' future. */
  platform: text("platform").notNull(),
  /** Long-lived refresh-equivalent token from the upstream platform. */
  refreshToken: text("refresh_token").notNull(),
  /** Short-lived access token cached from the most recent refresh. */
  accessToken: text("access_token"),
  /** When `accessToken` expires. NULL when never refreshed. */
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  /** Enumerated ad accounts. Shape: [{id, name, currency, timezone, business_id}, ...] */
  accountIds: jsonb("account_ids").$type<Array<{
    id: string;
    name?: string;
    currency?: string;
    timezone?: string;
    business_id?: string;
  }>>().notNull().default([]),
  /** Currently-selected ad account (sticky-with-override per design doc decision #5). */
  activeAccountId: text("active_account_id"),
  /** Platform-specific extras: Meta business_id, granted scopes, fb_user_id, etc. */
  platformMetadata: jsonb("platform_metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("ad_platform_connections_user_platform_idx").on(table.userId, table.platform),
  index("ad_platform_connections_platform_idx").on(table.platform),
]);

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
  userId: text("user_id").notNull(),
  /** Stripe environment: "test" (dev) or "live" (prod). Scopes every row so
   * the same user can have separate subscription state per env. */
  env: text("env").notNull().default("live"),
  /** Email on file at Stripe — kept flat for support/ops queries. */
  email: text("email"),
  /** Webhook lookup key. */
  stripeCustomerId: text("stripe_customer_id"),
  /** Full Stripe Subscription object, or null if the customer has none. */
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("subscriptions_stripe_customer_idx").on(table.stripeCustomerId),
  uniqueIndex("subscriptions_user_env_uq").on(table.userId, table.env),
  uniqueIndex("subscriptions_customer_env_uq").on(table.stripeCustomerId, table.env),
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
  impressionShareDiagnosis: jsonb("impression_share_diagnosis"),
  /** Updated whenever an Apply lands against this snapshot — used to detect
   * stale-state on the audit page (re-run prompt) and to filter "audits that
   * led to action" in analytics. */
  lastApplyAt: timestamp("last_apply_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("audit_snapshots_account_idx").on(table.accountId, table.createdAt),
]);

// ─── Audit Applies — recommendation→write attribution ────────────────

export const auditApplies = pgTable("audit_applies", {
  id: serial("id").primaryKey(),
  /** FK-ish to audit_snapshots.id. Not enforced (audit_snapshots can be pruned). */
  snapshotId: integer("snapshot_id").notNull(),
  /** Pass bucket key — 'stopWasting' | 'fixingFundamentals' | 'unlockingGrowth'. */
  passKey: text("pass_key").notNull(),
  /** 0-based position of the PassItem inside passes[passKey]. */
  index: integer("index").notNull(),
  /** Denormalized from snapshot for cheap digest queries. */
  userId: text("user_id"),
  accountId: text("account_id").notNull(),
  /** Denormalized actionType — pause_campaign, add_negative, update_budget, etc. */
  actionType: text("action_type").notNull(),
  /** operations.id of the apply write. Null only on transient INSERT-before-write race. */
  changeId: integer("change_id"),
  /** operations.id of the undo write. Null until undone. */
  undoChangeId: integer("undo_change_id"),
  /** Serialized ToolCall to replay if user clicks Undo. Same shape as the
   * MCP write tools accept. Null when the apply itself failed. */
  undoToolCall: jsonb("undo_tool_call"),
  appliedAt: timestamp("applied_at").defaultNow().notNull(),
  undoneAt: timestamp("undone_at"),
}, (table) => [
  uniqueIndex("audit_applies_lookup_idx").on(table.snapshotId, table.passKey, table.index),
  index("audit_applies_user_applied_idx").on(table.userId, table.appliedAt),
]);

// ─── Tool Permissions (per-user MCP tool approval policy) ──────────

export const toolPermissions = pgTable("tool_permissions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  toolName: text("tool_name").notNull(),
  /** 'always_allow' | 'needs_approval' | 'blocked' */
  mode: text("mode").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("tool_permissions_user_tool_idx").on(table.userId, table.toolName),
]);

// ─── Shared Audits (Phase 1: private auto-save of each run) ────────
//
// Every audit a signed-in user runs is auto-saved here so they can browse
// their history. Phase 2 will add public sharing — the columns supporting
// that (visibility, show_* flags, view_count, cta_click_count, takedown_*)
// are added now so the migration is one-shot. Phase 1 writes `visibility=
// 'private'` only; no public reads are allowed.
//
// Payload is the anonymized, render-ready `SharedAuditPayload` shape from
// `lib/audit/anonymize.ts`. We never store raw `AuditInput`; the anonymizer
// runs at save time even for private audits so upgrading one to public
// later is a no-op on the data.

export const sharedAudits = pgTable("shared_audits", {
  id: text("id").primaryKey(), // UUID
  /** 10-char nanoid, URL-safe. Unique across all rows. */
  slug: text("slug").notNull().unique(),
  /** FK to mcp_sessions.user_id. NOT NULL in Phase 1 (no CLI path yet). */
  ownerUserId: text("owner_user_id").notNull(),
  /** 'web' | 'cli' | 'chat' — Phase 1 only writes 'web'. */
  source: text("source").notNull(),
  /** 'private' | 'public' — Phase 1 only writes 'private'. */
  visibility: text("visibility").notNull().default("private"),
  /** sha256(accountId + AUDIT_SHARE_SALT) — for dedup + future collision detection. */
  accountFingerprint: text("account_fingerprint").notNull(),
  /** Anonymized, render-ready `SharedAuditPayload` (see lib/audit/anonymize.ts). */
  payload: jsonb("payload").notNull(),
  showCampaignNames: boolean("show_campaign_names").notNull().default(false),
  showSpend: boolean("show_spend").notNull().default(true),
  showExactSpend: boolean("show_exact_spend").notNull().default(false),
  industry: text("industry"),
  takedownReason: text("takedown_reason"),
  takenDownAt: timestamp("taken_down_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  viewCount: integer("view_count").notNull().default(0),
  ctaClickCount: integer("cta_click_count").notNull().default(0),
}, (table) => [
  // Primary query: list a user's audits newest-first.
  index("shared_audits_owner_created_idx").on(table.ownerUserId, table.createdAt),
  // Phase 2 prep: public-feed query. Partial index defined in the SQL
  // migration (drizzle-orm doesn't yet emit partial indexes cleanly).
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
