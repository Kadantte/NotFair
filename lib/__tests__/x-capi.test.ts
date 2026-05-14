import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildXConversionRequest, sendXConversion } from "../x-capi";

const BASE = "https://ads-api.x.com/12/measurement/conversions";

const OAUTH_ENV = {
  X_CONSUMER_KEY: "ck-test",
  X_CONSUMER_SECRET: "cs-test",
  X_ACCESS_TOKEN: "at-test",
  X_ACCESS_TOKEN_SECRET: "ats-test",
};

describe("sendXConversion", () => {
  const originalEnv = { ...process.env };
  const fetchMock = vi.fn();
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    warnSpy.mockClear();
    errorSpy.mockClear();
    process.env.X_PIXEL_ID = "q27qa";
    process.env.X_EVENT_ID = "tw-q27qa-q27qc";
    Object.assign(process.env, OAUTH_ENV);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("skips when any OAuth 1.0a credential is missing", async () => {
    delete process.env.X_ACCESS_TOKEN_SECRET;

    await sendXConversion({
      conversionId: "conv-123",
      email: "a@b.com",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds a dry-run OAuth 1.0a request without calling fetch", () => {
    const request = buildXConversionRequest({
      conversionId: "dry-run-123",
      email: "a@b.com",
      valueDecimal: 1,
      currency: "USD",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(request?.url).toBe(`${BASE}/q27qa`);
    expect(request?.init.method).toBe("POST");
    expect(request?.init.headers["Content-Type"]).toBe("application/json");
    expect(request?.init.headers.Authorization).toMatch(/^OAuth /);
  });

  it("skips when no attribution identifiers are provided", async () => {
    await sendXConversion({
      conversionId: "conv-123",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("posts a well-formed payload with a normalized SHA-256 email identifier", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));

    await sendXConversion({
      conversionId: "signup-42",
      email: "  FOO@BAR.com ",
      valueDecimal: 1,
      currency: "USD",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/q27qa`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const auth: string = init.headers.Authorization;
    expect(auth.startsWith("OAuth ")).toBe(true);
    expect(auth).toContain('oauth_consumer_key="ck-test"');
    expect(auth).toContain('oauth_token="at-test"');
    expect(auth).toContain('oauth_signature_method="HMAC-SHA1"');
    expect(auth).toContain('oauth_version="1.0"');
    expect(auth).toMatch(/oauth_signature="[^"]+"/);
    expect(auth).toMatch(/oauth_nonce="[a-f0-9]+"/);
    expect(auth).toMatch(/oauth_timestamp="\d+"/);

    const body = JSON.parse(init.body);
    expect(body.conversions).toHaveLength(1);
    const [conversion] = body.conversions;
    expect(conversion.event_id).toBe("tw-q27qa-q27qc");
    expect(conversion.conversion_id).toBe("signup-42");
    expect(conversion.identifiers).toEqual([
      {
        hashed_email:
          "0c7e6a405862e402eb76a70f8a26fc732d07c32931e9fae9ab1582911d2e8a3b",
      },
    ]);
    expect(conversion.value).toBe("1");
    expect(conversion.price_currency).toBe("USD");
    expect(Date.parse(conversion.conversion_time)).not.toBeNaN();
  });

  it("includes twclid as an attribution identifier when present", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));

    await sendXConversion({
      conversionId: "signup-123",
      email: "a@b.com",
      twclid: "  twclid-test  ",
      eventId: "tw-q27qa-signup",
      valueDecimal: 1,
      currency: "USD",
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.conversions[0].event_id).toBe("tw-q27qa-signup");
    expect(body.conversions[0].identifiers).toEqual([
      { twclid: "twclid-test" },
      {
        hashed_email:
          "fb98d44ad7501a959f3f4f4a3f004fe2d9e581ea6207e218c4b02c08a4d75adf",
      },
    ]);
  });

  it("can send with only twclid when email is unavailable", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));

    await sendXConversion({
      conversionId: "signup-123",
      twclid: "twclid-only",
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).conversions[0].identifiers).toEqual([
      { twclid: "twclid-only" },
    ]);
  });

  it("honors custom pixel and event ids", async () => {
    process.env.X_PIXEL_ID = "pixel_custom";
    process.env.X_EVENT_ID = "tw-pixel_custom-event_custom";
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));

    await sendXConversion({
      conversionId: "conv-custom",
      email: "a@b.com",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/pixel_custom`);
    expect(JSON.parse(init.body).conversions[0].event_id).toBe(
      "tw-pixel_custom-event_custom",
    );
  });

  it("logs and swallows non-2xx responses", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad request", { status: 400 }));

    await sendXConversion({
      conversionId: "conv-123",
      email: "a@b.com",
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "[x-capi] failed",
      expect.objectContaining({ status: 400 }),
    );
  });

  it("logs and swallows network exceptions", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    await sendXConversion({
      conversionId: "conv-123",
      email: "a@b.com",
    });

    expect(errorSpy).toHaveBeenCalledWith("[x-capi] exception", expect.any(Error));
  });
});
