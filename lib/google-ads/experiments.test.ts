import { describe, expect, it, vi, beforeEach } from "vitest";

const queryFn = vi.fn<(_q: string) => Promise<unknown[]>>();
const mutateResourcesFn = vi.fn();
const experimentsCreate = vi.fn();
const experimentArmsCreate = vi.fn();
const scheduleExperimentRpc = vi.fn();
const endExperimentRpc = vi.fn();
const promoteExperimentRpc = vi.fn();
const graduateExperimentRpc = vi.fn();
const listExperimentAsyncErrorsRpc = vi.fn();

vi.mock("./client", () => ({
  getCustomer: vi.fn(() => ({
    query: queryFn,
    mutateResources: mutateResourcesFn,
    experiments: {
      create: experimentsCreate,
      scheduleExperiment: scheduleExperimentRpc,
      endExperiment: endExperimentRpc,
      promoteExperiment: promoteExperimentRpc,
      graduateExperiment: graduateExperimentRpc,
      listExperimentAsyncErrors: listExperimentAsyncErrorsRpc,
    },
    experimentArms: {
      create: experimentArmsCreate,
    },
  })),
  getCachedCustomer: vi.fn(() => ({
    query: queryFn,
    mutateResources: mutateResourcesFn,
  })),
  STATUS: { ENABLED: 2, PAUSED: 3 },
  AD_GROUP_TYPE: { SEARCH_STANDARD: 2 },
  MATCH_TYPE: { EXACT: 2, PHRASE: 3, BROAD: 4 },
  MATCH_TYPE_NAME: { 2: "EXACT", 3: "PHRASE", 4: "BROAD" },
}));

import {
  createExperiment,
  addExperimentArms,
  scheduleExperiment,
  endExperiment,
  promoteExperiment,
  graduateExperiment,
  listExperimentAsyncErrors,
  createAdVariationExperiment,
  __testInternals,
} from "./experiments";
import type { AuthContext } from "./types";

const auth: AuthContext = {
  refreshToken: "rt",
  customerId: "1234567890",
  userId: "u1",
};

