import { describe, expect, it } from "vitest";
import { PLAYBOOKS, findPlaybook, legacyUriFor } from "./index";

describe("playbooks registry", () => {
  it("publishes runScript-centric playbooks with notfair:// URIs", () => {
    expect(PLAYBOOKS.length).toBeGreaterThanOrEqual(2);
    for (const p of PLAYBOOKS) {
      expect(p.uri).toMatch(/^notfair:\/\/playbooks\//);
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
    expect(findPlaybook("notfair://playbooks/audit-account")?.name).toContain("Audit");
    expect(findPlaybook("notfair://playbooks/explain-regression")?.name).toContain("regression");
    expect(findPlaybook("notfair://playbooks/run-experiment")?.name).toContain("experiment");
  });

  it("findPlaybook returns undefined for an unknown URI", () => {
    expect(findPlaybook("notfair://playbooks/does-not-exist")).toBeUndefined();
  });

  it("findPlaybook resolves the legacy adsagent:// URI scheme for pre-v0.23.0 toprank clients", () => {
    for (const p of PLAYBOOKS) {
      expect(findPlaybook(legacyUriFor(p))).toBe(p);
    }
  });

  it("findPlaybook returns undefined for an unknown URI under the legacy scheme", () => {
    expect(findPlaybook("adsagent://playbooks/does-not-exist")).toBeUndefined();
  });

  it("legacyUriFor maps the canonical URI to the adsagent:// scheme", () => {
    for (const p of PLAYBOOKS) {
      const legacy = legacyUriFor(p);
      expect(legacy).toMatch(/^adsagent:\/\/playbooks\//);
      // Same slug on both sides of the rename.
      expect(legacy.replace("adsagent://playbooks/", "")).toBe(
        p.uri.replace("notfair://playbooks/", ""),
      );
    }
  });

  it("every playbook demonstrates the runScript + gaqlParallel pattern", () => {
    for (const p of PLAYBOOKS) {
      expect(p.content).toMatch(/ads\.gaqlParallel/);
    }
  });

  it("audit-account playbook teaches the wasted-spend threshold heuristic", () => {
    const p = findPlaybook("notfair://playbooks/audit-account")!;
    expect(p.content).toContain("accountCpa");
    expect(p.content).toContain("accountCpa * 2");
    expect(p.content).toContain("search_term_view");
    expect(p.content).toContain("change_event");
  });

  it("explain-regression playbook correlates timeseries + changes + waste", () => {
    const p = findPlaybook("notfair://playbooks/explain-regression")!;
    expect(p.content).toContain("segments.date");
    expect(p.content).toContain("ads.queries.changeEvents");
    expect(p.content).toContain("search_term_view");
  });

  it("playbooks use the canonical change_event query builder", () => {
    const joined = PLAYBOOKS.map((p) => p.content).join("\n");
    expect(joined).not.toContain("change_event.change_date_time DURING");
    expect(joined).not.toContain("change_event.resource_type");
    expect(joined).toContain("ads.queries.changeEvents");
  });

  it("run-experiment playbook lists the full lifecycle of write tools", () => {
    const p = findPlaybook("notfair://playbooks/run-experiment")!;
    // Mutating tools (write side)
    expect(p.content).toContain("createExperiment");
    expect(p.content).toContain("addExperimentArms");
    expect(p.content).toContain("scheduleExperiment");
    expect(p.content).toContain("listExperimentAsyncErrors");
    expect(p.content).toContain("endExperiment");
    expect(p.content).toContain("promoteExperiment");
    expect(p.content).toContain("graduateExperiment");
    // Read side via GAQL
    expect(p.content).toContain("FROM experiment");
    expect(p.content).toContain("FROM experiment_arm");
    expect(p.content).toContain("in_design_campaigns");
    // Decision rules covering stat-significance preconditions
    expect(p.content).toMatch(/14 days/);
    expect(p.content).toMatch(/30 conversions/);
  });

  it("run-experiment playbook documents the RSA-asset shortcut and the manual fallback", () => {
    const p = findPlaybook("notfair://playbooks/run-experiment")!;
    expect(p.content).toContain("createAdVariationExperiment");
    // Bundled shortcut surface
    expect(p.content).toContain("baseAdId");
    expect(p.content).toContain("trialAdId");
    expect(p.content).toContain("readyToSchedule");
    // Manual fallback for ambiguous-match cases — agents need to know how to find the trial RSA themselves
    expect(p.content).toContain("RESPONSIVE_SEARCH_AD");
    expect(p.content).toContain("ad_group_ad.ad.responsive_search_ad");
    // Atomicity warning is the most common foot-gun
    expect(p.content).toMatch(/RSA assets are atomic/);
    // Discourage the unverified AD_VARIATION enum value
    expect(p.content).toMatch(/no Google sample demonstrates it through/i);
  });

  it("every playbook description is under 300 chars so it fits in resources/list", () => {
    for (const p of PLAYBOOKS) {
      expect(p.description.length).toBeLessThanOrEqual(300);
    }
  });
});
