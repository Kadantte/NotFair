"use server";

import { cloneAgent } from "@/server/agents/clone";
import { cascadeDeleteAgentArtifacts } from "@/server/agents/cascade-delete";
import { writeAgentMeta } from "@/server/agent-meta";

// --- Relocate (used by project rename to move agents to the new slug) ---

export type RelocateAgentInput = {
  old_agent_id: string;
  source_project_slug: string;
  new_project_slug: string;
  new_slug: string;
  new_display_name: string;
  preserve_source_agent_id?: string;
  preserve_created_at?: string;
};

export type RelocateAgentResult = {
  new_agent_id: string;
  new_slug: string;
};

export async function relocateAgent(
  input: RelocateAgentInput,
): Promise<RelocateAgentResult> {
  const cloneResult = await cloneAgent({
    source_agent_id: input.old_agent_id,
    project_slug: input.new_project_slug,
    new_slug: input.new_slug,
    display_name: input.new_display_name,
    slug_is_canonical: true,
  });

  await writeAgentMeta({
    agent_id: cloneResult.new_agent_id,
    project_slug: input.new_project_slug,
    slug: cloneResult.new_slug,
    name: input.new_display_name,
    ...(input.preserve_source_agent_id
      ? { source_agent_id: input.preserve_source_agent_id }
      : {}),
    created_at: input.preserve_created_at ?? new Date().toISOString(),
  });

  // Best-effort: the clone already succeeded, so a cleanup failure must not
  // fail the relocation — but it must not be invisible either (a silent
  // swallow here previously masked cleanup breaking entirely, stranding the
  // old agent's sessions and MCP registrations).
  await cascadeDeleteAgentArtifacts(
    input.source_project_slug,
    input.old_agent_id,
  ).catch((err) =>
    console.error(`[relocate] cleanup of old agent ${input.old_agent_id} failed:`, err),
  );

  return {
    new_agent_id: cloneResult.new_agent_id,
    new_slug: cloneResult.new_slug,
  };
}