const EXP_RN = "customers/1234567890/experiments/555";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createExperiment", () => {
  it("encodes type/status/suffix/dates as snake_case proto fields", async () => {
    experimentsCreate.mockResolvedValue({
      results: [{ resource_name: EXP_RN }],
    });

    const result = await createExperiment(auth, {
      name: "Q2 bidding test",
      type: "SEARCH_CUSTOM",
      suffix: "[bid-test]",
      description: "Compare TARGET_CPA vs MAX_CONV",
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      syncEnabled: true,
    });

    expect(result.success).toBe(true);
    expect(result.experimentResourceName).toBe(EXP_RN);
    expect(result.entityId).toBe("555");

    expect(experimentsCreate).toHaveBeenCalledTimes(1);
    const [resources] = experimentsCreate.mock.calls[0];
    expect(resources).toHaveLength(1);
    const r = resources[0];
    expect(r.name).toBe("Q2 bidding test");
    expect(r.type).toBe(__testInternals.EXPERIMENT_TYPE_CODE.SEARCH_CUSTOM);
    expect(r.status).toBe(__testInternals.EXPERIMENT_STATUS_CODE.SETUP);
    expect(r.suffix).toBe("[bid-test]");
    expect(r.description).toBe("Compare TARGET_CPA vs MAX_CONV");
    expect(r.start_date).toBe("2026-05-01");
    expect(r.end_date).toBe("2026-05-31");
    expect(r.sync_enabled).toBe(true);
  });

  it("defaults the suffix to [experiment] when omitted", async () => {
    experimentsCreate.mockResolvedValue({ results: [{ resource_name: EXP_RN }] });
    await createExperiment(auth, { name: "n", type: "SEARCH_CUSTOM" });
    expect(experimentsCreate.mock.calls[0][0][0].suffix).toBe("[experiment]");
  });

  it("rejects empty names without hitting the API", async () => {
    const result = await createExperiment(auth, { name: "  ", type: "SEARCH_CUSTOM" });
    expect(result.success).toBe(false);
    expect(experimentsCreate).not.toHaveBeenCalled();
  });

  it("rejects malformed dates", async () => {
    const result = await createExperiment(auth, {
      name: "n",
      type: "SEARCH_CUSTOM",
      startDate: "May 1",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/YYYY-MM-DD/);
  });

  it("rejects end_date before start_date", async () => {
    const result = await createExperiment(auth, {
      name: "n",
      type: "SEARCH_CUSTOM",
      startDate: "2026-06-01",
      endDate: "2026-05-15",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/end_date.*start_date/);
    expect(experimentsCreate).not.toHaveBeenCalled();
  });

  it("rewrites duplicate-name errors into actionable prose", async () => {
    experimentsCreate.mockRejectedValue({
      errors: [{ message: "Duplicate", error_code: { experiment_error: 2 } }],
    });
    const result = await createExperiment(auth, { name: "dup", type: "SEARCH_CUSTOM" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already exists/i);
  });
});

describe("addExperimentArms", () => {
  const validArms = [
    { name: "control", control: true, trafficSplit: 50, campaignId: "12345" },
    { name: "treatment", control: false, trafficSplit: 50 },
  ];

  it("sends control + treatment in one mutate, snake_case, MUTABLE_RESOURCE", async () => {
    experimentArmsCreate.mockResolvedValue({
      results: [
        {
          resource_name: "customers/1234567890/experimentArms/555~1",
          experiment_arm: {
            name: "control",
            control: true,
            traffic_split: 50,
            campaigns: ["customers/1234567890/campaigns/12345"],
            in_design_campaigns: [],
          },
        },
        {
          resource_name: "customers/1234567890/experimentArms/555~2",
          experiment_arm: {
            name: "treatment",
            control: false,
            traffic_split: 50,
            campaigns: [],
            in_design_campaigns: ["customers/1234567890/campaigns/99999"],
          },
        },
      ],
    });

    const result = await addExperimentArms(auth, EXP_RN, validArms);

    expect(result.success).toBe(true);
    expect(result.inDesignCampaigns).toEqual(["customers/1234567890/campaigns/99999"]);
    expect(result.arms).toHaveLength(2);

    const [resources, options] = experimentArmsCreate.mock.calls[0];
    expect(resources).toHaveLength(2);
    expect(resources[0]).toMatchObject({
      experiment: EXP_RN,
      name: "control",
      control: true,
      traffic_split: 50,
      campaigns: ["customers/1234567890/campaigns/12345"],
    });
    expect(resources[1]).toMatchObject({
      experiment: EXP_RN,
      name: "treatment",
      control: false,
      traffic_split: 50,
    });
    expect(resources[1].campaigns).toBeUndefined();
    expect(options).toEqual({
      partial_failure: false,
      response_content_type: __testInternals.RESPONSE_CONTENT_MUTABLE_RESOURCE,
    });
  });

  it("rejects when traffic split doesn't sum to 100", async () => {
    const result = await addExperimentArms(auth, EXP_RN, [
      { name: "c", control: true, trafficSplit: 60, campaignId: "1" },
      { name: "t", control: false, trafficSplit: 30 },
    ]);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/sum to 100/i);
    expect(experimentArmsCreate).not.toHaveBeenCalled();
  });

  it("rejects when no control arm provided", async () => {
    const result = await addExperimentArms(auth, EXP_RN, [
      { name: "a", control: false, trafficSplit: 50 },
      { name: "b", control: false, trafficSplit: 50 },
    ]);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/exactly one arm/i);
  });

  it("rejects when control arm omits its campaignId", async () => {
    const result = await addExperimentArms(auth, EXP_RN, [
      { name: "c", control: true, trafficSplit: 50 },
      { name: "t", control: false, trafficSplit: 50 },
    ]);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/control arm.*campaignId/i);
  });
});

describe("scheduleExperiment", () => {
  it("rejects scheduling experiments that are not in SETUP", async () => {
    queryFn.mockResolvedValueOnce([
      { experiment: { resource_name: EXP_RN, status: 2 } },
    ]);
    const result = await scheduleExperiment(auth, EXP_RN);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/only SETUP/);
    expect(scheduleExperimentRpc).not.toHaveBeenCalled();
  });

  it("returns operation name and done flag from the LRO", async () => {
    queryFn.mockResolvedValueOnce([
      { experiment: { resource_name: EXP_RN, status: 6 } },
    ]);
    scheduleExperimentRpc.mockResolvedValue({
      name: "operations/abc123",
      done: false,
    });
    const result = await scheduleExperiment(auth, EXP_RN);
    expect(result.success).toBe(true);
    expect(result.operationName).toBe("operations/abc123");
    expect(result.done).toBe(false);
    expect(scheduleExperimentRpc).toHaveBeenCalledWith({ resource_name: EXP_RN });
  });
});

