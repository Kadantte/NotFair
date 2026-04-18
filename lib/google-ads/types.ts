// ─── Types ───────────────────────────────────────────────────────────

export type ConnectedAccount = {
  id: string;
  name: string;
  loginCustomerId?: string;
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

/** Build an AuthContext targeting a specific account (for per-tool targeting). */
export function authForAccount(auth: AuthContext, accountId?: string): AuthContext {
  const targetId = resolveAccountId(auth, accountId);
  return { ...auth, customerId: targetId };
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

export type WriteResult = {
  success: boolean;
  action: string;
  entityId: string;
  beforeValue: string;
  afterValue: string;
  error?: string;
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
  | "TARGET_ROAS";

export interface UpdateCampaignBiddingParams {
  biddingStrategy: BiddingStrategyType;
  targetCpaMicros?: number;  // required for TARGET_CPA, optional for MAXIMIZE_CONVERSIONS
  targetRoas?: number;       // required for TARGET_ROAS; optional cap for MAXIMIZE_CONVERSION_VALUE
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
