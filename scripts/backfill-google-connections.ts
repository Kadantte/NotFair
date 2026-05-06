/**
 * Phase-1 backfill: seed `ad_platform_connections` rows for every live
 * `mcp_sessions` user. After this runs (and before phase-2 reads flip), the
 * dual-write path keeps both tables in sync; this script catches users
 * whose last sign-in pre-dates the dual-write deploy.
 *
 * Selection rule per user:
 *   1. Filter to sessions with user_id NOT NULL and expires_at >= now().
 *   2. Prefer rows with a non-empty customer_id (real connection over ads-less).
 *   3. Among ties, take the most recent created_at (latest re-auth wins).
 *
 * Per-account loginCustomerId resolution:
 *   - If the customer_ids JSON entry has loginCustomerId, use it.
 *   - Otherwise fall back to the row-level login_customer_id (legacy sessions
 *     pre-date per-account storage; see lib/google-ads/types.ts:91-95).
 *
 * Idempotent: re-runnable. Uses ON CONFLICT (user_id, platform).
 *
 * Usage:
 *   npx tsx scripts/backfill-google-connections.ts            # dry run
 *   npx tsx scripts/backfill-google-connections.ts --apply    # write
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";

function loadEnvFile(path: string) {
  const envContent = readFileSync(path, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

try {
  loadEnvFile(".env.local");
} catch {
  // Best effort; env may already be present.
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not found in environment or .env.local");
  process.exit(1);
}

type SessionRow = {
  userId: string;
  refreshToken: string;
  customerId: string;
  customerIds: string;
  loginCustomerId: string | null;
  googleEmail: string | null;
  createdAt: string;
};

type AccountEntry = {
  id: string;
  name?: string;
  loginCustomerId?: string | null;
};

type AccountForRow = {
  id: string;
  name: string;
  loginCustomerId?: string | null;
};

function parseCustomerIds(raw: string | null | undefined): AccountEntry[] {
  if (!raw || raw === "[]") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: unknown): item is AccountEntry =>
        typeof item === "object" && item !== null && "id" in item,
    );
  } catch {
    return [];
  }
}

/**
 * Pick the canonical session row per user_id.
 *   - prefer non-empty customer_id (real Google Ads connection)
 *   - then most recent created_at
 */
function pickCanonicalSessions(rows: SessionRow[]): Map<string, SessionRow> {
  const byUser = new Map<string, SessionRow>();
  for (const row of rows) {
    const existing = byUser.get(row.userId);
    if (!existing) {
      byUser.set(row.userId, row);
      continue;
    }
    const existingHasCustomer = existing.customerId !== "";
    const candidateHasCustomer = row.customerId !== "";
    if (candidateHasCustomer && !existingHasCustomer) {
      byUser.set(row.userId, row);
      continue;
    }
    if (existingHasCustomer && !candidateHasCustomer) continue;
    // Both same state — pick most recent.
    if (new Date(row.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      byUser.set(row.userId, row);
    }
  }
  return byUser;
}

type UpsertPayload = {
  userId: string;
  refreshToken: string;
  activeAccountId: string | null;
  accountIds: AccountForRow[];
  platformMetadata: Record<string, unknown>;
};

function buildPayload(row: SessionRow): UpsertPayload {
  const parsed = parseCustomerIds(row.customerIds);
  const accountIds: AccountForRow[] = parsed.map((a) => {
    const entry: AccountForRow = {
      id: a.id,
      name: a.name ?? "",
    };
    // Per-account loginCustomerId resolution. `null` is meaningful (explicit
    // direct-access). `undefined` means legacy data — fall back to row-level.
    if (a.loginCustomerId !== undefined) {
      entry.loginCustomerId = a.loginCustomerId;
    } else if (row.loginCustomerId !== null) {
      // Legacy fallback: hoist row-level into per-account so the new schema
      // doesn't need to remember the deprecated session-level field.
      entry.loginCustomerId = row.loginCustomerId;
    }
    return entry;
  });

  return {
    userId: row.userId,
    refreshToken: row.refreshToken,
    activeAccountId: row.customerId === "" ? null : row.customerId,
    accountIds,
    platformMetadata: row.googleEmail ? { googleEmail: row.googleEmail } : {},
  };
}

async function main() {
  const sql = postgres(DATABASE_URL);
  const shouldApply = process.argv.includes("--apply");

  try {
    const sessions = await sql<SessionRow[]>`
      SELECT
        user_id AS "userId",
        refresh_token AS "refreshToken",
        customer_id AS "customerId",
        customer_ids AS "customerIds",
        login_customer_id AS "loginCustomerId",
        google_email AS "googleEmail",
        created_at AS "createdAt"
      FROM mcp_sessions
      WHERE user_id IS NOT NULL
        AND expires_at >= ${new Date().toISOString()}
    `;

    const canonical = pickCanonicalSessions(sessions);

    const existingConnections = await sql<{ userId: string }[]>`
      SELECT user_id AS "userId"
      FROM ad_platform_connections
      WHERE platform = 'google_ads'
    `;
    const existingUserIds = new Set(existingConnections.map((r) => r.userId));

    let toCreate = 0;
    let toUpdate = 0;
    const payloads: UpsertPayload[] = [];
    for (const row of canonical.values()) {
      const payload = buildPayload(row);
      payloads.push(payload);
      if (existingUserIds.has(payload.userId)) toUpdate++;
      else toCreate++;
    }

    console.log(`mcp_sessions live rows (user_id NOT NULL, not expired): ${sessions.length}`);
    console.log(`distinct users to upsert:                                ${canonical.size}`);
    console.log(`  → would CREATE new ad_platform_connections rows:       ${toCreate}`);
    console.log(`  → would UPDATE existing ad_platform_connections rows:  ${toUpdate}`);
    const adsLessUsers = payloads.filter((p) => p.activeAccountId === null).length;
    console.log(`  (of which ads-less / pending: ${adsLessUsers})`);

    if (!shouldApply) {
      console.log("\nDry run only. Re-run with --apply to persist upserts.");
      return;
    }

    if (payloads.length === 0) {
      console.log("\nNo rows eligible for backfill.");
      return;
    }

    let applied = 0;
    await sql.begin(async (tx) => {
      for (const p of payloads) {
        await tx`
          INSERT INTO ad_platform_connections (
            user_id, platform, refresh_token, account_ids, active_account_id, platform_metadata
          )
          VALUES (
            ${p.userId},
            'google_ads',
            ${p.refreshToken},
            ${sql.json(p.accountIds)},
            ${p.activeAccountId},
            ${sql.json(p.platformMetadata)}
          )
          ON CONFLICT (user_id, platform) DO UPDATE SET
            refresh_token = EXCLUDED.refresh_token,
            account_ids = EXCLUDED.account_ids,
            active_account_id = EXCLUDED.active_account_id,
            platform_metadata = EXCLUDED.platform_metadata,
            updated_at = now()
        `;
        applied++;
      }
    });

    console.log(`\nApplied ${applied} upserts.`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
