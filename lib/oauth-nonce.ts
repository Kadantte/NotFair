import { db, schema } from "@/lib/db";
import { eq, lt } from "drizzle-orm";

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Store an OAuth nonce server-side so verification doesn't depend on cookies.
 * The nonce is single-use: consumed on first verification.
 */
export async function storeOAuthNonce(nonce: string): Promise<void> {
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
  await db().insert(schema.oauthNonces).values({ nonce, expiresAt });
}

/**
 * Verify and consume a nonce. Returns true if the nonce exists and hasn't
 * expired, then deletes it to prevent replay. Also cleans up expired nonces.
 */
export async function verifyOAuthNonce(nonce: string): Promise<boolean> {
  // Delete expired nonces opportunistically
  await db()
    .delete(schema.oauthNonces)
    .where(lt(schema.oauthNonces.expiresAt, new Date()));

  // Try to delete the target nonce — if it existed, we consumed it
  const deleted = await db()
    .delete(schema.oauthNonces)
    .where(eq(schema.oauthNonces.nonce, nonce))
    .returning({ nonce: schema.oauthNonces.nonce });

  return deleted.length > 0;
}
