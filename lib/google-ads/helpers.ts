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
