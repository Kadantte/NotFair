import type { AuthContext, NextToolHint, PolicyRejectionDetails } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Extract a meaningful error message from Google Ads API errors.
 * The google-ads-api library throws GoogleAdsFailure objects (not Error instances)
 * with an `errors` array containing detailed failure info.
 */
export function extractErrorMessage(
  error: unknown,
  options: { log?: boolean } = {},
): string {
  if (options.log !== false) {
    console.error("[google-ads] API error:", error);
  }

  // Standard Error
  if (error instanceof Error) return error.message;

  // GoogleAdsFailure — has an `errors` array with `message` and `error_code` fields
  if (error && typeof error === "object" && "errors" in error) {
    const failures = (error as { errors: Array<{ message?: string; error_code?: Record<string, unknown> }> }).errors;
    if (Array.isArray(failures) && failures.length > 0) {
      const messages = failures.map((f) => {
        const code = f.error_code ? Object.entries(f.error_code).map(([k, v]) => `${k}=${v}`).join(", ") : "";
        return f.message ? `${f.message}${code ? ` (${code})` : ""}` : code;
      }).filter(Boolean);
      if (messages.length > 0) return messages.join("; ");
    }
  }

  // Fallback: try to stringify
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return "Unknown error"; }
}

/**
 * Rewrite "Negative ad group criteria are not updateable" errors into an
 * actionable pointer to the correct tool. Google Ads has no pause state for
 * negatives; the equivalent is to remove them.
 */
export function rewriteNegativePauseError(msg: string): string {
  if (isNegativePauseError(msg)) {
    return `${msg} — Negative keywords cannot be paused in Google Ads. Call \`removeNegativeKeyword\` (or \`removeKeywordFromNegativeList\` for shared lists) instead; use \`addNegativeKeyword\` to re-add later.`;
  }
  return msg;
}

/** Detect the "negative criterion can't be paused" error shape. */
export function isNegativePauseError(msg: string): boolean {
  return /negative ad group criteria are not updateable/i.test(msg) ||
    /ad_group_criterion_error=6/i.test(msg);
}

/**
 * Extract PolicyViolationDetails from a GoogleAdsFailure and rewrite it into an
 * actionable message. Google Ads returns one or more errors with
 * `error_code.policy_violation_error === 2` (POLICY_ERROR); each carries
 * `details.policy_violation_details.{external_policy_name, key.{policy_name, violating_text}}`
 * and `trigger.string_value` (the offending text).
 *
 * Returns null if no policy-violation errors are present on the failure.
 */
export function extractPolicyRejection(error: unknown): PolicyRejectionDetails | null {
  if (!error || typeof error !== "object") return null;
  type UnknownRecord = Record<string, unknown>;
  const asRecord = (value: unknown): UnknownRecord =>
    value && typeof value === "object" ? value as UnknownRecord : {};
  const failures = "errors" in error
    ? (error as { errors: UnknownRecord[] }).errors
    : [error as UnknownRecord];
  if (!Array.isArray(failures) || failures.length === 0) return null;

  const parts: string[] = [];
  const seenPolicies = new Set<string>();
  const violatingTexts = new Set<string>();
  for (const f of failures) {
    const code = asRecord(f.error_code);
    const isPolicy =
      code.policy_violation_error === 2 ||
      code.policy_violation_error === "POLICY_ERROR" ||
      code.policy_finding_error != null;
    if (!isPolicy) continue;

    const details = asRecord(f.details);
    const pvd = asRecord(details.policy_violation_details);
    const key = asRecord(pvd.key);
    const trigger = asRecord(f.trigger);
    const policyName: string | undefined =
      typeof key.policy_name === "string"
        ? key.policy_name
        : typeof pvd.external_policy_name === "string"
          ? pvd.external_policy_name
          : undefined;
    const violatingText: string | undefined =
      typeof key.violating_text === "string"
        ? key.violating_text
        : typeof trigger.string_value === "string"
          ? trigger.string_value
          : undefined;
    const description: string | undefined =
      typeof pvd.external_policy_description === "string" ? pvd.external_policy_description : undefined;

    const label = policyName ?? "POLICY";
    seenPolicies.add(label.toUpperCase());
    if (violatingText) {
      violatingTexts.add(violatingText);
      parts.push(`${label} on text "${violatingText}"`);
    } else if (description) {
      parts.push(`${label}: ${description}`);
    } else {
      parts.push(label);
    }
  }

  if (parts.length === 0) return null;

  const isHealthPolicy = seenPolicies.has("HEALTH_IN_PERSONALIZED_ADS");
  const requiredAction = isHealthPolicy ? "request_exemption" : "rewrite_or_request_exception";

  const guidance = isHealthPolicy
    ? "Health and medical content is blocked from personalized ads targeting. Do NOT retry this specific content — healthcare topics require an advertiser exemption before they can run. To apply: Google Ads → Tools → Policy Manager → Request Exemption. Rewording health/medical phrases will NOT bypass this policy; the exemption is required."
    : "Google Ads rejected this content. Rewrite without the restricted phrase, or request a policy exception in the Google Ads UI (Tools → Policy Manager).";

  const message = `Policy violation: ${parts.join("; ")}. ${guidance}`;
  return {
    policyTopics: [...seenPolicies],
    violatingTexts: [...violatingTexts],
    retryable: false,
    requiredAction,
    message,
  };
}