describe("endExperiment", () => {
  it("uses the `experiment` field per proto", async () => {
    queryFn.mockResolvedValueOnce([
      { experiment: { resource_name: EXP_RN, status: 2 } },
    ]);
    endExperimentRpc.mockResolvedValue({});
    const result = await endExperiment(auth, EXP_RN);
    expect(result.success).toBe(true);
    expect(endExperimentRpc).toHaveBeenCalledWith({ experiment: EXP_RN });
  });

  it("rejects ending experiments that are still in SETUP", async () => {
    queryFn.mockResolvedValueOnce([
      { experiment: { resource_name: EXP_RN, status: 6 } },
    ]);
    const result = await endExperiment(auth, EXP_RN);
    expect(result.success).toBe(false);
    expect(endExperimentRpc).not.toHaveBeenCalled();
  });
});

describe("promoteExperiment", () => {
  it("uses the `resource_name` field per proto and only runs from ENABLED", async () => {
    queryFn.mockResolvedValueOnce([
      { experiment: { resource_name: EXP_RN, status: 2 } },
    ]);
    promoteExperimentRpc.mockResolvedValue({ name: "operations/p1", done: false });
    const result = await promoteExperiment(auth, EXP_RN);
    expect(result.success).toBe(true);
    expect(result.operationName).toBe("operations/p1");
    expect(promoteExperimentRpc).toHaveBeenCalledWith({ resource_name: EXP_RN });
  });

  it("rejects promoting non-running experiments", async () => {
    queryFn.mockResolvedValueOnce([
      { experiment: { resource_name: EXP_RN, status: 6 } },
    ]);
    const result = await promoteExperiment(auth, EXP_RN);
    expect(result.success).toBe(false);
    expect(promoteExperimentRpc).not.toHaveBeenCalled();
  });
});

describe("graduateExperiment", () => {
  const BUDGET_RN = "customers/1234567890/campaignBudgets/789";
  const TRIAL_CAMPAIGN_RN = "customers/1234567890/campaigns/99999";

  it("resolves the trial campaign from the treatment arm and posts a single mapping", async () => {
    queryFn
      .mockResolvedValueOnce([{ experiment: { resource_name: EXP_RN, status: 2 } }])
      .mockResolvedValueOnce([
        {
          experiment_arm: { control: true, in_design_campaigns: [] },
        },
        {
          experiment_arm: {
            control: false,
            in_design_campaigns: [TRIAL_CAMPAIGN_RN],
          },
        },
      ]);
    graduateExperimentRpc.mockResolvedValue({});

    const result = await graduateExperiment(auth, EXP_RN, BUDGET_RN);

    expect(result.success).toBe(true);
    expect(result.graduatedCampaignResourceName).toBe(TRIAL_CAMPAIGN_RN);
    expect(graduateExperimentRpc).toHaveBeenCalledWith({
      experiment: EXP_RN,
      campaign_budget_mappings: [
        { experiment_campaign: TRIAL_CAMPAIGN_RN, campaign_budget: BUDGET_RN },
      ],
    });
  });

  it("rejects when the budget input is not a full resource name", async () => {
    queryFn.mockResolvedValueOnce([
      { experiment: { resource_name: EXP_RN, status: 2 } },
    ]);
    const result = await graduateExperiment(auth, EXP_RN, "789");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/full resource name/i);
    expect(graduateExperimentRpc).not.toHaveBeenCalled();
  });

  it("rejects when the experiment has no materialized trial campaign", async () => {
    queryFn
      .mockResolvedValueOnce([{ experiment: { resource_name: EXP_RN, status: 2 } }])
      .mockResolvedValueOnce([
        { experiment_arm: { control: true, in_design_campaigns: [] } },
        { experiment_arm: { control: false, in_design_campaigns: [] } },
      ]);
    const result = await graduateExperiment(auth, EXP_RN, BUDGET_RN);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/listExperimentAsyncErrors/i);
    expect(graduateExperimentRpc).not.toHaveBeenCalled();
  });
});

describe("listExperimentAsyncErrors", () => {
  it("clamps page_size into [1, 1000] and threads page_token", async () => {
    listExperimentAsyncErrorsRpc.mockResolvedValue({
      errors: [{ code: 7, message: "boom" }],
      next_page_token: "tok2",
    });
    const result = await listExperimentAsyncErrors(auth, EXP_RN, 5000, "tok1");
    expect(listExperimentAsyncErrorsRpc).toHaveBeenCalledWith({
      resource_name: EXP_RN,
      page_size: 1000,
      page_token: "tok1",
    });
    expect(result.errors).toEqual([{ code: 7, message: "boom", details: undefined }]);
    expect(result.nextPageToken).toBe("tok2");
  });

  it("returns nextPageToken=null when the response has no token", async () => {
    listExperimentAsyncErrorsRpc.mockResolvedValue({ errors: [] });
    const result = await listExperimentAsyncErrors(auth, EXP_RN);
    expect(result.errors).toEqual([]);
    expect(result.nextPageToken).toBeNull();
  });
});

