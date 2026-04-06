import { createHmac } from "crypto";

const SECRET = process.env.CRON_SECRET || process.env.RESEND_API_KEY || "outreach-fallback-key";

/** Sign an ID so unsubscribe/track URLs are unguessable */
export function signId(id: number, action: "unsub" | "track"): string {
  const hmac = createHmac("sha256", SECRET);
  hmac.update(`${action}:${id}`);
  return hmac.digest("hex").slice(0, 16);
}

/** Build a signed token: "id-signature" */
export function makeToken(id: number, action: "unsub" | "track"): string {
  return `${id}-${signId(id, action)}`;
}

/** Verify and extract ID from a signed token. Returns null if invalid. */
export function verifyToken(token: string, action: "unsub" | "track"): number | null {
  const dashIdx = token.indexOf("-");
  if (dashIdx === -1) return null;

  const id = Number(token.slice(0, dashIdx));
  const sig = token.slice(dashIdx + 1);

  if (isNaN(id) || !sig) return null;
  if (sig !== signId(id, action)) return null;

  return id;
}
