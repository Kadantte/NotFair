import { getCachedCustomer, getClient } from "../client";
import { extractErrorMessage, micros, normalizeCustomerId } from "../helpers";
import type { AuthContext } from "../types";
import { isDemoAuth } from "@/lib/demo/constants";
import {
  demoGetAccountBudgetSummary,
  demoGetAccountInfo,
  demoGetAccountSettings,
} from "@/lib/demo/reads";

// ─── Read Functions ──────────────────────────────────────────────────

export async function getAccountInfo(auth: AuthContext) {
  if (isDemoAuth(auth)) return demoGetAccountInfo();
  const customer = getCachedCustomer(auth);
  const result = await customer.query(`
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.time_zone,
      customer.test_account,
      customer.manager
    FROM customer
    LIMIT 1
  `);
  const row = (result as any[])[0]?.customer;
  return {
    id: String(row?.id ?? normalizeCustomerId(auth.customerId)),
    name: row?.descriptive_name ?? "Untitled account",
    currencyCode: row?.currency_code ?? null,
    timeZone: row?.time_zone ?? null,
    isTestAccount: Boolean(row?.test_account),
    isManager: Boolean(row?.manager),
  };
}

/**
 * Get budget summary for an account: total daily budget across all active campaigns,
 * number of active campaigns, and currency code.
 */
export async function getAccountBudgetSummary(auth: AuthContext) {
  if (isDemoAuth(auth)) return demoGetAccountBudgetSummary();
  const customer = getCachedCustomer(auth);
  const result = await customer.query(`
    SELECT
      campaign.id,
      campaign.campaign_budget,
      campaign_budget.amount_micros,
      customer.currency_code
    FROM campaign
    WHERE campaign.status = 'ENABLED'
  `);
  const rows = result as any[];
  // Deduplicate budgets by resource name (shared budgets)
  const seenBudgets = new Set<string>();
  let totalBudgetMicros = 0;
  let currencyCode: string | null = null;
  let enabledCampaigns = 0;

  for (const row of rows) {
    enabledCampaigns++;
    if (!currencyCode) currencyCode = row.customer?.currency_code ?? null;
    const budgetName = row.campaign?.campaign_budget;
    if (budgetName && !seenBudgets.has(budgetName)) {
      seenBudgets.add(budgetName);
      totalBudgetMicros += row.campaign_budget?.amount_micros ?? 0;
    }
  }

  return {
    totalDailyBudget: micros(totalBudgetMicros),
    activeCampaigns: enabledCampaigns,
    currencyCode,
  };
}

export async function listAccessibleCustomers(refreshToken: string) {
  const client = getClient();
  const response = (await client.listAccessibleCustomers(refreshToken)) as {
    resource_names?: string[];
  };

  return Promise.all(
    (response.resource_names ?? []).map(async (resourceName) => {
      const customerId = resourceName.replace("customers/", "");
      try {
        const info = await getAccountInfo({ refreshToken, customerId });
        return info;
      } catch (error) {
        return {
          id: customerId,
          name: "Unavailable",
          currencyCode: null,
          timeZone: null,
          isTestAccount: false,
          isManager: false,
          error: extractErrorMessage(error, { log: false }),
        };
      }
    }),
  );
}

/**
 * Account that the user can connect — flat list combining direct-access
 * accounts and clients reachable through a manager (MCC) account.
 *
 * `loginCustomerId` is set when the only path to the account is via a
 * manager; the API requires this header for cross-account calls.
 */
export type ConnectableAccount = {
  id: string;
  name: string;
  loginCustomerId?: string;
  loginCustomerName?: string;
};

/** Cap concurrent manager expansions to avoid quota / latency blow-ups. */
const MAX_MANAGERS_TO_EXPAND = 10;

/**
 * Resolve the full set of accounts the user can connect to: direct-access
 * accounts plus every active client account reachable via any manager (MCC)
 * the user has direct access to. Direct-access wins on dedup so we don't
 * carry an unnecessary `login_customer_id` on every API call.
 */
