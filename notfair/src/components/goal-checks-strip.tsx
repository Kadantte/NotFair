import { cn } from "@/lib/utils";
import type { CheckSquare, Streak } from "@/lib/goal-streak";

/**
 * Maintain-goal hero: the streak headline plus one square per check —
 * held / intervened / failed. Colors are never alone: each square has a
 * distinct glyph for the non-held states and a native tooltip, and the
 * legend spells the mapping out in text.
 */
export function GoalChecksStrip({
  squares,
  streak,
}: {
  squares: CheckSquare[];
  streak: Streak | null;
}) {
  const recent = squares.slice(-28);
  return (
    <div>
      <p className="m-0 mb-2 text-[13px]">
        {streak === null ? (
          <span className="text-[hsl(var(--notfair-ink-4))]">No checks yet.</span>
        ) : !streak.holding ? (
          <span>
            <b>Attention needed</b> — the last check drifted or failed.
          </span>
        ) : streak.days === 0 ? (
          <span>
            <b>Holding at target</b> — since today&rsquo;s check.
          </span>
        ) : (
          <span>
            Held at target for{" "}
            <b className="tabular-nums">
              {streak.days} day{streak.days === 1 ? "" : "s"}
            </b>
          </span>
        )}
      </p>
      {recent.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1" role="img" aria-label="Check history">
            {recent.map((sq) => (
              <span
                key={sq.tick_number}
                title={`Check ${sq.tick_number} — ${
                  sq.state === "held"
                    ? "held at target"
                    : sq.state === "acted"
                      ? "agent intervened"
                      : "drifted or failed"
                } (${new Date(sq.t).toLocaleDateString()})`}
                className={cn(
                  "flex size-4 items-center justify-center rounded-[3px] text-[9px] font-bold leading-none",
                  sq.state === "held" &&
                    "bg-[hsl(var(--notfair-accent))] text-transparent",
                  sq.state === "acted" &&
                    "bg-[hsl(217_60%_55%)] text-white",
                  sq.state === "failed" && "bg-[hsl(0_72%_51%)] text-white",
                )}
              >
                {sq.state === "acted" ? "▼" : sq.state === "failed" ? "✕" : ""}
              </span>
            ))}
          </div>
          <p className="m-0 mt-1.5 text-[10.5px] text-[hsl(var(--notfair-ink-4))]">
            ■ held · <span className="font-bold">▼</span> intervened ·{" "}
            <span className="font-bold">✕</span> drifted/failed
          </p>
        </>
      )}
    </div>
  );
}
