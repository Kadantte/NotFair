/**
 * Personal access tokens for the HighLevel MCP route.
 *
 * Format: `ghl_pat_<connectionId>_<32 base64url bytes>`
 *
 * The plaintext is shown to the user once at creation time. Storage is
 * SHA-256 of the plaintext — we never persist it raw. Lookup is
 * constant-time on the unique hash index.
 */
import { createHash, randomBytes } from "crypto";

export const GHL_PAT_PREFIX = "ghl_pat_";

export type IssuedPat = {
  /** Plaintext token. Show to the user once, never store. */
  token: string;
  /** SHA-256 of the plaintext, stored in `gohighlevel_access_tokens.token_hash`. */
  tokenHash: string;
};

/** Issue a fresh PAT for the given connection id. */
export function issuePat(connectionId: number): IssuedPat {
  const random = randomBytes(32).toString("base64url");
  const token = `${GHL_PAT_PREFIX}${connectionId}_${random}`;
  return { token, tokenHash: hashPat(token) };
}

/** Hash a PAT for storage / lookup. */
export function hashPat(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Pull the connection id off the front of a PAT for a fast pre-filter
 * before the hash lookup. Returns null for malformed tokens.
 */
export function parseConnectionIdFromPat(token: string): number | null {
  if (!token.startsWith(GHL_PAT_PREFIX)) return null;
  const rest = token.slice(GHL_PAT_PREFIX.length);
  const sep = rest.indexOf("_");
  if (sep <= 0) return null;
  const idStr = rest.slice(0, sep);
  if (!/^\d+$/.test(idStr)) return null;
  const id = Number(idStr);
  return Number.isFinite(id) && id > 0 ? id : null;
}
