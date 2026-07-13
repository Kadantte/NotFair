import { requireAdapter } from "@/server/adapters/registry";
import { getProject } from "@/server/db/projects";
import { listProjectAgents } from "@/server/agent-meta";
import { mcpSpecByKey } from "@/server/mcp-catalog";
import { findMcpToken } from "@/server/mcp/tokens";
import { getOrCreateMcpServerSecret } from "./secret";

/**
 * Register NotFair's outbound MCP server (`notfair-goals`) with
 * the project's harness adapter for a specific agent.
 *
 * The harness-adapter model writes MCP wiring into whichever config file
 * the chosen harness expects (Claude Code's `.mcp.json`, Codex's
 * `~/.codex/config.toml`); registration is per-agent.
 *
 * URL: `NOTFAIR_MCP_URL` if set, else
 * `http://127.0.0.1:${NOTFAIR_PORT||3326}/api/mcp/goals`.
 */

export const GOALS_MCP_KEY = "notfair-goals";
export const BROWSER_MCP_KEY = "notfair-browser";

function notfairOriginPort(): string {
  return process.env.NOTFAIR_PORT?.trim() || "3326";
}

function defaultMcpUrl(): string {
  if (process.env.NOTFAIR_MCP_URL?.trim()) {
    return process.env.NOTFAIR_MCP_URL.trim();
  }
  return `http://127.0.0.1:${notfairOriginPort()}/api/mcp/goals`;
}

function defaultBrowserMcpUrl(): string {
  if (process.env.NOTFAIR_BROWSER_MCP_URL?.trim()) {
    return process.env.NOTFAIR_BROWSER_MCP_URL.trim();
  }
  return `http://127.0.0.1:${notfairOriginPort()}/api/mcp/browser`;
}

export type InstallResult =
  | { ok: true; key: string; url: string }
  | { ok: false; key: string; url: string; error: string };

export async function registerGoalsMcpForAgent(
  project_slug: string,
  agent_id: string,
): Promise<InstallResult> {
  return registerInternalMcpForAgent({
    project_slug,
    agent_id,
    key: GOALS_MCP_KEY,
    url: defaultMcpUrl(),
  });
}

/**
 * Register the standalone browser MCP (notfair-browser) for an agent.
 * Same shared-secret auth + same harness adapter glue as the goals server;
 * separate URL + server name so agents see the surface as its own thing.
 */
export async function registerBrowserMcpForAgent(
  project_slug: string,
  agent_id: string,
): Promise<InstallResult> {
  return registerInternalMcpForAgent({
    project_slug,
    agent_id,
    key: BROWSER_MCP_KEY,
    url: defaultBrowserMcpUrl(),
  });
}

async function registerInternalMcpForAgent(args: {
  project_slug: string;
  agent_id: string;
  key: string;
  url: string;
}): Promise<InstallResult> {
  const { project_slug, agent_id, key, url } = args;
  const project = getProject(project_slug);
  if (!project) {
    return { ok: false, key, url, error: `Unknown project ${project_slug}` };
  }
  try {
    const adapter = requireAdapter(project.harness_adapter);
    await adapter.registerMcp({
      serverName: key,
      agentId: agent_id,
      projectSlug: project_slug,
      transport: {
        type: "http",
        url,
        headers: { Authorization: `Bearer ${getOrCreateMcpServerSecret()}` },
      },
    });
    return { ok: true, key, url };
  } catch (err) {
    return {
      ok: false,
      key,
      url,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Register an external catalog MCP server (Google Ads, GSC, etc.) with the
 * project's harness adapter for a specific agent. Pulls the OAuth bearer
 * from the `mcp_tokens` table and the resource URL from the catalog spec.
 *
 * Called after a successful OAuth callback so the bearer becomes visible
 * to running agents without the user manually re-provisioning. Idempotent:
 * the adapter `registerMcp` overwrites the prior entry on rewrite.
 */
export async function registerCatalogMcpForAgent(
  project_slug: string,
  catalog_key: string,
  agent_id: string,
): Promise<InstallResult> {
  const spec = mcpSpecByKey(project_slug, catalog_key);
  if (!spec) {
    return {
      ok: false,
      key: catalog_key,
      url: "",
      error: `Unknown catalog key ${catalog_key}`,
    };
  }
  const project = getProject(project_slug);
  if (!project) {
    return {
      ok: false,
      key: catalog_key,
      url: spec.resource_url,
      error: `Unknown project ${project_slug}`,
    };
  }
  const token = findMcpToken(project_slug, catalog_key);
  if (!token) {
    return {
      ok: false,
      key: catalog_key,
      url: spec.resource_url,
      error: `No token stored for ${catalog_key} in project ${project_slug}`,
    };
  }
  try {
    const adapter = requireAdapter(project.harness_adapter);
    await adapter.registerMcp({
      serverName: catalog_key,
      agentId: agent_id,
      projectSlug: project_slug,
      transport: {
        type: "http",
        url: spec.resource_url,
        headers: { Authorization: `Bearer ${token.access_token_enc}` },
      },
    });
    return { ok: true, key: catalog_key, url: spec.resource_url };
  } catch (err) {
    return {
      ok: false,
      key: catalog_key,
      url: spec.resource_url,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Convenience: register an external catalog MCP with EVERY agent in the
 * project. Called from the OAuth callback so a fresh token reaches all
 * project agents without re-provisioning. Best-effort per agent — one
 * failed registration doesn't abort the rest.
 */
export async function registerCatalogMcpForProject(
  project_slug: string,
  catalog_key: string,
): Promise<InstallResult[]> {
  const agents = await listProjectAgents(project_slug);
  const results: InstallResult[] = [];
  for (const agent of agents) {
    results.push(
      await registerCatalogMcpForAgent(project_slug, catalog_key, agent.agent_id),
    );
  }
  return results;
}

