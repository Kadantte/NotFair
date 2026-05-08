import crypto from "node:crypto";
import { getRequiredEnv } from "@/lib/env";
import { BRAND_URL_WWW } from "@/lib/brand";

/**
 * Signed one-click unsubscribe tokens for broadcast emails.
 *
 * Format: `<base64url(userId)>.<broadcastId>.<base64url(hmacSha256)>`
 * The HMAC binds (userId, broadcastId) so a leaked token can only
 * unsubscribe one user — never escalate to "unsubscribe everyone".
 *
 * The signing key is `BROADCAST_UNSUBSCRIBE_SECRET`; rotating it
 * invalidates all in-flight tokens but is otherwise safe (recipients
 * who click an old link see a graceful "expired" page).
 */

function getSecret(): string {
  return getRequiredEnv("BROADCAST_UNSUBSCRIBE_SECRET");
}

function b64url(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64url");
}

function fromB64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf-8");
}

function hmac(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function signUnsubscribeToken(userId: string, broadcastId: number): string {
  const payload = `${b64url(userId)}.${broadcastId}`;
  return `${payload}.${hmac(payload)}`;
}

export function verifyUnsubscribeToken(
  token: string,
): { userId: string; broadcastId: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encUserId, encBroadcastId, sig] = parts;
  if (!encUserId || !encBroadcastId || !sig) return null;

  const expected = hmac(`${encUserId}.${encBroadcastId}`);
  const sigBuf = Buffer.from(sig, "base64url");
  const expectedBuf = Buffer.from(expected, "base64url");
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  const broadcastId = Number.parseInt(encBroadcastId, 10);
  if (!Number.isFinite(broadcastId)) return null;

  let userId: string;
  try {
    userId = fromB64url(encUserId);
  } catch {
    return null;
  }
  if (!userId) return null;

  return { userId, broadcastId };
}

export function buildUnsubscribeUrl(userId: string, broadcastId: number): string {
  const token = signUnsubscribeToken(userId, broadcastId);
  return `${BRAND_URL_WWW}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}
