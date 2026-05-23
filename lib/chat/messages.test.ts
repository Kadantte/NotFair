import { describe, expect, it } from "vitest";
import { sanitizeNonEmptyPartMessages } from "./messages";

describe("sanitizeNonEmptyPartMessages", () => {
  it("drops UI messages with empty parts before AI SDK validation", () => {
    const messages = [
      { id: "1", role: "user", parts: [{ type: "text", text: "hello" }] },
      { id: "2", role: "user", parts: [] },
      { id: "3", role: "assistant", parts: [{ type: "text", text: "hi" }] },
    ];

    expect(sanitizeNonEmptyPartMessages(messages)).toEqual([
      messages[0],
      messages[2],
    ]);
  });

  it("returns an empty array for non-array or fully empty histories", () => {
    expect(sanitizeNonEmptyPartMessages(undefined)).toEqual([]);
    expect(sanitizeNonEmptyPartMessages([{ id: "1", role: "user", parts: [] }])).toEqual([]);
  });
});
