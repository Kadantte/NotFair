import { describe, expect, it } from "vitest";
import { PLAYBOOKS, findPlaybook } from "./index";

describe("playbooks registry", () => {
  it("publishes all four playbooks with adsagent:// URIs", () => {
    expect(PLAYBOOKS).toHaveLength(4);
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
    expect(findPlaybook("adsagent://playbooks/build-daily-dashboard")?.name).toContain(
      "daily Google Ads dashboard",
    );
    expect(findPlaybook("adsagent://playbooks/explain-regression")?.name).toContain(
      "regression",
    );
  });

  it("findPlaybook returns undefined for an unknown URI", () => {
    expect(findPlaybook("adsagent://playbooks/does-not-exist")).toBeUndefined();
  });

  it("build-daily-dashboard references the Phase 4 view tools (not audit)", () => {
    const p = findPlaybook("adsagent://playbooks/build-daily-dashboard")!;
    expect(p.content).toContain("getWasteFindings");
    expect(p.content).toContain("getAccountChanges");
    expect(p.content).toContain("getTimeseries");
    // The "don't over-call" section should warn against the monolith
    expect(p.content).toMatch(/Do \*\*not\*\* call.*audit/);
  });

  it("explain-regression composes timeseries + changes + waste", () => {
    const p = findPlaybook("adsagent://playbooks/explain-regression")!;
    expect(p.content).toContain("getTimeseries");
    expect(p.content).toContain("getAccountChanges");
    expect(p.content).toContain("getWasteFindings");
  });

  it("drill-down tells Claude to check recentChange before recommending a pause", () => {
    const p = findPlaybook("adsagent://playbooks/drill-down")!;
    expect(p.content).toContain("recentChange");
  });

  it("customize-dashboard maps common user phrases to tool calls", () => {
    const p = findPlaybook("adsagent://playbooks/customize-dashboard")!;
    expect(p.content).toContain("granularity");
    expect(p.content).toContain("campaignIds");
    expect(p.content).toContain("comparePreviousPeriod");
  });

  it("every playbook description is under 300 chars so it fits in resources/list", () => {
    for (const p of PLAYBOOKS) {
      expect(p.description.length).toBeLessThanOrEqual(300);
    }
  });
});
