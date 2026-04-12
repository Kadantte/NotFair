import { db, schema } from "@/lib/db";
import { getAccountInfo, getAccountBudgetSummary } from "./reads";
import type { AuthContext } from "./types";

/**
 * Fetch account info + budget summary from Google Ads and upsert into
 * the `accounts` table.  Intended to be called fire-and-forget on
 * connect so the dev dashboard always has fresh snapshots.
 */
export async function syncAccountSnapshot(auth: AuthContext) {
  const [info, budget] = await Promise.all([
    getAccountInfo(auth),
    getAccountBudgetSummary(auth).catch((err) => {
      console.warn(`[sync-account] Budget query failed for ${auth.customerId}, saving account info only:`, err);
      return null;
    }),
  ]);

  const snapshot = {
    name: info.name,
    currencyCode: budget?.currencyCode ?? info.currencyCode,
    dailyBudget: budget?.totalDailyBudget ?? null,
    activeCampaigns: budget?.activeCampaigns ?? null,
    timeZone: info.timeZone,
    isTest: info.isTestAccount,
    lastSyncedAt: new Date(),
  };

  await db()
    .insert(schema.accounts)
    .values({ accountId: info.id, ...snapshot })
    .onConflictDoUpdate({ target: schema.accounts.accountId, set: snapshot });
}

/**
 * Sync multiple accounts in parallel, swallowing individual failures
 * so one bad account doesn't block the rest.
 */
export async function syncAccountSnapshots(
  refreshToken: string,
  accountIds: string[],
) {
  await Promise.allSettled(
    accountIds.map((customerId) =>
      syncAccountSnapshot({ refreshToken, customerId }),
    ),
  );
}
