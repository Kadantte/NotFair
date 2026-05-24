/**
 * Unit tests for the Meta Graph API client. Asserts the correctness fixes
 * from the bug audit:
 *
 *   - access_token rides on the Authorization header (not URL/body).
 *   - metaGraphAllPages.maxRows caps total rows + slices exactly.
 *   - error envelopes on pages 2+ throw MetaApiError instead of returning
 *     partial data silently.
 *   - access_token is stripped from paging.next URLs before refetching.
 *   - metaInsights threads its `limit` through as a total cap.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  getEnv: vi.fn(() => "v21.0"),
  getRequiredEnv: vi.fn((name: string) => name),
}));

import {
  buildMetaErrorMessage,
  META_DATE_PRESETS,
  metaGraph,
  metaGraphAllPages,
  metaInsights,
  MetaApiError,
  normalizeDatePreset,
} from "./client";

type Init = RequestInit | undefined;
type FetchCall = { url: string; init: Init };

function makeFetchStub(responses: Array<{ status?: number; body: unknown }>) {
  const calls: FetchCall[] = [];
  let i = 0;
  const stub = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses[i++] ?? { status: 200, body: {} };
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  return { stub, calls };
}

describe("metaGraph", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends access_token via Authorization header on GET", async () => {
    const { stub, calls } = makeFetchStub([{ body: { id: "123", name: "Test" } }]);
    vi.stubGlobal("fetch", stub);

    await metaGraph("ACCESS_TOKEN_VALUE", { path: "/me", params: { fields: "id,name" } });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    // URL must NOT contain access_token
    expect(url).not.toContain("access_token");
    // It SHOULD contain the actual params
    expect(url).toContain("fields=id%2Cname");
    // Header must carry Bearer token
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("Bearer ACCESS_TOKEN_VALUE");
  });

  it("sends access_token via Authorization header on POST and keeps body params", async () => {
    const { stub, calls } = makeFetchStub([{ body: { success: true } }]);
    vi.stubGlobal("fetch", stub);

    await metaGraph("ACCESS_TOKEN_VALUE", {
      path: "/123",
      method: "POST",
      params: { status: "PAUSED" },
    });

    const { url, init } = calls[0];
    expect(url).not.toContain("access_token");
    expect(url).toContain("/v21.0/123");
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("Bearer ACCESS_TOKEN_VALUE");
    expect(headers.get("Content-Type")).toBe("application/x-www-form-urlencoded");
    // Body should contain the form param without the token
    const body = init?.body as string;
    expect(body).toContain("status=PAUSED");
    expect(body).not.toContain("access_token");
  });

  it("injects execution_options=['validate_only'] on POST when validateOnly=true", async () => {
    const { stub, calls } = makeFetchStub([{ body: { success: true } }]);
    vi.stubGlobal("fetch", stub);

    await metaGraph("tok", {
      path: "/123",
      method: "POST",
      params: { status: "PAUSED" },
      validateOnly: true,
    });

    const body = calls[0].init?.body as string;
    expect(body).toContain("execution_options=");
    // URL-decode and check the array shape Meta accepts.
    const decoded = decodeURIComponent(body);
    expect(decoded).toContain('execution_options=["validate_only"]');
  });

  it("does NOT inject execution_options on GET (read endpoints don't accept it)", async () => {
    const { stub, calls } = makeFetchStub([{ body: { id: "1" } }]);
    vi.stubGlobal("fetch", stub);

    await metaGraph("tok", { path: "/me", validateOnly: true });
    expect(calls[0].url).not.toContain("execution_options");
  });

  it("does NOT inject execution_options when validateOnly is unset (prod default)", async () => {
    const { stub, calls } = makeFetchStub([{ body: { success: true } }]);
    vi.stubGlobal("fetch", stub);

    await metaGraph("tok", {
      path: "/123",
      method: "POST",
      params: { status: "PAUSED" },
      // validateOnly omitted
    });
    const body = calls[0].init?.body as string;
    expect(body).not.toContain("execution_options");
  });

  it("throws MetaApiError on 200 + body.error envelope", async () => {
    const { stub } = makeFetchStub([
      {
        body: {
          error: {
            message: "Invalid OAuth access token",
            type: "OAuthException",
            code: 190,
          },
        },
      },
    ]);
    vi.stubGlobal("fetch", stub);

    await expect(metaGraph("token", { path: "/me" })).rejects.toBeInstanceOf(
      MetaApiError,
    );
  });

  // Production regression: pre-fix, the error string was just
  // `Meta Graph GET ...: Invalid parameter (code 100)` — the agent then
  // burned 11 successive runScript iterations trying to figure out which
  // field was bad. Meta's actual body carries `error_user_msg`
  // ("Requesting for deleted objects is not supported in this endpoint.")
  // and `error_user_title` ("Cannot Request for Deleted Objects") that we
  // were dropping. Verified empirically against /act_*/campaigns with
  // effective_status=["DELETED"] on 2026-05-23.
  it("surfaces error_user_msg + subcode when Meta returns rich envelope (DELETED rejection)", async () => {
    const { stub } = makeFetchStub([
      {
        status: 400,
        body: {
          error: {
            message: "Invalid parameter",
            type: "OAuthException",
            code: 100,
            error_subcode: 1815001,
            error_user_title: "Cannot Request for Deleted Objects",
            error_user_msg:
              "Requesting for deleted objects is not supported in this endpoint.",
            fbtrace_id: "A_s_ZuYouwJAs0tt3-_6DzA",
          },
        },
      },
    ]);
    vi.stubGlobal("fetch", stub);

    try {
      await metaGraph("token", { path: "/act_123/campaigns" });
      throw new Error("expected metaGraph to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(MetaApiError);
      const e = err as MetaApiError;
      // Agent-facing message must carry the actionable text, not just
      // "Invalid parameter".
      expect(e.message).toContain("Requesting for deleted objects");
      expect(e.message).toContain("Cannot Request for Deleted Objects");
      // Both the top-level code AND the subcode should be in the string —
      // Meta documents many issues by subcode (e.g. 1815001).
      expect(e.message).toContain("code 100");
      expect(e.message).toContain("subcode 1815001");
      // Raw envelope passes through so callers can branch on subcode.
      expect(e.graphError?.error_subcode).toBe(1815001);
      expect(e.graphError?.error_user_msg).toBeDefined();
    }
  });

  it("falls back to `message` when error_user_msg is absent (older endpoints)", async () => {
    const { stub } = makeFetchStub([
      {
        status: 400,
        body: {
          error: {
            message: "Some legacy error",
            type: "OAuthException",
            code: 100,
          },
        },
      },
    ]);
    vi.stubGlobal("fetch", stub);

    try {
      await metaGraph("token", { path: "/v1/legacy" });
    } catch (err) {
      expect((err as MetaApiError).message).toContain("Some legacy error");
      expect((err as MetaApiError).message).toContain("code 100");
    }
  });
});

