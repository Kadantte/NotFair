import { getCustomer } from "./client";
import { extractErrorMessage, getDateRange, micros, normalizeCustomerId, safeEntityId, validateRsaAssets } from "./helpers";
import { updateAdAssets, updateAdFinalUrl, type AdAsset } from "./campaign-ops";
import type { AuthContext, WriteResult } from "./types";

// ─── Constants ───────────────────────────────────────────────────────

/**
 * v1 scope.
 *  - SEARCH_CUSTOM is the general-purpose type covering campaign-level A/B
 *    tests (ad copy, keywords, landing pages, etc.) AND ad-asset A/B tests:
 *    the trial campaign is a clone, so mutating the cloned RSA's assets
 *    achieves the same outcome as the UI's "Ad variations" feature.
 *  - SEARCH_AUTOMATED_BIDDING_STRATEGY is the dedicated type for bid-
 *    strategy comparisons.
 *
 * Notably absent: `AD_VARIATION = 3` exists in the proto enum but every
 * official Google sample (Python, Java, Ruby) only uses it as a stub enum
 * definition — there are zero documented call sites that pass type=3 to
 * `ExperimentService.MutateExperiments`. Combined with the help-center docs
 * describing the UI's "Ad variations" as a cross-campaign feature (which
 * conflicts with experiment_arm.campaigns max length = 1), the public path
 * for RSA-asset A/B testing is SEARCH_CUSTOM, not AD_VARIATION. The
 * `createAdVariationExperiment` helper bundles the SEARCH_CUSTOM flow
 * tailored for asset-level edits.
 *
 * Other proto-level types (DISPLAY_CUSTOM, SHOPPING_AUTOMATED_BIDDING_STRATEGY,
 * VIDEO_CUSTOM, HOTEL_CUSTOM) are intentionally out of scope until there's a
 * concrete user need; they need different validation and reporting paths.
 */
export const SUPPORTED_EXPERIMENT_TYPES = [
  "SEARCH_CUSTOM",
  "SEARCH_AUTOMATED_BIDDING_STRATEGY",
] as const;
export type SupportedExperimentType = (typeof SUPPORTED_EXPERIMENT_TYPES)[number];

const EXPERIMENT_TYPE_CODE: Record<SupportedExperimentType, number> = {
  SEARCH_CUSTOM: 7,
  SEARCH_AUTOMATED_BIDDING_STRATEGY: 9,
};

const EXPERIMENT_TYPE_NAME: Record<number, SupportedExperimentType> = {
  7: "SEARCH_CUSTOM",
  9: "SEARCH_AUTOMATED_BIDDING_STRATEGY",
};

const EXPERIMENT_STATUS_CODE = {
  UNSPECIFIED: 0,
  UNKNOWN: 1,
  ENABLED: 2,
  REMOVED: 3,
  HALTED: 4,
  PROMOTED: 5,
  SETUP: 6,
  INITIATED: 7,
  GRADUATED: 8,
} as const;

const EXPERIMENT_STATUS_NAME: Record<number, keyof typeof EXPERIMENT_STATUS_CODE> = {
  0: "UNSPECIFIED",
  1: "UNKNOWN",
  2: "ENABLED",
  3: "REMOVED",
  4: "HALTED",
  5: "PROMOTED",
  6: "SETUP",
  7: "INITIATED",
  8: "GRADUATED",
};

// ResponseContentType.MUTABLE_RESOURCE — surface in_design_campaigns from the
// arm-create response so we can hand them back to the agent in one round-trip.
const RESPONSE_CONTENT_MUTABLE_RESOURCE = 2;

// ─── Types ───────────────────────────────────────────────────────────

export type CreateExperimentParams = {
  /** Required. 1–1024 chars, unique under a customer. */
  name: string;
  /** Required. SEARCH_CUSTOM (default) or SEARCH_AUTOMATED_BIDDING_STRATEGY. */
  type: SupportedExperimentType;
  /** Appended to treatment campaign names. Defaults to "[experiment]". */
  suffix?: string;
  /** Optional human-readable description (max 2048 chars). */
  description?: string;
  /** YYYY-MM-DD. Defaults to "now or campaign start, whichever is later". */
  startDate?: string;
  /** YYYY-MM-DD. Defaults to the base campaign's end date. */
  endDate?: string;
  /**
   * If true, edits to the base campaign sync into the trial campaign as well.
   * Immutable after creation. Default: not set (Google's default).
   */
  syncEnabled?: boolean;
};

export type CreateExperimentResult = WriteResult & {
  experimentResourceName?: string;
};

export type ExperimentArmInput = {
  /** Required. 1–1024 chars, unique within the experiment. */
  name: string;
  /** True for the control arm (max 1 per experiment). */
  control: boolean;
  /** Integer 1–100. All arms together must sum to 100. */
  trafficSplit: number;
  /** Required for the control arm: the existing campaign to compare against. */
  campaignId?: string;
};

export type ExperimentArmResult = {
  resourceName: string;
  name: string;
  control: boolean;
  trafficSplit: number;
  campaigns: string[];
  /** Output-only: trial campaigns auto-spawned for the treatment arm. */
  inDesignCampaigns: string[];
};

export type AddExperimentArmsResult = WriteResult & {
  experimentResourceName: string;
  arms: ExperimentArmResult[];
  /** The trial campaign(s) the agent should mutate before scheduleExperiment. */
  inDesignCampaigns: string[];
};

export type ScheduleExperimentResult = WriteResult & {
  experimentResourceName: string;
  /** Long-running operation name; passes off into ListExperimentAsyncErrors. */
  operationName?: string;
  done: boolean;
};

export type EndExperimentResult = WriteResult & {
  experimentResourceName: string;
};

export type PromoteExperimentResult = WriteResult & {
  experimentResourceName: string;
  operationName?: string;
  done: boolean;
};

export type GraduateExperimentResult = WriteResult & {
  experimentResourceName: string;
  graduatedCampaignResourceName: string;
  campaignBudgetResourceName: string;
};

export type ListExperimentAsyncErrorsResult = {
  experimentResourceName: string;
  errors: Array<{ code?: number | string; message: string; details?: unknown }>;
  nextPageToken: string | null;
};

export type ActiveExperimentCampaign = {
  campaignId: string;
  campaignResourceName: string;
  campaignName: string | null;
};

export type ActiveExperimentArm = {
  resourceName: string;
  name: string;
  control: boolean;
  trafficSplit: number;
  campaigns: ActiveExperimentCampaign[];
  inDesignCampaigns: ActiveExperimentCampaign[];
};

export type ActiveExperimentCampaignMetrics = {
  campaignId: string;
  campaignResourceName: string;
  campaignName: string | null;
  impressions: number;
  clicks: number;
  costMicros: number;
  cost: number;
  conversions: number;
  conversionValue: number;
};

export type ActiveExperimentSummary = {
  experimentResourceName: string;
  experimentId: string;
  name: string;
  status: "ENABLED";
  type: string;
  startDate: string | null;
  endDate: string | null;
  suffix: string | null;
  arms: ActiveExperimentArm[];
  metricsWindow: { start: string; end: string; days: number };
  metrics: ActiveExperimentCampaignMetrics[];
};

export type ActiveExperimentImpact = {
  campaignId: string;
  campaignResourceName: string;
  experimentResourceName: string;
  experimentId: string;
  experimentName: string;
  armName: string;
  armRole: "CONTROL" | "TREATMENT";
  trafficSplit: number;
  startDate: string | null;
  endDate: string | null;
};

