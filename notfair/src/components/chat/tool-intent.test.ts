import { Edit3, FileText, Globe, Terminal, Wrench } from "lucide-react";
import { describe, expect, it } from "vitest";

import {
  formatToolName,
  humanizeShellCommand,
  humanizeTool,
  iconForTool,
  looksLikeShellInvocation,
  matchMcpServerKey,
  shortenPathish,
} from "./tool-intent";

describe("formatToolName", () => {
  it("keeps only the action after nested namespace separators", () => {
    expect(formatToolName("mcp__NotFair-GoogleAds__createCampaign")).toBe(
      "createCampaign",
    );
    expect(formatToolName("notfair_demo__notfair_goals.propose_target")).toBe(
      "propose_target",
    );
    expect(formatToolName("runScript")).toBe("runScript");
    expect(formatToolName("")).toBe("");
  });
});

describe("looksLikeShellInvocation", () => {
  it("recognizes wrapper prefixes, binary paths, and metacharacters", () => {
    expect(looksLikeShellInvocation('bash -lc "ls -la"')).toBe(true);
    expect(looksLikeShellInvocation("/usr/bin/find . -name x")).toBe(true);
    expect(looksLikeShellInvocation("cat a.txt | grep foo")).toBe(true);
  });

  it("leaves tool identifiers and short tokens alone", () => {
    expect(looksLikeShellInvocation("runScript")).toBe(false);
    expect(looksLikeShellInvocation("ls")).toBe(false);
    expect(looksLikeShellInvocation("")).toBe(false);
  });
});

describe("humanizeShellCommand", () => {
  it("unwraps the bash -lc wrapper before mapping the verb", () => {
    expect(humanizeShellCommand(`/bin/zsh -lc 'git status --short'`)).toEqual({
      verb: "Ran git status",
    });
  });

  it("maps common leading binaries to verb phrases", () => {
    expect(humanizeShellCommand("pwd")).toEqual({ verb: "Checked working directory" });
    expect(humanizeShellCommand("ls src/lib")).toEqual({
      verb: "Listed files",
      target: "src/lib",
    });
    expect(humanizeShellCommand("find . -name '*.ts'")).toMatchObject({
      verb: "Searched the filesystem",
    });
    expect(humanizeShellCommand(`rg -n "needle" src`)).toEqual({
      verb: "Searched files",
      target: `"needle"`,
    });
    expect(humanizeShellCommand("cat package.json")).toEqual({
      verb: "Read file",
      target: "package.json",
    });
    expect(humanizeShellCommand("git")).toMatchObject({ verb: "Ran git" });
  });

  it("understands package-manager subcommands", () => {
    expect(humanizeShellCommand("pnpm test")).toEqual({ verb: "Ran tests" });
    expect(humanizeShellCommand("npm install left-pad")).toEqual({
      verb: "Installed packages",
    });
    expect(humanizeShellCommand("pnpm run build")).toEqual({ verb: "Ran pnpm build" });
    expect(humanizeShellCommand("pnpm run")).toEqual({ verb: "Ran pnpm" });
    expect(humanizeShellCommand("yarn why react")).toEqual({ verb: "Ran yarn why" });
    expect(humanizeShellCommand("bun")).toEqual({ verb: "Ran bun" });
  });

  it("covers scripts, network fetches, and file mutations", () => {
    expect(humanizeShellCommand("node scripts/seed.ts")).toEqual({
      verb: "Ran script",
      target: "scripts/seed.ts",
    });
    expect(humanizeShellCommand("curl -s https://example.com/api")).toEqual({
      verb: "Fetched URL",
      target: "https://example.com/api",
    });
    expect(humanizeShellCommand("mkdir -p out/dir")).toEqual({
      verb: "Created directory",
      target: "out/dir",
    });
    expect(humanizeShellCommand("touch a.txt")).toEqual({
      verb: "Created file",
      target: "a.txt",
    });
    expect(humanizeShellCommand("rm -rf build")).toEqual({
      verb: "Removed file(s)",
      target: "build",
    });
    expect(humanizeShellCommand("mv a b")).toEqual({ verb: "Moved file" });
    expect(humanizeShellCommand("cp a b")).toEqual({ verb: "Copied file" });
    expect(humanizeShellCommand("sed -i '' 's/a/b/' file.txt")).toMatchObject({
      verb: "Edited text",
    });
    expect(humanizeShellCommand("which node")).toEqual({
      verb: "Located binary",
      target: "node",
    });
    expect(humanizeShellCommand("echo hi")).toEqual({ verb: "Printed text" });
    expect(humanizeShellCommand("make build")).toEqual({ verb: "Ran make build" });
    expect(humanizeShellCommand("make")).toEqual({ verb: "Ran make" });
    expect(humanizeShellCommand("docker ps")).toEqual({ verb: "Ran docker ps" });
    expect(humanizeShellCommand("kubectl get pods")).toEqual({
      verb: "Ran kubectl get",
    });
    expect(humanizeShellCommand("gh pr list")).toEqual({ verb: "Ran gh pr" });
  });

  it("only reads the leading command of a pipeline", () => {
    expect(humanizeShellCommand("cat log.txt | tail -20")).toEqual({
      verb: "Read file",
      target: "log.txt",
    });
  });

  it("falls back to Ran <bin> with a truncated first line", () => {
    const long = `weirdtool ${"x".repeat(100)}`;
    const intent = humanizeShellCommand(long);
    expect(intent.verb).toBe("Ran weirdtool");
    expect(intent.target!.length).toBe(80);
    expect(intent.target!.endsWith("…")).toBe(true);
  });

  it("handles an empty command", () => {
    expect(humanizeShellCommand("")).toEqual({ verb: "Ran shell command" });
  });
});

