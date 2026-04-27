import type { AuthContext } from "./types";
import { runSafeGaqlReport } from "./reads";
import { humanizeGaqlRows } from "./humanize";
import { queryAccountInfo, queryConversionActions } from "./audit/queries";
import { isManagerOwnedConversionAction } from "./campaign-ops";

// One-shot canonical snapshot of "what is this account configured to do?"
// Pre-shaped so the LLM doesn't have to translate enum integers or micros
// before reasoning — it gets named bidding strategies, named conversion
// categories, and major-unit currency directly. See ../mcp/read-tools.ts
// for the MCP tool registration and the routing rationale.

export interface AccountSummary {
  account: {
    id: string;
    name: string;
    currencyCode: string;
    timeZone: string;
    autoTaggingEnabled: boolean;
    hasTrackingTemplate: boolean;
  };
  campaigns: CampaignSummary[];
  conversionActions: ConversionActionSummary[];
  notes: string[];
}

export interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  channelType: string;
  biddingStrategy: string;
  /** Major-unit currency (per account.currencyCode). Null when not applicable to the strategy. */
  targetCpa: number | null;
  /** Decimal target ROAS (1.0 = break-even). Null when not applicable. */
  targetRoas: number | null;
  /** Daily budget in major units. Null when budget metadata wasn't returned. */
  dailyBudget: number | null;
  networks: { search: boolean; partners: boolean; display: boolean };
}

export interface ConversionActionSummary {
  id: string;
  name: string;
  status: string;
  category: string;
  type: string;
  countingType: string;
  primaryForGoal: boolean;
  includeInConversionsMetric: boolean;
  /** True when owned by a manager (MCC) account — read-only from this account's API. */
  isManagerOwned: boolean;
  /** Default value in major units. Null when not configured. */
  defaultValue: number | null;
}

const CAMPAIGNS_QUERY = `
  SELECT
    campaign.id, campaign.name, campaign.status,
    campaign.advertising_channel_type, campaign.bidding_strategy_type,
    campaign.target_cpa.target_cpa_micros,
    campaign.target_roas.target_roas,
    campaign.maximize_conversions.target_cpa_micros,
    campaign.maximize_conversion_value.target_roas,
    campaign.network_settings.target_google_search,
    campaign.network_settings.target_search_network,
    campaign.network_settings.target_content_network,
    campaign_budget.amount_micros
  FROM campaign
  WHERE campaign.status != 'REMOVED'
  ORDER BY campaign.name ASC
`;

// Humanizer may have already replaced the integer with a string — accept either form.
function readEnum(node: Record<string, unknown> | undefined, field: string): string {
  if (!node) return "UNKNOWN";
  const direct = node[field];
  if (typeof direct === "string" && direct.length > 0) return direct;
  const named = node[`${field}_name`];
  if (typeof named === "string" && named.length > 0) return named;
  return "UNKNOWN";
}

