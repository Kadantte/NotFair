import { describe, expect, it } from "vitest";
import { buildXSignupConversionId } from "../x-signup";

describe("x signup helpers", () => {
  it("builds a stable non-PII signup conversion id", () => {
    expect(buildXSignupConversionId("user-123")).toMatch(/^signup-[a-f0-9]{32}$/);
    expect(buildXSignupConversionId("user-123")).toBe(buildXSignupConversionId("user-123"));
    expect(buildXSignupConversionId("user-123")).not.toContain("user-123");
  });
});
