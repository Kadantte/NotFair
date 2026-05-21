import type {
  AuthContext,
  NextToolHint,
  PolicyDiagnostics,
  PolicyGoogleErrorDiagnostic,
  PolicyRejectionDetails,
  PolicyTopicDiagnostic,
} from "./types";

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

function guidanceForPolicyTopic(topic: string): string[] {
  const key = topic.toUpperCase();
  const map: Record<string, string[]> = {
    HEALTH_IN_PERSONALIZED_ADS: [
      "Health and medical content is blocked from personalized ads targeting. Do not retry this content unchanged; request the appropriate Google Ads exemption before it can run.",
    ],
    CONSUMER_FINANCE: [
      "Check ad copy and destination for financing, loan, payment plan, APR, credit, or lender language. Remove the financial claim or make sure the advertiser has the required disclosures/certification path.",
    ],
    FINANCIAL_PRODUCTS_AND_SERVICES: [
      "Check for financial product/service claims and required disclosures. Remove finance-related language if the advertiser is not intentionally promoting financial services.",
    ],
    PERSONAL_LOANS: [
      "Check for personal-loan language, lead generation, APR, repayment terms, and lender claims. Either remove the loan framing or provide the required disclosures.",
    ],
    HIGH_APR_PERSONAL_LOANS: [
      "Check APR and loan-term claims. Google prohibits high-APR personal-loan ads in the US.",
    ],
    MISREPRESENTATION: [
      "Check for unsupported or misleading claims, missing business identity, offer mismatch, pricing mismatch, guarantees, ratings, and claims not substantiated on the landing page.",
    ],
    UNAVAILABLE_PROMOTIONS: [
      "Check whether discounts, free estimates, same-day service, guarantees, or special offers are real, current, and clearly available on the landing page.",
    ],
    DESTINATION_NOT_WORKING: [
      "Check final URL accessibility, redirects, robots/noindex blocks, SSL, mobile rendering, geo/IP blocking, and whether Googlebot can reach the page.",
    ],
    DESTINATION_NOT_ACCESSIBLE: [
      "Check final URL accessibility, redirects, robots/noindex blocks, SSL, mobile rendering, geo/IP blocking, and whether Googlebot can reach the page.",
    ],
    DESTINATION_REQUIREMENTS: [
      "Check that the landing page loads reliably, clearly identifies the business, matches the ad offer, and is not blocking review crawlers.",
    ],
    TRADEMARKS_IN_AD_TEXT: [
      "Check headlines and descriptions for protected brand names. Remove trademarked terms or request authorization/exception where appropriate.",
    ],
    TRADEMARKS: [
      "Check ad assets and destination for protected brand names. Remove trademarked terms or request authorization/exception where appropriate.",
    ],
  };
  return map[key] ?? [
    "Google Ads rejected this content. Use the Google-reported policy topic and evidence to change the specific ad asset or destination field, then retry with revised content or request a policy exception in Google Ads Policy Manager.",
  ];
}