// Reads the humanizer-added `<base>_value` sibling that pairs with `*_micros` fields.
function readMoney(parent: Record<string, unknown> | undefined, baseKey: string): number | null {
  if (!parent) return null;
  const value = parent[`${baseKey}_value`];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readNumber(parent: Record<string, unknown> | undefined, key: string): number | null {
  if (!parent) return null;
  const v = parent[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function buildCampaignSummary(row: Record<string, unknown>): CampaignSummary {
  const c = (row.campaign ?? {}) as Record<string, unknown>;
  const ns = (c.network_settings ?? {}) as Record<string, unknown>;
  const tCpa = (c.target_cpa ?? {}) as Record<string, unknown>;
  const tRoas = (c.target_roas ?? {}) as Record<string, unknown>;
  const maxConv = (c.maximize_conversions ?? {}) as Record<string, unknown>;
  const maxConvValue = (c.maximize_conversion_value ?? {}) as Record<string, unknown>;
  const budget = (row.campaign_budget ?? {}) as Record<string, unknown>;

  // tCPA can live under target_cpa.target_cpa_micros (TARGET_CPA strategy) OR
  // under maximize_conversions.target_cpa_micros (MAXIMIZE_CONVERSIONS with an
  // optional cap). Same value semantically — surface either. Same dual-location
  // for tROAS across TARGET_ROAS and MAXIMIZE_CONVERSION_VALUE.
  const targetCpa = readMoney(tCpa, "target_cpa") ?? readMoney(maxConv, "target_cpa");
  const targetRoas = readNumber(tRoas, "target_roas") ?? readNumber(maxConvValue, "target_roas");

  return {
    id: String(c.id ?? ""),
    name: String(c.name ?? ""),
    status: readEnum(c, "status"),
    channelType: readEnum(c, "advertising_channel_type"),
    biddingStrategy: readEnum(c, "bidding_strategy_type"),
    targetCpa,
    targetRoas,
    dailyBudget: readMoney(budget, "amount"),
    networks: {
      search: ns.target_google_search === true,
      partners: ns.target_search_network === true,
      display: ns.target_content_network === true,
    },
  };
}

function buildConversionActionSummary(
  row: Record<string, unknown>,
  customerId: string,
): ConversionActionSummary {
  const ca = (row.conversion_action ?? {}) as Record<string, unknown>;
  const valueSettings = (ca.value_settings ?? {}) as Record<string, unknown>;

  return {
    id: String(ca.id ?? ""),
    name: String(ca.name ?? ""),
    status: readEnum(ca, "status"),
    category: readEnum(ca, "category"),
    type: readEnum(ca, "type"),
    countingType: readEnum(ca, "counting_type"),
    primaryForGoal: ca.primary_for_goal === true,
    includeInConversionsMetric: ca.include_in_conversions_metric === true,
    isManagerOwned: isManagerOwnedConversionAction(customerId, ca.owner_customer),
    defaultValue:
      typeof valueSettings.default_value === "number"
        ? valueSettings.default_value
        : null,
  };
}

function buildNotes(
  campaigns: CampaignSummary[],
  conversionActions: ConversionActionSummary[],
): string[] {
  const notes: string[] = [];

  const enabledActions = conversionActions.filter((a) => a.status === "ENABLED");
  const primaryEnabled = enabledActions.filter((a) => a.primaryForGoal);
  if (enabledActions.length > 0 && primaryEnabled.length === 0) {
    notes.push(
      "No ENABLED conversion action is marked primary_for_goal. Smart Bidding optimizes against the *primary* set — confirm at least one action is primary, or bidding will fall back to defaults.",
    );
  }

  const valueCampaigns = campaigns.filter((c) =>
    c.biddingStrategy === "MAXIMIZE_CONVERSION_VALUE" ||
    c.biddingStrategy === "TARGET_ROAS",
  );
  if (valueCampaigns.length > 0 && valueCampaigns.length < campaigns.length) {
    notes.push(
      `Mixed optimization mode: ${valueCampaigns.length} of ${campaigns.length} campaigns optimize for VALUE (MAXIMIZE_CONVERSION_VALUE / TARGET_ROAS); the rest optimize for COUNT. Don't aggregate ROAS across both groups.`,
    );
  }

  return notes;
}

export async function getAccountSummary(auth: AuthContext): Promise<AccountSummary> {
  const [accountReport, campaignsReport, conversionsReport] = await Promise.all([
    runSafeGaqlReport(auth, queryAccountInfo()),
    runSafeGaqlReport(auth, CAMPAIGNS_QUERY, 500),
    runSafeGaqlReport(auth, queryConversionActions(), 500),
  ]);

  humanizeGaqlRows(accountReport.rows as unknown[]);
  humanizeGaqlRows(campaignsReport.rows as unknown[]);
  humanizeGaqlRows(conversionsReport.rows as unknown[]);

  const accountRow = (accountReport.rows[0] ?? {}) as Record<string, unknown>;
  const customer = (accountRow.customer ?? {}) as Record<string, unknown>;
  const customerId = String(customer.id ?? auth.customerId);

  const campaigns = (campaignsReport.rows as Record<string, unknown>[]).map(
    buildCampaignSummary,
  );
  const conversionActions = (conversionsReport.rows as Record<string, unknown>[]).map(
    (row) => buildConversionActionSummary(row, customerId),
  );

  return {
    account: {
      id: customerId,
      name: String(customer.descriptive_name ?? ""),
      currencyCode: String(customer.currency_code ?? "USD"),
      timeZone: String(customer.time_zone ?? ""),
      autoTaggingEnabled: customer.auto_tagging_enabled === true,
      hasTrackingTemplate:
        typeof customer.tracking_url_template === "string" &&
        customer.tracking_url_template.length > 0,
    },
    campaigns,
    conversionActions,
    notes: buildNotes(campaigns, conversionActions),
  };
}
