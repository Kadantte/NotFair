/**
 * Live integration tests for the Meta Ads MCP at `/api/mcp/meta_ads`.
 *
 * Hits a running dev server with a real `oat_meta_ads_*` bearer token. Goes
 * through the full request → handler-factory resolveAuth → AsyncLocalStorage
 * threading → tool registrar → Graph API → response parsing path.
 *
 * Opt-in. Skipped when META_MCP_TEST_BEARER_TOKEN is unset, so the default
 * `pnpm test` run stays hermetic.
 *
 * To run:
 *   1. Start the dev server: `pnpm dev`
 *   2. Get a Meta MCP token (one-time): use Codex/Claude to OAuth against
 *      http://localhost:3000/api/mcp/meta_ads, then copy the token from
 *      `oauth_access_tokens` (where resource_url ends in /meta_ads).
 *   3. Run:
 *        META_MCP_TEST_BEARER_TOKEN=oat_meta_ads_… pnpm test:live
 *
 * Optional env:
 *   - MCP_TEST_BASE_URL                  (default: http://localhost:3000)
 *   - META_MCP_TEST_INCLUDE_WRITES=1     also exercise pause→enable round-trip
 *                                        on the FIRST campaign listed by the
 *                                        account. The campaign is restored to
 *                                        its original status afterward, but
 *                                        only run this against an account
 *                                        you're OK touching.
 */

import { beforeAll, describe, expect, it } from "vitest";

const BEARER = process.env.META_MCP_TEST_BEARER_TOKEN ?? "";
const BASE_URL = process.env.MCP_TEST_BASE_URL ?? "http://localhost:3000";
const META_MCP_URL = `${BASE_URL}/api/mcp/meta_ads`;
const INCLUDE_WRITES = process.env.META_MCP_TEST_INCLUDE_WRITES === "1";

type McpCallResult = {
  isError: boolean;
  text: string;
  parsed: any;
};

async function callTool(
  name: string,
  args: Record<string, unknown> = {},
): Promise<McpCallResult> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  };
  const res = await fetch(META_MCP_URL, {
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
    /* tool returned non-JSON text; rare for typed handlers */
  }
  return { isError: !!result.isError, text, parsed };
}

