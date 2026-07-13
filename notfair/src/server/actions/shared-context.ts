"use server";

import { revalidatePath } from "next/cache";
import { getProject } from "@/server/db/projects";
import {
  writeProjectBrief,
  PROJECT_BRIEF_MAX_BYTES,
} from "@/server/onboarding/project-brief";
import { syncProjectAgents } from "@/server/goals/provision";

/**
 * User-side editing of the shared workspace context (PROJECT.md). Same
 * write + sync path the agents' `set_shared_context` tool uses, so a save
 * here lands in every goal agent's identity immediately.
 */
export async function saveSharedContextAction(input: {
  project_slug: string;
  content: string;
}): Promise<
  | { ok: true; synced_agents: number }
  | { ok: false; error: string }
> {
  const project = getProject(input.project_slug);
  if (!project) return { ok: false, error: "Workspace not found." };

  const content = input.content.trim();
  if (!content) {
    return { ok: false, error: "Shared context can't be empty — describe the company instead." };
  }
  if (Buffer.byteLength(content, "utf8") > PROJECT_BRIEF_MAX_BYTES) {
    return {
      ok: false,
      error: `Too long — keep it under ${Math.round(PROJECT_BRIEF_MAX_BYTES / 1024)}KB. This is a curated brief, not a dump.`,
    };
  }

  try {
    await writeProjectBrief(input.project_slug, content);
    const synced_agents = await syncProjectAgents(input.project_slug);
    revalidatePath("/", "layout");
    return { ok: true, synced_agents };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
