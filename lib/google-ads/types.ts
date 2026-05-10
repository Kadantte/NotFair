// ─── Types ───────────────────────────────────────────────────────────

export type ConnectedAccount = {
  id: string;
  name: string;
  /**
   * Manager (MCC) account id required to reach this account. Three states:
   *   - string: account is reached via that manager.
   *   - null: explicit direct-access; clears session-level loginCustomerId for this account.
   *   - undefined (key absent): legacy data — fall back to session-level loginCustomerId.
   * Writers of new sessions should always emit string|null, never omit.
   */
  loginCustomerId?: string | null;
};

/** Parse a JSON-encoded customer_ids string into ConnectedAccount[]. */
export function parseCustomerIds(raw: string | null | undefined): ConnectedAccount[] {
  if (!raw || raw === "[]") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: unknown): item is ConnectedAccount =>
        typeof item === "object" && item !== null && "id" in item,
    );
  } catch {
    return [];
  }
}

/** Derive a display name from a JSON-encoded customer_ids string. */
export function deriveCustomerName(raw: string | null | undefined): string {
  const accounts = parseCustomerIds(raw);
  if (accounts.length === 0) return "Google Ads Account";
  return accounts.map((a) => a.name || a.id).join(", ");
}

export type AuthContext = {
  refreshToken: string;
  customerId: string;
  customerIds?: ConnectedAccount[];
  userId?: string | null;
  /** Set when accessing a client account through a manager (MCC) account. */
  loginCustomerId?: string | null;
  /** Set when a dev is impersonating — contains the dev's real email for auth gates. */
  realGoogleEmail?: string | null;
  /** Raw MCP clientInfo.name from the session. Null for chat/agent paths. */
  clientName?: string | null;
  /** Raw MCP clientInfo.version from the session. */
  clientVersion?: string | null;
  /** "oauth" | "direct" | "chat" — how the caller authenticated. */
  authMethod?: string | null;
  /** User-Agent header from the HTTP request. */
  userAgent?: string | null;
  /** mcp_sessions.id for MCP paths. Null for chat/agent paths. */
  sessionId?: number | null;
  /**
   * True when the request is from an integration-test bearer token (Meta:
   * `oat_meta_ads_test_*`). When set, Meta write tools auto-apply Graph API
   * `execution_options=["validate_only"]` so the call goes through the full
   * validation pipeline without persisting state. Prod customer tokens can
   * never set this — production tokens use a hex-only prefix that cannot
   * collide with `_test_`. Set by `handler-factory.resolveAuth`; never set
   * elsewhere.
   */
  testMode?: boolean;
};

/**
 * Resolve the target account ID for a tool call.
 * If accountId is provided and is in the session's connected accounts, use it.
 * Otherwise fall back to the default customerId.
 */
export function resolveAccountId(auth: AuthContext, accountId?: string): string {
  if (!accountId) return auth.customerId;
  if (auth.customerIds?.some((a) => a.id === accountId)) return accountId;
  throw new Error(
    `Account ${accountId} is not connected to this session. ` +
    `Connected accounts: ${(auth.customerIds ?? []).map((a) => a.id).join(", ") || auth.customerId}. ` +
    `Use listConnectedAccounts to see available accounts.`,
  );
}

/**
 * Build an AuthContext targeting a specific account (for per-tool targeting).
 *
 * Resolves `loginCustomerId` per-account from `customerIds` so a session can
 * mix direct-access and manager-routed accounts. Three cases for the target:
 *   - Field present, string: account is reached via that manager — use it.
 *   - Field present, null: explicit direct-access — clear session-level so we
 *     don't accidentally inherit the primary account's manager in a mixed
 *     session.
 *   - Field ABSENT (legacy data): fall back to session-level. Older sessions
 *     wrote customerIds without the field; their session-level loginCustomerId
 *     is the only source of truth, so honoring it keeps those sessions working.
 *
 * The absent-vs-null distinction is what makes new mixed-source sessions safe
 * AND legacy single-account-with-manager sessions keep working.
 */
export function authForAccount(auth: AuthContext, accountId?: string): AuthContext {
  const targetId = resolveAccountId(auth, accountId);
  const target = auth.customerIds?.find((a) => a.id === targetId);
  const hasExplicitLoginCustomerId =
    target !== undefined && "loginCustomerId" in target;
  const loginCustomerId = hasExplicitLoginCustomerId
    ? target!.loginCustomerId ?? null
    : auth.loginCustomerId ?? null;
  return { ...auth, customerId: targetId, loginCustomerId };
}

export type Guardrails = {
  maxBidChangePct: number;      // e.g. 0.25 = 25%
  maxBudgetChangePct: number;   // e.g. 0.50 = 50%
  maxKeywordPausePct: number;   // e.g. 0.30 = 30%
};

export const DEFAULT_GUARDRAILS: Guardrails = {
  maxBidChangePct: 0.25,
  maxBudgetChangePct: 0.50,
  maxKeywordPausePct: 0.30,
};

/**
 * Tools we route agents to from a write rejection. Constrained to known
 * destinations so a typo can't silently misroute. Extend when adding a new
 * rejection-routing case (e.g. a new policy fix).
 */
export type NextToolName =
  | "removeNegativeKeyword"
  | "addNegativeKeyword"
  | "setGuardrails";

/**
 * Structured "what to call instead" hint surfaced when a write rejection has a
 * known better tool. Agents see this in `structuredContent` and should call
 * `nextTool.name` next instead of retrying the original — prose-only "Call X
 * instead" text in `error` is repeatedly ignored in production traces.
 */
