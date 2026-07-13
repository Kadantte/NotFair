/**
 * Per-agent color palette used by the cron calendar (and anywhere else a
 * per-agent swatch helps scanning). Agent = goal: there are no reserved
 * role hues anymore — every agent gets a stable, vivid color by hashing
 * its slug. Deliberately vivid: zinc/neutral would read as "disabled"
 * against the rest of the UI.
 */
export type AgentColor = {
  /** Tailwind classes: chip background + text color. Neutral inset fill —
   *  hue lives in the `dot` / `label` fields only. */
  chip: string;
  /** Solid dot/legend swatch. */
  dot: string;
  /** Label color when only the label is shown. */
  label: string;
};

const CHIP =
  "bg-[hsl(var(--notfair-surface-2))] text-[hsl(var(--notfair-ink-3))] border-transparent";

const PALETTE: AgentColor[] = [
  { chip: CHIP, dot: "bg-blue-500", label: "text-blue-700 dark:text-blue-300" },
  { chip: CHIP, dot: "bg-violet-500", label: "text-violet-700 dark:text-violet-300" },
  { chip: CHIP, dot: "bg-emerald-500", label: "text-emerald-700 dark:text-emerald-300" },
  { chip: CHIP, dot: "bg-amber-500", label: "text-amber-700 dark:text-amber-300" },
  { chip: CHIP, dot: "bg-rose-500", label: "text-rose-700 dark:text-rose-300" },
  { chip: CHIP, dot: "bg-cyan-500", label: "text-cyan-700 dark:text-cyan-300" },
  { chip: CHIP, dot: "bg-fuchsia-500", label: "text-fuchsia-700 dark:text-fuchsia-300" },
  { chip: CHIP, dot: "bg-teal-500", label: "text-teal-700 dark:text-teal-300" },
  { chip: CHIP, dot: "bg-orange-500", label: "text-orange-700 dark:text-orange-300" },
  { chip: CHIP, dot: "bg-indigo-500", label: "text-indigo-700 dark:text-indigo-300" },
  { chip: CHIP, dot: "bg-pink-500", label: "text-pink-700 dark:text-pink-300" },
  { chip: CHIP, dot: "bg-lime-500", label: "text-lime-700 dark:text-lime-300" },
];

/** Fast deterministic hash (djb2) so a slug always maps to the same color. */
function hashSlug(slug: string): number {
  let h = 5381;
  for (let i = 0; i < slug.length; i++) {
    h = ((h << 5) + h + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Stable color for an agent slug (e.g. `goal-alex`). */
export function colorForAgentSlug(slug: string): AgentColor {
  return PALETTE[hashSlug(slug) % PALETTE.length]!;
}
