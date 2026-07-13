import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Per-agent meta sidecar (`notfair-meta.json` in the agent's workspace
 * dir). Agent = goal: every agent is a goal agent, so the sidecar is the
 * single source of truth for the project's roster — no templates, no
 * seeded placeholders. Authored at agent-create time, read by the sidebar
 * and slug resolution.
 */

export type AgentMeta = {
  /** Full agent id, e.g. `acme-goal-alex`. */
  agent_id: string;
  /** Project slug this agent belongs to. */
  project_slug: string;
  /**
   * Personal name the user assigned (e.g. "Alex"). IMMUTABLE — set once
   * at agent-create time; the agent_id and URL slug encode it.
   */
  name: string;
  /** URL slug, e.g. `goal-alex`. */
  slug?: string;
  /** When cloned, the source agentId. (Legacy field; unused today.) */
  source_agent_id?: string;
  created_at: string;
};

function notfairDataDir(): string {
  return process.env.NOTFAIR_DATA_DIR ?? join(homedir(), ".notfair");
}

function metaPath(agentId: string): string {
  return join(notfairDataDir(), "agents", agentId, "notfair-meta.json");
}

export async function writeAgentMeta(meta: AgentMeta): Promise<void> {
  const path = metaPath(meta.agent_id);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(meta, null, 2), "utf8");
}

export function readAgentMeta(agentId: string): AgentMeta | null {
  const path = metaPath(agentId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as AgentMeta;
  } catch {
    return null;
  }
}

/** Has this agent's workspace been provisioned on disk? */
export async function agentExistsOnDisk(agentId: string): Promise<boolean> {
  try {
    const s = await stat(join(notfairDataDir(), "agents", agentId));
    return s.isDirectory();
  } catch {
    return false;
  }
}

export type ProjectAgentEntry = {
  agent_id: string;
  /** URL slug, e.g. `goal-alex`. */
  slug: string;
  /** Personal name (e.g. "Alex"). */
  name: string;
  source_agent_id?: string;
  created_at?: string;
};

/**
 * List agents for a project — the meta sidecars whose `project_slug`
 * field equals the requested slug. The sidecar (not the dir-name prefix)
 * is authoritative, so projects whose slug is a string prefix of another
 * ("acme" vs "acme-q4") never cross-leak rosters.
 */
export async function listProjectAgents(project_slug: string): Promise<ProjectAgentEntry[]> {
  const agentsRoot = join(notfairDataDir(), "agents");
  let entries: string[] = [];
  try {
    entries = await readdir(agentsRoot);
  } catch {
    return [];
  }
  const prefix = `${project_slug}-`;
  const result: ProjectAgentEntry[] = [];
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    const meta = readAgentMeta(entry);
    if (!meta) continue;
    if (meta.project_slug !== project_slug) continue;
    result.push({
      agent_id: meta.agent_id,
      slug: meta.slug ?? slugifyForMeta(meta.name),
      name: meta.name,
      source_agent_id: meta.source_agent_id,
      created_at: meta.created_at,
    });
  }
  // Stable order: creation time, oldest first (sidebar reads top-down).
  return result.sort((a, b) =>
    (a.created_at ?? "").localeCompare(b.created_at ?? ""),
  );
}

/** Workspace dir for an agent. */
export function workspaceDirFor(agentId: string): string {
  return join(notfairDataDir(), "agents", agentId);
}

/** Fallback slug for sidecars written before `slug` was recorded. */
function slugifyForMeta(s: string): string {
  return `goal-${s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)}`;
}

export type ResolvedAgent = {
  agent_id: string;
  /** Personal name (e.g. "Alex"). */
  name: string;
  slug: string;
};

/**
 * Resolve a URL slug to its full agent_id within the current project.
 * Returns null when no project agent matches the slug.
 */
export async function resolveAgentBySlug(
  project_slug: string,
  url_slug: string,
): Promise<ResolvedAgent | null> {
  const all = await listProjectAgents(project_slug);
  const hit = all.find((a) => a.slug === url_slug);
  if (!hit) return null;
  return { agent_id: hit.agent_id, name: hit.name, slug: hit.slug };
}
