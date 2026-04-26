import type { NextToolHint } from "./types";

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
export function extractPolicyDetails(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("errors" in error)) return null;
  const failures = (error as { errors: Array<Record<string, any>> }).errors;
  if (!Array.isArray(failures) || failures.length === 0) return null;

  const parts: string[] = [];
  for (const f of failures) {
    const code = f?.error_code ?? {};
    const isPolicy =
      code.policy_violation_error === 2 ||
      code.policy_violation_error === "POLICY_ERROR" ||
      code.policy_finding_error != null;
    if (!isPolicy) continue;

    const pvd = f?.details?.policy_violation_details;
    const policyName: string | undefined =
      pvd?.key?.policy_name ?? pvd?.external_policy_name;
    const violatingText: string | undefined =
      pvd?.key?.violating_text ?? f?.trigger?.string_value;
    const description: string | undefined = pvd?.external_policy_description;

    const label = policyName ?? "POLICY";
    if (violatingText) {
      parts.push(`${label} on text "${violatingText}"`);
    } else if (description) {
      parts.push(`${label}: ${description}`);
    } else {
      parts.push(label);
    }
  }

  if (parts.length === 0) return null;
  return `Policy violation: ${parts.join("; ")}. Google Ads rejected this ad copy/keyword. Rewrite without the restricted phrase, or request a trademark/policy exception in the Google Ads UI.`;
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
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - Math.max(days - 1, 0));
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
