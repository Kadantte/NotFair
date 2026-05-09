import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetKeyCacheForTests,
  decryptSecret,
  decryptSecretOrNull,
  encryptSecret,
  encryptSecretOrNull,
  isEncrypted,
} from "../secrets";

describe("crypto/secrets", () => {
  beforeEach(() => {
    delete process.env.SECRET_ENCRYPTION_KEY;
    _resetKeyCacheForTests();
  });

  afterEach(() => {
    delete process.env.SECRET_ENCRYPTION_KEY;
    _resetKeyCacheForTests();
  });

  it("round-trips a plaintext value with a derived test key", () => {
    const plaintext = "hello-world";
    const enc = encryptSecret(plaintext);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(decryptSecret(enc)).toBe(plaintext);
  });

  it("produces a different ciphertext per call (random IV)", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it("decryptSecret passes through plaintext (lazy-upgrade compat)", () => {
    expect(decryptSecret("legacy-plaintext-token")).toBe("legacy-plaintext-token");
    expect(isEncrypted("legacy-plaintext-token")).toBe(false);
  });

  it("rejects malformed encrypted strings", () => {
    expect(() => decryptSecret("enc:v1:bad")).toThrow();
    expect(() => decryptSecret("enc:v1:" + "a:b:c")).toThrow(); // wrong IV/tag length
  });

  it("rejects tampered ciphertext via GCM auth tag", () => {
    const enc = encryptSecret("payload");
    // Flip a bit in the ciphertext segment (4th colon-separated chunk)
    const parts = enc.split(":");
    parts[parts.length - 1] = parts[parts.length - 1].split("").reverse().join("");
    const tampered = parts.join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("uses SECRET_ENCRYPTION_KEY when set as base64", () => {
    // 32 bytes of zeros base64 = 'AAAA...AAAA='
    process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 0).toString("base64");
    _resetKeyCacheForTests();
    const enc = encryptSecret("with-real-key");
    expect(decryptSecret(enc)).toBe("with-real-key");
  });

  it("accepts a 64-char hex key", () => {
    process.env.SECRET_ENCRYPTION_KEY = "a".repeat(64);
    _resetKeyCacheForTests();
    const enc = encryptSecret("hex-key");
    expect(decryptSecret(enc)).toBe("hex-key");
  });

  it("derives via SHA-256 from a passphrase if not hex/base64-32B", () => {
    process.env.SECRET_ENCRYPTION_KEY = "some-dev-passphrase";
    _resetKeyCacheForTests();
    const enc = encryptSecret("derived-key");
    expect(decryptSecret(enc)).toBe("derived-key");
  });

  it("OrNull helpers handle null/empty inputs", () => {
    expect(encryptSecretOrNull(null)).toBeNull();
    expect(encryptSecretOrNull("")).toBeNull();
    expect(decryptSecretOrNull(null)).toBeNull();
    expect(decryptSecretOrNull("")).toBeNull();
    const enc = encryptSecretOrNull("x");
    expect(enc).not.toBeNull();
    expect(decryptSecretOrNull(enc)).toBe("x");
  });

  it("decryption with a different key fails (no silent corruption)", () => {
    process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    _resetKeyCacheForTests();
    const enc = encryptSecret("locked");

    process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString("base64");
    _resetKeyCacheForTests();
    expect(() => decryptSecret(enc)).toThrow();
  });
});
