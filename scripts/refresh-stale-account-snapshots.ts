/**
 * Refresh derived `accounts` snapshots when the cache is missing, stale relative
 * to account-changing writes, or suspiciously zero despite meaningful usage.
 *
 * Safe by default: dry-run only unless --apply is passed.
 *
 * Usage:
 *   npx tsx scripts/refresh-stale-account-snapshots.ts
 *   npx tsx scripts/refresh-stale-account-snapshots.ts --apply
 *   npx tsx scripts/refresh-stale-account-snapshots.ts --apply --limit 100 --min-ops 20
 */
import { readFileSync } from "node:fs";
import { refreshStaleAccountSnapshots } from "@/lib/google-ads/account-snapshot-refresh";

function parseEnvValue(raw: string) {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

function loadEnvFile(path: string) {
  const envContent = readFileSync(path, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = parseEnvValue(match[2]);
  }
}

try {
  loadEnvFile(".env.local");
} catch {
  // Best effort; env may already be present.
}

function numberArg(name: string, fallback: number) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

async function main() {
  const shouldApply = process.argv.includes("--apply");
  const minOps = numberArg("--min-ops", 20);
  const limit = numberArg("--limit", 50);

  const result = await refreshStaleAccountSnapshots({
    dryRun: !shouldApply,
    limit,
    minOps,
  });

  console.log(
    `snapshot backlog: connected=${result.summary.connectedAccounts}; ` +
      `missing=${result.summary.missingSnapshots}; ` +
      `staleAfterWrite=${result.summary.staleAfterWrite}; ` +
      `zeroWithUsage=${result.summary.zeroWithUsage}`,
  );
  console.log(`candidates selected: ${result.candidates.length}`);
  console.log(`mode: ${result.mode}; minOps=${minOps}; limit=${limit}`);

  for (const c of result.candidates) {
    const verb = shouldApply ? "refreshed" : "would refresh";
    const loginCustomerId = c.hasEntryLoginCustomerId
      ? c.entryLoginCustomerId ?? "direct"
      : c.sessionLoginCustomerId ?? "direct";
    console.log(
      `${verb} ${c.accountId}` +
        ` email=${c.googleEmail ?? "unknown"}` +
        ` reason=${c.reason}` +
        ` ops=${c.operations}` +
        ` writes=${c.writes}` +
        ` current=${c.currentDailyBudget ?? "null"}/${c.currentActiveCampaigns ?? "null"}` +
        ` loginCustomerId=${loginCustomerId}` +
        ` lastSynced=${c.lastSyncedAt?.toISOString() ?? "null"}` +
        ` lastSnapshotWrite=${c.lastSnapshotWriteAt?.toISOString() ?? "null"}`,
    );
  }

  if (!shouldApply) {
    console.log("\nDry run only. Re-run with --apply to refresh snapshots.");
    return;
  }

  console.log(`\nDone. refreshed=${result.refreshed}; failed=${result.failed}`);
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.warn(`failed ${error.accountId}: ${error.message}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Refresh stale account snapshots failed:", error);
    process.exit(1);
  });
