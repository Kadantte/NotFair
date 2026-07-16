"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadMoreGoalChecksAction } from "@/server/actions/goals";
import type { CheckPr, CheckRow } from "@/server/goals/checks";
import { projectHref } from "@/lib/project-href";
import { formatMetric } from "@/lib/format-metric";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/markdown";

/**
 * The goal rail's Checks diary. Server-renders the newest page; older
 * checks stream in as the sentinel scrolls into view (cursor-paged by
 * tick_number). The page's 5s auto-refresh re-sends the first page, which
 * is merged in by id so freshly loaded history is never dropped.
 */
export function GoalChecksList({
  slug,
  agentSlug,
  goalId,
  initialRows,
  initialHasMore,
}: {
  slug: string;
  agentSlug: string;
  goalId: string;
  initialRows: CheckRow[];
  initialHasMore: boolean;
}) {
  const [rows, setRows] = useState<CheckRow[]>(initialRows);
  // Only load responses update hasMore: a refresh of the first page says
  // nothing about whether history below the loaded window remains.
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // The observer callback outlives renders; read rows through a ref.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    setRows((prev) => mergeRows(prev, initialRows));
  }, [initialRows]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(async (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const oldest = Math.min(...rowsRef.current.map((r) => r.tick_number));
        const res = await loadMoreGoalChecksAction(goalId, oldest);
        setRows((prev) => mergeRows(prev, res.rows));
        setHasMore(res.hasMore);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [goalId, hasMore]);

  if (rows.length === 0) return null;

  return (
    <>
      <ul className="m-0 flex list-none flex-col divide-y divide-border/40 p-0">
        {rows.map((t) => (
          <CheckItem key={t.id} slug={slug} agentSlug={agentSlug} tick={t} />
        ))}
      </ul>
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-2">
          {loading && (
            <Loader2 className="size-3.5 animate-spin text-[hsl(var(--notfair-ink-4))]" />
          )}
        </div>
      )}
    </>
  );
}

/** Upsert incoming rows by id, newest check first. */
function mergeRows(prev: CheckRow[], incoming: CheckRow[]): CheckRow[] {
  const byId = new Map(prev.map((r) => [r.id, r]));
  for (const r of incoming) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => b.tick_number - a.tick_number);
}

function CheckItem({
  slug,
  agentSlug,
  tick,
}: {
  slug: string;
  agentSlug: string;
  tick: CheckRow;
}) {
  const threadLabel = tick.trigger_kind === "intake" ? "main" : `tick-${tick.tick_number}`;
  return (
    <li className="py-2.5 text-[12px] leading-snug first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">
          Check {tick.tick_number}
          {tick.trigger_kind === "manual" && (
            <span className="ns-tag ml-1.5 align-middle">manually triggered</span>
          )}
          {tick.metric_value !== null && (
            <span className="ml-1.5 font-normal tabular-nums text-[hsl(var(--notfair-ink-3))]">
              → {formatMetric(tick.metric_value)}
            </span>
          )}
        </span>
        <span className="shrink-0 text-[10.5px] tabular-nums text-[hsl(var(--notfair-ink-4))]">
          {timeAgo(tick.started_at)}
        </span>
      </div>
      {tick.metric_error && (
        <p className="m-0 text-[11.5px] text-[hsl(0_72%_51%)]">{tick.metric_error}</p>
      )}
      <div className="line-clamp-2 text-[11.5px] text-[hsl(var(--notfair-ink-4))]">
        <Markdown className="text-[11.5px] text-[hsl(var(--notfair-ink-4))] [&_p]:m-0 [&_p]:inline [&_p+p]:before:content-['_']">
          {tick.status === "running"
            ? "running…"
            : tick.status === "failed"
              ? `failed: ${tick.summary ?? "(no detail)"}`
              : (tick.summary ?? "(no summary)")}
        </Markdown>
      </div>
      {/* Running agent checks are watchable live: the session attaches at
          turn start and the check page's transcript polls as it streams.
          No-op checks never carry a session and stay unlinked. */}
      {(tick.session_id || tick.status === "running" || tick.prs.length > 0) && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {(tick.session_id || tick.status === "running") && (
            <Link
              href={projectHref(slug, `/goals/${agentSlug}/checks/${threadLabel}`)}
              className="ns-link text-[10.5px]"
            >
              {tick.status === "running" ? "watch live ›" : "details ›"}
            </Link>
          )}
          {tick.prs.map((pr) => (
            <CheckPrButton key={pr.id} pr={pr} />
          ))}
        </div>
      )}
    </li>
  );
}

/** Compact colored PR pill on a check row — links straight to GitHub. */
function CheckPrButton({ pr }: { pr: CheckPr }) {
  const number = pr.url.match(/\/pull\/(\d+)$/)?.[1];
  const tone =
    pr.state === "open"
      ? "ns-tag-accent"
      : pr.state === "merged"
        ? "bg-[hsl(217_60%_55%/0.14)] text-[hsl(217_60%_45%)] dark:text-[hsl(217_70%_70%)]"
        : "ns-tag-red";
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noreferrer"
      title={pr.title}
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
        tone,
      )}
    >
      PR{number ? ` #${number}` : ""} · {pr.state}
    </a>
  );
}
