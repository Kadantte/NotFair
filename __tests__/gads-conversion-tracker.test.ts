import { describe, expect, it } from "vitest";
import { resolveXSignupEventId } from "@/components/gads-conversion-tracker";

describe("GadsConversionTracker X signup config", () => {
  it("uses the legacy bundled X signup event only with the bundled pixel", () => {
    expect(resolveXSignupEventId({})).toBe("tw-q27qa-q27qc");
  });

  it("fails closed when the X pixel is overridden without a matching signup event", () => {
    expect(resolveXSignupEventId({ NEXT_PUBLIC_X_PIXEL_ID: "pixel-custom" })).toBeUndefined();
  });

  it("uses an explicit X signup event when configured", () => {
    expect(resolveXSignupEventId({
      NEXT_PUBLIC_X_PIXEL_ID: "pixel-custom",
      NEXT_PUBLIC_X_SIGNUP_EVENT_ID: "tw-pixel-custom-signup",
    })).toBe("tw-pixel-custom-signup");
  });
});
