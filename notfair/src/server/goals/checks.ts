import { listGoalActions, listGoalTicks, type GoalTick } from "@/server/db/goals";
import { listGoalPrs, type GoalPrState } from "@/server/db/goal-prs";

/**
 * Check rows for the goal screen's diary list — each tick joined with the
 * PRs its turn registered, paged newest-first by tick_number so the list
 * can lazy-load older checks on scroll.
 */

export type CheckPr = {
  id: string;
  url: string;
  title: string;
  state: GoalPrState;
};

export type CheckRow = GoalTick & { prs: CheckPr[] };

export const CHECKS_PAGE_SIZE = 10;

export function listCheckRows(
  goal_id: string,
  opts: { limit?: number; beforeTick?: number } = {},
): { rows: CheckRow[]; hasMore: boolean } {
  const limit = opts.limit ?? CHECKS_PAGE_SIZE;
  // Fetch one extra row purely to learn whether another page exists.
  const ticks = listGoalTicks(goal_id, limit + 1, opts.beforeTick);
  const hasMore = ticks.length > limit;
  const page = ticks.slice(0, limit);

  // PRs registered before tick stamping existed resolve their check
  // through the linked action instead.
  const actionTicks = new Map(
    listGoalActions(goal_id, 200).map((a) => [a.id, a.tick_number]),
  );
  const prsByTick = new Map<number, CheckPr[]>();
  for (const pr of listGoalPrs(goal_id, 100)) {
    const tickNo =
      pr.tick_number ?? (pr.action_id ? (actionTicks.get(pr.action_id) ?? null) : null);
    if (tickNo == null) continue;
    prsByTick.set(tickNo, [
      ...(prsByTick.get(tickNo) ?? []),
      { id: pr.id, url: pr.url, title: pr.title, state: pr.state },
    ]);
  }

  return {
    rows: page.map((t) => ({ ...t, prs: prsByTick.get(t.tick_number) ?? [] })),
    hasMore,
  };
}
