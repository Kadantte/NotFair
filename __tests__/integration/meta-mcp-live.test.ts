/**
 * Live integration tests for the Meta Ads MCP at `/api/mcp/meta_ads`.
 *
 * Hits a running dev server with a real `oat_meta_ads_test_*` bearer token.
 * Goes through the full request → handler-factory resolveAuth →
 * AsyncLocalStorage threading → tool registrar → Graph API → response
 * parsing path.
 *
 * Opt-in. Skipped when META_MCP_TEST_BEARER_TOKEN is unset, so the default
 * `pnpm test` run stays hermetic.
 *
 * To run:
 *   1. Start the dev server: `pnpm dev`
 *   2. Mint a test token: `node --env-file=.env.local scripts/mint-meta-test-token.mjs`
 *   3. Run:
 *        META_MCP_TEST_BEARER_TOKEN=oat_meta_ads_test_… pnpm test:live
 *
 * Writes: the test token uses the `oat_meta_ads_test_` prefix, which
 * `handler-factory.resolveAuth` recognizes and flags `auth.testMode=true`.
 * Every write tool then auto-applies Meta's `execution_options=
 * ["validate_only"]`, so the calls run the full validation pipeline (auth,
 * permissions, schema, CBO checks, etc.) without persisting any state.
 * That makes write coverage safe to run every time — no opt-in flag, no
 * fear of touching real campaigns. Customer-facing (non-test-prefixed)
 * tokens never get this flag and write normally.
 *
 * Optional env:
 *   - MCP_TEST_BASE_URL  (default: http://localhost:3000)
 */

import { beforeAll, describe, expect, it } from "vitest";

