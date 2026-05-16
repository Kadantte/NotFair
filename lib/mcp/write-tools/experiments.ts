import { z } from "zod";
import {
  createExperiment,
  addExperimentArms,
  scheduleExperiment,
  endExperiment,
  promoteExperiment,
  graduateExperiment,
  listExperimentAsyncErrors,
  createAdVariationExperiment,
  SUPPORTED_EXPERIMENT_TYPES,
} from "@/lib/google-ads";
import { execWrite, execRead } from "@/lib/tools/execute";
import {
  typedResult,
  safeHandler,
  accountIdParam,
  READ_ANNOTATIONS,
  WRITE_ANNOTATIONS,
  DESTRUCTIVE_WRITE_ANNOTATIONS,
} from "../types";
import { resolveToolAuth } from "../helpers";
import type { WriteToolDeps } from "./_deps";

export function registerExperimentWriteTools(deps: WriteToolDeps) {
  const { server, currentAuth, writeToolCall } = deps;

  // ─── Experiments (Drafts & Trials) ──────────────────────────────
  //
  // Lifecycle: createExperiment → addExperimentArms → modify the returned
  // inDesignCampaigns[0] (e.g. updateCampaignBidding, updateAd, addKeyword)
  // → scheduleExperiment → listExperimentAsyncErrors (verify forking succeeded)
  // → run for ≥ 14 days → endExperiment | promoteExperiment | graduateExperiment.
  // Read the `notfair://playbooks/run-experiment` resource for the full flow.

  server.registerTool("createExperiment", {
    description:
      "Create a Google Ads experiment in SETUP status. Step 1 of 5 — next call addExperimentArms with one control + one treatment arm. Type `SEARCH_CUSTOM` for general search experiments (compare ads/keywords/landing pages); `SEARCH_AUTOMATED_BIDDING_STRATEGY` to compare bidding strategies on the same campaign. The experiment doesn't serve traffic until scheduleExperiment is called. Returns experimentResourceName.",
    inputSchema: {
      accountId: accountIdParam,
      name: z.string().min(1).max(1024).describe("Experiment name, unique under the customer."),
      type: z
        .enum(SUPPORTED_EXPERIMENT_TYPES)
        .describe("SEARCH_CUSTOM for ad/keyword/landing-page tests; SEARCH_AUTOMATED_BIDDING_STRATEGY to compare bidding strategies."),
      suffix: z
        .string()
        .max(64)
        .optional()
        .describe("String appended to the trial campaign name. Defaults to '[experiment]'."),
      description: z.string().max(2048).optional(),
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("YYYY-MM-DD. Defaults to today (or campaign start, whichever is later)."),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("YYYY-MM-DD. Defaults to the base campaign's end date. Recommended: ≥14 days after start for stat significance."),
      syncEnabled: z
        .boolean()
        .optional()
        .describe("If true, edits to the base campaign also propagate into the trial. Immutable after creation."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, name, type, suffix, description, startDate, endDate, syncEnabled }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () =>
      createExperiment(targetAuth, { name, type, suffix, description, startDate, endDate, syncEnabled }),
    );
    return typedResult({
      ...result,
      nextSteps: result.success
        ? "Call addExperimentArms with one control arm (referencing the existing campaign you want to test) and one treatment arm (traffic_split must sum to 100). Then mutate the returned inDesignCampaigns[0] before scheduling."
        : undefined,
    });
  }));

  server.registerTool("addExperimentArms", {
    description:
      "Step 2 of 5. Create both arms (control + treatment) in ONE atomic call — Google forbids adding arms incrementally because traffic_split must sum to 100. The control arm references an existing campaign; the treatment arm has Google auto-spawn a trial campaign that you then mutate (returned as `inDesignCampaigns[0]`). Returns the trial campaign resource name(s) so the agent can apply the change under test BEFORE scheduling. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      experimentResourceName: z
        .string()
        .regex(/^customers\/[^/]+\/experiments\/[^/]+$/)
        .describe("Resource name from createExperiment, e.g. 'customers/123/experiments/456'."),
      arms: z
        .array(
          z.object({
            name: z.string().min(1).max(1024),
            control: z.boolean().describe("Exactly one arm must be control=true."),
            trafficSplit: z
              .number()
              .int()
              .min(1)
              .max(99)
              .describe("Percent of traffic to this arm (1–99). All arms together must sum to 100."),
            campaignId: z
              .string()
              .optional()
              .describe("REQUIRED on the control arm: ID of the existing campaign you're comparing against. Omit on the treatment arm — Google auto-creates the trial."),
          }),
        )
        .min(2)
        .max(2)
        .describe("Provide both arms in one call. v1 supports exactly one control + one treatment (Google's current limit)."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, experimentResourceName, arms }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () =>
      addExperimentArms(targetAuth, experimentResourceName, arms),
    );
    return typedResult({
      ...result,
      nextSteps: result.success && result.inDesignCampaigns.length > 0
        ? `Apply the change you want to test on the trial campaign(s): ${result.inDesignCampaigns.join(", ")}. For a bidding test, call updateCampaignBidding on the trial campaign ID. For an ad copy test, call createAd / updateAdAssets. THEN call scheduleExperiment.`
        : undefined,
    });
  }));

  server.registerTool("scheduleExperiment", {
    description:
      "Step 4 of 5. Kick off the experiment — Google forks the in-design (trial) campaign into a real serving campaign. Returns immediately with an operation name; forking happens asynchronously over a few seconds to a few minutes. ALWAYS follow up with `listExperimentAsyncErrors` to verify forking succeeded — async errors don't surface from this call. Status precondition: experiment must be SETUP. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      experimentResourceName: z
        .string()
        .regex(/^customers\/[^/]+\/experiments\/[^/]+$/)
        .describe("Resource name of the experiment to schedule."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, experimentResourceName }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () =>
      scheduleExperiment(targetAuth, experimentResourceName),
    );
    return typedResult({
      ...result,
      nextSteps: result.success
        ? "Wait 30–60 seconds, then call listExperimentAsyncErrors with this experimentResourceName to confirm forking succeeded. After that, query experiment_arm + the trial campaign metrics via runScript to monitor performance."
        : undefined,
    });
  }));

  server.registerTool("listExperimentAsyncErrors", {
    description:
      "Read errors logged during the most recent scheduleExperiment or promoteExperiment long-running operation. An empty list means the LRO succeeded. A non-empty list means forking or promotion failed — usually a campaign-config issue (invalid budget, conflicting bidding strategy, missing conversion action). Call this after every scheduleExperiment / promoteExperiment.",
    inputSchema: {
      accountId: accountIdParam,
      experimentResourceName: z
        .string()
        .regex(/^customers\/[^/]+\/experiments\/[^/]+$/),
      pageSize: z.number().int().min(1).max(1000).default(100),
      pageToken: z.string().optional(),
    },
    annotations: READ_ANNOTATIONS,
  }, safeHandler(async ({ accountId, experimentResourceName, pageSize, pageToken }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execRead(auth, targetId, "list_experiment_async_errors", () =>
      listExperimentAsyncErrors(targetAuth, experimentResourceName, pageSize, pageToken),
    );
    return typedResult(result);
  }));

  server.registerTool("endExperiment", {
    description:
      "Stop a running experiment immediately, without waiting for the scheduled end date. The trial campaign keeps its current state but stops splitting traffic. Use when the test has produced enough data and you DON'T want to apply the changes back to the base campaign. Status precondition: experiment must be ENABLED, INITIATED, or HALTED. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      experimentResourceName: z
        .string()
        .regex(/^customers\/[^/]+\/experiments\/[^/]+$/),
    },
    annotations: DESTRUCTIVE_WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, experimentResourceName }) =>
    writeToolCall({ accountId }, (a) => endExperiment(a, experimentResourceName)),
  ));

  server.registerTool("promoteExperiment", {
    description:
      "Apply the treatment arm's changes back onto the base campaign and stop the trial. Long-running — like scheduleExperiment, returns immediately and you must follow up with `listExperimentAsyncErrors`. Use when the treatment is a clear winner and you want the base campaign to inherit the changes. Status precondition: experiment must be ENABLED. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      experimentResourceName: z
        .string()
        .regex(/^customers\/[^/]+\/experiments\/[^/]+$/),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, experimentResourceName }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, null, () =>
      promoteExperiment(targetAuth, experimentResourceName),
    );
    return typedResult({
      ...result,
      nextSteps: result.success
        ? "Wait 30–60 seconds, then call listExperimentAsyncErrors to confirm promotion succeeded. The base campaign now reflects the treatment changes."
        : undefined,
    });
  }));

  server.registerTool("createAdVariationExperiment", {
    description:
      "RSA-asset A/B test shortcut. Bundles createExperiment + addExperimentArms + asset patch on the trial RSA into ONE call. Use to A/B-test an RSA's headlines, descriptions, or final URL against the live version. Internally a SEARCH_CUSTOM experiment whose treatment-arm clone has its RSA patched — Google's verified API path for RSA A/B testing. The base RSA is cloned into a trial campaign; this tool patches the clone and leaves the experiment in SETUP — you call scheduleExperiment to begin serving. Required: at least one of `headlines`, `descriptions`, `finalUrl`. RSA assets are atomic — when patching copy, supply BOTH headlines AND descriptions (Google replaces the full asset set). Returns experimentResourceName, trialCampaignId, trialAdGroupId, trialAdId, and `readyToSchedule`. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      name: z.string().min(1).max(1024).describe("Experiment name, unique under the customer."),
      baseCampaignId: z.string().describe("Existing campaign ID containing the RSA you want to vary."),
      baseAdGroupId: z.string().describe("Ad group ID containing the base RSA."),
      baseAdId: z.string().describe("RSA ID to clone and vary. Must be a Responsive Search Ad."),
      headlines: z
        .array(
          z.object({
            text: z.string().min(1).max(30),
            pin: z.number().int().min(1).max(3).optional().describe("Pin to position 1, 2, or 3."),
          }),
        )
        .min(3)
        .max(15)
        .optional()
        .describe("Replacement headlines for the trial RSA (3–15, ≤30 chars). Omit to keep the original headlines."),
      descriptions: z
        .array(
          z.object({
            text: z.string().min(1).max(90),
            pin: z.number().int().min(1).max(2).optional().describe("Pin to position 1 or 2."),
          }),
        )
        .min(2)
        .max(4)
        .optional()
        .describe("Replacement descriptions for the trial RSA (2–4, ≤90 chars). Omit to keep originals. If you pass headlines you MUST also pass descriptions (RSA assets are atomic)."),
      finalUrl: z.string().url().optional().describe("Replacement landing page URL for the trial RSA."),
      treatmentTrafficSplit: z
        .number()
        .int()
        .min(1)
        .max(99)
        .default(50)
        .describe("Percent of traffic routed to the variation (1–99). Default 50 (50/50)."),
      suffix: z.string().max(64).optional().describe("Trial campaign name suffix. Defaults to '[ad-var]'."),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      description: z.string().max(2048).optional(),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, name, baseCampaignId, baseAdGroupId, baseAdId, headlines, descriptions, finalUrl, treatmentTrafficSplit, suffix, startDate, endDate, description }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);
    const result = await execWrite(auth, targetId, baseCampaignId, () =>
      createAdVariationExperiment(targetAuth, {
        name, baseCampaignId, baseAdGroupId, baseAdId,
        headlines, descriptions, finalUrl,
        treatmentTrafficSplit, suffix, startDate, endDate, description,
      }),
    );
    return typedResult({
      ...result,
      nextSteps: result.readyToSchedule
        ? "Patch landed on the trial RSA. Call scheduleExperiment with this experimentResourceName to begin serving. Then wait 30–60s and call listExperimentAsyncErrors to confirm forking succeeded."
        : result.experimentResourceName
          ? "Partial success. Re-apply the asset patch with updateAdAssets / updateAdFinalUrl on the trial ad (use trialAdGroupId + trialAdId), or call endExperiment to discard."
          : undefined,
    });
  }));

  server.registerTool("graduateExperiment", {
    description:
      "Permanently fork the trial campaign into a standalone campaign that runs alongside the base. The agent only needs to supply the new budget — the trial campaign resource is resolved automatically. Use when both control and treatment are valuable and you want to keep them both running independently. Status precondition: experiment must be ENABLED. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      experimentResourceName: z
        .string()
        .regex(/^customers\/[^/]+\/experiments\/[^/]+$/),
      campaignBudgetResourceName: z
        .string()
        .regex(/^customers\/[^/]+\/campaignBudgets\/[^/]+$/)
        .describe("Full resource name of the budget the standalone graduated campaign should use, e.g. 'customers/123/campaignBudgets/789'."),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, experimentResourceName, campaignBudgetResourceName }) =>
    writeToolCall({ accountId }, (a) =>
      graduateExperiment(a, experimentResourceName, campaignBudgetResourceName),
    ),
  ));
}
