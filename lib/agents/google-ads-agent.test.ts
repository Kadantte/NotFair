import { describe, expect, it } from "vitest";
import { buildGoogleAdsAgentAuthContext } from "./google-ads-agent";

describe("buildGoogleAdsAgentAuthContext", () => {
  it("preserves manager-routed Google Ads account auth for chat tools", () => {
    const auth = buildGoogleAdsAgentAuthContext({
      refreshToken: "rt",
      customerId: "6426052156",
      customerIds: [
        { id: "6426052156", name: "Eupakovka", loginCustomerId: "3016587315" },
      ],
      loginCustomerId: "3016587315",
      userId: "user-1",
      authMethod: "chat",
    });

    expect(auth.customerId).toBe("6426052156");
    expect(auth.loginCustomerId).toBe("3016587315");
    expect(auth.customerIds).toEqual([
      { id: "6426052156", name: "Eupakovka", loginCustomerId: "3016587315" },
    ]);
    expect(auth.clientName).toBe("adsagent-chat");
  });
});
