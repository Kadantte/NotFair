/**
 * Display identity for a goal. Goals are the only nameable thing in
 * NotFair (agents are plumbing), so every surface labels rows/pages with
 * this: the agent-written short_label when it exists, else a trimmed
 * statement, else a placeholder for goals whose ambition hasn't landed.
 *
 * Client-safe: pure string logic, no server imports.
 */

const MAX_FALLBACK_CHARS = 42;

export function goalLabel(goal: {
  short_label?: string | null;
  statement?: string | null;
}): string {
  const label = goal.short_label?.trim();
  if (label) return label;
  const statement = goal.statement?.trim();
  if (statement) return trimAtWord(statement, MAX_FALLBACK_CHARS);
  return "New goal";
}

function trimAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max / 2 ? lastSpace : max)}…`;
}
