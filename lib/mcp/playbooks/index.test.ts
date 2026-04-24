import { describe, expect, it } from "vitest";
import { PLAYBOOKS, findPlaybook } from "./index";

describe("playbooks registry", () => {
  it("publishes runScript-centric playbooks with adsagent:// URIs", () => {
    expect(PLAYBOOKS.length).toBeGreaterThanOrEqual(2);
    for (const p of PLAYBOOKS) {
      expect(p.uri).toMatch(/^adsagent:\/\/playbooks\//);
    }
  });

  it("every playbook has a non-empty name, description, and content", () => {
    for (const p of PLAYBOOKS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.content.length).toBeGreaterThan(500);
    }
  });

  it("URIs are unique", () => {
    const uris = PLAYBOOKS.map((p) => p.uri);
    expect(new Set(uris).size).toBe(uris.length);
  });

  it("findPlaybook returns the right playbook by URI", () => {
    expect(findPlaybook("adsagent://playbooks/audit-account")?.name).toContain("Audit");
    expect(findPlaybook("adsagent://playbooks/explain-regression")?.name).toContain("regression");
  });

  it("findPlaybook returns undefined for an unknown URI", () => {
    expect(findPlaybook("adsagent://playbooks/does-not-exist")).toBeUndefined();
  });

  it("every playbook demonstrates the runScript + gaqlParallel pattern", () => {
    for (const p of PLAYBOOKS) {
      expect(p.content).toMatch(/ads\.gaqlParallel/);
    }
  });

  it("audit-account playbook teaches the wasted-spend threshold heuristic", () => {
    const p = findPlaybook("adsagent://playbooks/audit-account")!;
    expect(p.content).toContain("accountCpa");
    expect(p.content).toContain("accountCpa * 2");
    expect(p.content).toContain("search_term_view");
    expect(p.content).toContain("change_event");
  });

  it("explain-regression playbook correlates timeseries + changes + waste", () => {
    const p = findPlaybook("adsagent://playbooks/explain-regression")!;
    expect(p.content).toContain("segments.date");
    expect(p.content).toContain("change_event");
    expect(p.content).toContain("search_term_view");
  });

  it("every playbook description is under 300 chars so it fits in resources/list", () => {
    for (const p of PLAYBOOKS) {
      expect(p.description.length).toBeLessThanOrEqual(300);
    }
  });
});
