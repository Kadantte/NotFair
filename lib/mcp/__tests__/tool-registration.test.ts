/**
 * Level-1 MCP integration tests — tool-handler layer.
 *
 * Exercises the full chain from `server.registerTool` → Zod input validation
 * → handler → `typedResult` / `errorResult` shape. The underlying
 * `google-ads-api` client is stubbed (same pattern as
 * `__tests__/all-tools-proto-validation.test.ts`); `@/lib/tools/execute`
 * is replaced with pass-throughs so rate-limiting, change-logging, and
 * analytics don't touch the DB during tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Module mocks (must be set before the modules that import them) ──

const mockQuery = vi.fn();
const mockMutateResources = vi.fn();
const mockCustomer = {
  query: mockQuery,
  mutateResources: mockMutateResources,
};

vi.mock("google-ads-api", () => ({
  GoogleAdsApi: class {
    Customer() {
      return mockCustomer;
    }
  },
  enums: {},
  resources: {},
  services: {},
}));

vi.mock("@/lib/env", () => ({
  getRequiredEnv: vi.fn().mockReturnValue("mock-value"),
  getEnv: vi.fn().mockReturnValue(undefined),
}));

// Short-circuit the shared execution path. The real `execRead`/`execWrite`
// enforce rate limits and log to Postgres; during tests we want the handler
// chain exercised but not the persistence side effects.
vi.mock("@/lib/tools/execute", () => ({
  execRead: vi.fn(async (_auth, _accountId, _toolName, fn) => fn()),
  execWrite: vi.fn(async (_auth, _accountId, _campaignId, fn) => {
    const result = await fn();
    return { ...result, changeId: 1 };
  }),
}));

// ─── Imports that depend on the mocks above ─────────────────────────

import { registerReadTools } from "../read-tools";
import { registerWriteTools } from "../write-tools";
import { clearCache } from "@/lib/google-ads";
import { buildHarness, TEST_AUTH, expectOk, expectError } from "./harness";

// ─── Shared setup ────────────────────────────────────────────────────

function resetMocks() {
  mockQuery.mockReset();
  mockMutateResources.mockReset();
  mockQuery.mockResolvedValue([]);
  mockMutateResources.mockResolvedValue({ mutate_operation_responses: [] });
  // `getCachedCustomer` memoises GAQL responses by (userId, customerId, query).
  // Tests reuse TEST_AUTH so every call collides on the same cache key — clear
  // between tests so `mockQuery` is actually reached each time.
  clearCache();
}

describe("MCP read tools — registration", () => {
  beforeEach(resetMocks);

  it("registers the narrow specialized-read surface", () => {
    const harness = buildHarness([registerReadTools], TEST_AUTH);
    const names = harness.listToolNames();
    // The surface deliberately stays small — only non-GAQL specialized tools
    // live here, everything else is covered by `runScript`.
    expect(names).toContain("searchGeoTargets");
    expect(names).toContain("getRecommendations");
    expect(names).toContain("getChanges");
    expect(names).toContain("reviewChangeImpact");
    expect(names).toContain("getResourceMetadata");
    expect(names).toContain("listQueryableResources");
    expect(names).toContain("getKeywordIdeas");
  });

  it("every registered read tool declares readOnlyHint = true", () => {
    const harness = buildHarness([registerReadTools], TEST_AUTH);
    for (const tool of harness.tools.values()) {
      expect(tool.annotations?.readOnlyHint, `${tool.name} is missing readOnlyHint`).toBe(true);
    }
  });

  it("every registered read tool description stays within the known connector limit", () => {
    // Claude's MCP connector silently drops tools with oversized descriptions
    // (commit 4109ce5 — 4.8KB `runScript` description caused "no tools
    // available"). The exact cap isn't documented; empirically ~2KB is fine
    // and ~4.8KB is rejected. Set the guardrail at 4000 chars so future
    // prose blowouts fail loud before users lose the tool.
    const MAX_DESCRIPTION_CHARS = 4000;
    const harness = buildHarness([registerReadTools], TEST_AUTH);
    for (const tool of harness.tools.values()) {
      expect(
        tool.description.length,
        `${tool.name} description is ${tool.description.length} chars`,
      ).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
    }
  });
});

describe("MCP read tools — handler execution", () => {
  beforeEach(resetMocks);

  it("getRecommendations wraps object results as structuredContent", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        recommendation: {
          type: "KEYWORD",
          campaign: "customers/1234567890/campaigns/999",
          dismissed: false,
        },
      },
    ]);

    const harness = buildHarness([registerReadTools], TEST_AUTH);
    const result = await harness.callTool("getRecommendations", {});
    const structured = expectOk(result);

    expect(structured).toHaveProperty("recommendations");
    expect(Array.isArray(structured.recommendations)).toBe(true);
    expect((structured.recommendations as unknown[])[0]).toMatchObject({
      type: "KEYWORD",
      campaignId: "999",
    });
  });

  it("applies Zod defaults declared in the input schema", async () => {
    const harness = buildHarness([registerReadTools], TEST_AUTH);
    // reviewChangeImpact declares `days` default 7, `limit` default 50.
    // Omitting them should not throw — harness runs Zod .parse() like the SDK.
    await expect(harness.callTool("reviewChangeImpact", {})).resolves.toBeDefined();
  });

  it("rejects invalid input at the Zod boundary", async () => {
    const harness = buildHarness([registerReadTools], TEST_AUTH);
    // getKeywordIdeas.keywords is z.array(z.string()).min(1) — passing a
    // string instead of an array should throw during validation, before
    // the handler runs.
    await expect(
      harness.callTool("getKeywordIdeas", { keywords: "not-an-array" }),
    ).rejects.toThrow();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("surfaces unknown account errors as typed error responses, not thrown exceptions", async () => {
    const harness = buildHarness([registerReadTools], TEST_AUTH);
    const result = await harness.callTool("getRecommendations", { accountId: "9999999999" });
    const text = expectError(result);
    expect(text).toMatch(/not connected to this session/i);
    expect(text).toContain("listConnectedAccounts");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("routes calls to the account selected via accountId", async () => {
    const multiAccountAuth = {
      ...TEST_AUTH,
      customerIds: [
        { id: "1111111111", name: "Primary" },
        { id: "2222222222", name: "Secondary" },
      ],
    };
    mockQuery.mockResolvedValueOnce([]);
    const harness = buildHarness([registerReadTools], multiAccountAuth);
    await harness.callTool("getRecommendations", { accountId: "2222222222" });
    // The real `customer` object is our stub, so we can't assert on
    // per-account instances directly — but the call must have reached the
    // query stub without throwing the "not connected" error.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("getRecommendations gracefully handles API failures", async () => {
    // getRecommendations catches errors internally and returns { recommendations: [], error }
    // because the Recommendations API isn't enabled on every account.
    mockQuery.mockRejectedValueOnce(new Error("SIMULATED_API_FAILURE"));
    const harness = buildHarness([registerReadTools], TEST_AUTH);
    const result = await harness.callTool("getRecommendations", {});
    const structured = expectOk(result);
    expect(structured).toMatchObject({ recommendations: [] });
    expect(structured.error).toContain("SIMULATED_API_FAILURE");
  });
});

describe("MCP write tools — smoke", () => {
  beforeEach(resetMocks);

  it("pauseKeyword flows through execWrite and returns a WriteResult with changeId", async () => {
    // pauseKeyword first queries sibling criteria to compute blast radius
    // (refuses to pause the sole active keyword), then issues a mutate.
    // Return 2 active criteria so totalActive > 1.
    mockQuery.mockResolvedValueOnce([
      { ad_group_criterion: { criterion_id: "222", keyword: { text: "blue widgets" } } },
      { ad_group_criterion: { criterion_id: "333", keyword: { text: "red widgets" } } },
    ]);
    mockMutateResources.mockResolvedValueOnce({
      mutate_operation_responses: [
        { ad_group_criterion_result: { resource_name: "customers/1/adGroupCriteria/111~222" } },
      ],
    });

    const harness = buildHarness([registerReadTools, registerWriteTools], TEST_AUTH);
    const result = await harness.callTool("pauseKeyword", {
      campaignId: "100",
      adGroupId: "111",
      criterionId: "222",
    });
    const structured = expectOk(result);
    expect(structured).toMatchObject({
      success: true,
      action: "pause_keyword",
      entityId: "222",
      changeId: 1,
    });
    expect(mockMutateResources).toHaveBeenCalledTimes(1);
  });
});
