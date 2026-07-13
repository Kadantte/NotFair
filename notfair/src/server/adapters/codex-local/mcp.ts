import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { McpRegistrationSpec } from "../types";

/**
 * Project-scoped MCP wiring for Codex.
 *
 * Codex reads MCP servers from `~/.codex/config.toml` — a single global file
 * shared across every project and agent on the machine. MCP tokens in
 * NotFair are project-scoped (one (project, server) pair → one bearer
 * shared by every agent in the project), so we namespace by project slug:
 * `notfair_<projectSlug>__<serverName>`. Every agent in the same project
 * sees the same entry; sibling projects don't duplicate.
 *
 * Earlier versions namespaced by agent id, which produced N entries per
 * project (one per agent) and let agents see each other's prefixes when
 * Codex enumerated the global config. Per-project namespacing collapses
 * that to one entry per project per server.
 *
 * Cross-project visibility in the global config is a residual: an agent in
 * project A can still see `notfair_B__*` headers because Codex reads the
 * whole file. Fully isolating that would require pointing CODEX_HOME at a
 * per-project path, which would also break the user's `~/.codex/auth.json`
 * login. Left as a future change.
 *
 * We rewrite the [mcp_servers.*] sections under our namespace prefix; we
 * never touch user-installed servers outside our prefix.
 */
export function codexConfigDir(): string {
  return process.env.CODEX_HOME?.trim() || join(homedir(), ".codex");
}

function codexConfigPath(): string {
  return join(codexConfigDir(), "config.toml");
}

const NOTFAIR_NS = "notfair_";

function namespaced(serverName: string, projectSlug: string): string {
  return `${NOTFAIR_NS}${projectSlug.replace(/-/g, "_")}__${serverName.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

async function readConfig(): Promise<string> {
  const path = codexConfigPath();
  if (!existsSync(path)) return "";
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function stripSection(toml: string, sectionHeader: string): string {
  // Remove a [mcp_servers."x"] block plus its key/value lines until the next
  // section header or EOF. Best-effort regex — codex's TOML is well-formed
  // and we only ever write what we wrote.
  const re = new RegExp(
    `\\n*\\[${escapeRe(sectionHeader)}\\][\\s\\S]*?(?=\\n\\[|\\n*$)`,
    "g",
  );
  return toml.replace(re, "");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Each codex MCP registration gets its OWN env var name carrying its
 * bearer. Encodes the server name into the env so different MCPs in the
 * same agent's config (goals, Google Ads, GSC, ...) can carry
 * different bearers. The spawn site (execute.ts) iterates the project's
 * `mcp_tokens` table + the internal-server secret and injects matching
 * env vars before invoking codex.
 *
 * Why env vars and not literal headers: codex 0.132+ marks raw
 * `headers = { Authorization = "Bearer ..." }` rows as Auth: Unsupported
 * and refuses to expose those MCP tools. The `bearer_token_env_var`
 * path is the documented way.
 */
export function bearerEnvVarForServer(serverName: string): string {
  const safe = serverName.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
  return `NOTFAIR_MCP_BEARER__${safe}`;
}

function renderServer(spec: McpRegistrationSpec): string {
  const header = `[mcp_servers.${namespaced(spec.serverName, spec.projectSlug)}]`;
  if (spec.transport.type === "stdio") {
    const lines = [
      header,
      `command = ${JSON.stringify(spec.transport.command)}`,
      `args = ${JSON.stringify(spec.transport.args)}`,
    ];
    if (spec.transport.env) {
      lines.push(`env = ${tomlInlineTable(spec.transport.env)}`);
    }
    return lines.join("\n") + "\n";
  }
  const lines = [header, `url = ${JSON.stringify(spec.transport.url)}`];
  const rawAuth =
    spec.transport.headers?.Authorization ??
    spec.transport.headers?.authorization;
  if (rawAuth) {
    lines.push(
      `bearer_token_env_var = ${JSON.stringify(bearerEnvVarForServer(spec.serverName))}`,
    );
  }
  const otherHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(spec.transport.headers ?? {})) {
    if (k.toLowerCase() !== "authorization") otherHeaders[k] = v;
  }
  if (Object.keys(otherHeaders).length > 0) {
    lines.push(`headers = ${tomlInlineTable(otherHeaders)}`);
  }
  return lines.join("\n") + "\n";
}

function tomlInlineTable(record: Record<string, string>): string {
  const parts = Object.entries(record).map(
    ([k, v]) => `${k} = ${JSON.stringify(v)}`,
  );
  return `{ ${parts.join(", ")} }`;
}

export async function registerCodexMcp(spec: McpRegistrationSpec): Promise<void> {
  await mkdir(codexConfigDir(), { recursive: true });
  let toml = await readConfig();
  toml = stripSection(toml, `mcp_servers.${namespaced(spec.serverName, spec.projectSlug)}`);
  toml = toml.trimEnd() + "\n\n" + renderServer(spec);
  await writeFile(codexConfigPath(), toml.trimStart(), "utf8");
}

export async function unregisterCodexMcp(
  serverName: string,
  projectSlug: string,
): Promise<void> {
  let toml = await readConfig();
  if (!toml) return;
  toml = stripSection(toml, `mcp_servers.${namespaced(serverName, projectSlug)}`);
  await writeFile(codexConfigPath(), toml.trimStart(), "utf8");
}

