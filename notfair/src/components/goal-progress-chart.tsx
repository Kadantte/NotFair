"use client";

import { useMemo, useRef, useState } from "react";

/**
 * The goal's hero chart: the metric over real time, with the target and
 * baseline as reference lines, every agent action as a marker on the
 * moment it happened, and observation windows shaded — cause and effect
 * on one picture.
 *
 * Dataviz rules applied: single series (no legend — the card title names
 * it), 2px line, ≥8px hit targets with a 2px surface ring, recessive
 * grid/reference lines in ink tokens, crosshair + tooltip by default,
 * text in text tokens never series color, and every colored mark carries
 * a shape + tooltip so nothing is color-alone.
 */

export type ChartPoint = { t: number; v: number; source: string };
export type ChartAction = {
  t: number;
  kind: string;
  label: string;
  expected: string;
  observed: string | null;
  reviewUntil: number | null;
};
export type ChartFailure = { t: number; error: string };

const W = 340;
const H = 170;
const PAD = { top: 10, right: 10, bottom: 20, left: 34 };

function fmtVal(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function fmtDate(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function GoalProgressChart({
  points,
  actions,
  failures,
  target,
  baseline,
  deadline,
}: {
  points: ChartPoint[];
  actions: ChartAction[];
  failures: ChartFailure[];
  target: number | null;
  baseline: number | null;
  deadline: number | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<
    | { kind: "point"; x: number; y: number; p: ChartPoint }
    | { kind: "action"; x: number; y: number; a: ChartAction }
    | { kind: "failure"; x: number; y: number; f: ChartFailure }
    | null
  >(null);

  const model = useMemo(() => {
    if (points.length < 2) return null;
    const ts = points.map((p) => p.t);
    const now = Date.now();
    const tMin = Math.min(...ts, ...actions.map((a) => a.t), now - 1);
    const tMax = Math.max(...ts, now);
    const values = [
      ...points.map((p) => p.v),
      ...(target !== null ? [target] : []),
      ...(baseline !== null ? [baseline] : []),
    ];
    let vMin = Math.min(...values);
    let vMax = Math.max(...values);
    if (vMin === vMax) {
      vMin -= 1;
      vMax += 1;
    }
    const vPad = (vMax - vMin) * 0.12;
    vMin -= vPad;
    vMax += vPad;
    const x = (t: number) =>
      PAD.left + ((t - tMin) / (tMax - tMin)) * (W - PAD.left - PAD.right);
    const y = (v: number) =>
      PAD.top + (1 - (v - vMin) / (vMax - vMin)) * (H - PAD.top - PAD.bottom);
    // 3 recessive horizontal gridlines with value labels.
    const gridVals = [vMin + vPad, (vMin + vMax) / 2, vMax - vPad];
    // 3 date ticks.
    const tickTs = [tMin, (tMin + tMax) / 2, tMax];
    return { tMin, tMax, x, y, gridVals, tickTs };
  }, [points, actions, target, baseline]);

  if (!model || points.length < 2) {
    return (
      <div className="flex h-28 items-center justify-center text-[12px] text-[hsl(var(--notfair-ink-4))]">
        The chart appears after a couple of readings — history backfills
        during setup when the source supports it.
      </div>
    );
  }

  const { x, y, gridVals, tickTs, tMax } = model;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1]!;
  const deadlineInside = deadline !== null && deadline <= tMax;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    // nearest data point by x
    let best: ChartPoint | null = null;
    let bestD = Infinity;
    for (const p of points) {
      const d = Math.abs(x(p.t) - mx);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best && bestD < 24) {
      setHover({ kind: "point", x: x(best.t), y: y(best.v), p: best });
    } else {
      setHover(null);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Metric over time. Latest ${fmtVal(last.v)}${target !== null ? `, target ${fmtVal(target)}` : ""}.`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* recessive grid + value labels */}
        {gridVals.map((gv, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(gv)}
              y2={y(gv)}
              stroke="hsl(var(--border))"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 4}
              y={y(gv) + 3}
              textAnchor="end"
              className="fill-[hsl(var(--notfair-ink-4))] text-[8px] tabular-nums"
            >
              {fmtVal(gv)}
            </text>
          </g>
        ))}
        {/* date ticks */}
        {tickTs.map((tt, i) => (
          <text
            key={i}
            x={x(tt)}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === tickTs.length - 1 ? "end" : "middle"}
            className="fill-[hsl(var(--notfair-ink-4))] text-[8px]"
          >
            {fmtDate(tt)}
          </text>
        ))}

        {/* observation windows (shaded) */}
        {actions
          .filter((a) => a.reviewUntil !== null)
          .map((a, i) => (
            <rect
              key={`w${i}`}
              x={x(a.t)}
              y={PAD.top}
              width={Math.max(0, x(Math.min(a.reviewUntil!, tMax)) - x(a.t))}
              height={H - PAD.top - PAD.bottom}
              fill="hsl(var(--notfair-accent))"
              opacity="0.07"
            />
          ))}

        {/* reference lines: baseline dotted, target dashed + label */}
        {baseline !== null && (
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(baseline)}
            y2={y(baseline)}
            stroke="hsl(var(--notfair-ink-4))"
            strokeWidth="1"
            strokeDasharray="1.5 3"
          />
        )}
        {target !== null && (
          <g>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(target)}
              y2={y(target)}
              stroke="hsl(var(--notfair-ink-3))"
              strokeWidth="1"
              strokeDasharray="5 3"
            />
            <text
              x={W - PAD.right}
              y={y(target) - 3}
              textAnchor="end"
              className="fill-[hsl(var(--notfair-ink-3))] text-[8px]"
            >
              target {fmtVal(target)}
            </text>
          </g>
        )}

        {/* deadline flag */}
        {deadlineInside && (
          <g>
            <line
              x1={x(deadline!)}
              x2={x(deadline!)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="hsl(var(--notfair-ink-4))"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            <text
              x={x(deadline!) + 3}
              y={PAD.top + 7}
              className="fill-[hsl(var(--notfair-ink-4))] text-[8px]"
            >
              ⚑ deadline
            </text>
          </g>
        )}

        {/* the metric line */}
        <path
          d={path}
          fill="none"
          stroke="hsl(var(--notfair-accent))"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* latest point, ringed */}
        <circle cx={x(last.t)} cy={y(last.v)} r="4" fill="hsl(var(--background))" />
        <circle cx={x(last.t)} cy={y(last.v)} r="2.5" fill="hsl(var(--notfair-accent))" />

        {/* action markers: ▼ on the time axis of the event */}
        {actions.map((a, i) => (
          <g
            key={`a${i}`}
            onMouseEnter={() => setHover({ kind: "action", x: x(a.t), y: PAD.top + 8, a })}
            onMouseLeave={() => setHover(null)}
            className="cursor-help"
          >
            {/* generous invisible hit target */}
            <rect x={x(a.t) - 8} y={PAD.top} width="16" height="16" fill="transparent" />
            <path
              d={`M${x(a.t) - 4.5},${PAD.top + 2} L${x(a.t) + 4.5},${PAD.top + 2} L${x(a.t)},${PAD.top + 9} Z`}
              fill="hsl(var(--notfair-accent))"
              stroke="hsl(var(--background))"
              strokeWidth="1.5"
            />
          </g>
        ))}

        {/* failed checks: ✕ */}
        {failures.map((f, i) => (
          <g
            key={`f${i}`}
            onMouseEnter={() => setHover({ kind: "failure", x: x(f.t), y: H - PAD.bottom - 8, f })}
            onMouseLeave={() => setHover(null)}
            className="cursor-help"
          >
            <rect x={x(f.t) - 8} y={H - PAD.bottom - 16} width="16" height="16" fill="transparent" />
            <text
              x={x(f.t)}
              y={H - PAD.bottom - 5}
              textAnchor="middle"
              className="fill-[hsl(0_72%_51%)] text-[10px] font-bold"
            >
              ✕
            </text>
          </g>
        ))}

        {/* crosshair for hovered data point */}
        {hover?.kind === "point" && (
          <g pointerEvents="none">
            <line
              x1={hover.x}
              x2={hover.x}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="hsl(var(--notfair-ink-4))"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle cx={hover.x} cy={hover.y} r="4" fill="hsl(var(--background))" />
            <circle cx={hover.x} cy={hover.y} r="2.5" fill="hsl(var(--notfair-accent))" />
          </g>
        )}
      </svg>

      {/* tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-[240px] rounded-md bg-[hsl(var(--card))] px-2.5 py-1.5 text-[11px] leading-snug shadow-lg"
          style={{
            left: `${Math.min(92, Math.max(8, (hover.x / W) * 100))}%`,
            top: `${(hover.y / H) * 100}%`,
            transform: `translate(${hover.x > W * 0.6 ? "-100%" : "8px"}, 10px)`,
          }}
        >
          {hover.kind === "point" && (
            <>
              <span className="font-medium tabular-nums">{fmtVal(hover.p.v)}</span>{" "}
              <span className="text-[hsl(var(--notfair-ink-4))]">
                {fmtDate(hover.p.t)}
                {hover.p.source === "backfill" ? " · history" : ""}
              </span>
            </>
          )}
          {hover.kind === "action" && (
            <>
              <p className="m-0 font-medium">▼ {hover.a.label}</p>
              <p className="m-0 text-[hsl(var(--notfair-ink-4))]">
                expected: {hover.a.expected}
              </p>
              {hover.a.observed && (
                <p className="m-0 text-[hsl(var(--notfair-ink-4))]">
                  observed: {hover.a.observed}
                </p>
              )}
              {!hover.a.observed && hover.a.reviewUntil && (
                <p className="m-0 text-[hsl(var(--notfair-ink-4))]">
                  measuring until {fmtDate(hover.a.reviewUntil)}
                </p>
              )}
            </>
          )}
          {hover.kind === "failure" && (
            <>
              <p className="m-0 font-medium text-[hsl(0_72%_51%)]">✕ check failed</p>
              <p className="m-0 text-[hsl(var(--notfair-ink-4))]">{hover.f.error}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
