/**
 * Shared tool-argument → transcript-label extraction for the harness
 * adapters. The harnesses expose every MCP call's full arguments; the
 * label is the one slot that survives into the transcript, so the goal
 * here is: no MCP call should land with an empty label while its
 * arguments held something a human could scan (the SQL text, the URL,
 * the campaign id…).
 */

/** Argument keys whose string value is the natural one-line label. */
const STRING_KEYS = [
  "file_path",
  "path",
  "filename",
  "url",
  "uri",
  "query",
  "sql",
  "hogql",
  "code",
  "script",
  "command",
  "cmd",
  "message",
  "text",
  "prompt",
  "statement",
  "name",
  "title",
  "description",
] as const;

function firstLine(s: string): string {
  const nl = s.indexOf("\n");
  return nl >= 0 ? s.slice(0, nl) : s;
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Best human-scannable one-liner for a tool's arguments: a well-known
 * string field when present, otherwise a compact `key=value` digest of
 * the primitive arguments. Returns undefined only for empty/absent args.
 */
export function labelFromArgs(
  args: Record<string, unknown> | undefined | null,
): string | undefined {
  if (!args) return undefined;
  for (const k of STRING_KEYS) {
    const v = args[k];
    if (typeof v === "string" && v.trim().length > 0) {
      return clip(firstLine(v.trim()), 160);
    }
  }
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (v == null) continue;
    if (typeof v === "string") {
      if (v.trim().length > 0) parts.push(`${k}=${clip(firstLine(v.trim()), 40)}`);
    } else if (typeof v === "number" || typeof v === "boolean") {
      parts.push(`${k}=${v}`);
    }
    if (parts.length >= 4) break;
  }
  if (parts.length === 0) return undefined;
  return clip(parts.join("  "), 160);
}