async function listTools(): Promise<{ name: string }[]> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  };
  const res = await fetch(META_MCP_URL, {
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
  const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
  if (!dataLine) throw new Error(`No SSE data line in tools/list response`);
  const envelope = JSON.parse(dataLine.slice(6));
  return envelope.result?.tools ?? [];
}

describe.skipIf(!BEARER)("Meta MCP live", () => {
  beforeAll(async () => {
    try {
      const ping = await fetch(`${BASE_URL}/api/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!ping.ok) throw new Error(`/api/health returned ${ping.status}`);
    } catch (err) {
      throw new Error(
        `Dev server not reachable at ${BASE_URL}. Start it with \`pnpm dev\` in another terminal. ` +
          `Underlying error: ${(err as Error).message}`,
      );
    }
  });

  it("tools/list returns the Stage 4 tool surface (no _skeleton_status)", { timeout: 30_000 }, async () => {
    const tools = await listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).not.toContain("_skeleton_status");
    // Read tools
    expect(names).toContain("listAdAccounts");
    expect(names).toContain("getAdAccount");
    expect(names).toContain("listCampaigns");
    expect(names).toContain("listAdSets");
    expect(names).toContain("listAds");
    expect(names).toContain("getInsights");
    // Code mode
    expect(names).toContain("runScript");
    // Write tools
    expect(names).toContain("pauseCampaign");
    expect(names).toContain("enableCampaign");
    expect(names).toContain("pauseAdSet");
    expect(names).toContain("enableAdSet");
    expect(names).toContain("pauseAd");
    expect(names).toContain("enableAd");
    expect(names).toContain("updateCampaignBudget");
    expect(names).toContain("updateAdSetBudget");
    expect(names).toContain("renameCampaign");
  });

  it("listAdAccounts returns at least one account", async () => {
    const { isError, parsed } = await callTool("listAdAccounts");
    expect(isError).toBe(false);
    expect(Array.isArray(parsed.accounts)).toBe(true);
    expect(parsed.accounts.length).toBeGreaterThan(0);
    expect(typeof parsed.activeAccountId).toBe("string");
    expect(parsed.activeAccountId.length).toBeGreaterThan(0);
  });

  it("getAdAccount returns currency, name, status for the active account", async () => {
    const { isError, parsed } = await callTool("getAdAccount");
    expect(isError).toBe(false);
    // Graph returns id like `act_123`; we don't strip on the account snapshot.
    expect(typeof parsed.id).toBe("string");
    // Currency / name should be present on any non-trivial ad account.
    expect(typeof parsed.currency).toBe("string");
    expect(parsed.currency.length).toBe(3); // ISO 4217
    expect(typeof parsed.name).toBe("string");
  });

  it("listCampaigns returns an array (possibly empty for fresh accounts)", async () => {
    const { isError, parsed } = await callTool("listCampaigns", { limit: 10 });
    expect(isError).toBe(false);
    expect(Array.isArray(parsed.campaigns)).toBe(true);
    expect(typeof parsed.rowCount).toBe("number");
  });

  it("getInsights with last_30d returns a row array", async () => {
    const { isError, parsed } = await callTool("getInsights", {
      level: "campaign",
      date_preset: "last_30d",
      limit: 50,
    });
    expect(isError).toBe(false);
    expect(Array.isArray(parsed.rows)).toBe(true);
    expect(typeof parsed.rowCount).toBe("number");
    expect(parsed.rowCount).toBe(parsed.rows.length);
  });

  it("runScript: ads.graph fetches /me Graph API user", async () => {
    const { isError, parsed } = await callTool("runScript", {
      code: `return await ads.graph("/me", { fields: "id,name" });`,
    });
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(typeof parsed.result.id).toBe("string");
    expect(parsed.result.id.length).toBeGreaterThan(0);
  });

  it("runScript: ads.graphParallel fans out two reads in one call", async () => {
    const { isError, parsed } = await callTool("runScript", {
      code: `
        const r = await ads.graphParallel([
          { name: "me", path: "/me", params: { fields: "id,name" } },
          { name: "campaigns", path: "/{accountId}/campaigns", params: { fields: ads.fields.campaign }, paged: true, limit: 10 },
        ]);
        return {
          meOk: r.me?.ok,
          meId: r.me?.ok ? r.me.data.id : null,
          campaignsOk: r.campaigns?.ok,
          campaignsCount: r.campaigns?.ok ? r.campaigns.data.data.length : null,
        };
      `,
    });
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(parsed.result.meOk).toBe(true);
    expect(typeof parsed.result.meId).toBe("string");
    expect(parsed.result.campaignsOk).toBe(true);
  });

  it("runScript: ads.insights returns last_30d account-level rows", async () => {
    const { isError, parsed } = await callTool("runScript", {
      code: `
        const rows = await ads.insights(null, {
          level: "account",
          date_preset: "last_30d",
          fields: ["spend", "impressions", "clicks"],
        });
        return { rowCount: rows.length, sample: rows.slice(0, 1) };
      `,
    });
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(typeof parsed.result.rowCount).toBe("number");
  });

  it("runScript: substitutes {accountId} in path templates", async () => {
    const { isError, parsed } = await callTool("runScript", {
      code: `
        const r = await ads.graph("/{accountId}", { fields: "id,name" });
        return { id: r.id, hasActPrefix: String(r.id).startsWith("act_") };
      `,
    });
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(parsed.result.hasActPrefix).toBe(true);
  });

  it("runScript: bootstrap helpers are reachable", async () => {
    const { isError, parsed } = await callTool("runScript", {
      code: `
        const range = ads.helpers.getDateRange(7);
        const fields = ads.fields.campaign;
        return {
          rangeKeys: Object.keys(range),
          activeAccountId: ads.activeAccountId,
          campaignFieldsLen: fields.split(",").length,
        };
      `,
    });
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(parsed.result.rangeKeys).toEqual(["since", "until"]);
    expect(typeof parsed.result.activeAccountId).toBe("string");
    expect(parsed.result.campaignFieldsLen).toBeGreaterThan(5);
  });

  it("runScript: clean error envelope when path is invalid", async () => {
    const { isError, parsed } = await callTool("runScript", {
      code: `
        try {
          await ads.graph("/this-endpoint-does-not-exist-xyz");
          return { reached: "no" };
        } catch (e) {
          return { caught: true, message: String(e.message ?? e) };
        }
      `,
    });
    expect(isError).toBe(false);
    expect(parsed.ok).toBe(true);
    expect(parsed.result.caught).toBe(true);
    expect(typeof parsed.result.message).toBe("string");
  });
});

// ─── Optional write round-trip ────────────────────────────────────────────
//
// Opt-in via META_MCP_TEST_INCLUDE_WRITES=1. Picks the FIRST campaign listed
// by the connected account and pause→enable's it back to its original
// status. Skips when there are zero campaigns or BEARER missing.
describe.skipIf(!BEARER || !INCLUDE_WRITES)("Meta MCP live: pause/enable round-trip", () => {
  it("pauses then re-enables the first campaign without changing the final state", async () => {
    const list = await callTool("listCampaigns", { limit: 1 });
    expect(list.isError).toBe(false);
    const campaigns: any[] = list.parsed.campaigns ?? [];
    if (campaigns.length === 0) {
      console.warn("[skip] No campaigns to test pause/enable on.");
      return;
    }
    const campaign = campaigns[0];
    const id: string = campaign.id;
    const originalStatus: string = campaign.status;

    // Pause
    const paused = await callTool("pauseCampaign", { campaignId: id });
    expect(paused.isError).toBe(false);
    expect(paused.parsed.success).toBe(true);
    expect(paused.parsed.action).toBe("pauseCampaign");
    expect(paused.parsed.entityId).toBe(id);
    expect((paused.parsed.after as any)?.status).toBe("PAUSED");

    // Re-enable (only if it was ACTIVE before — restore exact starting state)
    if (originalStatus === "ACTIVE") {
      const enabled = await callTool("enableCampaign", { campaignId: id });
      expect(enabled.isError).toBe(false);
      expect(enabled.parsed.success).toBe(true);
      expect((enabled.parsed.after as any)?.status).toBe("ACTIVE");
    } else {
      // Already paused before our run; leave PAUSED.
      console.warn(
        `[note] First campaign ${id} was ${originalStatus} before the test — left PAUSED to match.`,
      );
    }
  });
});