export async function listConnectableAccounts(
  refreshToken: string,
): Promise<{
  accounts: ConnectableAccount[];
  managers: { id: string; name: string }[];
}> {
  const customers = await listAccessibleCustomers(refreshToken);

  const direct: ConnectableAccount[] = [];
  const managers: { id: string; name: string }[] = [];
  for (const c of customers) {
    if ("error" in c) continue;
    if (c.isManager) {
      managers.push({ id: c.id, name: c.name || `Manager ${c.id}` });
    } else {
      direct.push({ id: c.id, name: c.name || "" });
    }
  }

  const managersToExpand = managers.slice(0, MAX_MANAGERS_TO_EXPAND);
  const expansions = await Promise.all(
    managersToExpand.map(async (mgr) => {
      try {
        const clients = await listClientAccountsUnderManager(refreshToken, mgr.id);
        return clients.map((c) => ({
          id: c.id,
          name: c.name || "Untitled account",
          loginCustomerId: mgr.id,
          loginCustomerName: mgr.name,
        }));
      } catch (err) {
        console.warn(`[listConnectableAccounts] Failed to expand manager ${mgr.id}:`, err);
        return [] as ConnectableAccount[];
      }
    }),
  );

  // Direct wins on dedup so we don't carry an unnecessary login_customer_id on
  // every API call. Within manager-routed accounts, first manager wins.
  const seen = new Set(direct.map((a) => a.id));
  const managerRouted: ConnectableAccount[] = [];
  for (const list of expansions) {
    for (const account of list) {
      if (seen.has(account.id)) continue;
      seen.add(account.id);
      managerRouted.push(account);
    }
  }

  return { accounts: [...direct, ...managerRouted], managers };
}

/**
 * List all non-manager client accounts under a manager (MCC) account.
 * Used when the user only has manager accounts — we fetch their clients so
 * they can connect to an actual ad account.
 */
export async function listClientAccountsUnderManager(
  refreshToken: string,
  managerId: string,
): Promise<{ id: string; name: string }[]> {
  const customer = getClient().Customer({
    customer_id: normalizeCustomerId(managerId),
    login_customer_id: normalizeCustomerId(managerId),
    refresh_token: refreshToken,
  });

  const result = (await customer.query(`
    SELECT
      customer_client.id,
      customer_client.descriptive_name,
      customer_client.manager,
      customer_client.hidden,
      customer_client.status
    FROM customer_client
    WHERE customer_client.manager = false
      AND customer_client.hidden = false
      AND customer_client.status = 'ENABLED'
  `)) as any[];

  return result
    .map((row) => ({
      id: String(row.customer_client?.id ?? ""),
      name: row.customer_client?.descriptive_name || "",
    }))
    .filter((c) => c.id);
}

export async function getAccountSettings(auth: AuthContext) {
  if (isDemoAuth(auth)) return demoGetAccountSettings();
  const customer = getCachedCustomer(auth);

  const result = await customer.query(`
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.auto_tagging_enabled,
      customer.tracking_url_template,
      customer.conversion_tracking_setting.conversion_tracking_id,
      customer.conversion_tracking_setting.cross_account_conversion_tracking_id
    FROM customer
    LIMIT 1
  `);

  const row = (result as any[])[0]?.customer ?? {};
  return {
    id: String(row.id ?? normalizeCustomerId(auth.customerId)),
    name: row.descriptive_name ?? "Untitled account",
    autoTaggingEnabled: row.auto_tagging_enabled ?? false,
    trackingUrlTemplate: row.tracking_url_template ?? null,
    conversionTrackingId: row.conversion_tracking_setting?.conversion_tracking_id
      ? String(row.conversion_tracking_setting.conversion_tracking_id)
      : null,
    crossAccountConversionTrackingId: row.conversion_tracking_setting?.cross_account_conversion_tracking_id
      ? String(row.conversion_tracking_setting.cross_account_conversion_tracking_id)
      : null,
  };
}
