import { describe, it, expect } from "vitest";
import { parseCustomerIds } from "@/lib/google-ads";

describe("parseCustomerIds", () => {
  it("parses valid JSON array of accounts", () => {
    const input = JSON.stringify([
      { id: "111", name: "Pet Hotel" },
      { id: "222", name: "Pet Travel" },
    ]);
    const result = parseCustomerIds(input);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("111");
    expect(result[1].name).toBe("Pet Travel");
  });

  it("returns empty array for null", () => {
    expect(parseCustomerIds(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(parseCustomerIds(undefined)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseCustomerIds("")).toEqual([]);
  });

  it("returns empty array for '[]'", () => {
    expect(parseCustomerIds("[]")).toEqual([]);
  });

  it("returns empty array for malformed JSON", () => {
    expect(parseCustomerIds("{not valid json")).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseCustomerIds(JSON.stringify({ id: "111" }))).toEqual([]);
  });

  it("filters out entries without id field", () => {
    const input = JSON.stringify([
      { id: "111", name: "Good" },
      { name: "No ID" },
      { id: "222", name: "Also good" },
    ]);
    const result = parseCustomerIds(input);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("111");
    expect(result[1].id).toBe("222");
  });

  it("handles entries with empty name", () => {
    const input = JSON.stringify([{ id: "111", name: "" }]);
    const result = parseCustomerIds(input);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("");
  });
});
