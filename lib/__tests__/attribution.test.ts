import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ATTRIBUTION_COOKIE_NAME,
  PAID_TOUCH_COOKIE_NAME,
  attributionToUserMetadata,
  paidTouchToUserMetadata,
  isInternalAttributionReferrer,
  parseAttributionCookie,
  parsePaidTouchCookie,
} from "@/lib/utm";
import { buildUserAttributionRecord } from "@/lib/db/attribution";
import { GET as googleSignin } from "@/app/api/auth/signin/route";

vi.mock("@/lib/oauth-nonce", () => ({
  storeOAuthNonce: vi.fn().mockResolvedValue(undefined),
}));

const originalGoogleClientId = process.env.GOOGLE_ADS_CLIENT_ID;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

function oauthState(response: Response): Record<string, unknown> {
  const location = response.headers.get("location");
  expect(location).toBeTruthy();

  const state = new URL(location!).searchParams.get("state");
  expect(state).toBeTruthy();

  return JSON.parse(Buffer.from(state!, "base64url").toString("utf8"));
}

beforeEach(() => {
  process.env.GOOGLE_ADS_CLIENT_ID = "test-client-id";
  process.env.NEXT_PUBLIC_APP_URL = "https://www.notfair.co";
});

afterEach(() => {
  if (originalGoogleClientId === undefined) {
    delete process.env.GOOGLE_ADS_CLIENT_ID;
  } else {
    process.env.GOOGLE_ADS_CLIENT_ID = originalGoogleClientId;
  }

  if (originalAppUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  }
});