describe("createAdVariationExperiment", () => {
  const baseAdSig = {
    ad_group: { id: "67890", name: "Brand AG" },
    ad_group_ad: {
      ad: {
        id: "11111",
        responsive_search_ad: {
          headlines: [{ text: "Buy now" }, { text: "Top brand" }, { text: "Save 10%" }],
          descriptions: [{ text: "Free shipping." }, { text: "30-day returns." }],
        },
        final_urls: ["https://example.com/old"],
      },
    },
  };
  const trialCampaignRn = "customers/1234567890/campaigns/99999";
  const armsResponse = {
    results: [
      {
        resource_name: "customers/1234567890/experimentArms/555~1",
        experiment_arm: { name: "control", control: true, traffic_split: 50 },
      },
      {
        resource_name: "customers/1234567890/experimentArms/555~2",
        experiment_arm: {
          name: "variation",
          control: false,
          traffic_split: 50,
          in_design_campaigns: [trialCampaignRn],
        },
      },
    ],
  };

  const validHeadlines = [
    { text: "Book today" },
    { text: "Top brand" },
    { text: "Save 20%" },
  ];
  const validDescriptions = [
    { text: "Free shipping over $50." },
    { text: "30-day money-back guarantee." },
  ];

  it("uses SEARCH_CUSTOM under the hood (the verified API path for RSA A/B), not AD_VARIATION", () => {
    // AD_VARIATION = 3 exists in the proto but no Google sample demonstrates
    // it through ExperimentService.MutateExperiments; SEARCH_CUSTOM = 7 is
    // the documented path. We assert the supported types so a future change
    // to expose AD_VARIATION trips this test and forces re-verification.
    expect(__testInternals.EXPERIMENT_TYPE_CODE.SEARCH_CUSTOM).toBe(7);
    expect(
      (__testInternals.EXPERIMENT_TYPE_CODE as Record<string, number>).AD_VARIATION,
    ).toBeUndefined();
  });

  it("end-to-end: creates experiment, adds arms, finds the cloned RSA, patches assets + finalUrl", async () => {
    queryFn
      // base RSA signature lookup
      .mockResolvedValueOnce([baseAdSig])
      // findTrialRsaMatching — returns one matching cloned RSA
      .mockResolvedValueOnce([
        {
          ad_group: { id: "77777", name: "Brand AG" },
          ad_group_ad: {
            ad: {
              id: "22222",
              responsive_search_ad: {
                headlines: [{ text: "Buy now" }],
                descriptions: [{ text: "Free shipping." }],
              },
            },
          },
        },
      ])
      // updateAdAssets reads current state for undo record
      .mockResolvedValueOnce([
        {
          ad_group_ad: {
            ad: {
              responsive_search_ad: baseAdSig.ad_group_ad.ad.responsive_search_ad,
            },
          },
        },
      ])
      // updateAdFinalUrl reads current URL for undo record
      .mockResolvedValueOnce([
        { ad_group_ad: { ad: { final_urls: ["https://example.com/old"] } } },
      ]);
    experimentsCreate.mockResolvedValue({
      results: [{ resource_name: "customers/1234567890/experiments/555" }],
    });
    experimentArmsCreate.mockResolvedValue(armsResponse);
    mutateResourcesFn.mockResolvedValue({});

    const result = await createAdVariationExperiment(auth, {
      name: "RSA copy test",
      baseCampaignId: "12345",
      baseAdGroupId: "67890",
      baseAdId: "11111",
      headlines: validHeadlines,
      descriptions: validDescriptions,
      finalUrl: "https://example.com/new",
    });

    expect(result.success).toBe(true);
    expect(result.readyToSchedule).toBe(true);
    expect(result.experimentResourceName).toBe("customers/1234567890/experiments/555");
    expect(result.trialCampaignId).toBe("99999");
    expect(result.trialAdGroupId).toBe("77777");
    expect(result.trialAdId).toBe("22222");
    expect(result.patches).toEqual({ headlines: true, descriptions: true, finalUrl: true });

    // Confirm we created a SEARCH_CUSTOM experiment (the verified API path).
    expect(experimentsCreate.mock.calls[0][0][0].type).toBe(7);

    // Two ad mutations should have been issued — updateAdAssets + updateAdFinalUrl
    expect(mutateResourcesFn).toHaveBeenCalledTimes(2);
  });

  it("rejects when neither headlines nor descriptions nor finalUrl is set", async () => {
    const result = await createAdVariationExperiment(auth, {
      name: "test",
      baseCampaignId: "1",
      baseAdGroupId: "2",
      baseAdId: "3",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/at least one/i);
    expect(experimentsCreate).not.toHaveBeenCalled();
  });

  it("rejects partial RSA patches (headlines without descriptions)", async () => {
    const result = await createAdVariationExperiment(auth, {
      name: "test",
      baseCampaignId: "1",
      baseAdGroupId: "2",
      baseAdId: "3",
      headlines: validHeadlines,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/atomic/i);
    expect(experimentsCreate).not.toHaveBeenCalled();
  });

  it("rejects when the base ad isn't a Responsive Search Ad", async () => {
    queryFn.mockResolvedValueOnce([
      {
        ad_group: { id: "67890", name: "Brand AG" },
        ad_group_ad: { ad: { id: "11111" /* no responsive_search_ad field */ } },
      },
    ]);
    const result = await createAdVariationExperiment(auth, {
      name: "test",
      baseCampaignId: "1",
      baseAdGroupId: "67890",
      baseAdId: "11111",
      finalUrl: "https://example.com/new",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Responsive Search Ad/);
    expect(experimentsCreate).not.toHaveBeenCalled();
  });

  it("returns a recoverable failure when the trial RSA can't be matched", async () => {
    queryFn
      .mockResolvedValueOnce([baseAdSig])
      // No matching ads in the trial campaign
      .mockResolvedValueOnce([]);
    experimentsCreate.mockResolvedValue({
      results: [{ resource_name: "customers/1234567890/experiments/555" }],
    });
    experimentArmsCreate.mockResolvedValue(armsResponse);

    const result = await createAdVariationExperiment(auth, {
      name: "test",
      baseCampaignId: "12345",
      baseAdGroupId: "67890",
      baseAdId: "11111",
      finalUrl: "https://example.com/new",
    });

    expect(result.success).toBe(false);
    expect(result.readyToSchedule).toBe(false);
    expect(result.experimentResourceName).toBeTruthy();
    expect(result.trialCampaignId).toBe("99999");
    expect(result.warning).toMatch(/manually|endExperiment/i);
    expect(mutateResourcesFn).not.toHaveBeenCalled();
  });

  it("flags ambiguous matches when multiple RSAs share the base signature", async () => {
    const ambiguous = {
      ad_group: { id: "77777", name: "Brand AG" },
      ad_group_ad: {
        ad: {
          id: "22222",
          responsive_search_ad: {
            headlines: [{ text: "Buy now" }],
            descriptions: [{ text: "Free shipping." }],
          },
        },
      },
    };
    queryFn
      .mockResolvedValueOnce([baseAdSig])
      .mockResolvedValueOnce([ambiguous, { ...ambiguous, ad_group_ad: { ad: { ...ambiguous.ad_group_ad.ad, id: "33333" } } }]);
    experimentsCreate.mockResolvedValue({
      results: [{ resource_name: "customers/1234567890/experiments/555" }],
    });
    experimentArmsCreate.mockResolvedValue(armsResponse);

    const result = await createAdVariationExperiment(auth, {
      name: "test",
      baseCampaignId: "12345",
      baseAdGroupId: "67890",
      baseAdId: "11111",
      finalUrl: "https://example.com/new",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/[Aa]mbiguous/);
  });

  it("rejects RSA validation failures (too few headlines)", async () => {
    const result = await createAdVariationExperiment(auth, {
      name: "test",
      baseCampaignId: "1",
      baseAdGroupId: "2",
      baseAdId: "3",
      headlines: [{ text: "only one" }, { text: "two" }],
      descriptions: validDescriptions,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/3-15 headlines/);
  });

  it("rejects invalid traffic split", async () => {
    const result = await createAdVariationExperiment(auth, {
      name: "test",
      baseCampaignId: "1",
      baseAdGroupId: "2",
      baseAdId: "3",
      finalUrl: "https://example.com/new",
      treatmentTrafficSplit: 0,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/1.{1,3}99/);
  });
});

describe("rewriteExperimentError", () => {
  it("translates traffic-split sum errors into actionable prose", () => {
    const out = __testInternals.rewriteExperimentError(
      "Sum is wrong (experiment_error=16)",
    );
    expect(out).toMatch(/sum to exactly 100/i);
  });

  it("leaves unknown errors unchanged", () => {
    const out = __testInternals.rewriteExperimentError("network blip");
    expect(out).toBe("network blip");
  });
});
