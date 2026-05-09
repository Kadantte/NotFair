import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHmac, generateKeyPairSync, createSign } from "crypto";
import { verifyWebhookSignature } from "@/lib/gohighlevel/webhook";

function clearEnv() {
  delete process.env.GOHIGHLEVEL_WEBHOOK_PUBLIC_KEY;
  delete process.env.GOHIGHLEVEL_WEBHOOK_SECRET;
  delete process.env.GOHIGHLEVEL_WEBHOOK_ALLOW_UNSIGNED;
}

describe("gohighlevel/webhook — verifyWebhookSignature", () => {
  beforeEach(clearEnv);
  afterEach(clearEnv);

  it("rejects when signature header is missing", () => {
    process.env.GOHIGHLEVEL_WEBHOOK_SECRET = "shh";
    const result = verifyWebhookSignature({ rawBody: "{}", signature: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_signature");
  });

  it("HMAC: accepts a correct shared-secret signature", () => {
    process.env.GOHIGHLEVEL_WEBHOOK_SECRET = "shared-secret";
    const body = JSON.stringify({ type: "INSTALL" });
    const sig = createHmac("sha256", "shared-secret").update(body).digest("base64");
    const result = verifyWebhookSignature({ rawBody: body, signature: sig });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mode).toBe("hmac");
  });

  it("HMAC: rejects a tampered body", () => {
    process.env.GOHIGHLEVEL_WEBHOOK_SECRET = "shared-secret";
    const body = JSON.stringify({ type: "INSTALL" });
    const sig = createHmac("sha256", "shared-secret").update(body).digest("base64");
    const result = verifyWebhookSignature({
      rawBody: JSON.stringify({ type: "UNINSTALL" }),
      signature: sig,
    });
    expect(result.ok).toBe(false);
  });

  it("HMAC: rejects a wrong-length signature without crashing", () => {
    process.env.GOHIGHLEVEL_WEBHOOK_SECRET = "shared-secret";
    const result = verifyWebhookSignature({
      rawBody: "{}",
      signature: Buffer.from("short").toString("base64"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("hmac_length_mismatch");
  });

  it("RSA: accepts a correct RSA-SHA256 signature", () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.GOHIGHLEVEL_WEBHOOK_PUBLIC_KEY = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    const body = JSON.stringify({ type: "UNINSTALL" });
    const signer = createSign("RSA-SHA256");
    signer.update(body);
    signer.end();
    const sig = signer.sign(privateKey).toString("base64");
    const result = verifyWebhookSignature({ rawBody: body, signature: sig });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mode).toBe("rsa");
  });

  it("RSA: rejects a signature from a different key", () => {
    const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const { privateKey: otherPriv } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.GOHIGHLEVEL_WEBHOOK_PUBLIC_KEY = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    const body = "hi";
    const signer = createSign("RSA-SHA256");
    signer.update(body);
    signer.end();
    const sig = signer.sign(otherPriv).toString("base64");
    const result = verifyWebhookSignature({ rawBody: body, signature: sig });
    expect(result.ok).toBe(false);
  });

  it("Unsigned dev mode: skips verification when allow-unsigned is set and no key configured", () => {
    process.env.GOHIGHLEVEL_WEBHOOK_ALLOW_UNSIGNED = "true";
    const result = verifyWebhookSignature({ rawBody: "{}", signature: null });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mode).toBe("skipped");
  });

  it("Unsigned dev mode: still rejects when a key IS configured (defense in depth)", () => {
    process.env.GOHIGHLEVEL_WEBHOOK_ALLOW_UNSIGNED = "true";
    process.env.GOHIGHLEVEL_WEBHOOK_SECRET = "secret";
    const result = verifyWebhookSignature({ rawBody: "{}", signature: null });
    expect(result.ok).toBe(false);
  });
});