describe("humanizeTool", () => {
  it("routes shell-flavored names through the shell humanizer", () => {
    expect(humanizeTool("Bash", "git diff --stat")).toEqual({ verb: "Ran git diff" });
    // Legacy rows: the command line stored as the NAME, label empty.
    expect(humanizeTool(`bash -lc "ls src"`, null)).toEqual({
      verb: "Listed files",
      target: "src",
    });
  });

  it("maps the built-in coding tools with pathish targets", () => {
    expect(humanizeTool("Read", "/Users/x/repo/src/lib/slug.ts")).toEqual({
      verb: "Read file",
      target: "…/lib/slug.ts",
    });
    expect(humanizeTool("write", "notes.md")).toEqual({
      verb: "Wrote file",
      target: "notes.md",
    });
    expect(humanizeTool("edit", null)).toEqual({ verb: "Edited file", target: undefined });
    expect(humanizeTool("patch", "a/b/c/d.ts")).toEqual({
      verb: "Edited file",
      target: "…/c/d.ts",
    });
    expect(humanizeTool("webfetch", "https://example.com")).toEqual({
      verb: "Fetched URL",
      target: "https://example.com",
    });
    expect(humanizeTool("websearch", "notfair pricing")).toEqual({
      verb: "Searched the web",
      target: "notfair pricing",
    });
  });

  it("speaks MCP verb-first action names in natural language", () => {
    expect(humanizeTool("mcp__X__getInsights", null).verb).toBe("Fetched insights");
    expect(humanizeTool("mcp__X__searchGeoTargets", null).verb).toBe(
      "Searched geo targets",
    );
    expect(humanizeTool("mcp__X__addKeyword", null).verb).toBe("Created keyword");
    expect(humanizeTool("mcp__X__deleteThing", null).verb).toBe("Removed thing");
    expect(humanizeTool("mcp__X__enableCampaign", null).verb).toBe("Enabled campaign");
    expect(humanizeTool("mcp__X__pauseAdGroup", null).verb).toBe("Paused ad group");
    expect(humanizeTool("mcp__X__resumeAd", null).verb).toBe("Resumed ad");
    expect(humanizeTool("mcp__X__renameCampaign", null).verb).toBe("Renamed campaign");
    expect(humanizeTool("mcp__X__proposeTarget", null).verb).toBe("Proposed target");
    expect(humanizeTool("mcp__X__logLearning", null).verb).toBe("Logged learning");
    expect(humanizeTool("mcp__X__reviewChangeImpact", null).verb).toBe(
      "Reviewed change impact",
    );
    expect(humanizeTool("mcp__X__registerMetric", null).verb).toBe("Registered metric");
    expect(humanizeTool("mcp__X__backfillHistory", null).verb).toBe(
      "Backfilled history",
    );
    expect(humanizeTool("mcp__X__verifyDefinition", null).verb).toBe(
      "Verified definition",
    );
    expect(humanizeTool("mcp__X__uploadClickConversions", null).verb).toBe(
      "Uploaded click conversions",
    );
    expect(humanizeTool("mcp__X__sendReport", null).verb).toBe("Sent report");
    expect(humanizeTool("mcp__X__list", null).verb).toBe("Listed records");
    expect(humanizeTool("mcp__X__get", null).verb).toBe("Fetched data");
    expect(humanizeTool("mcp__X__create", null).verb).toBe("Created a record");
    expect(humanizeTool("mcp__X__set", null).verb).toBe("Updated a record");
  });

  it("detects SQL-looking labels for exec-style tools", () => {
    expect(humanizeTool("mcp__X__exec", "SELECT 1")).toEqual({
      verb: "Ran a query",
      target: "SELECT 1",
    });
    // exec with a non-SQL label reads as a generic command.
    expect(humanizeTool("mcp__X__execute", "do the thing")).toEqual({
      verb: "Ran a command",
      target: "do the thing",
    });
    expect(humanizeTool("mcp__X__runScript", null).verb).toBe("Ran script");
  });

  it("falls back to Called <action> for unknown verbs", () => {
    expect(humanizeTool("mcp__X__frobnicateWidget", null).verb).toBe(
      "Called frobnicate widget",
    );
  });
});

