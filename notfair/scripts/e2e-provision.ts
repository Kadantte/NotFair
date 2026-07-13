import { createProject, getProject } from "../src/server/db/projects";
import { createGoal } from "../src/server/db/goals";
import { goalAgentIdFor, provisionGoalAgent } from "../src/server/goals/provision";

/**
 * Dev helper: provision a test project with one goal agent so the UI has
 * something to render without walking through onboarding. Agent = goal —
 * the goal starts in `intake` and gets defined in the agent's chat.
 *
 *   pnpm tsx scripts/e2e-provision.ts
 */
async function main() {
  const slug = "e2e-test-brand";
  if (!getProject(slug)) {
    const r = createProject({ display_name: "E2E Test Brand" });
    if (!r.ok) throw new Error(r.reason);
    console.log("project created:", r.project.slug);
  }
  const agent_id = goalAgentIdFor(slug, 1);
  const goal = createGoal({
    project_slug: slug,
    agent_id,
    statement: "Keep test wasted spend at $0",
  });
  await provisionGoalAgent({ goal, urlSlug: "goal-1" });
  console.log("goal agent provisioned:", agent_id, "goal:", goal.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
