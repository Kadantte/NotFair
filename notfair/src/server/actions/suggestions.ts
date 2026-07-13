"use server";

import { revalidatePath } from "next/cache";
import {
  getSuggestion,
  markSuggestionAccepted,
  markSuggestionDismissed,
} from "@/server/db/suggestions";
import {
  analyzableSources,
  generateSuggestionsForSource,
} from "@/server/suggestions/engine";
import { createGoalAgentAction, type GoalActionResult } from "@/server/actions/goals";

/**
 * Accept a suggestion: mint the goal from its statement (the normal
 * statement-first flow — the agent still verifies the metric and the
 * user still presses START) and retire the card.
 */
export async function acceptSuggestionAction(id: string): Promise<GoalActionResult> {
  const suggestion = getSuggestion(id);
  if (!suggestion) return { ok: false, error: "Suggestion not found." };
  if (suggestion.status !== "open") {
    return { ok: false, error: "This suggestion was already handled." };
  }

  const result = await createGoalAgentAction({
    project_slug: suggestion.project_slug,
    statement: suggestion.statement,
  });
  if (result.ok && result.goal_id) {
    markSuggestionAccepted(id, result.goal_id);
    revalidatePath("/", "layout");
  }
  return result;
}

export async function dismissSuggestionAction(id: string): Promise<{ ok: boolean }> {
  const suggestion = getSuggestion(id);
  if (!suggestion || suggestion.status !== "open") return { ok: false };
  markSuggestionDismissed(id);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Re-run analysis across every connected source that supports it. */
export async function refreshSuggestionsAction(
  project_slug: string,
): Promise<{ ok: boolean; sources: number }> {
  const sources = analyzableSources(project_slug);
  for (const key of sources) {
    void generateSuggestionsForSource(project_slug, key);
  }
  revalidatePath("/", "layout");
  return { ok: true, sources: sources.length };
}