describe("buildMetaErrorMessage", () => {
  it("prefers error_user_msg over message and tags both codes", () => {
    const msg = buildMetaErrorMessage(
      {
        message: "Invalid parameter",
        code: 100,
        error_subcode: 1815001,
        error_user_title: "Cannot Request for Deleted Objects",
        error_user_msg: "Requesting for deleted objects is not supported in this endpoint.",
      },
      "GET",
      "/act_1/campaigns",
    );
    expect(msg).toMatchInlineSnapshot(
      `"Meta Graph GET /act_1/campaigns: Requesting for deleted objects is not supported in this endpoint. [Cannot Request for Deleted Objects] (code 100, subcode 1815001)"`,
    );
  });

  it("omits the title when it duplicates the user msg", () => {
    const msg = buildMetaErrorMessage(
      {
        error_user_msg: "Token expired",
        error_user_title: "Token expired",
        code: 190,
      },
      "GET",
      "/me",
    );
    expect(msg).toContain("Token expired");
    // No duplicate "[Token expired]" bracket — the title would just repeat.
    expect((msg.match(/Token expired/g) ?? []).length).toBe(1);
  });

  it("handles null envelope as 'no error envelope'", () => {
    const msg = buildMetaErrorMessage(null, "POST", "/act_1/adsets");
    expect(msg).toBe("Meta Graph POST /act_1/adsets: HTTP error (no error envelope)");
  });
});

describe("normalizeDatePreset", () => {
  it("returns the preset unchanged when valid", () => {
    expect(normalizeDatePreset("last_30d")).toBe("last_30d");
    expect(normalizeDatePreset("maximum")).toBe("maximum");
  });

  it("translates the most-common LLM mistake (lifetime → maximum)", () => {
    expect(normalizeDatePreset("lifetime")).toBe("maximum");
    expect(normalizeDatePreset("Lifetime")).toBe("maximum");
    expect(normalizeDatePreset("LIFETIME")).toBe("maximum");
  });

  it("translates other common aliases", () => {
    expect(normalizeDatePreset("all_time")).toBe("maximum");
    expect(normalizeDatePreset("alltime")).toBe("maximum");
  });

  it("returns null for unknown values (caller decides how to surface)", () => {
    expect(normalizeDatePreset("last_60d")).toBeNull();
    expect(normalizeDatePreset("forever")).toBeNull();
    expect(normalizeDatePreset("")).toBeNull();
  });

  it("covers every preset listed in META_DATE_PRESETS", () => {
    for (const preset of META_DATE_PRESETS) {
      expect(normalizeDatePreset(preset)).toBe(preset);
    }
  });
});

