/**
 * HighLevel webhook event handling.
 *
 * HighLevel signs webhook payloads with RS256 using their public key. The
 * signature lands in the `x-wh-signature` header (base64-encoded). To verify:
 *   1. Take the raw request body bytes (NOT a JSON re-stringify).
 *   2. RSA-SHA256 verify against HighLevel's public key.
 *   3. If `GOHIGHLEVEL_WEBHOOK_PUBLIC_KEY` is unset, fall back to a shared
 *      secret HMAC for development. (Configured via
 *      `GOHIGHLEVEL_WEBHOOK_SECRET`.)
 *
 * The shared-secret fallback is intentional — it lets you wire the webhook
 * up locally with a tunnel before fetching the real public key. Production
 * should ALWAYS set the public key env var.
 *
 * Supported events for the lifecycle handler:
 *   - INSTALL:           noop (we already persist via the OAuth callback).
 *   - UNINSTALL / INSTALL_DELETE: soft-delete every matching connection.
 *   - LOCATION_CREATE:   noop (location tokens are minted via bulk install).
 *   - PLAN_CHANGE:       passthrough — logged for now.
 *
 * Anything else is logged at info level and acknowledged with 200 so
 * HighLevel stops retrying. Mirrors the Stripe webhook contract.
 */
import { createHmac, createPublicKey, createVerify, timingSafeEqual } from "crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";

export type GhlWebhookEvent = {
  type?: string;
  appId?: string;
  companyId?: string;
  locationId?: string;
  installType?: "Company" | "Location" | string;
  timestamp?: string;
} & Record<string, unknown>;

export type WebhookVerifyResult =
  | { ok: true; mode: "rsa" | "hmac" | "skipped" }
  | { ok: false; reason: string };

/**
 * Verify a HighLevel webhook signature against the raw body. Tries RSA
 * (production) first, then HMAC (dev) — whichever env var is configured.
 *
 * Returns { ok: true } when no key is configured AND
 * `GOHIGHLEVEL_WEBHOOK_ALLOW_UNSIGNED` is set. This is a deliberately loud
 * escape hatch for local-only dev — never set it in production.
 */
