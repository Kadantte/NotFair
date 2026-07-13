"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  acceptSuggestionAction,
  dismissSuggestionAction,
  refreshSuggestionsAction,
} from "@/server/actions/suggestions";
import type { GoalSuggestion } from "@/server/db/suggestions";
import { projectHref } from "@/lib/project-href";
import { Button } from "@/components/ui/button";

/**
 * Suggested-goal cards minted from a mechanical audit of a connected ads
 * account. Accepting one runs the normal statement-first flow: a goal
 * agent spins up, verifies the metric, and nothing spends until START.
 */
export function GoalSuggestionCard({
  suggestion,
  projectSlug,
}: {
  suggestion: GoalSuggestion;
  projectSlug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);

  function accept() {
    startTransition(async () => {
      const r = await acceptSuggestionAction(suggestion.id);
      if (!r.ok || !r.agent_slug) {
        toast.error(r.error ?? "Could not create the goal.");
        return;
      }
      toast.success("Goal created — your agent is on it.");
      router.push(projectHref(projectSlug, `/goals/${r.agent_slug}`));
    });
  }

  function dismiss() {
    setDismissed(true);
    startTransition(async () => {
      await dismissSuggestionAction(suggestion.id);
      router.refresh();
    });
  }

  if (dismissed) return null;

  return (
    <div className="ns-card relative flex flex-col gap-2 p-4">
      <button
        type="button"
        onClick={dismiss}
        disabled={pending}
        aria-label="Dismiss suggestion"
        title="Dismiss — this idea won't come back"
        className="absolute right-3 top-3 rounded p-1 text-[hsl(var(--notfair-ink-4))] hover:text-[hsl(var(--notfair-ink-2))]"
      >
        <X className="size-3.5" />
      </button>
      <div className="flex items-center gap-2 pr-8">
        <Sparkles className="size-3.5 shrink-0 text-[hsl(var(--notfair-accent))]" aria-hidden />
        <p className="m-0 text-[13.5px] font-medium">{suggestion.title}</p>
        <span className="ns-tag">
          {suggestion.mode === "maintain" ? "keep it there" : "reach a target"}
        </span>
      </div>
      <p className="m-0 text-[12.5px] text-[hsl(var(--notfair-ink-3))]">
        {suggestion.rationale}
      </p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="m-0 text-[11.5px] text-[hsl(var(--notfair-ink-4))]">
          An agent verifies the numbers first — nothing runs until you press START.
        </p>
        <Button size="sm" onClick={accept} disabled={pending}>
          {pending ? "Creating…" : "Create this goal"}
        </Button>
      </div>
    </div>
  );
}

/** Inline retry for a failed account analysis. */
export function RetryAnalysisButton({ projectSlug }: { projectSlug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await refreshSuggestionsAction(projectSlug);
          router.refresh();
        })
      }
    >
      {pending ? "Retrying…" : "Retry"}
    </Button>
  );
}
