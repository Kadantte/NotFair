/**
 * Phase-1 dual-write invariant check. After dual-write is deployed, every
 * live `mcp_sessions` user MUST have a matching `ad_platform_connections`
 * row for `platform = 'google_ads'`. This script proves it (or exits
 * non-zero with a list of offending users).
 *
 * Wire into CI / a periodic job during phase-1 bake. If this ever returns
 * non-zero, dual-write missed a write site or a row drift happened — fix
 * before flipping reads in phase-2.
 *
 * Usage:
 *   npx tsx scripts/check-google-connection-invariant.ts
 *
 * Exit codes:
 *   0 — invariant holds
 *   1 — invariant violated (orphan rows printed to stderr)
 *   2 — environment / connection failure
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
  // Best effort; CI will already have DATABASE_URL set.
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not found in environment or .env.local");
  process.exit(2);
}

async function main() {
  const sql = postgres(DATABASE_URL);
  try {
    const offenders = await sql<
      Array<{ userId: string; sessionCount: number; mostRecent: string }>
    >`
      SELECT
        s.user_id AS "userId",
        count(*)::int AS "sessionCount",
        max(s.created_at) AS "mostRecent"
      FROM mcp_sessions s
      LEFT JOIN ad_platform_connections c
        ON c.user_id = s.user_id AND c.platform = 'google_ads'
      WHERE s.user_id IS NOT NULL
        AND s.expires_at >= ${new Date().toISOString()}
        AND c.id IS NULL
      GROUP BY s.user_id
      ORDER BY "mostRecent" DESC
    `;

    if (offenders.length === 0) {
      console.log("ad_platform_connections invariant: OK");
      console.log("(every live mcp_sessions user has a google_ads connection row)");
      return;
    }

    console.error(
      `ad_platform_connections invariant: VIOLATED (${offenders.length} users)`,
    );
    console.error(
      "Live mcp_sessions users with NO matching google_ads connection row:",
    );
    for (const row of offenders) {
      console.error(
        `  ${row.userId}  sessions=${row.sessionCount}  last_seen=${row.mostRecent}`,
      );
    }
    console.error("");
    console.error(
      "Likely cause: a write path is missing the dual-write call. Either re-run",
    );
    console.error(
      "`pnpm db:backfill-google-connections --apply` for the immediate fix, or",
    );
    console.error("audit recent changes to the OAuth callback / auth routes.");
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Invariant check failed:", error);
  process.exit(2);
});