export type ActiveExperimentImpactCheck = {
  ok: boolean;
  impacts: ActiveExperimentImpact[];
  error?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Pattern-match an Experiment resource name AND validate that both ID
 * segments are pure digits. Defense in depth: while the MCP tool boundary
 * enforces the regex via Zod, several helpers below interpolate this string
 * into GAQL queries — restricting to `\d+` makes single-quote / comment
 * injection impossible regardless of caller.
 */
function experimentIdFromResourceName(resourceName: string): string | null {
  const match = resourceName.match(/^customers\/\d+\/experiments\/(\d+)$/);
  return match ? match[1] : null;
}

function rewriteExperimentError(msg: string): string {
  // Translate the most common ExperimentError enum codes (visible as
  // experiment_error=N in the GoogleAdsFailure) into actionable prose.
  // Source: experiment_error.proto in google-ads-node v22.
  const map: Array<{ pattern: RegExp; rewrite: string }> = [
    {
      pattern: /experiment_error=2\b|DUPLICATE_EXPERIMENT_NAME/i,
      rewrite: "Experiment name already exists. Pick a unique name.",
    },
    {
      pattern: /experiment_error=3\b|CANNOT_MODIFY_REMOVED_EXPERIMENT/i,
      rewrite: "Experiment has been removed and can no longer be modified. Create a new experiment.",
    },
    {
      pattern: /experiment_error=4\b|START_DATE_TOO_OLD/i,
      rewrite: "Experiment start_date is in the past. Pick today or later (YYYY-MM-DD).",
    },
    {
      pattern: /experiment_error=5\b|END_DATE_BEFORE_START_DATE/i,
      rewrite: "Experiment end_date precedes start_date. Adjust the date range.",
    },
    {
      pattern: /experiment_error=11\b|EXPERIMENT_NOT_RUNNING/i,
      rewrite: "Experiment is not in a RUNNING state. End/promote/graduate require status ENABLED — call scheduleExperiment first or check experiment.status via ads.gaql.",
    },
    {
      pattern: /experiment_error=15\b|TRAFFIC_SPLIT_OVERLAPPING/i,
      rewrite: "Traffic split values across arms must sum to 100 (each arm 1–100). Re-create the arms with valid splits.",
    },
    {
      pattern: /experiment_error=16\b|SUM_TRAFFIC_SPLIT_NOT_100/i,
      rewrite: "Traffic split values across arms must sum to exactly 100.",
    },
    {
      pattern: /experiment_error=17\b|TRAFFIC_SPLIT_GREATER_THAN_MAX/i,
      rewrite: "A single arm's traffic_split is above the allowed maximum (100). Split traffic between control and treatment so both are 1–99.",
    },
    {
      pattern: /experiment_error=22\b|EXPERIMENT_CAMPAIGN_NOT_CREATED/i,
      rewrite: "The trial (in-design) campaign does not exist yet. Schedule the experiment first, then graduate.",
    },
    {
      pattern: /experiment_error=24\b|INVALID_DURATION/i,
      rewrite: "Experiment duration is invalid (Google requires at least 1 day, typically 14+ for stat significance).",
    },
    {
      pattern: /experiment_error=29\b|CANNOT_GRADUATE_NON_RUNNING_EXPERIMENT/i,
      rewrite: "Only RUNNING experiments can be graduated. Schedule first, or end and re-create.",
    },
  ];
  for (const { pattern, rewrite } of map) {
    if (pattern.test(msg)) return `${rewrite} (Original: ${msg})`;
  }
  return msg;
}

function experimentStatusName(raw: unknown): string {
  if (typeof raw === "string") return raw;
  const code = Number(raw ?? 0);
  return EXPERIMENT_STATUS_NAME[code] ?? `UNKNOWN(${code})`;
}

function campaignIdFromResourceName(resourceName: string | null | undefined): string | null {
  const match = String(resourceName ?? "").match(/^customers\/\d+\/campaigns\/(\d+)$/);
  return match ? match[1] : null;
}

function campaignResourceName(customerId: string, campaignId: string): string {
  return `customers/${normalizeCustomerId(customerId)}/campaigns/${safeEntityId(campaignId)}`;
}

function quoteGaqlString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function enumName(raw: unknown, fallback = "UNKNOWN"): string {
  if (typeof raw === "string") return raw;
  if (raw == null) return fallback;
  return String(raw);
}

function experimentTypeName(raw: unknown): string {
  if (typeof raw === "string") return raw;
  const code = Number(raw ?? 0);
  return EXPERIMENT_TYPE_NAME[code] ?? enumName(raw);
}

function boolValue(raw: unknown): boolean {
  return raw === true || raw === 1 || raw === "true" || raw === "TRUE";
}

async function fetchCampaignNames(
  customer: ReturnType<typeof getCustomer>,
  resourceNames: string[],
): Promise<Map<string, { id: string; name: string | null }>> {
  const unique = [...new Set(resourceNames)].filter(Boolean);
  const out = new Map<string, { id: string; name: string | null }>();
  if (unique.length === 0) return out;

  const rows = await customer.query(`
    SELECT campaign.resource_name, campaign.id, campaign.name
    FROM campaign
    WHERE campaign.resource_name IN (${unique.map(quoteGaqlString).join(", ")})
  `);
  type CampaignRow = {
    campaign?: { resource_name?: string; id?: string | number; name?: string };
  };
  for (const row of rows as CampaignRow[]) {
    const rn = row.campaign?.resource_name ?? "";
    const id = String(row.campaign?.id ?? campaignIdFromResourceName(rn) ?? "");
    out.set(rn, { id, name: row.campaign?.name ?? null });
  }
  for (const rn of unique) {
    if (!out.has(rn)) {
      out.set(rn, { id: campaignIdFromResourceName(rn) ?? "", name: null });
    }
  }
  return out;
}

async function fetchCampaignMetrics(
  customer: ReturnType<typeof getCustomer>,
  resourceNames: string[],
  days: number,
): Promise<{ window: { start: string; end: string; days: number }; metrics: ActiveExperimentCampaignMetrics[] }> {
  const unique = [...new Set(resourceNames)].filter(Boolean);
  const window = { ...getDateRange(days), days };
  if (unique.length === 0) return { window, metrics: [] };

  const rows = await customer.query(`
    SELECT campaign.resource_name,
           campaign.id,
           campaign.name,
           metrics.impressions,
           metrics.clicks,
           metrics.cost_micros,
           metrics.conversions,
           metrics.conversions_value
    FROM campaign
    WHERE campaign.resource_name IN (${unique.map(quoteGaqlString).join(", ")})
      AND segments.date BETWEEN '${window.start}' AND '${window.end}'
  `);
  type MetricsRow = {
    campaign?: { resource_name?: string; id?: string | number; name?: string };
    metrics?: {
      impressions?: string | number;
      clicks?: string | number;
      cost_micros?: string | number;
      conversions?: string | number;
      conversions_value?: string | number;
    };
  };

  return {
    window,
    metrics: (rows as MetricsRow[]).map((row) => {
      const costMicros = Number(row.metrics?.cost_micros ?? 0);
      const rn = row.campaign?.resource_name ?? "";
      return {
        campaignId: String(row.campaign?.id ?? campaignIdFromResourceName(rn) ?? ""),
        campaignResourceName: rn,
        campaignName: row.campaign?.name ?? null,
        impressions: Number(row.metrics?.impressions ?? 0),
        clicks: Number(row.metrics?.clicks ?? 0),
        costMicros,
        cost: micros(costMicros),
        conversions: Number(row.metrics?.conversions ?? 0),
        conversionValue: Number(row.metrics?.conversions_value ?? 0),
      };
    }),
  };
}

/** Read the current experiment status (numeric) so we can pre-empt invalid lifecycle transitions. */
async function fetchExperimentStatus(
  customer: ReturnType<typeof getCustomer>,
  experimentResourceName: string,
): Promise<{ statusCode: number; statusName: string; resourceName: string } | null> {
  try {
    const id = experimentIdFromResourceName(experimentResourceName);
    if (!id) return null;
    const rows = await customer.query(`
      SELECT experiment.resource_name, experiment.status
      FROM experiment
      WHERE experiment.resource_name = '${experimentResourceName}'
      LIMIT 1
    `);
    type ExperimentRow = { experiment?: { resource_name?: string; status?: number } };
    const row = (rows as ExperimentRow[])[0];
    if (!row) return null;
    const code = Number(row.experiment?.status ?? 0);
    return {
      statusCode: code,
      statusName: EXPERIMENT_STATUS_NAME[code] ?? `UNKNOWN(${code})`,
      resourceName: row.experiment?.resource_name ?? experimentResourceName,
    };
  } catch {
    return null;
  }
}

/**
 * Find the trial campaign produced when the experiment was scheduled. After
 * `scheduleExperiment`, the treatment arm's `in_design_campaigns[0]` is the
 * resource we feed to graduate as `experiment_campaign`.
 */
async function fetchTreatmentTrialCampaign(
  customer: ReturnType<typeof getCustomer>,
  experimentResourceName: string,
): Promise<string | null> {
  // Validate before interpolating into GAQL.
  if (!experimentIdFromResourceName(experimentResourceName)) return null;
  try {
    const rows = await customer.query(`
      SELECT experiment_arm.resource_name,
             experiment_arm.control,
             experiment_arm.in_design_campaigns
      FROM experiment_arm
      WHERE experiment_arm.experiment = '${experimentResourceName}'
    `);
    type ArmRow = {
      experiment_arm?: { control?: boolean | number; in_design_campaigns?: string[] };
    };
    const treatment = (rows as ArmRow[]).find(
      (r) => r.experiment_arm?.control === false || r.experiment_arm?.control === 0,
    );
    const trial: string[] = treatment?.experiment_arm?.in_design_campaigns ?? [];
    return trial[0] ?? null;
  } catch {
    return null;
  }
}

// ─── listActiveExperiments ──────────────────────────────────────────

/**
 * Denormalized, safety-oriented view of currently running experiments.
 * Raw `experiment_arm` rows can outlive removed parent experiments; this
 * helper starts from `experiment.status = ENABLED` and only then attaches
 * arms, campaign names, and recent metrics.
 */
export async function listActiveExperiments(
  auth: AuthContext,
  days = 14,
): Promise<{ activeExperiments: ActiveExperimentSummary[]; count: number }> {
  const customer = getCustomer(auth);
  const metricDays = Math.max(1, Math.min(90, Math.floor(days)));

  type ExperimentRow = {
    experiment?: {
      resource_name?: string;
      id?: string | number;
      name?: string;
      status?: string | number;
      type?: string | number;
      start_date?: string;
      end_date?: string;
      suffix?: string;
    };
  };
  const experimentRows = await customer.query(`
    SELECT experiment.resource_name,
           experiment.id,
           experiment.name,
           experiment.type,
           experiment.status,
           experiment.start_date,
           experiment.end_date,
           experiment.suffix
    FROM experiment
    WHERE experiment.status = 'ENABLED'
    ORDER BY experiment.start_date DESC
    LIMIT 100
  `) as ExperimentRow[];

  const experiments = experimentRows
    .map((row) => row.experiment)
    .filter((experiment): experiment is NonNullable<ExperimentRow["experiment"]> =>
      Boolean(experiment?.resource_name) && experimentStatusName(experiment?.status) === "ENABLED",
    );
  if (experiments.length === 0) {
    return { activeExperiments: [], count: 0 };
  }

  const experimentResourceNames = experiments.map((e) => e.resource_name!);
  type ArmRow = {
    experiment_arm?: {
      resource_name?: string;
      experiment?: string;
      name?: string;
      control?: boolean | number | string;
      traffic_split?: string | number;
      campaigns?: string[];
      in_design_campaigns?: string[];
    };
  };
  const armRows = await customer.query(`
    SELECT experiment_arm.resource_name,
           experiment_arm.experiment,
           experiment_arm.name,
           experiment_arm.control,
           experiment_arm.traffic_split,
           experiment_arm.campaigns,
           experiment_arm.in_design_campaigns
    FROM experiment_arm
    WHERE experiment_arm.experiment IN (${experimentResourceNames.map(quoteGaqlString).join(", ")})
  `) as ArmRow[];

  const campaignResourceNames = armRows.flatMap((row) => [
    ...(row.experiment_arm?.campaigns ?? []),
    ...(row.experiment_arm?.in_design_campaigns ?? []),
  ]);
  const [campaignNames, metricsResult] = await Promise.all([
    fetchCampaignNames(customer, campaignResourceNames),
    fetchCampaignMetrics(customer, campaignResourceNames, metricDays),
  ]);

  const campaignInfo = (rn: string): ActiveExperimentCampaign => {
    const known = campaignNames.get(rn);
    return {
      campaignId: known?.id || campaignIdFromResourceName(rn) || "",
      campaignResourceName: rn,
      campaignName: known?.name ?? null,
    };
  };

  const armsByExperiment = new Map<string, ActiveExperimentArm[]>();
  for (const row of armRows) {
    const arm = row.experiment_arm;
    if (!arm?.experiment || !experimentResourceNames.includes(arm.experiment)) continue;
    const denormalized: ActiveExperimentArm = {
      resourceName: arm.resource_name ?? "",
      name: arm.name ?? "",
      control: boolValue(arm.control),
      trafficSplit: Number(arm.traffic_split ?? 0),
      campaigns: (arm.campaigns ?? []).map(campaignInfo),
      inDesignCampaigns: (arm.in_design_campaigns ?? []).map(campaignInfo),
    };
    armsByExperiment.set(arm.experiment, [
      ...(armsByExperiment.get(arm.experiment) ?? []),
      denormalized,
    ]);
  }

  const activeExperiments = experiments.map((experiment): ActiveExperimentSummary => {
    const rn = experiment.resource_name!;
    const arms = armsByExperiment.get(rn) ?? [];
    const experimentCampaignResourceNames = new Set(
      arms.flatMap((arm) => [
        ...arm.campaigns.map((campaign) => campaign.campaignResourceName),
        ...arm.inDesignCampaigns.map((campaign) => campaign.campaignResourceName),
      ]),
    );
    return {
      experimentResourceName: rn,
      experimentId: String(experiment.id ?? experimentIdFromResourceName(rn) ?? ""),
      name: experiment.name ?? "",
      status: "ENABLED",
      type: experimentTypeName(experiment.type),
      startDate: experiment.start_date ?? null,
      endDate: experiment.end_date ?? null,
      suffix: experiment.suffix ?? null,
      arms,
      metricsWindow: metricsResult.window,
      metrics: metricsResult.metrics.filter((metric) => experimentCampaignResourceNames.has(metric.campaignResourceName)),
    };
  });

  return { activeExperiments, count: activeExperiments.length };
}

export async function checkActiveExperimentImpact(
  auth: AuthContext,
  campaignIds: string[],
): Promise<ActiveExperimentImpactCheck> {
  const uniqueCampaignIds = [...new Set(campaignIds.filter(Boolean).map(String))];
  if (uniqueCampaignIds.length === 0) return { ok: true, impacts: [] };

  try {
    const customer = getCustomer(auth);
    type ExperimentRow = {
      experiment?: {
        resource_name?: string;
        id?: string | number;
        name?: string;
        status?: string | number;
        start_date?: string;
        end_date?: string;
      };
    };
    const experimentRows = await customer.query(`
      SELECT experiment.resource_name,
             experiment.id,
             experiment.name,
             experiment.status,
             experiment.start_date,
             experiment.end_date
      FROM experiment
      WHERE experiment.status = 'ENABLED'
      LIMIT 100
    `) as ExperimentRow[];
    const activeExperiments = experimentRows
      .map((row) => row.experiment)
      .filter((experiment): experiment is NonNullable<ExperimentRow["experiment"]> =>
        Boolean(experiment?.resource_name) && experimentStatusName(experiment?.status) === "ENABLED",
      );
    if (activeExperiments.length === 0) return { ok: true, impacts: [] };

    const experimentByResourceName = new Map(
      activeExperiments.map((experiment) => [experiment.resource_name!, experiment]),
    );
    type ArmRow = {
      experiment_arm?: {
        experiment?: string;
        name?: string;
        control?: boolean | number | string;
        traffic_split?: string | number;
        campaigns?: string[];
        in_design_campaigns?: string[];
      };
    };
    const armRows = await customer.query(`
      SELECT experiment_arm.experiment,
             experiment_arm.name,
             experiment_arm.control,
             experiment_arm.traffic_split,
             experiment_arm.campaigns,
             experiment_arm.in_design_campaigns
      FROM experiment_arm
      WHERE experiment_arm.experiment IN (${activeExperiments.map((e) => quoteGaqlString(e.resource_name!)).join(", ")})
    `) as ArmRow[];

    const targetResourceNames = new Set(uniqueCampaignIds.map((id) => campaignResourceName(auth.customerId, id)));
    const impacts: ActiveExperimentImpact[] = [];

    for (const row of armRows) {
      const arm = row.experiment_arm;
      const experiment = arm?.experiment ? experimentByResourceName.get(arm.experiment) : undefined;
      if (!arm || !experiment?.resource_name) continue;
      const role = boolValue(arm.control) ? "CONTROL" : "TREATMENT";
      const campaignResourceNames = [...(arm.campaigns ?? []), ...(arm.in_design_campaigns ?? [])];
      for (const rn of campaignResourceNames) {
        if (!targetResourceNames.has(rn)) continue;
        impacts.push({
          campaignId: campaignIdFromResourceName(rn) ?? "",
          campaignResourceName: rn,
          experimentResourceName: experiment.resource_name,
          experimentId: String(experiment.id ?? experimentIdFromResourceName(experiment.resource_name) ?? ""),
          experimentName: experiment.name ?? "",
          armName: arm.name ?? "",
          armRole: role,
          trafficSplit: Number(arm.traffic_split ?? 0),
          startDate: experiment.start_date ?? null,
          endDate: experiment.end_date ?? null,
        });
      }
    }

    return { ok: impacts.length === 0, impacts };
  } catch (error) {
    return {
      ok: false,
      impacts: [],
      error: `Could not verify active experiment impact before mutation: ${extractErrorMessage(error, { log: false })}`,
    };
  }
}

// ─── createExperiment ────────────────────────────────────────────────

/**
 * Create an Experiment resource in SETUP status. Does not touch arms or
 * schedule — the caller continues with `addExperimentArms` next.
 */
export async function createExperiment(
  auth: AuthContext,
  params: CreateExperimentParams,
): Promise<CreateExperimentResult> {
  const customer = getCustomer(auth);

  const name = params.name.trim();
  if (!name) {
    return {
      success: false,
      action: "create_experiment",
      entityId: "",
      beforeValue: "",
      afterValue: name,
      error: "Experiment name is required.",
      experimentResourceName: undefined,
    };
  }
  if (name.length > 1024) {
    return {
      success: false,
      action: "create_experiment",
      entityId: "",
      beforeValue: "",
      afterValue: name,
      error: "Experiment name must be 1024 characters or fewer.",
    };
  }

  if (params.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(params.startDate)) {
    return {
      success: false,
      action: "create_experiment",
      entityId: "",
      beforeValue: "",
      afterValue: name,
      error: `start_date must be YYYY-MM-DD (got "${params.startDate}").`,
    };
  }
  if (params.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(params.endDate)) {
    return {
      success: false,
      action: "create_experiment",
      entityId: "",
      beforeValue: "",
      afterValue: name,
      error: `end_date must be YYYY-MM-DD (got "${params.endDate}").`,
    };
  }
  if (params.startDate && params.endDate && params.endDate < params.startDate) {
    return {
      success: false,
      action: "create_experiment",
      entityId: "",
      beforeValue: "",
      afterValue: name,
      error: `end_date (${params.endDate}) must be on or after start_date (${params.startDate}).`,
    };
  }

  const resource: Record<string, unknown> = {
    name,
    type: EXPERIMENT_TYPE_CODE[params.type],
    status: EXPERIMENT_STATUS_CODE.SETUP,
    suffix: params.suffix ?? "[experiment]",
  };
  if (params.description) resource.description = params.description;
  if (params.startDate) resource.start_date = params.startDate;
  if (params.endDate) resource.end_date = params.endDate;
  if (typeof params.syncEnabled === "boolean") resource.sync_enabled = params.syncEnabled;

  try {
    const response = await (customer as any).experiments.create([resource]);
    const resourceName: string =
      response?.results?.[0]?.resource_name ??
      response?.results?.[0]?.resourceName ??
      "";
    const experimentId = experimentIdFromResourceName(resourceName) ?? "";

    return {
      success: true,
      action: "create_experiment",
      entityId: experimentId,
      beforeValue: "",
      afterValue: JSON.stringify({ name, type: params.type, suffix: resource.suffix }),
      label: name,
      experimentResourceName: resourceName,
    };
  } catch (error) {
    return {
      success: false,
      action: "create_experiment",
      entityId: "",
      beforeValue: "",
      afterValue: name,
      error: rewriteExperimentError(extractErrorMessage(error)),
    };
  }
}

// ─── addExperimentArms ───────────────────────────────────────────────

/**
 * Create the control + treatment arms in a single mutate. Google requires
 * both arms to land atomically (their `traffic_split` must sum to 100), so
 * partial_failure is forbidden by the API. We also request MUTABLE_RESOURCE
 * so the response includes `in_design_campaigns` for the treatment arm.
 *
 * The agent should treat the returned `inDesignCampaigns[0]` as a real
 * campaign ID and apply the mutation under test (bidding, ads, keywords,
 * etc.) BEFORE calling scheduleExperiment.
 */
export async function addExperimentArms(
  auth: AuthContext,
  experimentResourceName: string,
  arms: ExperimentArmInput[],
): Promise<AddExperimentArmsResult> {
  const customer = getCustomer(auth);
  const cid = normalizeCustomerId(auth.customerId);

  if (arms.length < 2) {
    return errorArmsResult(
      experimentResourceName,
      "Provide at least one control arm and one treatment arm in a single call (Google forbids adding arms incrementally).",
    );
  }
  const controls = arms.filter((a) => a.control);
  if (controls.length !== 1) {
    return errorArmsResult(
      experimentResourceName,
      `Exactly one arm must have control=true (got ${controls.length}).`,
    );
  }
  const totalSplit = arms.reduce((s, a) => s + a.trafficSplit, 0);
  if (totalSplit !== 100) {
    return errorArmsResult(
      experimentResourceName,
      `traffic_split values must sum to 100 across arms (got ${totalSplit}).`,
    );
  }
  for (const arm of arms) {
    if (arm.trafficSplit < 1 || arm.trafficSplit > 100) {
      return errorArmsResult(
        experimentResourceName,
        `traffic_split for arm "${arm.name}" must be between 1 and 100 (got ${arm.trafficSplit}).`,
      );
    }
    if (arm.control && !arm.campaignId) {
      return errorArmsResult(
        experimentResourceName,
        `Control arm "${arm.name}" must reference an existing campaignId (this is the campaign you're comparing against).`,
      );
    }
  }

  const resources = arms.map((arm) => {
    const r: Record<string, unknown> = {
      experiment: experimentResourceName,
      name: arm.name,
      control: arm.control,
      traffic_split: arm.trafficSplit,
    };
    if (arm.campaignId) {
      r.campaigns = [`customers/${cid}/campaigns/${safeEntityId(arm.campaignId)}`];
    }
    return r;
  });

  try {
    const response = await (customer as any).experimentArms.create(resources, {
      partial_failure: false,
      response_content_type: RESPONSE_CONTENT_MUTABLE_RESOURCE,
    });

    const results = (response?.results ?? []) as any[];
    const armResults: ExperimentArmResult[] = results.map((res) => {
      const arm = res?.experiment_arm ?? res?.experimentArm ?? {};
      return {
        resourceName: res?.resource_name ?? res?.resourceName ?? "",
        name: arm.name ?? "",
        control: Boolean(arm.control),
        trafficSplit: Number(arm.traffic_split ?? arm.trafficSplit ?? 0),
        campaigns: arm.campaigns ?? [],
        inDesignCampaigns: arm.in_design_campaigns ?? arm.inDesignCampaigns ?? [],
      };
    });

    const inDesignCampaigns = armResults
      .filter((r) => !r.control)
      .flatMap((r) => r.inDesignCampaigns);

    return {
      success: true,
      action: "add_experiment_arms",
      entityId: experimentIdFromResourceName(experimentResourceName) ?? "",
      beforeValue: "",
      afterValue: JSON.stringify(arms.map((a) => ({ name: a.name, control: a.control, split: a.trafficSplit }))),
      label: `${armResults.length} arms`,
      experimentResourceName,
      arms: armResults,
      inDesignCampaigns,
    };
  } catch (error) {
    return {
      success: false,
      action: "add_experiment_arms",
      entityId: experimentIdFromResourceName(experimentResourceName) ?? "",
      beforeValue: "",
      afterValue: JSON.stringify(arms.map((a) => ({ name: a.name, control: a.control, split: a.trafficSplit }))),
      error: rewriteExperimentError(extractErrorMessage(error)),
      experimentResourceName,
      arms: [],
      inDesignCampaigns: [],
    };
  }
}

function errorArmsResult(experimentResourceName: string, message: string): AddExperimentArmsResult {
  return {
    success: false,
    action: "add_experiment_arms",
    entityId: experimentIdFromResourceName(experimentResourceName) ?? "",
    beforeValue: "",
    afterValue: "",
    error: message,
    experimentResourceName,
    arms: [],
    inDesignCampaigns: [],
  };
}

// ─── scheduleExperiment ──────────────────────────────────────────────

/**
 * Kick off the long-running schedule operation. We do NOT await completion
 * — Google forks the in-design campaigns into real serving campaigns in the
 * background. The caller should poll `listExperimentAsyncErrors` after a
 * few seconds to confirm forking succeeded.
 */
export async function scheduleExperiment(
  auth: AuthContext,
  experimentResourceName: string,
): Promise<ScheduleExperimentResult> {
  const customer = getCustomer(auth);

  const status = await fetchExperimentStatus(customer, experimentResourceName);
  if (status && status.statusCode !== EXPERIMENT_STATUS_CODE.SETUP) {
    return {
      success: false,
      action: "schedule_experiment",
      entityId: experimentIdFromResourceName(experimentResourceName) ?? "",
      beforeValue: status.statusName,
      afterValue: status.statusName,
      error: `Cannot schedule: experiment is ${status.statusName}, only SETUP experiments can be scheduled. Create a new experiment if this one was already scheduled or ended.`,
      experimentResourceName,
      done: false,
    };
  }

  try {
    const op = await (customer as any).experiments.scheduleExperiment({
      resource_name: experimentResourceName,
    });
    const operationName: string | undefined = op?.name ?? op?.operationName ?? undefined;
    const done = Boolean(op?.done);
    return {
      success: true,
      action: "schedule_experiment",
      entityId: experimentIdFromResourceName(experimentResourceName) ?? "",
      beforeValue: status?.statusName ?? "SETUP",
      afterValue: "INITIATED",
      label: "experiment scheduled",
      experimentResourceName,
      operationName,
      done,
    };
  } catch (error) {
    return {
      success: false,
      action: "schedule_experiment",
      entityId: experimentIdFromResourceName(experimentResourceName) ?? "",
      beforeValue: status?.statusName ?? "",
      afterValue: "",
      error: rewriteExperimentError(extractErrorMessage(error)),
      experimentResourceName,
      done: false,
    };
  }
}

// ─── endExperiment ───────────────────────────────────────────────────

/**
 * Stop a running experiment immediately. Synchronous — returns once the
 * server has updated the experiment's end_date. The trial campaign continues
 * in its current state but stops splitting traffic.
 */
export async function endExperiment(
  auth: AuthContext,
  experimentResourceName: string,
): Promise<EndExperimentResult> {
  const customer = getCustomer(auth);

  const status = await fetchExperimentStatus(customer, experimentResourceName);
  if (status) {
    const endable = new Set([
      EXPERIMENT_STATUS_CODE.ENABLED,
      EXPERIMENT_STATUS_CODE.INITIATED,
      EXPERIMENT_STATUS_CODE.HALTED,
    ]);
    if (!endable.has(status.statusCode as 2 | 4 | 7)) {
      return {
        success: false,
        action: "end_experiment",
        entityId: experimentIdFromResourceName(experimentResourceName) ?? "",
        beforeValue: status.statusName,
        afterValue: status.statusName,
        error: `Cannot end: experiment is ${status.statusName}, only ENABLED/INITIATED/HALTED experiments can be ended.`,
        experimentResourceName,
      };
    }
  }

  try {
    await (customer as any).experiments.endExperiment({
      experiment: experimentResourceName,
    });
    return {
      success: true,
      action: "end_experiment",
      entityId: experimentIdFromResourceName(experimentResourceName) ?? "",
      beforeValue: status?.statusName ?? "ENABLED",
      afterValue: "ENDED",
      label: "experiment ended",
      experimentResourceName,
    };
  } catch (error) {
    return {
      success: false,
      action: "end_experiment",
      entityId: experimentIdFromResourceName(experimentResourceName) ?? "",
      beforeValue: status?.statusName ?? "",
      afterValue: "",
      error: rewriteExperimentError(extractErrorMessage(error)),
      experimentResourceName,
    };
  }
}

// ─── promoteExperiment ───────────────────────────────────────────────

/**
 * Apply the treatment arm's changes back onto the base campaign and stop
 * the trial. Long-running — like schedule. Use after the experiment has run
 * long enough that the treatment is the clear winner.
 */
export async function promoteExperiment(
  auth: AuthContext,
  experimentResourceName: string,
): Promise<PromoteExperimentResult> {
  const customer = getCustomer(auth);

  const status = await fetchExperimentStatus(customer, experimentResourceName);
  if (status && status.statusCode !== EXPERIMENT_STATUS_CODE.ENABLED) {
    return {
      success: false,
      action: "promote_experiment",
      entityId: experimentIdFromResourceName(experimentResourceName) ?? "",
      beforeValue: status.statusName,
      afterValue: status.statusName,
      error: `Cannot promote: experiment is ${status.statusName}, only ENABLED (running) experiments can be promoted.`,
      experimentResourceName,
      done: false,
    };
  }

  try {
    const op = await (customer as any).experiments.promoteExperiment({
      resource_name: experimentResourceName,
    });
    const operationName: string | undefined = op?.name ?? op?.operationName ?? undefined;
    const done = Boolean(op?.done);
    return {
      success: true,
      action: "promote_experiment",
      entityId: experimentIdFromResourceName(experimentResourceName) ?? "",
      beforeValue: status?.statusName ?? "ENABLED",
      afterValue: "PROMOTED",
      label: "experiment promoted",
      experimentResourceName,
      operationName,
      done,
    };
  } catch (error) {
    return {
      success: false,
      action: "promote_experiment",
      entityId: experimentIdFromResourceName(experimentResourceName) ?? "",
      beforeValue: status?.statusName ?? "",
      afterValue: "",
      error: rewriteExperimentError(extractErrorMessage(error)),
      experimentResourceName,
      done: false,
    };
  }
}

// ─── graduateExperiment ──────────────────────────────────────────────

/**
 * Permanently fork the trial campaign into a standalone campaign with its
 * own budget. Synchronous. The trial campaign's resource name is resolved
 * from the experiment's treatment arm; the caller only needs to supply the
 * budget the new standalone campaign should use.
 */
export async function graduateExperiment(
  auth: AuthContext,
  experimentResourceName: string,
  campaignBudgetResourceName: string,
): Promise<GraduateExperimentResult> {
  const customer = getCustomer(auth);

  const status = await fetchExperimentStatus(customer, experimentResourceName);
  if (status && status.statusCode !== EXPERIMENT_STATUS_CODE.ENABLED) {
    return {
      success: false,
      action: "graduate_experiment",
      entityId: experimentIdFromResourceName(experimentResourceName) ?? "",
      beforeValue: status.statusName,
      afterValue: status.statusName,
      error: `Cannot graduate: experiment is ${status.statusName}, only ENABLED (running) experiments can be graduated.`,
      experimentResourceName,
      graduatedCampaignResourceName: "",
      campaignBudgetResourceName,
    };
  }

  if (!campaignBudgetResourceName.startsWith("customers/")) {
    return {
      success: false,
      action: "graduate_experiment",
      entityId: experimentIdFromResourceName(experimentResourceName) ?? "",
      beforeValue: status?.statusName ?? "",
      afterValue: status?.statusName ?? "",
      error: `campaignBudgetResourceName must be a full resource name like "customers/{id}/campaignBudgets/{budgetId}" (got "${campaignBudgetResourceName}").`,
      experimentResourceName,
      graduatedCampaignResourceName: "",
      campaignBudgetResourceName,
    };
  }

  const trialCampaign = await fetchTreatmentTrialCampaign(customer, experimentResourceName);
  if (!trialCampaign) {
    return {
      success: false,
      action: "graduate_experiment",
      entityId: experimentIdFromResourceName(experimentResourceName) ?? "",
      beforeValue: status?.statusName ?? "",
      afterValue: status?.statusName ?? "",
      error: "Could not resolve the treatment arm's trial campaign. The experiment may not have finished forking yet — call listExperimentAsyncErrors and retry.",
      experimentResourceName,
      graduatedCampaignResourceName: "",
      campaignBudgetResourceName,
    };
  }

  try {
    await (customer as any).experiments.graduateExperiment({
      experiment: experimentResourceName,
      campaign_budget_mappings: [
        {
          experiment_campaign: trialCampaign,
          campaign_budget: campaignBudgetResourceName,
        },
      ],
    });
    return {
      success: true,
      action: "graduate_experiment",
      entityId: experimentIdFromResourceName(experimentResourceName) ?? "",
      beforeValue: status?.statusName ?? "ENABLED",
      afterValue: "GRADUATED",
      label: "experiment graduated",
      experimentResourceName,
      graduatedCampaignResourceName: trialCampaign,
      campaignBudgetResourceName,
    };
  } catch (error) {
    return {
      success: false,
      action: "graduate_experiment",
      entityId: experimentIdFromResourceName(experimentResourceName) ?? "",
      beforeValue: status?.statusName ?? "",
      afterValue: "",
      error: rewriteExperimentError(extractErrorMessage(error)),
      experimentResourceName,
      graduatedCampaignResourceName: trialCampaign,
      campaignBudgetResourceName,
    };
  }
}

// ─── listExperimentAsyncErrors ───────────────────────────────────────

/**
 * Retrieve any async errors logged during the most recent schedule or
 * promote operation. An empty list means the long-running operation
 * succeeded; a non-empty list means the campaign forking or promotion
 * failed and the agent must re-create the experiment after fixing the
 * underlying problem (usually a campaign-config issue).
 */
export async function listExperimentAsyncErrors(
  auth: AuthContext,
  experimentResourceName: string,
  pageSize: number = 100,
  pageToken?: string,
): Promise<ListExperimentAsyncErrorsResult> {
  const customer = getCustomer(auth);

  const response = await (customer as any).experiments.listExperimentAsyncErrors({
    resource_name: experimentResourceName,
    page_size: Math.min(Math.max(pageSize, 1), 1000),
    ...(pageToken ? { page_token: pageToken } : {}),
  });

  const rawErrors = (response?.errors ?? []) as Array<any>;
  const errors = rawErrors.map((e) => ({
    code: e?.code ?? undefined,
    message: typeof e?.message === "string" ? e.message : extractErrorMessage(e, { log: false }),
    details: e?.details ?? undefined,
  }));
  const nextPageToken: string | null =
    typeof response?.next_page_token === "string" && response.next_page_token.length > 0
      ? response.next_page_token
      : null;

  return {
    experimentResourceName,
    errors,
    nextPageToken,
  };
}

// ─── createAdVariationExperiment (high-level helper) ────────────────

export type CreateAdVariationExperimentParams = {
  /** Required. 1–1024 chars, unique under a customer. */
  name: string;
  /** Existing campaign whose RSA you're varying. */
  baseCampaignId: string;
  /** Ad group containing the RSA you want to vary. */
  baseAdGroupId: string;
  /** RSA whose assets are being varied (the trial campaign clones it). */
  baseAdId: string;
  /** Replacement RSA headlines for the trial ad (3–15, ≤30 chars each). Required if testing copy. */
  headlines?: AdAsset[];
  /** Replacement RSA descriptions for the trial ad (2–4, ≤90 chars each). Required if testing copy. */
  descriptions?: AdAsset[];
  /** Replacement final URL for the trial ad. */
  finalUrl?: string;
  /** Percent of traffic to the treatment arm. Default 50 (50/50 split). */
  treatmentTrafficSplit?: number;
  /** Suffix appended to the trial campaign name. Default "[ad-var]". */
  suffix?: string;
  /** YYYY-MM-DD. Defaults to "now or campaign start, whichever is later". */
  startDate?: string;
  /** YYYY-MM-DD. Recommended ≥ 14 days after start for stat significance. */
  endDate?: string;
  /** Optional human-readable description (max 2048 chars). */
  description?: string;
};

export type CreateAdVariationExperimentResult = WriteResult & {
  experimentResourceName?: string;
  trialCampaignId?: string;
  trialAdGroupId?: string;
  trialAdId?: string;
  /** Asset patches we attempted on the trial ad. */
  patches: { headlines: boolean; descriptions: boolean; finalUrl: boolean };
  /** True iff every bundled step succeeded; the caller can scheduleExperiment immediately. */
  readyToSchedule: boolean;
  /** Warning surfaced when partial steps succeeded (e.g. arms created but the patch failed). */
  warning?: string;
};

type RsaSignature = {
  adGroupName: string;
  adGroupId: string;
  adId: string;
  firstHeadline: string;
  firstDescription: string;
  finalUrl: string;
};

/**
 * Look up enough of a base RSA so we can match its clone in the trial campaign.
 * Returns null if the ad doesn't exist or isn't an RSA.
 */
async function fetchRsaSignature(
  customer: ReturnType<typeof getCustomer>,
  adGroupId: string,
  adId: string,
): Promise<RsaSignature | null> {
  const adIdNum = safeEntityId(adId, "ad");
  const adGroupIdNum = safeEntityId(adGroupId, "ad group");
  const rows = await customer.query(`
    SELECT
      ad_group.id, ad_group.name,
      ad_group_ad.ad.id,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group_ad.ad.final_urls
    FROM ad_group_ad
    WHERE ad_group_ad.ad.id = ${adIdNum}
      AND ad_group.id = ${adGroupIdNum}
    LIMIT 1
  `);
  type Row = {
    ad_group?: { id?: string | number; name?: string };
    ad_group_ad?: {
      ad?: {
        id?: string | number;
        responsive_search_ad?: {
          headlines?: Array<{ text?: string }>;
          descriptions?: Array<{ text?: string }>;
        };
        final_urls?: string[];
      };
    };
  };
  const row = (rows as Row[])[0];
  const rsa = row?.ad_group_ad?.ad?.responsive_search_ad;
  if (!row?.ad_group?.id || !rsa) return null;
  return {
    adGroupName: row.ad_group.name ?? "",
    adGroupId: String(row.ad_group.id),
    adId: String(row.ad_group_ad?.ad?.id ?? adId),
    firstHeadline: rsa.headlines?.[0]?.text ?? "",
    firstDescription: rsa.descriptions?.[0]?.text ?? "",
    finalUrl: row.ad_group_ad?.ad?.final_urls?.[0] ?? "",
  };
}

/**
 * Find the cloned RSA in a trial campaign. We match by (ad_group.name,
 * first headline text, first description text) — these are preserved across
 * the auto-clone, so for any practical account the match is unique.
 */
async function findTrialRsaMatching(
  customer: ReturnType<typeof getCustomer>,
  trialCampaignId: string,
  base: RsaSignature,
): Promise<{ adGroupId: string; adId: string } | { error: string }> {
  const trialId = safeEntityId(trialCampaignId, "trial campaign");
  const rows = await customer.query(`
    SELECT
      ad_group.id, ad_group.name,
      ad_group_ad.ad.id,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions
    FROM ad_group_ad
    WHERE campaign.id = ${trialId}
      AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
  `);
  type Row = {
    ad_group?: { id?: string | number; name?: string };
    ad_group_ad?: {
      ad?: {
        id?: string | number;
        responsive_search_ad?: {
          headlines?: Array<{ text?: string }>;
          descriptions?: Array<{ text?: string }>;
        };
      };
    };
  };
  const matches = (rows as Row[]).filter((r) => {
    const rsa = r.ad_group_ad?.ad?.responsive_search_ad;
    return (
      r.ad_group?.name === base.adGroupName &&
      rsa?.headlines?.[0]?.text === base.firstHeadline &&
      rsa?.descriptions?.[0]?.text === base.firstDescription
    );
  });

  if (matches.length === 0) {
    return {
      error: `Could not locate the cloned RSA in trial campaign ${trialCampaignId}. The trial campaign exists but no ad matches the base ad's signature (ad_group="${base.adGroupName}", first headline, first description).`,
    };
  }
  if (matches.length > 1) {
    return {
      error: `Ambiguous match: ${matches.length} RSAs in the trial campaign share the base ad's signature. Use the manual flow (createExperiment → addExperimentArms → updateAdAssets) instead.`,
    };
  }
  const m = matches[0];
  return {
    adGroupId: String(m.ad_group?.id ?? ""),
    adId: String(m.ad_group_ad?.ad?.id ?? ""),
  };
}

function trialCampaignIdFromResourceName(resourceName: string): string | null {
  // Numeric-only segments — same defense rationale as experimentIdFromResourceName.
  const match = resourceName.match(/^customers\/\d+\/campaigns\/(\d+)$/);
  return match ? match[1] : null;
}

/**
 * Bundle the RSA-asset A/B lifecycle's first 4 steps into one call:
 *   1. createExperiment (SEARCH_CUSTOM under the hood — see notes above)
 *   2. addExperimentArms(control referencing baseCampaign, treatment with split)
 *   3. resolve the cloned RSA in the trial campaign
 *   4. apply the asset patch via updateAdAssets / updateAdFinalUrl
 *
 * After this returns success, the caller calls `scheduleExperiment` to
 * fork the in-design campaign into a real serving campaign.
 *
 * Bundled-write semantics. This helper makes 4+ Google Ads API mutations
 * but only one operations-log row and one rate-limit charge get recorded
 * (via execWrite at the MCP boundary). That matches `createCampaign`'s
 * pattern — we treat the bundled call as one logical change. The granular
 * undo path is `endExperiment`, not per-step rollback (see
 * executeUndoForChange).
 *
 * Failure semantics — partial success is real here. If the experiment + arms
 * land but the patch fails, we return success=false but include the
 * experiment/trial IDs in the result so the agent can recover by calling
 * the granular tools (or end the experiment without scheduling).
 */
export async function createAdVariationExperiment(
  auth: AuthContext,
  params: CreateAdVariationExperimentParams,
): Promise<CreateAdVariationExperimentResult> {
  const customer = getCustomer(auth);
  const split = params.treatmentTrafficSplit ?? 50;
  const patches = { headlines: false, descriptions: false, finalUrl: false };

  // ── Step 0: validate ──
  if (!params.headlines && !params.descriptions && !params.finalUrl) {
    return {
      success: false,
      action: "create_ad_variation_experiment",
      entityId: "",
      beforeValue: "",
      afterValue: "",
      error: "Provide at least one of: headlines, descriptions, finalUrl. Otherwise the trial RSA is identical to the base and the experiment is meaningless.",
      patches,
      readyToSchedule: false,
    };
  }
  if (split < 1 || split > 99) {
    return {
      success: false,
      action: "create_ad_variation_experiment",
      entityId: "",
      beforeValue: "",
      afterValue: "",
      error: `treatmentTrafficSplit must be 1–99 (got ${split}).`,
      patches,
      readyToSchedule: false,
    };
  }
  if (params.headlines || params.descriptions) {
    if (!params.headlines || !params.descriptions) {
      return {
        success: false,
        action: "create_ad_variation_experiment",
        entityId: "",
        beforeValue: "",
        afterValue: "",
        error: "RSA assets are atomic — when patching headlines or descriptions, you must pass BOTH (Google replaces the full asset set on the trial RSA).",
        patches,
        readyToSchedule: false,
      };
    }
    const rsaError = validateRsaAssets(
      params.headlines.map((h) => h.text),
      params.descriptions.map((d) => d.text),
    );
    if (rsaError) {
      return {
        success: false,
        action: "create_ad_variation_experiment",
        entityId: "",
        beforeValue: "",
        afterValue: "",
        error: rsaError,
        patches,
        readyToSchedule: false,
      };
    }
  }
  if (params.finalUrl !== undefined && !/^https?:\/\//i.test(params.finalUrl)) {
    return {
      success: false,
      action: "create_ad_variation_experiment",
      entityId: "",
      beforeValue: "",
      afterValue: "",
      error: "finalUrl must start with http:// or https://.",
      patches,
      readyToSchedule: false,
    };
  }

  // ── Step 0b: snapshot the base RSA so we can match its clone later ──
  let base: RsaSignature | null;
  try {
    base = await fetchRsaSignature(customer, params.baseAdGroupId, params.baseAdId);
  } catch (error) {
    return {
      success: false,
      action: "create_ad_variation_experiment",
      entityId: "",
      beforeValue: "",
      afterValue: "",
      error: `Could not read base RSA before forking: ${extractErrorMessage(error)}`,
      patches,
      readyToSchedule: false,
    };
  }
  if (!base) {
    return {
      success: false,
      action: "create_ad_variation_experiment",
      entityId: "",
      beforeValue: "",
      afterValue: "",
      error: `Base ad ${params.baseAdId} (in ad group ${params.baseAdGroupId}) is not a Responsive Search Ad, or doesn't exist. AD_VARIATION supports RSAs only.`,
      patches,
      readyToSchedule: false,
    };
  }

  // ── Step 1: createExperiment ──
  // Uses type=SEARCH_CUSTOM under the hood. The proto enum has an
  // AD_VARIATION value, but no Google sample or doc demonstrates passing it
  // through ExperimentService.MutateExperiments — and the support docs
  // describe AD_VARIATION as cross-campaign, which doesn't fit
  // experiment_arm.campaigns (max length 1). The well-traveled path for
  // RSA-asset A/B testing is to clone the campaign with SEARCH_CUSTOM and
  // mutate the cloned RSA, which is what we do here.
  const exp = await createExperiment(auth, {
    name: params.name,
    type: "SEARCH_CUSTOM",
    suffix: params.suffix ?? "[ad-var]",
    description: params.description,
    startDate: params.startDate,
    endDate: params.endDate,
  });
  if (!exp.success || !exp.experimentResourceName) {
    return {
      success: false,
      action: "create_ad_variation_experiment",
      entityId: "",
      beforeValue: "",
      afterValue: params.name,
      error: exp.error ?? "Failed to create the AD_VARIATION experiment row.",
      patches,
      readyToSchedule: false,
    };
  }

  // ── Step 2: addExperimentArms ──
  const arms = await addExperimentArms(auth, exp.experimentResourceName, [
    { name: "control", control: true, trafficSplit: 100 - split, campaignId: params.baseCampaignId },
    { name: "variation", control: false, trafficSplit: split },
  ]);
  if (!arms.success || arms.inDesignCampaigns.length === 0) {
    return {
      success: false,
      action: "create_ad_variation_experiment",
      entityId: experimentIdFromResourceName(exp.experimentResourceName) ?? "",
      beforeValue: "",
      afterValue: params.name,
      error: arms.error ?? "addExperimentArms succeeded but no trial campaign was returned.",
      experimentResourceName: exp.experimentResourceName,
      patches,
      readyToSchedule: false,
    };
  }

  const trialCampaignId =
    trialCampaignIdFromResourceName(arms.inDesignCampaigns[0]) ?? "";

  // ── Step 3: find the cloned RSA in the trial campaign ──
  const trialRsa = await findTrialRsaMatching(customer, trialCampaignId, base);
  if ("error" in trialRsa) {
    return {
      success: false,
      action: "create_ad_variation_experiment",
      entityId: experimentIdFromResourceName(exp.experimentResourceName) ?? "",
      beforeValue: "",
      afterValue: params.name,
      error: trialRsa.error,
      experimentResourceName: exp.experimentResourceName,
      trialCampaignId,
      patches,
      readyToSchedule: false,
      warning: "Experiment + arms exist but the cloned RSA could not be matched. Either patch the trial ad manually with updateAdAssets, or call endExperiment to discard.",
    };
  }

  // ── Step 4: apply the asset patch on the trial ad ──
  const warnings: string[] = [];
  if (params.headlines && params.descriptions) {
    const r = await updateAdAssets(auth, trialRsa.adGroupId, trialRsa.adId, {
      headlines: params.headlines,
      descriptions: params.descriptions,
    });
    patches.headlines = r.success;
    patches.descriptions = r.success;
    if (!r.success) warnings.push(`updateAdAssets on trial RSA failed: ${r.error}`);
  }
  if (params.finalUrl !== undefined) {
    const r = await updateAdFinalUrl(auth, trialRsa.adGroupId, trialRsa.adId, params.finalUrl);
    patches.finalUrl = r.success;
    if (!r.success) warnings.push(`updateAdFinalUrl on trial RSA failed: ${r.error}`);
  }

  const allRequestedPatchesLanded =
    (!params.headlines || patches.headlines) &&
    (!params.descriptions || patches.descriptions) &&
    (params.finalUrl === undefined || patches.finalUrl);

  return {
    success: allRequestedPatchesLanded,
    action: "create_ad_variation_experiment",
    entityId: experimentIdFromResourceName(exp.experimentResourceName) ?? "",
    beforeValue: "",
    afterValue: JSON.stringify({
      name: params.name,
      treatmentTrafficSplit: split,
      patched: { ...patches },
    }),
    label: params.name,
    error: warnings.length > 0 ? warnings.join("; ") : undefined,
    experimentResourceName: exp.experimentResourceName,
    trialCampaignId,
    trialAdGroupId: trialRsa.adGroupId,
    trialAdId: trialRsa.adId,
    patches,
    readyToSchedule: allRequestedPatchesLanded,
    warning: !allRequestedPatchesLanded
      ? "Experiment + arms exist but at least one asset patch failed. Re-apply with updateAdAssets / updateAdFinalUrl on the trial ad before scheduleExperiment."
      : undefined,
  };
}

// ─── Test surface ────────────────────────────────────────────────────
//
// Exposed so unit tests can assert on the proto-shape we feed the library
// without having to mock the entire google-ads-api Customer object.

export const __testInternals = {
  EXPERIMENT_TYPE_CODE,
  EXPERIMENT_STATUS_CODE,
  RESPONSE_CONTENT_MUTABLE_RESOURCE,
  experimentIdFromResourceName,
  rewriteExperimentError,
  trialCampaignIdFromResourceName,
};
