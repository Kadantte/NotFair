import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("joins classes and drops falsy conditionals", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });

  it("lets later tailwind utilities win over earlier conflicting ones", () => {
    expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4");
  });
});
