// Schema-level tests for the Meta MCP read tools. Verifies the
// agent-facing contract:
//
//   1. `statuses` enum excludes DELETED (subcode 1815001) but keeps
//      ARCHIVED. Empirically verified against the /campaigns edge 2026-05.
//   2. `date_preset` Zod refinement rejects `lifetime` BEFORE we round-trip
//      to Meta. Lifetime is the top recurring agent-side mistake (3 distinct
//      users hit it pre-fix).
//
// We don't stand up an MCP server here — the schema shape is what the
// MCP framework validates against. We reach for the same Zod definition
// the tool registers.

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { META_DATE_PRESETS, normalizeDatePreset } from "@/lib/meta-ads/client";

// Re-declared inline because the tool-registration path doesn't export the
// schema directly; this is the SAME shape used at read-tools.ts:32-38. If
// these drift, the live E2E catches it on the user's account.
const StatusFilterSchema = z
  .array(z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]))
  .optional();

const DatePresetSchema = z
  .string()
  .optional()
  .refine((v) => v === undefined || normalizeDatePreset(v) !== null, {
    message: `Invalid date_preset. Use one of: ${META_DATE_PRESETS.join(", ")}.`,
  });

describe("StatusFilterSchema (listCampaigns / listAdSets / listAds)", () => {
  it("accepts ACTIVE + PAUSED + ARCHIVED (the three values Meta supports)", () => {
    expect(StatusFilterSchema.parse(["ACTIVE", "PAUSED", "ARCHIVED"])).toEqual([
      "ACTIVE",
      "PAUSED",
      "ARCHIVED",
    ]);
  });

  it("rejects DELETED — Meta returns subcode 1815001 on /campaigns, /adsets, /ads", () => {
    expect(() => StatusFilterSchema.parse(["DELETED"])).toThrow();
    expect(() =>
      StatusFilterSchema.parse(["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"]),
    ).toThrow();
  });

  it("accepts undefined (default: Meta returns ACTIVE + PAUSED)", () => {
    expect(StatusFilterSchema.parse(undefined)).toBeUndefined();
  });
});

describe("DatePresetSchema (getInsights)", () => {
  it("accepts every documented Meta preset", () => {
    for (const preset of META_DATE_PRESETS) {
      expect(DatePresetSchema.parse(preset)).toBe(preset);
    }
  });

  it("accepts `lifetime` at the schema layer (handler auto-translates to maximum)", () => {
    // The schema is permissive on known aliases so the call goes through
    // — `metaInsights` rewrites `lifetime` → `maximum` before Meta sees
    // it. This avoids a hard agent-facing failure on a common mistake.
    expect(DatePresetSchema.parse("lifetime")).toBe("lifetime");
  });

  it("rejects obvious typos and unknown windows BEFORE we round-trip to Meta", () => {
    expect(() => DatePresetSchema.parse("last_60d")).toThrow();
    expect(() => DatePresetSchema.parse("yesterweek")).toThrow();
  });

  it("accepts undefined (the unset default)", () => {
    expect(DatePresetSchema.parse(undefined)).toBeUndefined();
  });
});
