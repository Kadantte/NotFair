import { beforeEach, describe, expect, it, vi } from "vitest";

const { getValidAccessTokenMock } = vi.hoisted(() => ({
  getValidAccessTokenMock: vi.fn(),
}));

vi.mock("@/lib/gohighlevel/oauth", () => ({
  getValidAccessToken: getValidAccessTokenMock,
  GHL_API_VERSION: "2021-07-28",
}));

import { ghlGet } from "@/lib/gohighlevel/client";

describe("GoHighLevel API client", () => {
  beforeEach(() => {
    getValidAccessTokenMock.mockReset();
    getValidAccessTokenMock.mockResolvedValue("ACCESS");
    global.fetch = vi.fn(async () => new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as unknown as typeof fetch;
  });

  it("builds root-relative HighLevel API URLs", async () => {
    await ghlGet(7, "/contacts/", { locationId: "loc_123", limit: 20 });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(global.fetch).mock.calls[0]!;
    expect(String(url)).toBe("https://services.leadconnectorhq.com/contacts/?locationId=loc_123&limit=20");
    expect(init).toMatchObject({
      method: "GET",
      headers: expect.objectContaining({
        Authorization: "Bearer ACCESS",
        Version: "2021-07-28",
      }),
    });
  });

  it("rejects protocol-relative, backslash, and dot-segment paths", async () => {
    await expect(ghlGet(7, "//evil.test/contacts")).rejects.toThrow("root-relative");
    await expect(ghlGet(7, "/locations\\evil")).rejects.toThrow("root-relative");
    await expect(ghlGet(7, "/products/%5c..%5ccontacts")).rejects.toThrow("root-relative");
    await expect(ghlGet(7, "/locations/../oauth/token")).rejects.toThrow("dot segments");
    await expect(ghlGet(7, "/locations/%2e%2e/oauth/token")).rejects.toThrow("dot segments");
    await expect(ghlGet(7, "/locations/%E0%A4%A")).rejects.toThrow("malformed");

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
