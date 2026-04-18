import { createHash } from "node:crypto";

const SENSITIVE_KEY_PATTERN = /refresh|access_token|password|secret|authorization|cookie|api[_-]?key/i;
const MAX_STRING_LENGTH = 1024;
const MAX_ARRAY_ITEMS = 50;
const MAX_DEPTH = 6;
const MAX_TOTAL_BYTES = 2048;

/**
 * Redact sensitive-looking keys, truncate long strings, cap array length,
 * and keep total JSON under MAX_TOTAL_BYTES. Never throws — returns null on
 * unserializable input so logging code paths stay non-blocking.
 */
export function redactAndTruncate(args: unknown): unknown {
  if (args == null) return args;
  try {
    const redacted = redact(args, 0);
    const json = JSON.stringify(redacted);
    if (Buffer.byteLength(json, "utf8") <= MAX_TOTAL_BYTES) return redacted;
    // Preserve a prefix for readability; don't try to re-parse (truncated JSON is invalid).
    return { __truncated: true, preview: json.slice(0, MAX_TOTAL_BYTES - 40) };
  } catch {
    return null;
  }
}

function redact(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[deep]";
  if (value == null) return value;
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? value.slice(0, MAX_STRING_LENGTH) + "…"
      : value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const slice = value.slice(0, MAX_ARRAY_ITEMS).map((v) => redact(v, depth + 1));
    return value.length > MAX_ARRAY_ITEMS
      ? [...slice, `[+${value.length - MAX_ARRAY_ITEMS} more]`]
      : slice;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY_PATTERN.test(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

/**
 * Stable hex digest of `value` regardless of object key order. Two calls with
 * the same logical payload produce the same hash → groups identical call
 * shapes in the telemetry table. Applied to the *redacted* value so sensitive
 * data is never hashed either.
 */
export function sha256Hex(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function canonicalize(value: unknown): string {
  if (value == null) return JSON.stringify(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const keys = Object.keys(value as object).sort();
  const parts = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`,
  );
  return `{${parts.join(",")}}`;
}

/** UTF-8 byte length of a JSON-serialized value; 0 for unserializable. */
export function byteLengthOf(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
  } catch {
    return 0;
  }
}