export type NextToolHint = {
  /** Exact MCP tool name to call (no prefix). */
  name: NextToolName;
  /** Why this tool, not the one we just tried. */
  reason: string;
  /** Args the agent can pass straight through. Optional. */
  args?: Record<string, unknown>;
};

export type PolicyRequiredAction =
  | "request_exemption"
  | "rewrite_or_request_exception";

export type PolicyTopicDiagnostic = {
  topic: string;
  type?: string;
  evidences: unknown[];
  constraints: unknown[];
  guidance: string[];
};

export type PolicyGoogleErrorDiagnostic = {
  message?: string;
  errorCode?: Record<string, unknown>;
  fieldPath: string[];
  trigger?: unknown;
  policyTopicEntries: PolicyTopicDiagnostic[];
  policyViolationDetails?: unknown;
  raw: unknown;
};

export type PolicyDiagnostics = {
  summary: string;
  severity?: string;
  confidence: "google_reported" | "google_policy_error";
  fieldPaths: string[];
  policyTopics: PolicyTopicDiagnostic[];
  googleErrors: PolicyGoogleErrorDiagnostic[];
  agentGuidance: string[];
};

export type PolicyRejectionDetails = {
  policyTopics: string[];
  violatingTexts: string[];
  retryable: false;
  requiredAction: PolicyRequiredAction;
  message: string;
  diagnostics?: PolicyDiagnostics;
};

export type WriteResult = {
  success: boolean;
  action: string;
  entityId: string;
  beforeValue: string;
  afterValue: string;
  error?: string;
  /** Structured Google Ads policy rejection metadata. Agents should not retry when `retryable` is false. */
  policy?: PolicyRejectionDetails;
  /** Structured next-tool routing for known rejection shapes (negative-pause, guardrail-blocked, etc). */
  nextTool?: NextToolHint;
  /** Human-readable label for the entity (e.g. keyword text). Stored in operations log. */
  label?: string | null;
  /** Owning campaign ID — set by operations that resolve it as a side-effect (e.g. ad_group/ad tracking template updates). */
  campaignId?: string | null;
};

export type BiddingStrategyType =
  | "MAXIMIZE_CONVERSIONS"
  | "MAXIMIZE_CONVERSION_VALUE"
  | "MAXIMIZE_CLICKS"
  | "MANUAL_CPC"
  | "TARGET_CPA"
  | "TARGET_ROAS"
  | "TARGET_IMPRESSION_SHARE";

/** Where on the SERP the Target Impression Share strategy should try to appear. */
export const TARGET_IMPRESSION_SHARE_LOCATIONS = [
  "ANYWHERE_ON_PAGE",
  "TOP_OF_PAGE",
  "ABSOLUTE_TOP_OF_PAGE",
] as const;
export type TargetImpressionShareLocation = (typeof TARGET_IMPRESSION_SHARE_LOCATIONS)[number];

export interface UpdateCampaignBiddingParams {
  biddingStrategy: BiddingStrategyType;
  targetCpaMicros?: number;  // required for TARGET_CPA, optional for MAXIMIZE_CONVERSIONS
  targetRoas?: number;       // required for TARGET_ROAS; optional cap for MAXIMIZE_CONVERSION_VALUE
  /** TARGET_IMPRESSION_SHARE: where on the SERP to target. Required for this strategy. */
  impressionShareLocation?: TargetImpressionShareLocation;
  /** TARGET_IMPRESSION_SHARE: IS target, 1–1_000_000 where 1_000_000 = 100% (e.g. 950_000 = 95%). Required. */
  locationFractionMicros?: number;
  /** TARGET_IMPRESSION_SHARE: max CPC bid ceiling in micros. Required — without a ceiling Google can bid unbounded. */
  cpcBidCeilingMicros?: number;
}

export interface UpdateCampaignSettingsParams {
  networks?: {
    googleSearch?: boolean;
    searchPartners?: boolean;
    displayNetwork?: boolean;
  };
  locationTargeting?: {
    add?: string[];    // geo target constant resource names or IDs
    remove?: string[]; // geo target constant resource names or IDs
  };
  negativeLocationTargeting?: {
    add?: string[];
    remove?: string[];
  };
  adSchedule?: {
    /** Replace the entire ad schedule with these slots. Pass [] to clear (run all hours, all days). */
    set: AdScheduleSlot[];
  };
  positiveGeoTargetType?: "PRESENCE" | "PRESENCE_OR_INTEREST";
  negativeGeoTargetType?: "PRESENCE" | "PRESENCE_OR_INTEREST";
  proximityTargeting?: {
    add?: ProximityTarget[];
    remove?: string[]; // criterion IDs returned by getCampaignSettings or runScript
  };
}

export interface AdScheduleSlot {
  /** Day of week, or "ALL" to expand to all 7 days */
  dayOfWeek: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY" | "ALL";
  /** 0-23 */
  startHour: number;
  /** 1-24 */
  endHour: number;
  /** Defaults to "ZERO" */
  startMinute?: "ZERO" | "FIFTEEN" | "THIRTY" | "FORTY_FIVE";
  /** Defaults to "ZERO" */
  endMinute?: "ZERO" | "FIFTEEN" | "THIRTY" | "FORTY_FIVE";
}

export interface ProximityTarget {
  /** Latitude in micro-degrees. e.g. 47608013 for 47.608013° N (Seattle) */
  latitudeMicroDegrees: number;
  /** Longitude in micro-degrees. e.g. -122335167 for -122.335167° W */
  longitudeMicroDegrees: number;
  /** Radius value, e.g. 5 */
  radius: number;
  radiusUnits: "MILES" | "KILOMETERS";
  /** Optional human-readable label for logging */
  label?: string;
}
