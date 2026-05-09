/**
 * Symmetric secret encryption for tokens at rest.
 *
 * Format: `enc:v1:<iv-b64>:<tag-b64>:<ciphertext-b64>` using AES-256-GCM.
 *
 * Key source: `SECRET_ENCRYPTION_KEY` env var (32 bytes, base64- or hex-
 * encoded). In tests we accept any non-empty string and SHA-256 it down to a
 * 32-byte key so suites can run without setting the real env.
 *
 * Read path: `decryptSecret` sniffs the `enc:v1:` prefix. Plaintext rows
 * (pre-encryption) pass through unchanged — supports lazy upgrade on the
 * next refresh write. Once every row has been touched, the legacy branch
 * can be removed.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { getEnv } from "@/lib/env";

const VERSION = "v1";
const PREFIX = `enc:${VERSION}:`;
const IV_BYTES = 12; // GCM standard
const TAG_BYTES = 16;
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = getEnv("SECRET_ENCRYPTION_KEY");
  if (!raw) {
    if (process.env.NODE_ENV === "test") {
      cachedKey = createHash("sha256").update("notfair-test-key").digest();
      return cachedKey;
    }
    throw new Error(
      "SECRET_ENCRYPTION_KEY is not set. Generate with `openssl rand -base64 32`.",
    );
  }
  // Accept hex (64 chars) or base64 (44-ish chars). If it's neither, derive
  // via SHA-256 so a passphrase is acceptable in development.
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    try {
      const decoded = Buffer.from(raw, "base64");
      key = decoded.length === KEY_BYTES
        ? decoded
        : createHash("sha256").update(raw).digest();
    } catch {
      key = createHash("sha256").update(raw).digest();
    }
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(`SECRET_ENCRYPTION_KEY must derive to ${KEY_BYTES} bytes; got ${key.length}.`);
  }
  cachedKey = key;
  return key;
}

/** Test hook — clear the cached key so a freshly-set env is picked up. */
export function _resetKeyCacheForTests(): void {
  cachedKey = null;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== "string") {
    throw new Error("encryptSecret expects a string.");
  }
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) {
    // Plaintext fallback — used during the lazy-upgrade window.
    return stored;
  }
  const body = stored.slice(PREFIX.length);
  const parts = body.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted secret (expected 3 colon-separated parts).");
  }
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");
  if (iv.length !== IV_BYTES) throw new Error("Bad IV length on encrypted secret.");
  if (tag.length !== TAG_BYTES) throw new Error("Bad tag length on encrypted secret.");
  const key = loadKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return out.toString("utf8");
}

/**
 * Convenience for nullable columns — encrypt if non-null, return null otherwise.
 */
export function encryptSecretOrNull(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return encryptSecret(value);
}

export function decryptSecretOrNull(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return decryptSecret(value);
}
