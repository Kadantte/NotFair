import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendRedditConversion } from "../reddit-capi";

const ENDPOINT = "https://ads-api.reddit.com/api/v2.0/conversions/events";

describe("sendRedditConversion", () => {
  const originalEnv = { ...process.env };
  const fetchMock = vi.fn();
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    warnSpy.mockClear();
    errorSpy.mockClear();
    process.env.REDDIT_PIXEL_ID = "a2_testpixel";
    process.env.REDDIT_CONVERSION_ACCESS_TOKEN = "secret-token";
    delete process.env.REDDIT_CAPI_TEST_MODE;
    delete process.env.NEXT_PUBLIC_REDDIT_PIXEL_ID;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("skips when env vars are missing", async () => {
    delete process.env.REDDIT_PIXEL_ID;
    delete process.env.REDDIT_CONVERSION_ACCESS_TOKEN;

    await sendRedditConversion({
      trackingType: "SignUp",
      conversionId: "abc",
      email: "a@b.com",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips when no attribution signals are provided", async () => {
    await sendRedditConversion({
      trackingType: "SignUp",
      conversionId: "abc",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("posts a well-formed payload with normalized email", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));

    await sendRedditConversion({
      trackingType: "SignUp",
      conversionId: "conv-123",
      email: "  FOO@BAR.com ",
      externalId: "user-42",
      ipAddress: "1.2.3.4",
      userAgent: "UA/1.0",
      valueDecimal: 1,
      currency: "USD",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ENDPOINT}/a2_testpixel`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer secret-token");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body);
    expect(body.test_mode).toBe(false);
    expect(body.events).toHaveLength(1);
    const [event] = body.events;
    expect(event.event_type).toEqual({ tracking_type: "SignUp" });
    expect(event.event_metadata).toEqual({
      conversion_id: "conv-123",
      value_decimal: 1,
      currency: "USD",
    });
    expect(event.user).toEqual({
      email: "foo@bar.com",
      external_id: "user-42",
      ip_address: "1.2.3.4",
      user_agent: "UA/1.0",
    });
    expect(typeof event.event_at).toBe("string");
    expect(Number.isFinite(Date.parse(event.event_at))).toBe(true);
  });

  it("honors REDDIT_CAPI_TEST_MODE flag", async () => {
    process.env.REDDIT_CAPI_TEST_MODE = "1";
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));

    await sendRedditConversion({
      trackingType: "SignUp",
      conversionId: "conv-xyz",
      email: "a@b.com",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.test_mode).toBe(true);
  });

  it("falls back to NEXT_PUBLIC_REDDIT_PIXEL_ID when REDDIT_PIXEL_ID is unset", async () => {
    delete process.env.REDDIT_PIXEL_ID;
    process.env.NEXT_PUBLIC_REDDIT_PIXEL_ID = "a2_publicfallback";
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));

    await sendRedditConversion({
      trackingType: "SignUp",
      conversionId: "c",
      email: "a@b.com",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(`${ENDPOINT}/a2_publicfallback`);
  });

  it("logs and swallows non-2xx responses", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad request", { status: 400 }));

    await sendRedditConversion({
      trackingType: "SignUp",
      conversionId: "c",
      email: "a@b.com",
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "[reddit-capi] failed",
      expect.objectContaining({ status: 400 }),
    );
  });

  it("logs and swallows network exceptions", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    await sendRedditConversion({
      trackingType: "SignUp",
      conversionId: "c",
      email: "a@b.com",
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "[reddit-capi] exception",
      expect.any(Error),
    );
  });
});
