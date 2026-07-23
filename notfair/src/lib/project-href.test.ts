import { describe, expect, it } from "vitest";

import { projectHref, subPathFromPathname } from "./project-href";

describe("projectHref", () => {
  it("returns the project root for an empty or slash path", () => {
    expect(projectHref("demo")).toBe("/demo");
    expect(projectHref("demo", "")).toBe("/demo");
    expect(projectHref("demo", "/")).toBe("/demo");
  });

  it("prefixes the slug regardless of leading-slash style", () => {
    expect(projectHref("demo", "goals/goal-1")).toBe("/demo/goals/goal-1");
    expect(projectHref("demo", "/goals/goal-1")).toBe("/demo/goals/goal-1");
  });

  it("throws when the slug is missing", () => {
    expect(() => projectHref("", "goals")).toThrow("slug is required");
  });
});

describe("subPathFromPathname", () => {
  it("returns empty for the project home", () => {
    expect(subPathFromPathname("/demo", "demo")).toBe("");
  });

  it("strips the current slug and keeps the leading slash", () => {
    expect(subPathFromPathname("/demo/connections", "demo")).toBe("/connections");
    expect(subPathFromPathname("/demo/goals/goal-1", "demo")).toBe("/goals/goal-1");
  });

  it("returns empty when the pathname belongs to a different project", () => {
    expect(subPathFromPathname("/other/connections", "demo")).toBe("");
    // Prefix must be a full segment — "/demofoo" is not project "demo".
    expect(subPathFromPathname("/demofoo/x", "demo")).toBe("");
  });

  it("returns empty on missing inputs", () => {
    expect(subPathFromPathname(null, "demo")).toBe("");
    expect(subPathFromPathname("/demo/x", undefined)).toBe("");
  });
});
