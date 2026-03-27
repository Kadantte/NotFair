import { describe, it, expect } from "vitest";
import { encodeTrackingEntityId, decodeTrackingEntityId } from "@/lib/google-ads";

describe("encodeTrackingEntityId", () => {
  it("encodes account level as 'account'", () => {
    expect(encodeTrackingEntityId("account")).toBe("account");
    expect(encodeTrackingEntityId("account", undefined)).toBe("account");
  });

  it("encodes campaign level as 'campaign:{id}'", () => {
    expect(encodeTrackingEntityId("campaign", "12345")).toBe("campaign:12345");
  });

  it("encodes ad_group level as 'ad_group:{id}'", () => {
    expect(encodeTrackingEntityId("ad_group", "67890")).toBe("ad_group:67890");
  });

  it("encodes ad level as 'ad:{id}'", () => {
    expect(encodeTrackingEntityId("ad", "11111")).toBe("ad:11111");
  });
});

describe("decodeTrackingEntityId", () => {
  it("decodes 'account' back to account level", () => {
    expect(decodeTrackingEntityId("account")).toEqual({ level: "account" });
  });

  it("decodes 'campaign:{id}' back to campaign level", () => {
    expect(decodeTrackingEntityId("campaign:12345")).toEqual({ level: "campaign", entityId: "12345" });
  });

  it("decodes 'ad_group:{id}' back to ad_group level", () => {
    expect(decodeTrackingEntityId("ad_group:67890")).toEqual({ level: "ad_group", entityId: "67890" });
  });

  it("decodes 'ad:{id}' back to ad level", () => {
    expect(decodeTrackingEntityId("ad:11111")).toEqual({ level: "ad", entityId: "11111" });
  });

  it("roundtrips correctly for all levels", () => {
    const cases: Array<[Parameters<typeof encodeTrackingEntityId>[0], string?]> = [
      ["account", undefined],
      ["campaign", "999"],
      ["ad_group", "888"],
      ["ad", "777"],
    ];
    for (const [level, entityId] of cases) {
      const encoded = encodeTrackingEntityId(level, entityId);
      const decoded = decodeTrackingEntityId(encoded);
      expect(decoded.level).toBe(level);
      if (level !== "account") {
        expect(decoded.entityId).toBe(entityId);
      }
    }
  });

  it("throws on missing colon (no level prefix)", () => {
    expect(() => decodeTrackingEntityId("campaign123")).toThrow(/unrecognized tracking entity ID format/);
    expect(() => decodeTrackingEntityId("")).toThrow(/unrecognized tracking entity ID format/);
  });

  it("throws on unknown level prefix", () => {
    expect(() => decodeTrackingEntityId("budget:123")).toThrow(/unknown tracking level/);
    expect(() => decodeTrackingEntityId("keyword:456")).toThrow(/unknown tracking level/);
  });
});
