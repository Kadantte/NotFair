import { provisionAgent } from "@/server/agents/provisioning";
import { readAgentMeta, writeAgentMeta } from "@/server/agent-meta";
import { getProject } from "@/server/db/projects";
import type { Goal } from "@/server/db/goals";
import { readProjectBrief } from "@/server/onboarding/project-brief";
import { DEFAULT_HARNESS_ADAPTER } from "@/server/adapters/registry";
import {
  registerBrowserMcpForAgent,
  registerCatalogMcpForAgent,
  registerGoalsMcpForAgent,
} from "@/server/mcp-server/registration";
import { listProjectMcpTokens } from "@/server/mcp/tokens";
import { goalLabel } from "@/lib/goal-label";
import { getGoalSkill, renderGoalIdentity } from "./identity";

/**
 * Provisioning for goal agents. An agent is a consequence of a goal
 * existing: created with the goal, identity re-rendered as the goal's spec
 * evolves (metric authored, target confirmed), garbage-collected with it.
 */

export const GOAL_TEMPLATE_KEY = "goal";

/**
 * Agents are anonymous plumbing (goals carry the display identity), so
 * ids are sequential: url slug `goal-<n>`, agent id
 * `<project>-goal-<n>`. Stable forever — labels can change, URLs don't.
 */
export function goalAgentUrlSlug(n: number): string {
  return `goal-${n}`;
}

export function goalAgentIdFor(project_slug: string, n: number): string {
  return `${project_slug}-${goalAgentUrlSlug(n)}`;
}

/**
 * Write the goal agent's workspace (IDENTITY.md + skill + project brief via
 * the project's harness adapter), its meta sidecar, and wire every MCP the
 * project has: goals, browser, and all connected catalog servers.
 * Idempotent — re-running refreshes files in place.
 */
export async function provisionGoalAgent(input: {
  goal: Goal;
  urlSlug: string;
}): Promise<void> {
  const { goal, urlSlug } = input;
  const project = getProject(goal.project_slug);
  if (!project) throw new Error(`project not found: ${goal.project_slug}`);
  const harnessAdapter = project.harness_adapter ?? DEFAULT_HARNESS_ADAPTER;

  const brief = await readProjectBrief(goal.project_slug).catch(() => null);
  const identityMd = renderGoalIdentity({ goal, brief, project });
  const label = goalLabel(goal);

  await provisionAgent({
    projectSlug: goal.project_slug,
    agentId: goal.agent_id,
    displayName: label,
    templateKey: GOAL_TEMPLATE_KEY,
    identityMd,
    skillMd: getGoalSkill(),
    projectMd: brief ?? undefined,
    harnessAdapter,
  });

  const existing = readAgentMeta(goal.agent_id);
  await writeAgentMeta({
    agent_id: goal.agent_id,
    project_slug: goal.project_slug,
    // meta.name mirrors the goal label so any surface still reading it
    // (deletion summaries, etc.) shows the goal, not a persona.
    name: label,
    slug: existing?.slug ?? urlSlug,
    created_at: existing?.created_at ?? new Date().toISOString(),
  });

  // MCP wiring is best-effort per server — a goal agent without browser
  // access still has its loop tools. Log and continue on failure.
  try {
    await registerGoalsMcpForAgent(goal.project_slug, goal.agent_id);
  } catch (err) {
    console.warn(`[goal-provision] goals MCP failed for ${goal.agent_id}:`, err);
  }
  try {
    await registerBrowserMcpForAgent(goal.project_slug, goal.agent_id);
  } catch (err) {
    console.warn(`[goal-provision] browser MCP failed for ${goal.agent_id}:`, err);
  }
  try {
    const tokens = listProjectMcpTokens(goal.project_slug);
    for (const t of tokens) {
      await registerCatalogMcpForAgent(goal.project_slug, t.server_name, goal.agent_id);
    }
  } catch (err) {
    console.warn(`[goal-provision] catalog MCP wiring failed for ${goal.agent_id}:`, err);
  }
}

/**
 * Re-render IDENTITY.md after a goal spec change (metric proposed, target
 * confirmed). Keeps the agent's on-disk brain in sync with the DB without
 * touching MCP wiring. Best-effort — callers treat failure as non-fatal
 * since the next full provision heals it.
 */
/**
 * Re-render IDENTITY.md for every goal agent in a project — called when
 * the shared workspace context (PROJECT.md) changes so all agents see it
 * on their next turn. Returns the number of agents synced.
 */
export async function syncProjectAgents(project_slug: string): Promise<number> {
  const { listProjectAgents } = await import("@/server/agent-meta");
  const { getGoalForAgent } = await import("@/server/db/goals");
  const entries = await listProjectAgents(project_slug);
  let synced = 0;
  for (const entry of entries) {
    const goal = getGoalForAgent(entry.agent_id);
    if (!goal) continue;
    try {
      await syncGoalIdentity(goal);
      synced++;
    } catch (err) {
      console.warn(`[goal-provision] brief sync failed for ${entry.agent_id}:`, err);
    }
  }
  return synced;
}

export async function syncGoalIdentity(goal: Goal): Promise<void> {
  const meta = readAgentMeta(goal.agent_id);
  const project = getProject(goal.project_slug);
  if (!project) return;
  const brief = await readProjectBrief(goal.project_slug).catch(() => null);
  const label = goalLabel(goal);
  await provisionAgent({
    projectSlug: goal.project_slug,
    agentId: goal.agent_id,
    displayName: label,
    templateKey: GOAL_TEMPLATE_KEY,
    identityMd: renderGoalIdentity({ goal, brief, project }),
    skillMd: getGoalSkill(),
    projectMd: brief ?? undefined,
    harnessAdapter: project.harness_adapter ?? DEFAULT_HARNESS_ADAPTER,
  });
  // Keep the meta label in sync so headers/deletion summaries follow the goal.
  if (meta && meta.name !== label) {
    await writeAgentMeta({ ...meta, name: label });
  }
}
