import { describe, expect, it } from "vitest";
import {
  createExperiment,
  addExperimentArms,
  scheduleExperiment,
  endExperiment,
  promoteExperiment,
  graduateExperiment,
  listExperimentAsyncErrors,
  createAdVariationExperiment,
} from "./experiments";
import { DEMO_CUSTOMER_ID, DEMO_REFRESH_TOKEN } from "@/lib/demo/constants";
import type { AuthContext } from "./types";

// Lives in its own file so the global `vi.mock("./client")` in experiments.test.ts
// doesn't apply. We're verifying the real demo stub from client.ts answers every
// experiment-service call without TypeError'ing.

const auth: AuthContext = {
  refreshToken: DEMO_REFRESH_TOKEN,
  customerId: DEMO_CUSTOMER_ID,
  userId: "demo-user",
};

describe("experiment helpers — demo auth path", () => {
  it("createExperiment returns a synthetic resource name", async () => {
    const result = await createExperiment(auth, {
      name: "demo experiment",
      type: "SEARCH_CUSTOM",
    });
    expect(result.success).toBe(true);
    expect(result.experimentResourceName).toMatch(/^customers\/0\/experiments\//);
  });

  it("addExperimentArms returns a synthetic trial campaign", async () => {
    const result = await addExperimentArms(auth, "customers/0/experiments/demo", [
      { name: "control", control: true, trafficSplit: 50, campaignId: "1" },
      { name: "treatment", control: false, trafficSplit: 50 },
    ]);
    expect(result.success).toBe(true);
    expect(result.inDesignCampaigns).toEqual(["customers/0/campaigns/demo-trial"]);
  });

  it("scheduleExperiment + endExperiment + promoteExperiment + graduateExperiment all answer without throwing", async () => {
    const exp = "customers/0/experiments/demo";
    // The demo stub also answers experiment.query as [], so the status
    // pre-check returns null and we go straight to the RPC stubs.
    const sched = await scheduleExperiment(auth, exp);
    expect(sched.success).toBe(true);
    expect(sched.operationName).toBe("operations/demo-schedule");

    const ended = await endExperiment(auth, exp);
    expect(ended.success).toBe(true);

    const promoted = await promoteExperiment(auth, exp);
    expect(promoted.success).toBe(true);

    // graduate requires a "trial campaign" — the empty query returns null
    // so we expect a structured failure (not a crash). That's the safe shape
    // for demo: we don't pretend the trial exists.
    const grad = await graduateExperiment(auth, exp, "customers/0/campaignBudgets/9");
    expect(grad.success).toBe(false);
    expect(grad.error).toBeTruthy();
  });

  it("listExperimentAsyncErrors returns an empty error list", async () => {
    const result = await listExperimentAsyncErrors(auth, "customers/0/experiments/demo");
    expect(result.errors).toEqual([]);
    expect(result.nextPageToken).toBeNull();
  });

  it("createAdVariationExperiment surfaces a clean error against the empty demo data", async () => {
    // The demo stub returns [] for every query, so the base RSA lookup will
    // fail. We verify it produces a structured error rather than crashing —
    // matches the safe demo posture (we don't pretend ads exist that don't).
    const result = await createAdVariationExperiment(auth, {
      name: "demo ad variation",
      baseCampaignId: "1",
      baseAdGroupId: "2",
      baseAdId: "3",
      finalUrl: "https://example.com/new",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Responsive Search Ad/);
  });
});