export function extractPolicyDetails(error: unknown): string | null {
  return extractPolicyRejection(error)?.message ?? null;
}

const POLICY_RETRY_TTL_MS = 6 * 60 * 60 * 1000;
const policyRetryCache = new Map<string, { expiresAt: number; policy: PolicyRejectionDetails; error: string }>();

function normalizePolicyText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function policyRetryScope(auth: Pick<AuthContext, "sessionId">): string | null {
  return auth.sessionId ? `session:${auth.sessionId}` : null;
}

function policyRetryKey(
  auth: Pick<AuthContext, "sessionId" | "customerId">,
  toolName: string,
  texts: string[],
): string | null {
  const scope = policyRetryScope(auth);
  const normalized = texts.map(normalizePolicyText).filter(Boolean).join("\u001f");
  if (!scope || !normalized) return null;
  return `${scope}|${auth.customerId}|${toolName}|${normalized}`;
}

export function recordPolicyFailure(
  auth: Pick<AuthContext, "sessionId" | "customerId">,
  toolName: string,
  texts: string[],
  policy: PolicyRejectionDetails,
  error = policy.message,
) {
  const key = policyRetryKey(auth, toolName, texts);
  if (!key) return;
  policyRetryCache.set(key, { expiresAt: Date.now() + POLICY_RETRY_TTL_MS, policy, error });
}

export function getPolicyRetryBlock(
  auth: Pick<AuthContext, "sessionId" | "customerId">,
  toolName: string,
  texts: string[],
): { policy: PolicyRejectionDetails; error: string } | null {
  const key = policyRetryKey(auth, toolName, texts);
  if (!key) return null;
  const cached = policyRetryCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    policyRetryCache.delete(key);
    return null;
  }
  return {
    policy: cached.policy,
    error: `Skipped retry: this exact ${toolName} content already hit a non-retryable Google Ads policy rejection in this session. ${cached.error}`,
  };
}

/**
 * Rewrite a `mutate_error=9` (MUTATES_NOT_ALLOWED) failure on a ConversionAction
 * into a friendly, actionable message that covers the cases the type-based
 * preflight in `updateConversionAction` misses — auto-generated lead-form
 * conversions, future read-only types Google adds, etc. The original error
 * string (with code) is preserved so callers can still grep by error code.
 */
export function rewriteConversionActionMutateError(msg: string, conversionActionId?: string): string {
  if (!isConversionActionReadOnlyError(msg)) return msg;
  const id = conversionActionId ? ` ${conversionActionId}` : "";
  return `Conversion action${id} is read-only via the Google Ads API. ` +
    `This typically means it was auto-generated by a Google Ads UI flow ` +
    `(e.g. Lead Form extensions), imported from an external source ` +
    `(GA4, Universal Analytics, Floodlight, Firebase, Salesforce, Search Ads 360), ` +
    `inherited from a manager account, or is a Smart Campaign / Store Visits / ` +
    `app-store auto-action. Modify it in the Google Ads UI or its source system. ` +
    `Underlying error: ${msg}`;
}

/** Detect "Mutates are not allowed for the requested resource" / mutate_error=9. */
export function isConversionActionReadOnlyError(msg: string): boolean {
  return /mutate_error=9/i.test(msg) ||
    /MUTATES_NOT_ALLOWED/i.test(msg) ||
    /mutates are not allowed for the requested resource/i.test(msg);
}

/**
 * Rewrite "operation is not allowed for removed resources" errors
 * (context_error=3 / OPERATION_NOT_PERMITTED_FOR_REMOVED_RESOURCE) into an
 * actionable message. Avoids expensive pre-query checks — callers pass an
 * optional entity hint (e.g. "Campaign 12345").
 */
