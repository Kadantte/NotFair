/**
 * Streak math for MAINTAIN goals: "held at target for N days" is the
 * right hero stat when holding IS the job. Pure — testable without a DB.
 */

export type CheckSquare = {
  tick_number: number;
  t: number;
  /** held = measured at/inside target; acted = the agent intervened this
   *  check; failed = the check errored or the metric drifted. */
  state: "held" | "acted" | "failed";
};

export type StreakInput = {
  tick_number: number;
  started_at: string;
  metric_value: number | null;
  status: string;
  /** true when a mutation action was logged on this check. */
  acted: boolean;
};

export function heldAtTarget(
  value: number | null,
  target: number | null,
  direction: "increase" | "decrease" | null,
): boolean {
  if (value === null || target === null) return false;
  return direction === "decrease" ? value <= target : value >= target;
}

export function buildCheckSquares(
  checks: StreakInput[],
  target: number | null,
  direction: "increase" | "decrease" | null,
): CheckSquare[] {
  return checks
    .slice()
    .sort((a, b) => a.tick_number - b.tick_number)
    .map((c) => ({
      tick_number: c.tick_number,
      t: Date.parse(c.started_at),
      state:
        c.status === "failed" || !heldAtTarget(c.metric_value, target, direction)
          ? ("failed" as const)
          : c.acted
            ? ("acted" as const)
            : ("held" as const),
    }));
}

export type Streak = { holding: boolean; days: number };

/**
 * The current hold: `holding` is false when the LATEST check drifted or
 * failed; otherwise days counts from the first check of the unbroken run
 * (0 = held since today). Null when there are no finished checks yet.
 */
export function currentStreak(squares: CheckSquare[], now = Date.now()): Streak | null {
  if (squares.length === 0) return null;
  let runStart: number | null = null;
  for (let i = squares.length - 1; i >= 0; i--) {
    const sq = squares[i]!;
    if (sq.state === "failed") break;
    runStart = sq.t;
  }
  if (runStart === null) return { holding: false, days: 0 };
  return { holding: true, days: Math.max(0, Math.floor((now - runStart) / 86_400_000)) };
}