export function verifyWebhookSignature(opts: {
  rawBody: string;
  signature: string | null;
}): WebhookVerifyResult {
  const publicKeyPem = getEnv("GOHIGHLEVEL_WEBHOOK_PUBLIC_KEY");
  const sharedSecret = getEnv("GOHIGHLEVEL_WEBHOOK_SECRET");
  const allowUnsigned = getEnv("GOHIGHLEVEL_WEBHOOK_ALLOW_UNSIGNED") === "true";

  if (!opts.signature) {
    if (allowUnsigned && !publicKeyPem && !sharedSecret) {
      return { ok: true, mode: "skipped" };
    }
    return { ok: false, reason: "missing_signature" };
  }

  if (publicKeyPem) {
    try {
      const key = createPublicKey({ key: publicKeyPem.replace(/\\n/g, "\n") });
      const verifier = createVerify("RSA-SHA256");
      verifier.update(opts.rawBody);
      verifier.end();
      const sigBuf = Buffer.from(opts.signature, "base64");
      const ok = verifier.verify(key, sigBuf);
      return ok ? { ok: true, mode: "rsa" } : { ok: false, reason: "rsa_signature_mismatch" };
    } catch (e) {
      return { ok: false, reason: `rsa_verify_error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  if (sharedSecret) {
    try {
      const expected = createHmac("sha256", sharedSecret).update(opts.rawBody).digest();
      const got = Buffer.from(opts.signature, "base64");
      if (got.length !== expected.length) return { ok: false, reason: "hmac_length_mismatch" };
      const ok = timingSafeEqual(expected, got);
      return ok ? { ok: true, mode: "hmac" } : { ok: false, reason: "hmac_signature_mismatch" };
    } catch (e) {
      return { ok: false, reason: `hmac_verify_error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  if (allowUnsigned) return { ok: true, mode: "skipped" };
  return { ok: false, reason: "no_verification_key_configured" };
}

export type WebhookHandlerResult = {
  type: string;
  applied: number;
  notes?: string[];
};

/**
 * Apply a parsed webhook event to local state. Idempotent — replaying the
 * same event is safe.
 */
export async function handleWebhookEvent(event: GhlWebhookEvent): Promise<WebhookHandlerResult> {
  const type = String(event.type ?? "").toUpperCase();
  const notes: string[] = [];

  switch (type) {
    case "UNINSTALL":
    case "APP_UNINSTALL":
    case "INSTALL_DELETE": {
      const targetIds = await findConnections(event);
      if (targetIds.length === 0) {
        notes.push("no matching connections");
        return { type, applied: 0, notes };
      }
      await db()
        .update(schema.goHighLevelConnections)
        .set({ uninstalledAt: new Date(), updatedAt: new Date() })
        .where(inArray(schema.goHighLevelConnections.id, targetIds));
      // Revoke all PATs tied to the uninstalled connections.
      await db()
        .update(schema.goHighLevelAccessTokens)
        .set({ revokedAt: new Date() })
        .where(inArray(schema.goHighLevelAccessTokens.connectionId, targetIds));
      // Hard-delete Claude consumer-OAuth tokens + outstanding auth codes.
      // We delete rather than soft-revoke because oauth_access_tokens has no
      // revoked_at column — the MCP route's audience+uninstalledAt check
      // would already reject these, so the rows would just be dead weight.
      await db()
        .delete(schema.oauthAccessTokens)
        .where(inArray(schema.oauthAccessTokens.gohighlevelConnectionId, targetIds));
      await db()
        .delete(schema.authorizationCodes)
        .where(inArray(schema.authorizationCodes.gohighlevelConnectionId, targetIds));
      return { type, applied: targetIds.length };
    }

    case "INSTALL":
    case "APP_INSTALL":
    case "LOCATION_CREATE": {
      // Persistence is handled by the OAuth callback / bulk-install path.
      // We log and ack so HighLevel doesn't retry.
      notes.push("noop: persistence handled by OAuth callback");
      return { type, applied: 0, notes };
    }

    case "PLAN_CHANGE":
    case "PLAN_UPDATE": {
      notes.push("noop: plan changes not modeled locally");
      return { type, applied: 0, notes };
    }

    default: {
      notes.push(`unknown event type: ${type || "(empty)"}`);
      return { type, applied: 0, notes };
    }
  }
}

async function findConnections(event: GhlWebhookEvent): Promise<number[]> {
  // Match priority: locationId (most specific) → companyId+appId → companyId.
  // Always filter `uninstalledAt IS NULL` so retried webhook deliveries don't
  // re-tombstone already-tombstoned rows (idempotent no-op vs a churning
  // updated_at).
  const notUninstalled = isNull(schema.goHighLevelConnections.uninstalledAt);

  if (event.locationId) {
    const rows = await db()
      .select({ id: schema.goHighLevelConnections.id })
      .from(schema.goHighLevelConnections)
      .where(
        and(
          eq(schema.goHighLevelConnections.locationId, String(event.locationId)),
          notUninstalled,
        ),
      );
    return rows.map((r) => r.id);
  }
  if (event.companyId) {
    const rows = await db()
      .select({ id: schema.goHighLevelConnections.id })
      .from(schema.goHighLevelConnections)
      .where(
        event.appId
          ? and(
              eq(schema.goHighLevelConnections.companyId, String(event.companyId)),
              eq(schema.goHighLevelConnections.appId, String(event.appId)),
              notUninstalled,
            )
          : and(
              eq(schema.goHighLevelConnections.companyId, String(event.companyId)),
              notUninstalled,
            ),
      );
    return rows.map((r) => r.id);
  }
  return [];
}
