import { describe, expect, it } from "vitest";
import { GHL_PAT_PREFIX, hashPat, issuePat, parseConnectionIdFromPat } from "@/lib/gohighlevel/pat";

describe("gohighlevel/pat", () => {
  it("issues a token with the right prefix and embedded connection id", () => {
    const { token, tokenHash } = issuePat(42);
    expect(token.startsWith(GHL_PAT_PREFIX)).toBe(true);
    expect(token).toMatch(/^ghl_pat_42_[A-Za-z0-9_-]{43,}$/);
    expect(parseConnectionIdFromPat(token)).toBe(42);
    expect(hashPat(token)).toBe(tokenHash);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("issues different tokens on every call", () => {
    const a = issuePat(1);
    const b = issuePat(1);
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it("parseConnectionIdFromPat rejects malformed tokens", () => {
    expect(parseConnectionIdFromPat("not-a-pat")).toBeNull();
    expect(parseConnectionIdFromPat("ghl_pat_abc_xyz")).toBeNull();
    expect(parseConnectionIdFromPat("ghl_pat_-1_xyz")).toBeNull();
    expect(parseConnectionIdFromPat("ghl_pat_42")).toBeNull(); // no separator after id
    expect(parseConnectionIdFromPat("ghl_pat_42_")).toBe(42); // empty random portion still parses
  });

  it("hashPat is deterministic", () => {
    expect(hashPat("ghl_pat_1_a")).toBe(hashPat("ghl_pat_1_a"));
    expect(hashPat("ghl_pat_1_a")).not.toBe(hashPat("ghl_pat_1_b"));
  });
});