function extractEvidenceTexts(evidences: unknown[]): string[] {
  const texts = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      if (value.trim()) texts.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) visit(nested);
    }
  };
  evidences.forEach(visit);
  return [...texts];
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
  const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
  const firstString = (...values: unknown[]): string | undefined =>
    values.find((value): value is string => typeof value === "string" && value.length > 0);
  const fieldPath = (f: UnknownRecord): string[] => {
    const location = asRecord(f.location);
    return asArray(location.field_path_elements ?? location.fieldPathElements)
      .map((element) => {
        const e = asRecord(element);
        const field = firstString(e.field_name, e.fieldName);
        const index = typeof e.index === "number" ? `[${e.index}]` : "";
        return field ? `${field}${index}` : index;
      })
      .filter(Boolean);
  };
  const readPolicyTopicEntries = (f: UnknownRecord): PolicyTopicDiagnostic[] => {
    const details = asRecord(f.details);
    const policyFindingDetails = asRecord(details.policy_finding_details ?? details.policyFindingDetails);
    return asArray(policyFindingDetails.policy_topic_entries ?? policyFindingDetails.policyTopicEntries)
      .map((entry) => {
        const e = asRecord(entry);
        const topic = firstString(e.topic) ?? "POLICY";
        const type = firstString(e.type) ?? (typeof e.type === "number" ? String(e.type) : undefined);
        return {
          topic,
          ...(type ? { type } : {}),
          evidences: asArray(e.evidences),
          constraints: asArray(e.constraints),
          guidance: guidanceForPolicyTopic(topic),
        };
      });
  };
  const triggerValue = (f: UnknownRecord): unknown => {
    const trigger = asRecord(f.trigger);
    return trigger.string_value ?? trigger.stringValue ?? trigger.int64_value ?? trigger.int64Value ?? undefined;
  };
  const failures = "errors" in error
    ? (error as { errors: UnknownRecord[] }).errors
    : [error as UnknownRecord];
  if (!Array.isArray(failures) || failures.length === 0) return null;

  const parts: string[] = [];
  const seenPolicies = new Set<string>();
  const violatingTexts = new Set<string>();
  const topicDiagnostics: PolicyTopicDiagnostic[] = [];
  const googleErrors: PolicyGoogleErrorDiagnostic[] = [];
  const fieldPaths = new Set<string>();
  for (const f of failures) {
    const code = asRecord(f.error_code ?? f.errorCode);
    const isPolicy =
      code.policy_violation_error === 2 ||
      code.policy_violation_error === "POLICY_ERROR" ||
      code.policy_finding_error != null;
    if (!isPolicy) continue;

    const details = asRecord(f.details);
    const pvd = asRecord(details.policy_violation_details ?? details.policyViolationDetails);
    const key = asRecord(pvd.key);
    const trigger = asRecord(f.trigger);
    const policyTopicEntries = readPolicyTopicEntries(f);
    const path = fieldPath(f);
    for (const pathElement of path) fieldPaths.add(pathElement);
    topicDiagnostics.push(...policyTopicEntries);
    googleErrors.push({
      ...(typeof f.message === "string" ? { message: f.message } : {}),
      ...(Object.keys(code).length > 0 ? { errorCode: code } : {}),
      fieldPath: path,
      ...(triggerValue(f) !== undefined ? { trigger: triggerValue(f) } : {}),
      policyTopicEntries,
      ...(Object.keys(pvd).length > 0 ? { policyViolationDetails: pvd } : {}),
      raw: f,
    });
    for (const entry of policyTopicEntries) {
      seenPolicies.add(entry.topic.toUpperCase());
      parts.push(`${entry.topic}${entry.type ? ` (${entry.type})` : ""}`);
      for (const evidenceText of extractEvidenceTexts(entry.evidences)) violatingTexts.add(evidenceText);
    }
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
    if (policyTopicEntries.length === 0) seenPolicies.add(label.toUpperCase());
    if (violatingText) {
      violatingTexts.add(violatingText);
      parts.push(`${label} on text "${violatingText}"`);
    } else if (description && policyTopicEntries.length === 0) {
      parts.push(`${label}: ${description}`);
    } else if (policyTopicEntries.length === 0) {
      parts.push(label);
    }
  }

  if (parts.length === 0) return null;

  const isHealthPolicy = seenPolicies.has("HEALTH_IN_PERSONALIZED_ADS");
  const requiredAction = isHealthPolicy ? "request_exemption" : "rewrite_or_request_exception";

  const agentGuidance = [...new Set(
    [...seenPolicies].flatMap((topic) => guidanceForPolicyTopic(topic)),
  )];
  const guidance = agentGuidance.length > 0
    ? agentGuidance.join(" ")
    : "Google Ads rejected this content. Rewrite without the restricted phrase, or request a policy exception in the Google Ads UI (Tools → Policy Manager).";

  const policyTopicLabels = [...seenPolicies];
  const severity = topicDiagnostics.find((entry) => entry.type)?.type;
  const diagnostics: PolicyDiagnostics = {
    summary: `Rejected for ${severity ? `${severity} ` : ""}Google Ads policy topic${policyTopicLabels.length === 1 ? "" : "s"}: ${policyTopicLabels.join(", ") || "POLICY"}.`,
    ...(severity ? { severity } : {}),
    confidence: topicDiagnostics.length > 0 ? "google_reported" : "google_policy_error",
    fieldPaths: [...fieldPaths],
    policyTopics: topicDiagnostics,
    googleErrors,
    agentGuidance,
  };

  const message = `Policy violation: ${[...new Set(parts)].join("; ")}. ${guidance}`;
  return {
    policyTopics: policyTopicLabels,
    violatingTexts: [...violatingTexts],
    retryable: false,
    requiredAction,
    message,
    diagnostics,
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
 * Google Ads resource_count_limit_exceeded_error=10 is deterministic, not
 * transient. For asset creation this almost always means the account/campaign
 * has hit the allowed count for that asset family; tell agents to reuse/link
 * existing assets instead of retrying create*Asset in a loop.
 */
export function rewriteAssetResourceLimitError(msg: string, fieldType?: string): string {
  if (
    /resource_count_limit_exceeded_error=10/i.test(msg) ||
    /limit on the number of allowed resources of this type to be exceeded/i.test(msg)
  ) {
    const family = fieldType ? `${fieldType} ` : "";
    return `${msg} — ${family}asset/resource limit reached. Do not retry create unchanged. List existing assets first (listCalloutAssets/listSitelinkAssets/listStructuredSnippetAssets/getAssetLinks), reuse an existing suitable asset with linkAsset, or unlink/remove obsolete links before creating more.`;
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
 * The `setGuardrails` MCP tool's Zod schema caps `maxBidChangePct` and
 * `maxBudgetChangePct` at 1.0 (100%) per call — see
 * lib/mcp/write-tools/guardrails.ts:20. The rejection hint MUST NOT
 * suggest a value above this cap, otherwise the agent calls
 * `setGuardrails`, gets a Zod rejection, and burns retries against a
 * suggestion the system itself refuses. Past production traces show this
 * exact loop (user feedback 2026-05).
 */
const GUARDRAIL_PCT_MAX = 1.0;

/**
 * Structured guardrail rejection — both the prose error AND a `nextTool` hint
 * the agent can act on without parsing free text. Production traces showed
 * agents retrying the original mutation 5+ times despite a clear "call
 * setGuardrails with X" message, so we surface it as a typed field too.
 *
 * Two cases:
 *  - Requested change ≤ 100% → suggest a one-shot guardrail bump (clipped
 *    to the schema's 1.0 max).
 *  - Requested change > 100% → no single call can land it; tell the agent
 *    to iterate (e.g. 100% + 100% = 4× in two steps) rather than offering
 *    a suggestion `setGuardrails` will reject.
 */
export function guardrailRejection(
  kind: "budget" | "bid",
  requestedChangePct: number,
  currentMaxPct: number,
): { error: string; nextTool: { name: "setGuardrails"; reason: string; args: Record<string, unknown> } } {
  const requested = Math.ceil(requestedChangePct * 100);
  const current = Math.round(currentMaxPct * 100);
  const argName = kind === "budget" ? "maxBudgetChangePct" : "maxBidChangePct";
  const kindLabel = kind === "budget" ? "Budget" : "Bid";
  const maxPct = Math.round(GUARDRAIL_PCT_MAX * 100);

  if (requested > maxPct) {
    // One-shot impossible — even at the schema max the change exceeds the cap.
    // Suggest iterating in maxPct chunks rather than a setGuardrails call that
    // would itself be rejected by the schema.
    const error =
      `${kindLabel} change of ${requested}% exceeds the per-call maximum guardrail of ${maxPct}% ` +
      `(schema cap on setGuardrails). One-shot changes >${maxPct}% aren't supported — ` +
      `iterate in ${maxPct}% steps (e.g. ${maxPct}% × 2 ≈ ${(1 + GUARDRAIL_PCT_MAX) ** 2 | 0}× over two calls). ` +
      `Raise to ${maxPct}% first with setGuardrails, then call this tool repeatedly.`;
    return {
      error,
      nextTool: {
        name: "setGuardrails",
        reason: `${kindLabel} change of ${requested}% can't land in one call (schema cap ${maxPct}%). Raise guardrail to ${maxPct}% and iterate.`,
        args: { [argName]: GUARDRAIL_PCT_MAX },
      },
    };
  }

  // Suggest rounding up to the next 10% above requested, at least +5 over current,
  // and clipped to the schema cap so the agent doesn't get bounced.
  const rawSuggested = Math.max(Math.ceil((requested + 5) / 10) * 10, current + 10);
  const suggested = Math.min(rawSuggested, maxPct);
  const error = `${kindLabel} change of ${requested}% exceeds maximum allowed ${current}%. To allow larger changes, call setGuardrails with { ${argName}: ${suggested / 100} } (or higher, up to ${GUARDRAIL_PCT_MAX}). Use this only if you've confirmed with the user.`;
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

const PHONE_LIKE_TEXT_RE = /(?:\+?1[\s.-]*)?(?:\([2-9]\d{2}\)|[2-9]\d{2})[\s.-]*\d{3}[\s.-]*\d{4}\b/;

/**
 * Google Ads rejects phone numbers embedded in ad/asset text with
 * PHONE_NUMBER_IN_AD_TEXT. Keep this intentionally conservative: match clear
 * North American phone formats, but do not block license numbers like
 * "CSLB #1105249".
 */
export function validateNoPhoneNumberInAdText(texts: string[]): string | null {
  const offending = texts.find((text) => PHONE_LIKE_TEXT_RE.test(text));
  if (!offending) return null;
  return `Google Ads policy preflight: phone numbers are not allowed in ad text/assets (PHONE_NUMBER_IN_AD_TEXT). Remove "${offending}" from headlines, descriptions, paths, callouts, sitelinks, or structured snippets; use a call asset/extension for phone numbers instead.`;
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