describe("first-touch attribution helpers", () => {
  it("parses and sanitizes the attribution cookie", () => {
    const cookieValue = encodeURIComponent(JSON.stringify({
      version: 1,
      utm_source: "github",
      utm_medium: "referral",
      gclid: "gclid-123",
      first_landing_url: "https://www.notfair.co/google-ads-mcp?utm_source=github",
      first_landing_path: "/google-ads-mcp?utm_source=github",
      signup_referrer: "https://github.com/nowork-studio/toprank",
      attribution_captured_at: "2026-05-07T15:00:00.000Z",
    }));

    const parsed = parseAttributionCookie(`foo=bar; ${ATTRIBUTION_COOKIE_NAME}=${cookieValue}`);

    expect(parsed).toMatchObject({
      utm_source: "github",
      utm_medium: "referral",
      gclid: "gclid-123",
      signup_referrer_domain: "github.com",
      first_landing_path: "/google-ads-mcp?utm_source=github",
    });
  });

  it("flags OAuth and same-site referrers as internal attribution noise", () => {
    expect(isInternalAttributionReferrer("https://accounts.google.com/", "www.notfair.co")).toBe(true);
    expect(isInternalAttributionReferrer("https://www.notfair.co/pricing", "notfair.co")).toBe(true);
    expect(isInternalAttributionReferrer("https://github.com/nowork-studio/toprank", "notfair.co")).toBe(false);
  });

  it("converts first-touch fields to Supabase user metadata", () => {
    expect(attributionToUserMetadata({
      version: 1,
      utm_source: "reddit",
      rdt_cid: "abc123",
      twclid: "twclid-123",
      signup_referrer: "https://www.reddit.com/r/PPC/",
      signup_referrer_domain: "reddit.com",
      attribution_captured_at: "2026-05-07T15:00:00.000Z",
    })).toEqual({
      attribution_version: 1,
      utm_source: "reddit",
      rdt_cid: "abc123",
      twclid: "twclid-123",
      signup_referrer: "https://www.reddit.com/r/PPC/",
      signup_referrer_domain: "reddit.com",
      attribution_captured_at: "2026-05-07T15:00:00.000Z",
    });
  });

  it("parses paid-touch only when paid signals are present", () => {
    const paidCookieValue = encodeURIComponent(JSON.stringify({
      version: 1,
      utm_source: "x",
      utm_medium: "paid_social",
      utm_campaign: "notfair_signup_sales_202605",
      twclid: "twclid-123",
      first_landing_url: "https://www.notfair.co/?twclid=twclid-123",
      first_landing_path: "/?twclid=twclid-123",
      attribution_captured_at: "2026-05-12T20:00:00.000Z",
    }));
    const organicCookieValue = encodeURIComponent(JSON.stringify({
      version: 1,
      utm_source: "github",
      utm_medium: "referral",
    }));

    expect(parsePaidTouchCookie(`${PAID_TOUCH_COOKIE_NAME}=${paidCookieValue}`)).toMatchObject({
      utm_source: "x",
      utm_medium: "paid_social",
      twclid: "twclid-123",
    });
    expect(parsePaidTouchCookie(`${PAID_TOUCH_COOKIE_NAME}=${organicCookieValue}`)).toBeNull();
  });

  it("treats explicit X UTM landings as paid touch even without utm_medium", () => {
    const paidCookieValue = encodeURIComponent(JSON.stringify({
      version: 1,
      utm_source: "x",
      utm_campaign: "notfair_signup_sales_202605",
      first_landing_path: "/?utm_source=x&utm_campaign=notfair_signup_sales_202605",
      attribution_captured_at: "2026-05-12T20:00:00.000Z",
    }));

    expect(parsePaidTouchCookie(`${PAID_TOUCH_COOKIE_NAME}=${paidCookieValue}`)).toMatchObject({
      utm_source: "x",
      utm_campaign: "notfair_signup_sales_202605",
    });
  });

  it("converts paid-touch fields to separate signup metadata", () => {
    expect(paidTouchToUserMetadata({
      version: 1,
      twclid: "twclid-123",
      attribution_captured_at: "2026-05-12T20:00:00.000Z",
    })).toEqual({
      paid_attribution_version: 1,
      paid_source: "x",
      paid_twclid: "twclid-123",
      paid_captured_at: "2026-05-12T20:00:00.000Z",
    });
  });

  it("builds a SQL attribution record with source fallback and raw attribution", () => {
    const record = buildUserAttributionRecord({
      userId: "user-123",
      email: "buyer@example.com",
      signupMethod: "google_oauth",
      attributionSource: "oauth_state",
      attribution: {
        version: 1,
        signup_referrer: "https://github.com/nowork-studio/toprank",
        signup_referrer_domain: "github.com",
        first_landing_path: "/google-ads-mcp",
        attribution_captured_at: "2026-05-07T15:00:00.000Z",
      },
      paidTouch: {
        version: 1,
        utm_source: "x",
        utm_medium: "paid_social",
        utm_campaign: "notfair_signup_sales_202605",
        twclid: "twclid-123",
        first_landing_path: "/?twclid=twclid-123",
        attribution_captured_at: "2026-05-12T20:00:00.000Z",
      },
    });

    expect(record).toMatchObject({
      userId: "user-123",
      email: "buyer@example.com",
      signupMethod: "google_oauth",
      source: "github.com",
      signupReferrerDomain: "github.com",
      attributionSource: "oauth_state",
      paidSource: "x",
      paidMedium: "paid_social",
      paidCampaign: "notfair_signup_sales_202605",
      paidTwclid: "twclid-123",
      paidLandingPath: "/?twclid=twclid-123",
      latestPaidTouch: {
        paid_attribution_version: 1,
        paid_source: "x",
        paid_medium: "paid_social",
        paid_campaign: "notfair_signup_sales_202605",
        paid_twclid: "twclid-123",
        paid_landing_path: "/?twclid=twclid-123",
        paid_captured_at: "2026-05-12T20:00:00.000Z",
      },
      rawAttribution: {
        attribution_version: 1,
        signup_referrer: "https://github.com/nowork-studio/toprank",
        signup_referrer_domain: "github.com",
        first_landing_path: "/google-ads-mcp",
        attribution_captured_at: "2026-05-07T15:00:00.000Z",
      },
    });
    expect(record?.attributionCapturedAt).toBeInstanceOf(Date);
  });

  it("does not thread internal referrers through the OAuth state fallback", async () => {
    const response = await googleSignin(new Request(
      "https://www.notfair.co/api/auth/signin?utm_source=google&signup_referrer=https%3A%2F%2Faccounts.google.com%2F",
    ));
    const state = oauthState(response);

    expect(state.signup_referrer).toBeUndefined();
    expect(state.attribution).toMatchObject({ utm_source: "google" });
    expect(state.attribution).not.toHaveProperty("signup_referrer");
  });

  it("threads latest paid touch through OAuth state without overwriting first touch", async () => {
    const firstTouch = encodeURIComponent(JSON.stringify({
      version: 1,
      utm_source: "github",
      signup_referrer: "https://github.com/nowork-studio/toprank",
      first_landing_path: "/google-ads-mcp",
      attribution_captured_at: "2026-05-07T15:00:00.000Z",
    }));
    const paidTouch = encodeURIComponent(JSON.stringify({
      version: 1,
      utm_source: "x",
      utm_medium: "paid_social",
      utm_campaign: "notfair_signup_sales_202605",
      twclid: "twclid-123",
      first_landing_path: "/?twclid=twclid-123",
      attribution_captured_at: "2026-05-12T20:00:00.000Z",
    }));

    const response = await googleSignin(new Request(
      "https://www.notfair.co/api/auth/signin",
      { headers: { cookie: `${ATTRIBUTION_COOKIE_NAME}=${firstTouch}; ${PAID_TOUCH_COOKIE_NAME}=${paidTouch}` } },
    ));
    const state = oauthState(response);

    expect(state.attribution).toMatchObject({ utm_source: "github" });
    expect(state.latest_paid_touch).toMatchObject({
      utm_source: "x",
      utm_medium: "paid_social",
      twclid: "twclid-123",
    });
  });
});