describe("shortenPathish", () => {
  it("keeps short paths and URLs intact, compresses deep paths", () => {
    expect(shortenPathish("a/b")).toBe("a/b");
    expect(shortenPathish("https://example.com/a/b/c")).toBe(
      "https://example.com/a/b/c",
    );
    expect(shortenPathish("/very/deep/nested/file.ts")).toBe("…/nested/file.ts");
    expect(shortenPathish("")).toBe("");
  });
});

describe("matchMcpServerKey", () => {
  const catalog = [
    {
      key: "NotFair-GoogleAds",
      display_name: "Google Ads",
      resource_url: "https://notfair.co",
    },
  ];

  it("matches the Codex dotted shape with a namespaced server key", () => {
    expect(
      matchMcpServerKey("notfair_demo__notfair_googleads.runScript", catalog)
        ?.display_name,
    ).toBe("Google Ads");
    // Bare dotted server key too.
    expect(
      matchMcpServerKey("notfair-googleads.runScript", catalog)?.display_name,
    ).toBe("Google Ads");
  });

  it("returns null without a recognizable prefix or catalog", () => {
    expect(matchMcpServerKey("mcp__Unknown__tool", catalog)).toBeNull();
    expect(matchMcpServerKey("plainTool", catalog)).toBeNull();
    expect(matchMcpServerKey("", catalog)).toBeNull();
    expect(matchMcpServerKey("mcp__NotFair-GoogleAds__x", [])).toBeNull();
    expect(matchMcpServerKey("mcp__NotFair-GoogleAds__x", undefined)).toBeNull();
  });
});

describe("iconForTool", () => {
  it("picks the icon family by tool name", () => {
    expect(iconForTool("shell")).toBe(Terminal);
    expect(iconForTool("Bash")).toBe(Terminal);
    expect(iconForTool("read")).toBe(FileText);
    expect(iconForTool("edit")).toBe(Edit3);
    expect(iconForTool("webfetch")).toBe(Globe);
    expect(iconForTool("runScript")).toBe(Wrench);
  });
});
