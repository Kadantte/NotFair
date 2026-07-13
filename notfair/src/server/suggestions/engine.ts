import {
  hasSuggestionsForSource,
  replaceOpenSuggestions,
  type SuggestionDraft,
} from "@/server/db/suggestions";
import { listLiveGoals } from "@/server/db/goals";
import { listProjectMcpTokens } from "@/server/mcp/tokens";
import {
  auditXadsAccount,
  xadsSuggestionsFromSnapshot,
  XADS_SOURCE_KEY,
} from "./xads";

/**
 * Suggestion generation: after a user connects an ads account, NotFair
 * audits it mechanically and proposes goals. One analyzer per platform;
 * X Ads is the first. Generation is idempotent per (project, source) —
 * open rows refresh, accepted/dismissed rows are left alone.
 */

type Analyzer = (
  project_slug: string,
  liveGoalStatements: string[],
) => Promise<SuggestionDraft[]>;

const ANALYZERS: Record<string, { label: string; run: Analyzer }> = {
  [XADS_SOURCE_KEY]: {
    label: "X Ads",
    run: async (project_slug, liveGoals) => {
      const snapshot = await auditXadsAccount(project_slug);
      return xadsSuggestionsFromSnapshot(snapshot, liveGoals);
    },
  },
};

export function suggestionSourceLabel(source_key: string): string | null {
  return ANALYZERS[source_key]?.label ?? null;
}

export type SuggestionRun = {
  source_key: string;
  label: string;
  status: "running" | "done" | "failed";
  error?: string;
  finished_at?: number;
};

// Per-project run state. In-memory is enough for a single-user local
// process: the UI polls it while a run is live, and a lost run after a
// restart just means the user re-triggers from the index page.
const runs = new Map<string, Map<string, SuggestionRun>>();

function projectRuns(project_slug: string): Map<string, SuggestionRun> {
  let m = runs.get(project_slug);
  if (!m) {
    m = new Map();
    runs.set(project_slug, m);
  }
  return m;
}

export function listSuggestionRuns(project_slug: string): SuggestionRun[] {
  return Array.from(projectRuns(project_slug).values());
}

export function anySuggestionRunActive(project_slug: string): boolean {
  return listSuggestionRuns(project_slug).some((r) => r.status === "running");
}

/**
 * Analyze one connected source and refresh its open suggestions.
 * No-ops when the source has no analyzer or a run is already live.
 */
export async function generateSuggestionsForSource(
  project_slug: string,
  source_key: string,
): Promise<void> {
  const analyzer = ANALYZERS[source_key];
  if (!analyzer) return;
  const state = projectRuns(project_slug);
  if (state.get(source_key)?.status === "running") return;

  state.set(source_key, {
    source_key,
    label: analyzer.label,
    status: "running",
  });
  try {
    const liveStatements = listLiveGoals(project_slug).map((g) => g.statement);
    const drafts = await analyzer.run(project_slug, liveStatements);
    replaceOpenSuggestions(project_slug, source_key, drafts);
    state.set(source_key, {
      source_key,
      label: analyzer.label,
      status: "done",
      finished_at: Date.now(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[suggestions] ${source_key} analysis failed:`, message);
    state.set(source_key, {
      source_key,
      label: analyzer.label,
      status: "failed",
      error: message,
      finished_at: Date.now(),
    });
  }
}

/** Every connected source that has an analyzer. */
export function analyzableSources(project_slug: string): string[] {
  return listProjectMcpTokens(project_slug)
    .map((t) => t.server_name)
    .filter((key) => key in ANALYZERS);
}

/**
 * First-visit hook for the goals index: kick off analysis for any
 * connected source that has never produced suggestions (covers accounts
 * connected before this feature existed, and dropped runs after a
 * restart). Fire-and-forget; failures land in the run state.
 */
export function maybeAutoGenerate(project_slug: string): void {
  for (const key of analyzableSources(project_slug)) {
    const run = projectRuns(project_slug).get(key);
    if (run) continue; // already attempted this process lifetime
    if (hasSuggestionsForSource(project_slug, key)) continue;
    void generateSuggestionsForSource(project_slug, key);
  }
}
