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

  it("accepts the current feedback queue lifecycle statuses", () => {
    const sql = readRepoFile("drizzle/0045_add_mcp_tool_feedback.sql");
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS\s+"mcp_tool_feedback_status_check"/i);
    expect(sql).toMatch(/UPDATE\s+"mcp_tool_feedback"\s+SET\s+"status"\s+=\s+CASE\s+"status"/i);
    expect(sql).toContain("WHEN 'open' THEN 'new'");
    expect(sql).toContain("WHEN 'in_progress' THEN 'triaged'");
    expect(sql).toContain("WHEN 'shipped' THEN 'fixed'");
    expect(sql.indexOf("UPDATE \"mcp_tool_feedback\"")).toBeLessThan(sql.indexOf("ADD CONSTRAINT \"mcp_tool_feedback_status_check\""));
    expect(sql).toMatch(/ADD CONSTRAINT\s+"mcp_tool_feedback_status_check"/i);
    for (const status of [
      "new",
      "triaged",
      "issue_opened",
      "pr_opened",
      "fixed",
      "closed",
      "wontfix",
      "needs_info",
    ]) {
      expect(sql).toContain(`'${status}'`);
    }
  });
});
