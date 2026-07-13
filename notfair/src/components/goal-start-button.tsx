"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { startGoalLoopAction } from "@/server/actions/goals";
import { Button } from "@/components/ui/button";

/**
 * The consent moment: the loop does not start until the user clicks this.
 * The click also fires the first tick immediately, so the reward for
 * consenting is watching the agent work right now.
 */
export function GoalStartButton({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function start() {
    startTransition(async () => {
      const r = await startGoalLoopAction(goalId);
      if (!r.ok) {
        toast.error(r.error ?? "Could not start the loop.");
        return;
      }
      toast.success("Loop started — the first tick is running now.");
      router.refresh();
    });
  }

  return (
    <Button onClick={start} disabled={pending} size="lg" className="gap-2">
      <Play className="size-4" />
      {pending ? "Starting…" : "START the loop"}
    </Button>
  );
}