export function rewriteRemovedResourceError(msg: string, entityHint?: string): string {
  if (
    /context_error=3/i.test(msg) ||
    /operation is not allowed for removed resources/i.test(msg) ||
    /OPERATION_NOT_PERMITTED_FOR_REMOVED_RESOURCE/i.test(msg)
  ) {
    return `${entityHint ?? "Entity"} has already been removed and cannot be modified. If you intended to operate on a different entity, list current entities first (e.g. listCampaigns / listAdGroups / listAds).`;
  }
  return msg;
}

/**
 * Build a `removeNegativeKeyword` next-tool hint. Five call sites (single
 * pauseKeyword precheck, pauseKeyword catch fallback, three bulk validators)
 * used to inline this object — one typo in `campaignId` and the agent
 * silently misroutes. Single source of truth for the args spelling.
 */
export function removeNegativeKeywordHint(
  campaignId: string,
  keyword: string | null | undefined,
  reason: string,
  matchType?: "BROAD" | "PHRASE" | "EXACT",
): NextToolHint {
  const args: Record<string, unknown> = { campaignId };
  if (keyword) args.keyword = keyword;
  if (matchType) args.matchType = matchType;
  return { name: "removeNegativeKeyword", reason, args };
}

/**
 * Structured guardrail rejection — both the prose error AND a `nextTool` hint
 * the agent can act on without parsing free text. Production traces showed
 * agents retrying the original mutation 5+ times despite a clear "call
 * setGuardrails with X" message, so we surface it as a typed field too.
 */
export function guardrailRejection(
  kind: "budget" | "bid",
  requestedChangePct: number,
  currentMaxPct: number,
): { error: string; nextTool: { name: "setGuardrails"; reason: string; args: Record<string, unknown> } } {
  const requested = Math.ceil(requestedChangePct * 100);
  const current = Math.round(currentMaxPct * 100);
  // Suggest rounding up to the next 10% above requested, at least +5 over current.
  const suggested = Math.max(Math.ceil((requested + 5) / 10) * 10, current + 10);
  const argName = kind === "budget" ? "maxBudgetChangePct" : "maxBidChangePct";
  const kindLabel = kind === "budget" ? "Budget" : "Bid";
  const error = `${kindLabel} change of ${requested}% exceeds maximum allowed ${current}%. To allow larger changes, call setGuardrails with { ${argName}: ${suggested / 100} } (or higher). Use this only if you've confirmed with the user.`;
  return {
    error,
    nextTool: {
      name: "setGuardrails",
      reason: `${kindLabel} change of ${requested}% exceeds the current ${current}% guardrail. Confirm with the user before raising it.`,
      args: { [argName]: suggested / 100 },
    },
  };
}

export function normalizeCustomerId(customerId: string): string {
  return customerId.replace(/-/g, "").trim();
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function getDateRange(days: number): { start: string; end: string } {
  const parsed = Math.floor(Number(days));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `ads.helpers.getDateRange(days): \`days\` must be a positive integer (received ${JSON.stringify(days)}). ` +
      `Example: ads.helpers.getDateRange(7) returns { start, end } for the last 7 days.`,
    );
  }
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (parsed - 1));
  return { start: formatDate(start), end: formatDate(end) };
}

/** Convert micros (Google Ads) to dollars */
export function micros(v: number | undefined): number {
  return v ? v / 1_000_000 : 0;
}

/** Convert dollars to micros (Google Ads) */
export function toMicros(dollars: number): number {
  return Math.round(dollars * 1_000_000);
}

export function safeEntityId(value: string, label = "campaign"): number {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`Invalid ${label} ID: ${value}`);
  }
  return id;
}

export function isValidFinalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Returns null if valid, or an error message string. */
export function validateRsaAssets(headlines: string[], descriptions: string[]): string | null {
  if (headlines.length < 3 || headlines.length > 15) return "RSA requires 3-15 headlines";
  if (descriptions.length < 2 || descriptions.length > 4) return "RSA requires 2-4 descriptions";
  const longHeadline = headlines.find((h) => h.length > 30);
  if (longHeadline) return `Headline exceeds 30 chars: "${longHeadline}"`;
  const longDesc = descriptions.find((d) => d.length > 90);
  if (longDesc) return `Description exceeds 90 chars: "${longDesc}"`;
  return null;
}