describe("metaGraphAllPages", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("respects maxRows by stopping pagination + slicing the result", async () => {
    const { stub, calls } = makeFetchStub([
      { body: { data: [{ id: "1" }, { id: "2" }, { id: "3" }], paging: { next: "https://graph.facebook.com/v21.0/foo?after=A&access_token=tok" } } },
      // Second page response — should NOT be requested if maxRows hits first
      { body: { data: [{ id: "4" }, { id: "5" }] } },
    ]);
    vi.stubGlobal("fetch", stub);

    const result = await metaGraphAllPages<{ id: string }>(
      "tok",
      { path: "/x" },
      { maxRows: 2 },
    );

    expect(result).toEqual([{ id: "1" }, { id: "2" }]);
    // Only the first page should have been fetched.
    expect(calls).toHaveLength(1);
  });

  it("strips access_token from paging.next and uses Authorization header", async () => {
    const { stub, calls } = makeFetchStub([
      {
        body: {
          data: [{ id: "1" }],
          paging: {
            next: "https://graph.facebook.com/v21.0/foo?after=cursorA&access_token=LEAKED&limit=100",
          },
        },
      },
      { body: { data: [{ id: "2" }] } },
    ]);
    vi.stubGlobal("fetch", stub);

    await metaGraphAllPages<{ id: string }>("REAL_TOKEN", { path: "/foo" });

    expect(calls).toHaveLength(2);
    const second = calls[1];
    // The retrieved next-URL must have access_token stripped.
    expect(second.url).not.toContain("access_token");
    expect(second.url).toContain("after=cursorA");
    const headers = new Headers(second.init?.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("Bearer REAL_TOKEN");
  });

  it("throws MetaApiError when a subsequent page returns body.error (was: silent partial data)", async () => {
    const { stub } = makeFetchStub([
      {
        body: {
          data: [{ id: "1" }],
          paging: { next: "https://graph.facebook.com/v21.0/foo?after=cursor" },
        },
      },
      {
        // 200 + error envelope on page 2 — the bug we're fixing.
        body: { error: { message: "Rate limit reached", code: 17 } },
      },
    ]);
    vi.stubGlobal("fetch", stub);

    await expect(
      metaGraphAllPages("tok", { path: "/foo" }),
    ).rejects.toBeInstanceOf(MetaApiError);
  });

  it("uses small page-size when maxRows is small (avoids over-fetching)", async () => {
    const { stub, calls } = makeFetchStub([
      { body: { data: [{ id: "1" }] } },
    ]);
    vi.stubGlobal("fetch", stub);

    await metaGraphAllPages("tok", { path: "/x" }, { maxRows: 5 });

    // First-page limit param should be 5, not the default 100.
    expect(calls[0].url).toContain("limit=5");
  });
});

describe("metaInsights", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("threads its `limit` as a TOTAL cap (not per-page) and slices to exact size", async () => {
    const { stub } = makeFetchStub([
      {
        body: {
          data: [{ campaign_id: "1" }, { campaign_id: "2" }, { campaign_id: "3" }],
          paging: { next: "https://graph.facebook.com/v21.0/insights?after=A" },
        },
      },
      // If pagination wasn't capped, we'd hit this response and get 5 rows.
      {
        body: {
          data: [{ campaign_id: "4" }, { campaign_id: "5" }],
        },
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const rows = await metaInsights("tok", "act_1", { limit: 2, level: "campaign" });
    expect(rows).toHaveLength(2);
  });

  it("rejects when both date_preset and time_range are supplied", async () => {
    await expect(
      metaInsights("tok", "act_1", {
        date_preset: "last_7d",
        time_range: { since: "2026-01-01", until: "2026-01-07" },
      }),
    ).rejects.toThrow(/date_preset.*OR.*time_range/);
  });

  it("auto-translates lifetime → maximum and lets the call through (defense in depth)", async () => {
    const { stub, calls } = makeFetchStub([{ body: { data: [] } }]);
    vi.stubGlobal("fetch", stub);

    await metaInsights("tok", "act_1", { date_preset: "lifetime" });
    expect(calls[0].url).toContain("date_preset=maximum");
    expect(calls[0].url).not.toContain("date_preset=lifetime");
  });

  it("rejects an unrecognized date_preset with a helpful message (runScript safety)", async () => {
    await expect(
      metaInsights("tok", "act_1", { date_preset: "yesterweek" }),
    ).rejects.toThrow(/invalid date_preset.*"yesterweek"/);
  });
});
