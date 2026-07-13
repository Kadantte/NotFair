"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createGoalAgentAction } from "@/server/actions/goals";
import { projectHref } from "@/lib/project-href";
import { Button } from "@/components/ui/button";

/**
 * Statement-first goal creation: the user states the ambition (the only
 * thing on their mind), the platform auto-names an agent for it, and on
 * success we drop straight into the agent's chat — where it is already
 * working out how to measure the goal.
 */
export function NewGoalForm({ projectSlug }: { projectSlug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [statement, setStatement] = useState("");

  function submit() {
    startTransition(async () => {
      const r = await createGoalAgentAction({
        project_slug: projectSlug,
        statement,
      });
      if (!r.ok || !r.agent_slug) {
        toast.error(r.error ?? "Could not create the goal.");
        return;
      }
      toast.success("Your agent is on it — watch it work.");
      router.push(projectHref(projectSlug, `/goals/${r.agent_slug}`));
    });
  }

  return (
    <div className="ns-card flex flex-col gap-3 p-4">
      <label htmlFor="new-goal-statement" className="text-[13px] font-medium">
        What do you want to achieve?
      </label>
      <textarea
        id="new-goal-statement"
        className="min-h-20 w-full resize-y rounded-lg bg-[hsl(var(--notfair-surface-2))] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--notfair-accent))]"
        placeholder={'e.g. "Cut our Google Ads CAC to $30" or "Get to 100 signups a month from paid"'}
        value={statement}
        onChange={(e) => setStatement(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && statement.trim() && !pending) {
            e.preventDefault();
            submit();
          }
        }}
        disabled={pending}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-[12px] text-[hsl(var(--notfair-ink-4))]">
          An agent takes it from here: it turns this into a measured metric,
          shows you the baseline, and nothing runs until you press START.
        </p>
        <Button onClick={submit} disabled={pending || !statement.trim()}>
          {pending ? "Creating…" : "Create goal"}
        </Button>
      </div>
    </div>
  );
}
