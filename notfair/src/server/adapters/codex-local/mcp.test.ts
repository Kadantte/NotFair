import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { McpRegistrationSpec } from "../types";
import {
  bearerEnvVarForServer,
  codexConfigDir,
  registerCodexMcp,
  unregisterCodexMcp,
} from "./mcp";

const originalCodexHome = process.env.CODEX_HOME;
let codexHome: string;

beforeEach(async () => {
  codexHome = await mkdtemp(join(tmpdir(), "notfair-codex-home-"));
  process.env.CODEX_HOME = codexHome;
});

afterAll(() => {
  if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = originalCodexHome;
});

function spec(overrides: Partial<McpRegistrationSpec> = {}): McpRegistrationSpec {
  return {
    serverName: "notfair-goals",
    agentId: "agent-1",
    projectSlug: "my-proj",
    transport: {
      type: "http",
      url: "http://127.0.0.1:3326/api/mcp/goals",
      headers: { Authorization: "Bearer s3cret" },
    },
    ...overrides,
  };
}

async function readToml(): Promise<string> {
  return readFile(join(codexHome, "config.toml"), "utf8");
}

describe("codexConfigDir", () => {
  it("honors CODEX_HOME", () => {
    expect(codexConfigDir()).toBe(codexHome);
  });
});

describe("bearerEnvVarForServer", () => {
  it("uppercases and sanitizes the server name", () => {
    expect(bearerEnvVarForServer("notfair-goals")).toBe(
      "NOTFAIR_MCP_BEARER__NOTFAIR_GOALS",
    );
    expect(bearerEnvVarForServer("gsc.v2")).toBe("NOTFAIR_MCP_BEARER__GSC_V2");
  });
});

describe("registerCodexMcp", () => {
  it("writes a project-namespaced http section with bearer_token_env_var, never a raw Authorization header", async () => {
    await registerCodexMcp(spec());
    const toml = await readToml();
    expect(toml).toContain("[mcp_servers.notfair_my_proj__notfair_goals]");
    expect(toml).toContain('url = "http://127.0.0.1:3326/api/mcp/goals"');
    expect(toml).toContain(
      'bearer_token_env_var = "NOTFAIR_MCP_BEARER__NOTFAIR_GOALS"',
    );
    expect(toml).not.toContain("s3cret");
    expect(toml).not.toContain("Authorization");
  });

  it("keeps non-auth headers as a TOML inline table", async () => {
    await registerCodexMcp(
      spec({
        transport: {
          type: "http",
          url: "http://x",
          headers: { authorization: "Bearer t", "X-Notfair": "yes" },
        },
      }),
    );
    const toml = await readToml();
    expect(toml).toContain('headers = { X-Notfair = "yes" }');
    expect(toml).toContain("bearer_token_env_var");
  });

  it("omits bearer wiring when the transport has no auth header", async () => {
    await registerCodexMcp(
      spec({ transport: { type: "http", url: "http://x" } }),
    );
    expect(await readToml()).not.toContain("bearer_token_env_var");
  });

  it("writes stdio sections with command, args and env", async () => {
    await registerCodexMcp(
      spec({
        serverName: "local-tool",
        transport: {
          type: "stdio",
          command: "node",
          args: ["server.js", "--flag"],
          env: { TOKEN: "t" },
        },
      }),
    );
    const toml = await readToml();
    expect(toml).toContain("[mcp_servers.notfair_my_proj__local_tool]");
    expect(toml).toContain('command = "node"');
    expect(toml).toContain('args = ["server.js","--flag"]');
    expect(toml).toContain('env = { TOKEN = "t" }');
  });

  it("replaces an existing section instead of duplicating it on re-register", async () => {
    await registerCodexMcp(spec());
    await registerCodexMcp(
      spec({ transport: { type: "http", url: "http://new-url" } }),
    );
    const toml = await readToml();
    const headers = toml.match(/\[mcp_servers\.notfair_my_proj__notfair_goals\]/g);
    expect(headers).toHaveLength(1);
    expect(toml).toContain('url = "http://new-url"');
    expect(toml).not.toContain("api/mcp/goals");
  });

  it("preserves user-installed servers outside the notfair namespace", async () => {
    await writeFile(
      join(codexHome, "config.toml"),
      'model = "gpt-5.5"\n\n[mcp_servers.user_tool]\ncommand = "mine"\n',
      "utf8",
    );
    await registerCodexMcp(spec());
    const toml = await readToml();
    expect(toml).toContain('model = "gpt-5.5"');
    expect(toml).toContain("[mcp_servers.user_tool]");
    expect(toml).toContain('command = "mine"');
    expect(toml).toContain("[mcp_servers.notfair_my_proj__notfair_goals]");
  });
});

describe("unregisterCodexMcp", () => {
  it("removes only our namespaced section", async () => {
    await writeFile(
      join(codexHome, "config.toml"),
      '[mcp_servers.user_tool]\ncommand = "mine"\n',
      "utf8",
    );
    await registerCodexMcp(spec());
    await unregisterCodexMcp("notfair-goals", "my-proj");
    const toml = await readToml();
    expect(toml).not.toContain("notfair_my_proj__notfair_goals");
    expect(toml).toContain("[mcp_servers.user_tool]");
  });

  it("is a no-op when there is no config file", async () => {
    await unregisterCodexMcp("notfair-goals", "my-proj");
    expect(existsSync(join(codexHome, "config.toml"))).toBe(false);
  });
});
