import { beforeAll, describe, expect, it } from "vitest";

const TEST_SECRET = "test-secret-for-broadcast-token-tests-only";

beforeAll(() => {
  process.env.BROADCAST_UNSUBSCRIBE_SECRET = TEST_SECRET;
});

describe("broadcast unsubscribe tokens", () => {
  it("round-trips userId + broadcastId", async () => {
    const { signUnsubscribeToken, verifyUnsubscribeToken } = await import(
      "@/lib/email/broadcast-token"
    );
    const token = signUnsubscribeToken("user_abc-123", 42);
    const decoded = verifyUnsubscribeToken(token);
    expect(decoded).toEqual({ userId: "user_abc-123", broadcastId: 42 });
  });

  it("rejects a tampered signature", async () => {
    const { signUnsubscribeToken, verifyUnsubscribeToken } = await import(
      "@/lib/email/broadcast-token"
    );
    const token = signUnsubscribeToken("user_abc", 1);
    const [u, b] = token.split(".");
    const tampered = `${u}.${b}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("rejects when broadcastId is swapped under a valid signature", async () => {
    const { signUnsubscribeToken, verifyUnsubscribeToken } = await import(
      "@/lib/email/broadcast-token"
    );
    const token = signUnsubscribeToken("user_abc", 1);
    const [u, , sig] = token.split(".");
    // Reuse the signature from broadcast 1 but claim broadcast 2 — must fail.
    const swapped = `${u}.2.${sig}`;
    expect(verifyUnsubscribeToken(swapped)).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    const { verifyUnsubscribeToken } = await import("@/lib/email/broadcast-token");
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken("only-one-part")).toBeNull();
    expect(verifyUnsubscribeToken("a.b")).toBeNull();
    expect(verifyUnsubscribeToken("a.b.c.d")).toBeNull();
  });
});
