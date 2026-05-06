import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/auth/signin/route";

vi.mock("@/lib/oauth-nonce", () => ({
  storeOAuthNonce: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("crypto", async () => {
  const actual = await vi.importActual<typeof import("crypto")>("crypto");
  return {
    ...actual,
    randomBytes: () => Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
  };
});

describe("Google OAuth signin route", () => {
  beforeEach(() => {
    process.env.GOOGLE_ADS_CLIENT_ID = "test-google-client";
    process.env.NEXT_PUBLIC_APP_URL = "https://www.notfair.co";
  });

  it("uses the canonical auth callback redirect URI regardless of locale", async () => {
    const request = new Request(
      "https://www.notfair.co/api/auth/signin?next=%2Fconnect%2Fgoogle-ads%2Fclaude-code",
      {
        headers: {
          "accept-language": "fr-FR,fr;q=0.9",
          cookie: "NEXT_LOCALE=fr",
        },
      },
    );

    const response = await GET(request);
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toBeTruthy();

    const googleUrl = new URL(location as string);
    expect(googleUrl.origin).toBe("https://accounts.google.com");
    expect(googleUrl.searchParams.get("client_id")).toBe("test-google-client");
    expect(googleUrl.searchParams.get("redirect_uri")).toBe("https://www.notfair.co/auth/callback");

    const state = JSON.parse(
      Buffer.from(googleUrl.searchParams.get("state") ?? "", "base64url").toString("utf8"),
    );
    expect(state.next).toBe("/connect/google-ads/claude-code");
  });
});
