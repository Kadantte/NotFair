import { describe, expect, it } from "vitest";

import {
  SLASH_COMMANDS,
  executeLocalSlashCommand,
  filterSlashCommands,
  findCommand,
  parseSlashMessage,
} from "./slash-commands";

describe("filterSlashCommands", () => {
  it("returns the full catalog for an empty or bare-slash query", () => {
    expect(filterSlashCommands("")).toEqual(SLASH_COMMANDS);
    expect(filterSlashCommands("/")).toEqual(SLASH_COMMANDS);
  });

  it("prefix-matches first, with or without the leading slash", () => {
    expect(filterSlashCommands("/cl").map((c) => c.name)).toEqual(["clear"]);
    expect(filterSlashCommands("mo").map((c) => c.name)).toEqual(["model"]);
  });

  it("falls back to substring match when no prefix hits", () => {
    // "od" is not a prefix of anything but appears inside "model".
    expect(filterSlashCommands("/od").map((c) => c.name)).toEqual(["model"]);
  });

  it("returns nothing for a query matching no command", () => {
    expect(filterSlashCommands("/zzz")).toEqual([]);
  });
});

describe("parseSlashMessage", () => {
  it("returns null for plain messages", () => {
    expect(parseSlashMessage("hello")).toBeNull();
    expect(parseSlashMessage("  not / a command")).toBeNull();
  });

  it("splits command and args, trimming both ends", () => {
    expect(parseSlashMessage("/stop")).toEqual({ command: "stop", args: "" });
    expect(parseSlashMessage("  /model opus fast  ")).toEqual({
      command: "model",
      args: "opus fast",
    });
  });
});

describe("findCommand", () => {
  it("finds catalog commands by name and misses unknowns", () => {
    expect(findCommand("help")?.key).toBe("help");
    expect(findCommand("nope")).toBeUndefined();
  });
});

describe("executeLocalSlashCommand", () => {
  it("maps each catalog command to its local action", () => {
    expect(executeLocalSlashCommand("clear")).toEqual({ kind: "clear" });
    expect(executeLocalSlashCommand("stop")).toEqual({ kind: "stop" });
    expect(executeLocalSlashCommand("model", "  opus ")).toEqual({
      kind: "set-model",
      value: "opus",
    });
  });

  it("renders a help listing that names every command", () => {
    const action = executeLocalSlashCommand("help");
    expect(action?.kind).toBe("help");
    const content = (action as { kind: "help"; content: string }).content;
    for (const c of SLASH_COMMANDS) {
      expect(content).toContain(`/${c.name}`);
      expect(content).toContain(c.description);
    }
  });

  it("returns null for unknown commands so they pass through to the agent", () => {
    expect(executeLocalSlashCommand("compact")).toBeNull();
  });
});
