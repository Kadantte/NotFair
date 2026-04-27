/**
 * Live integration tests for read-only MCP tools.
 *
 * Unlike the rest of the suite, these hit a running dev server over real HTTP
 * with a real bearer token, so they exercise the full request → Google Ads
 * API → response parsing path. They catch a class of bugs invisible to the
 * mocked tests — e.g. response-shape drift in the google-ads-api lib (the
 * getKeywordIdeas gax-tuple unwrap bug) or numeric-enum-vs-name mismatches
 * (getRecommendations).
 *
 * Opt-in. Skipped when MCP_TEST_BEARER_TOKEN is unset, so the default
 * `pnpm test` run stays hermetic.
 *
 * To run:
 *   1. Start the dev server in another terminal: `pnpm dev`
 *   2. Run: `MCP_TEST_BEARER_TOKEN=<your-mcp-token> pnpm test:live`
 *
 * Optional env:
 *   - MCP_TEST_BASE_URL (default: http://localhost:3000)
 *
 * Writes are NOT covered — they would mutate the live Google Ads account.
 * See docs/audit notes for the validate_only harness proposal that would
 * close that gap.
 */

import { beforeAll, describe, expect, it } from "vitest";

const BEARER = process.env.MCP_TEST_BEARER_TOKEN ?? "";
const BASE_URL = process.env.MCP_TEST_BASE_URL ?? "http://localhost:3000";
const MCP_URL = `${BASE_URL}/api/mcp`;

type McpCallResult = {
  isError: boolean;
  text: string;
  parsed: any;
};

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<McpCallResult> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  };
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BEARER}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`MCP HTTP ${res.status}: ${await res.text()}`);
  }
  const raw = await res.text();
  // Streamable HTTP transport returns SSE — peel the first `data: …` line.
  const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
  if (!dataLine) throw new Error(`No SSE data line in response: ${raw.slice(0, 200)}`);
  const envelope = JSON.parse(dataLine.slice(6));
  const result = envelope.result ?? {};
  const text = result.content?.[0]?.text ?? "";
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Some responses may not be JSON (rare for typed reads).
  }
  return { isError: !!result.isError, text, parsed };
}

describe.skipIf(!BEARER)("MCP live read-only tools", () => {
  beforeAll(async () => {
    // Pre-flight: confirm the dev server is up before running 11 tool calls
    // that would otherwise time out one-by-one with a confusing trace.
    try {
      const ping = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (!ping.ok) {
        throw new Error(`/api/health returned ${ping.status}`);
      }
    } catch (err) {
      throw new Error(
        `Dev server not reachable at ${BASE_URL}. Start it with \`pnpm dev\` in another terminal. ` +
          `Underlying error: ${(err as Error).message}`,
      );
    }
  });

  it("listConnectedAccounts returns at least one account", async () => {
    const { isError, parsed } = await callTool("listConnectedAccounts");
    expect(isError).toBe(false);
    expect(Array.isArray(parsed.accounts)).toBe(true);
    expect(parsed.accounts.length).toBeGreaterThan(0);
    expect(typeof parsed.defaultAccountId).toBe("string");
  });

  it("searchGeoTargets resolves a country query", async () => {
    const { isError, parsed } = await callTool("searchGeoTargets", {
      query: "United States",
      countryCode: "US",
    });
    expect(isError).toBe(false);
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.results.length).toBeGreaterThan(0);
    // Each result should have an id and name — proves we parsed the proto reply.
    const first = parsed.results[0];
    expect(typeof first.id).toBe("string");
    expect(first.id).not.toBe("");
  });

  it("listQueryableResources returns the GAQL resource catalog", async () => {
    const { isError, parsed } = await callTool("listQueryableResources");
    expect(isError).toBe(false);
    expect(Array.isArray(parsed.resources)).toBe(true);
    // The GAQL surface has 100+ resources; sanity-check we're not getting an empty list.
    expect(parsed.resources.length).toBeGreaterThan(50);
  });

  it("getResourceMetadata returns fields for a known resource", async () => {
    const { isError, parsed } = await callTool("getResourceMetadata", {
      resourceName: "campaign",
    });
    expect(isError).toBe(false);
    expect(Array.isArray(parsed.fields)).toBe(true);
    expect(parsed.fields.length).toBeGreaterThan(0);
  });

  it("listKeywords returns a keyword inventory shape", async () => {
    const { isError, parsed } = await callTool("listKeywords", { limit: 3 });
    expect(isError).toBe(false);
    expect(Array.isArray(parsed.keywords)).toBe(true);
    // Don't assert non-empty — a fresh account may have no keywords.
  });

  it("getRecommendations returns named enum types, not numeric strings", async () => {
    const { isError, parsed } = await callTool("getRecommendations");
    expect(isError).toBe(false);
    expect(Array.isArray(parsed.recommendations)).toBe(true);
    // Regression guard for the enum-stringify bug: if any recs come back, every
    // `type` must be an UPPER_SNAKE_CASE name, not a numeric string like "8".
    for (const rec of parsed.recommendations) {
      expect(rec.type).toMatch(/^[A-Z_]+$/);
      expect(rec.type).not.toMatch(/^\d+$/);
    }
  });

  it("getChanges returns the change-log shape", async () => {
    const { isError, parsed } = await callTool("getChanges", { limit: 3 });
    expect(isError).toBe(false);
    expect(Array.isArray(parsed.items)).toBe(true);
    expect(typeof parsed.total).toBe("number");
  });

  it("reviewChangeImpact returns the analysis envelope", async () => {
    const { isError, parsed } = await callTool("reviewChangeImpact", { days: 7, limit: 3 });
    expect(isError).toBe(false);
    expect(parsed.window).toBeDefined();
    expect(parsed.counts).toBeDefined();
    expect(Array.isArray(parsed.items)).toBe(true);
  });

  it("getGuardrails returns the guardrail config", async () => {
    const { isError, parsed } = await callTool("getGuardrails");
    expect(isError).toBe(false);
    expect(parsed).toHaveProperty("source");
  });

  it("runScript executes a simple GAQL query and returns rows", async () => {
    const { isError, parsed } = await callTool("runScript", {
      code: `return await ads.gaql("SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1");`,
    });
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(parsed.result.rowCount).toBeGreaterThanOrEqual(1);
    expect(parsed.result.rows[0].customer.id).toBeDefined();
  });

  it("getKeywordIdeas returns parsed ideas (or skips if platform creds missing)", async () => {
    const { isError, parsed, text } = await callTool("getKeywordIdeas", {
      keywords: ["running shoes"],
      geoTargetIds: ["2840"],
      pageSize: 3,
    });
    if (isError && text.includes("Platform credentials missing")) {
      // Local dev without KEYWORD_API_* env vars — skip rather than fail.
      console.warn("[skip] getKeywordIdeas: Platform credentials missing in local env");
      return;
    }
    expect(isError).toBe(false);
    expect(Array.isArray(parsed.keywords)).toBe(true);
    expect(parsed.keywords.length).toBeGreaterThan(0);
    // Regression guard for the gax-tuple unwrap bug: results must have real text.
    expect(parsed.keywords[0].keyword).toBeTruthy();
    // Regression guard for the competition string-vs-number bug.
    for (const k of parsed.keywords) {
      expect(k.competition).toMatch(/^(LOW|MEDIUM|HIGH|UNSPECIFIED|UNKNOWN)$/);
    }
  });
});
