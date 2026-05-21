import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("MCP feedback migration and scripts", () => {
  it("keeps the internal feedback table private from Supabase Data API roles", () => {
    const sql = readRepoFile("drizzle/0045_add_mcp_tool_feedback.sql");

    expect(sql).toMatch(/ALTER TABLE\s+"mcp_tool_feedback"\s+ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE\s+"mcp_tool_feedback"\s+FROM\s+anon,\s*authenticated/i);
    expect(sql).toMatch(/REVOKE ALL ON SEQUENCE\s+"mcp_tool_feedback_id_seq"\s+FROM\s+anon,\s*authenticated/i);
  });

  it("exposes a one-shot apply script for the manual post-0029 migration path", () => {
    const packageJson = JSON.parse(readRepoFile("package.json")) as { scripts: Record<string, string> };
    expect(packageJson.scripts["db:apply-0045-mcp-tool-feedback"]).toBe(
      "tsx scripts/apply-migration-0045-mcp-tool-feedback.ts",
    );
  });

  it("runs the triage script through pnpm-managed tsx instead of npx", () => {
    const packageJson = JSON.parse(readRepoFile("package.json")) as { scripts: Record<string, string> };
    expect(packageJson.scripts["mcp-feedback:triage"]).toBe("tsx scripts/triage-mcp-feedback.ts");
  });

  it("processes queued feedback oldest-first to avoid starving old rows", () => {
    const script = readRepoFile("scripts/triage-mcp-feedback.ts");
    expect(script).toContain('import { asc, eq } from "drizzle-orm"');
    expect(script).toContain(".orderBy(asc(schema.mcpToolFeedback.createdAt))");
    expect(script).not.toContain(".orderBy(desc(schema.mcpToolFeedback.createdAt))");
  });
});