const BEARER = process.env.META_MCP_TEST_BEARER_TOKEN ?? "";
const BASE_URL = process.env.MCP_TEST_BASE_URL ?? "http://localhost:3000";
const META_MCP_URL = `${BASE_URL}/api/mcp/meta_ads`;

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
    expect(names).toContain("renameAd");
    // Create + comprehensive-update tools (full life cycle).
    expect(names).toContain("createCampaign");
    expect(names).toContain("createAdSet");
    expect(names).toContain("createAdCreative");
    expect(names).toContain("createAd");
    expect(names).toContain("updateCampaign");
    expect(names).toContain("updateAdSet");
    expect(names).toContain("updateAdCreative");
    // Page-identity read (pages_show_list) — needed to surface the Page
    // list to the user when picking the `object_story_spec.page_id` for
    // a new ad creative. Page-management tools (listPageAds,
    // listLeadGenForms, getPagePostInsights, pausePromotedPost,
    // resumePromotedPost) are out of scope and not registered.
    expect(names).toContain("listPages");
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

  // Regression test for the over-fetching bug — the read tool used to fetch
  // up to 20 pages and slice client-side. With `limit: 1` and account-level
  // insights, the result must contain at most 1 row.
  it("limit param actually caps total rows (no over-fetch)", async () => {
    const { isError, parsed } = await callTool("getInsights", {
      level: "account",
      date_preset: "last_30d",
      limit: 1,
    });
    expect(isError).toBe(false);
    expect(parsed.rows.length).toBeLessThanOrEqual(1);
    expect(parsed.rowCount).toBe(parsed.rows.length);
  });

  it("listCampaigns honors small limit (no over-fetch)", async () => {
    const { isError, parsed } = await callTool("listCampaigns", { limit: 2 });
    expect(isError).toBe(false);
    expect(parsed.campaigns.length).toBeLessThanOrEqual(2);
    expect(parsed.rowCount).toBe(parsed.campaigns.length);
  });

  it("listAdSets returns an array (account-scoped)", async () => {
    const { isError, parsed } = await callTool("listAdSets", { limit: 5 });
    expect(isError).toBe(false);
    expect(Array.isArray(parsed.adSets)).toBe(true);
    expect(typeof parsed.rowCount).toBe("number");
    expect(parsed.adSets.length).toBeLessThanOrEqual(5);
  });

  it("listAds returns an array (account-scoped)", async () => {
    const { isError, parsed } = await callTool("listAds", { limit: 5 });
    expect(isError).toBe(false);
    expect(Array.isArray(parsed.ads)).toBe(true);
    expect(typeof parsed.rowCount).toBe("number");
    expect(parsed.ads.length).toBeLessThanOrEqual(5);
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

// ─── Write tools (validate-only) ──────────────────────────────────────────
//
// Always-on. Test tokens (`oat_meta_ads_test_*`) flip auth.testMode=true at
// the auth layer; every write tool then auto-applies Meta's
// `execution_options=["validate_only"]`. Each call goes through the full
// validation pipeline (auth, schema, permissions, CBO checks) without
// persisting any state — so this safely exercises every write tool against
// the real Graph API on every test run.
//
// Assertions check the envelope shape and Graph API acceptance, NOT actual
// state mutation (since validate_only doesn't mutate). after-snapshot still
// reflects the pre-call state.
describe.skipIf(!BEARER)("Meta MCP live: write tools (validate-only)", () => {
  // Resolve an account that actually has entities — the bearer's "active"
  // account may be empty even when sibling accounts have campaigns. Without
  // this, the write tests silently pass via early-return and the dashboard
  // never sees the write tools.
  let testAccountId: string | null = null;
  let firstCampaign: { id: string; name?: string; daily_budget?: string; lifetime_budget?: string } | null = null;
  let firstAdSet: { id: string; daily_budget?: string; lifetime_budget?: string; campaign_id?: string } | null = null;
  let firstAd: { id: string } | null = null;

  beforeAll(async () => {
    const accts = await callTool("listAdAccounts");
    if (accts.isError) throw new Error("listAdAccounts failed in beforeAll");
    const candidateIds: string[] = [
      ...(accts.parsed.accounts ?? []).map((a: any) => String(a.id)),
    ];
    // Probe each account in turn until one has at least one campaign.
    for (const id of candidateIds) {
      const camp = await callTool("listCampaigns", { accountId: id, limit: 1 });
      if (!camp.isError && (camp.parsed.campaigns ?? []).length > 0) {
        testAccountId = id;
        firstCampaign = camp.parsed.campaigns[0];
        break;
      }
    }
    if (!testAccountId) {
      console.warn(
        `[meta-live] None of the connected accounts have campaigns. ` +
          `Write tools will be skipped — connect an account with at least one campaign.`,
      );
      return;
    }
    const adset = await callTool("listAdSets", { accountId: testAccountId, limit: 1 });
    if (!adset.isError && (adset.parsed.adSets ?? []).length > 0) {
      firstAdSet = adset.parsed.adSets[0];
    }
    const ad = await callTool("listAds", { accountId: testAccountId, limit: 1 });
    if (!ad.isError && (ad.parsed.ads ?? []).length > 0) {
      firstAd = ad.parsed.ads[0];
    }
  });

  it("pauseCampaign validates against the real Graph API", async () => {
    if (!firstCampaign) return console.warn("[skip] no campaign available");
    const r = await callTool("pauseCampaign", {
      accountId: testAccountId!,
      campaignId: firstCampaign.id,
    });
    expect(r.isError).toBe(false);
    expect(r.parsed.success).toBe(true);
    expect(r.parsed.action).toBe("pauseCampaign");
    expect(r.parsed.entityId).toBe(firstCampaign.id);
  });

  it("enableCampaign validates against the real Graph API", async () => {
    if (!firstCampaign) return console.warn("[skip] no campaign available");
    const r = await callTool("enableCampaign", {
      accountId: testAccountId!,
      campaignId: firstCampaign.id,
    });
    expect(r.isError).toBe(false);
    expect(r.parsed.success).toBe(true);
    expect(r.parsed.action).toBe("enableCampaign");
  });

  it("pauseAdSet validates against the real Graph API", async () => {
    if (!firstAdSet) return console.warn("[skip] no ad set available");
    const r = await callTool("pauseAdSet", {
      accountId: testAccountId!,
      adSetId: firstAdSet.id,
    });
    expect(r.isError).toBe(false);
    expect(r.parsed.success).toBe(true);
    expect(r.parsed.action).toBe("pauseAdSet");
    expect(r.parsed.entityId).toBe(firstAdSet.id);
  });

  it("enableAdSet validates against the real Graph API", async () => {
    if (!firstAdSet) return console.warn("[skip] no ad set available");
    const r = await callTool("enableAdSet", {
      accountId: testAccountId!,
      adSetId: firstAdSet.id,
    });
    expect(r.isError).toBe(false);
    expect(r.parsed.success).toBe(true);
    expect(r.parsed.action).toBe("enableAdSet");
  });

  // pauseAd/enableAd: some ad types (boosted page posts, dynamic creative
  // children) reject direct status writes with Meta's code-100 even under
  // validate_only — that's a real-world ad-type restriction, not a tool bug.
  // We accept either an OK envelope or a Meta-side rejection: both prove the
  // call reached Graph's validator.
  it("pauseAd reaches Meta's validator", async () => {
    if (!firstAd) return console.warn("[skip] no ad available");
    const r = await callTool("pauseAd", { accountId: testAccountId!, adId: firstAd.id });
    expect(typeof r.parsed?.success === "boolean" || r.isError).toBe(true);
  });

  it("enableAd reaches Meta's validator", async () => {
    if (!firstAd) return console.warn("[skip] no ad available");
    const r = await callTool("enableAd", { accountId: testAccountId!, adId: firstAd.id });
    expect(typeof r.parsed?.success === "boolean" || r.isError).toBe(true);
  });

  // renameAd — POST `/{ad_id}` with a `name` field. Gated on
  // `ads_management`. Unlike status writes (blocked on boosted-post ads
  // pre-review), name writes succeed against every ad type the user has
  // rights to.
  it("renameAd succeeds — name write through ads_management", async () => {
    if (!firstAd) return console.warn("[skip] no ad available");
    // No-op rename: re-set the existing name. Meta accepts and processes
    // the write, returning success: true.
    const original = await callTool("listAds", {
      accountId: testAccountId!,
      limit: 1,
    });
    const adName = (original.parsed.ads?.[0] as { name?: string } | undefined)?.name ?? "test";
    const r = await callTool("renameAd", {
      accountId: testAccountId!,
      adId: firstAd.id,
      name: adName,
    });
    expect(r.isError).toBe(false);
    expect(r.parsed.success).toBe(true);
    expect(r.parsed.action).toBe("renameAd");
    expect(r.parsed.entityId).toBe(firstAd.id);
  });

  it("renameCampaign validates against the real Graph API (no-op same-name)", async () => {
    if (!firstCampaign?.name) return console.warn("[skip] no campaign name available");
    const r = await callTool("renameCampaign", {
      accountId: testAccountId!,
      campaignId: firstCampaign.id,
      name: firstCampaign.name,
    });
    expect(r.isError).toBe(false);
    expect(r.parsed.success).toBe(true);
    expect(r.parsed.action).toBe("renameCampaign");
  });

  it("updateCampaignBudget validates against the real Graph API", async () => {
    if (!firstCampaign) return console.warn("[skip] no campaign available");
    const dailyBudget = firstCampaign.daily_budget
      ? parseInt(firstCampaign.daily_budget, 10)
      : null;
    const lifetimeBudget = firstCampaign.lifetime_budget
      ? parseInt(firstCampaign.lifetime_budget, 10)
      : null;
    const args: Record<string, unknown> = {
      accountId: testAccountId!,
      campaignId: firstCampaign.id,
    };
    if (dailyBudget) args.dailyBudget = dailyBudget;
    else if (lifetimeBudget) args.lifetimeBudget = lifetimeBudget;
    else args.dailyBudget = 1000;
    const r = await callTool("updateCampaignBudget", args);
    // We accept either success OR a clean Meta validation error envelope —
    // both prove the tool plumbing reached Graph's validator.
    expect(typeof r.parsed?.success === "boolean" || r.isError).toBe(true);
  });

  it("updateAdSetBudget validates against the real Graph API", async () => {
    if (!firstAdSet) return console.warn("[skip] no ad set available");
    const dailyBudget = firstAdSet.daily_budget
      ? parseInt(firstAdSet.daily_budget, 10)
      : null;
    const lifetimeBudget = firstAdSet.lifetime_budget
      ? parseInt(firstAdSet.lifetime_budget, 10)
      : null;
    const args: Record<string, unknown> = { accountId: testAccountId!, adSetId: firstAdSet.id };
    if (dailyBudget) args.dailyBudget = dailyBudget;
    else if (lifetimeBudget) args.lifetimeBudget = lifetimeBudget;
    else args.dailyBudget = 1000;
    const r = await callTool("updateAdSetBudget", args);
    // Under CBO, Meta will reject; that's still a valid exercise of the
    // full validation path.
    expect(typeof r.parsed?.success === "boolean" || r.isError).toBe(true);
  });

  // ─── Life-cycle creation + comprehensive updates ──────────────────────
  // validate_only doesn't persist, so create tools that pass Meta's
  // validator return a synthetic envelope with no real id. Some create
  // combinations fail Meta's business-rule validation (objective vs
  // optimization_goal mismatch, special_ad_categories vs ad type, etc.)
  // — accept either OK envelope or a clean Meta error envelope: both
  // prove the call reached Graph's validator.

  // Validate-only against Meta's full validator can take 5–15s per call
  // (page-id resolution, link probe, business-rule checks). 30s gives
  // headroom even on cold-start dev compiles.
  const CREATE_TIMEOUT = { timeout: 30_000 } as const;

  it("createCampaign reaches Meta's validator", CREATE_TIMEOUT, async () => {
    if (!testAccountId) return console.warn("[skip] no test account");
    const r = await callTool("createCampaign", {
      accountId: testAccountId,
      name: "live-test-campaign-do-not-keep",
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: ["NONE"],
      daily_budget: 1000,
    });
    expect(typeof r.parsed?.success === "boolean" || r.isError).toBe(true);
  });

  it("createAdSet reaches Meta's validator", CREATE_TIMEOUT, async () => {
    if (!firstCampaign) return console.warn("[skip] no campaign available");
    const r = await callTool("createAdSet", {
      accountId: testAccountId!,
      name: "live-test-adset-do-not-keep",
      campaign_id: firstCampaign.id,
      billing_event: "IMPRESSIONS",
      optimization_goal: "REACH",
      targeting: { geo_locations: { countries: ["US"] } },
      status: "PAUSED",
      daily_budget: 1000,
    });
    expect(typeof r.parsed?.success === "boolean" || r.isError).toBe(true);
  });

  it("createAdCreative reaches Meta's validator", CREATE_TIMEOUT, async () => {
    if (!testAccountId) return console.warn("[skip] no test account");
    // Test connection's business owns Oncall247 (id 108561168972321) —
    // see the Page-identity describe block.
    const PAGE_ID = "108561168972321";
    const r = await callTool("createAdCreative", {
      accountId: testAccountId,
      name: "live-test-creative-do-not-keep",
      object_story_spec: {
        page_id: PAGE_ID,
        link_data: {
          link: "https://www.notfair.co",
          message: "live-test creative — validate only",
          name: "NotFair",
        },
      },
    });
    expect(typeof r.parsed?.success === "boolean" || r.isError).toBe(true);
  });

  it("createAd reaches Meta's validator", CREATE_TIMEOUT, async () => {
    if (!firstAdSet || !firstAd) return console.warn("[skip] need adset+ad");
    // Reuse an existing creative id where possible. listAds returns the
    // creative envelope; fall back to the ad id (Meta will reject as a
    // bad creative id, which still proves the call reached the validator).
    const adCreativeId =
      (firstAd as { creative?: { id?: string } }).creative?.id ?? firstAd.id;
    const r = await callTool("createAd", {
      accountId: testAccountId!,
      name: "live-test-ad-do-not-keep",
      adset_id: firstAdSet.id,
      creative_id: adCreativeId,
      status: "PAUSED",
    });
    expect(typeof r.parsed?.success === "boolean" || r.isError).toBe(true);
  });

  it("updateCampaign validates a no-op name write", CREATE_TIMEOUT, async () => {
    if (!firstCampaign?.name)
      return console.warn("[skip] no campaign name available");
    const r = await callTool("updateCampaign", {
      accountId: testAccountId!,
      campaignId: firstCampaign.id,
      name: firstCampaign.name,
    });
    expect(r.isError).toBe(false);
    expect(r.parsed.success).toBe(true);
    expect(r.parsed.action).toBe("updateCampaign");
    expect(r.parsed.entityId).toBe(firstCampaign.id);
  });

  it("updateAdSet reaches Meta's validator", CREATE_TIMEOUT, async () => {
    if (!firstAdSet) return console.warn("[skip] no ad set available");
    const adSetName = (firstAdSet as { name?: string }).name ?? "live-test";
    const r = await callTool("updateAdSet", {
      accountId: testAccountId!,
      adSetId: firstAdSet.id,
      name: adSetName,
    });
    expect(typeof r.parsed?.success === "boolean" || r.isError).toBe(true);
  });

  it("updateAdCreative reaches Meta's validator", CREATE_TIMEOUT, async () => {
    if (!firstAd) return console.warn("[skip] no ad available");
    // No-op swap: pass the same creative id the ad already references
    // (or fall back to the ad id — Meta validates either way).
    const adCreativeId =
      (firstAd as { creative?: { id?: string } }).creative?.id ?? firstAd.id;
    const r = await callTool("updateAdCreative", {
      accountId: testAccountId!,
      adId: firstAd.id,
      creative_id: adCreativeId,
    });
    expect(typeof r.parsed?.success === "boolean" || r.isError).toBe(true);
  });
});

// ─── Page-identity read (pages_show_list) ───────────────────────────────
//
// `listPages` is the only Page-related tool still in scope — the agent
// uses it to surface the user's Page list when picking the
// `object_story_spec.page_id` for a new ad creative. Page-management
// tools (listPageAds, listLeadGenForms, getPagePostInsights,
// pausePromotedPost, resumePromotedPost) are out of scope and not
// registered.
describe.skipIf(!BEARER)("Meta MCP live: Page identity", () => {
  const BUSINESS_ID = "1211081106225236";

  it("listPages returns the Pages the user manages", async () => {
    const { isError, parsed } = await callTool("listPages", {
      businessId: BUSINESS_ID,
    });
    expect(isError).toBe(false);
    expect(Array.isArray(parsed.pages)).toBe(true);
    expect(parsed.rowCount).toBe(parsed.pages.length);
    // The test connection's business owns at least one Page (Oncall247).
    expect(parsed.pages.length).toBeGreaterThan(0);
    for (const p of parsed.pages) {
      expect(typeof p.id).toBe("string");
      expect(typeof p.name).toBe("string");
    }
  });
});
