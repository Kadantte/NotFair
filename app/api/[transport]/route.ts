import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  getAccountInfo,
  listCampaigns,
  getCampaignPerformance,
  getKeywords,
  getSearchTermReport,
  pauseKeyword,
  enableKeyword,
  updateBid,
  addNegativeKeyword,
  updateCampaignBudget,
  pauseCampaign,
  enableCampaign,
  toMicros,
  type AuthContext,
} from "@/lib/google-ads";

// Phase 1: env-based auth for founder's account.
// Phase 2: MCP OAuth 2.1 for multi-user.
const auth: AuthContext = {
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN ?? "",
  customerId: process.env.GOOGLE_ADS_CUSTOMER_ID ?? "",
};

// ─── MCP Handler ─────────────────────────────────────────────────────

const handler = createMcpHandler(
  (server) => {
    // ─── READ TOOLS ────────────────────────────────────────────

    server.registerTool(
      "getAccountInfo",
      {
        title: "Get Account Info",
        description:
          "Get the connected Google Ads customer account details (name, currency, timezone, test status).",
        inputSchema: {},
      },
      async () => {
        const result = await getAccountInfo(auth);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );

    server.registerTool(
      "listCampaigns",
      {
        title: "List Campaigns",
        description:
          "List campaigns with metrics (impressions, clicks, cost, conversions). Use to get an overview of campaign performance.",
        inputSchema: {
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .default(20)
            .describe("Max campaigns to return"),
          includeRemoved: z
            .boolean()
            .default(false)
            .describe("Include removed campaigns"),
        },
      },
      async ({ limit, includeRemoved }) => {
        const result = await listCampaigns(auth, {
          limit,
          includeRemoved,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );

    server.registerTool(
      "getCampaignPerformance",
      {
        title: "Get Campaign Performance",
        description:
          "Get daily performance metrics and totals for a campaign over a date range. Includes impressions, clicks, cost, conversions, CPA, ROAS.",
        inputSchema: {
          campaignId: z.string().describe("Google Ads campaign ID"),
          days: z
            .number()
            .int()
            .min(1)
            .max(365)
            .default(30)
            .describe("Number of days to look back"),
        },
      },
      async ({ campaignId, days }) => {
        const result = await getCampaignPerformance(
          auth,
          campaignId,
          days,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );

    server.registerTool(
      "getKeywords",
      {
        title: "Get Keywords",
        description:
          "Get top keywords for a campaign with metrics (impressions, clicks, CTR, CPC, quality score, conversions).",
        inputSchema: {
          campaignId: z.string().describe("Google Ads campaign ID"),
          days: z.number().int().min(1).max(365).default(30),
          limit: z.number().int().min(1).max(100).default(50),
        },
      },
      async ({ campaignId, days, limit }) => {
        const result = await getKeywords(auth, campaignId, days, limit);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );

    server.registerTool(
      "getSearchTermReport",
      {
        title: "Get Search Terms",
        description:
          "Get actual search queries that triggered your ads. Use to find irrelevant terms to add as negatives.",
        inputSchema: {
          campaignId: z.string().describe("Google Ads campaign ID"),
          days: z.number().int().min(1).max(365).default(30),
          limit: z.number().int().min(1).max(100).default(50),
        },
      },
      async ({ campaignId, days, limit }) => {
        const result = await getSearchTermReport(
          auth,
          campaignId,
          days,
          limit,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );

    // ─── WRITE TOOLS ───────────────────────────────────────────

    server.registerTool(
      "pauseKeyword",
      {
        title: "Pause Keyword",
        description:
          "Pause an active keyword to stop it from triggering ads. Use when a keyword is wasting spend with no conversions.",
        inputSchema: {
          campaignId: z.string().describe("Campaign ID"),
          adGroupId: z
            .string()
            .describe("Ad group ID containing the keyword"),
          criterionId: z.string().describe("Keyword criterion ID to pause"),
        },
      },
      async ({ campaignId, adGroupId, criterionId }) => {
        const result = await pauseKeyword(
          auth,
          campaignId,
          adGroupId,
          criterionId,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );

    server.registerTool(
      "enableKeyword",
      {
        title: "Enable Keyword",
        description:
          "Re-enable a paused keyword. Use to undo a previous pause.",
        inputSchema: {
          adGroupId: z.string().describe("Ad group ID"),
          criterionId: z.string().describe("Keyword criterion ID to enable"),
        },
      },
      async ({ adGroupId, criterionId }) => {
        const result = await enableKeyword(auth, adGroupId, criterionId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );

    server.registerTool(
      "updateBid",
      {
        title: "Update Keyword Bid",
        description:
          "Change the CPC bid for a keyword. Only works with MANUAL_CPC or ENHANCED_CPC bidding strategies. Bid change limited to 25% by default.",
        inputSchema: {
          campaignId: z.string().describe("Campaign ID"),
          adGroupId: z.string().describe("Ad group ID"),
          criterionId: z.string().describe("Keyword criterion ID"),
          newBidDollars: z
            .number()
            .positive()
            .describe("New bid amount in dollars (e.g. 1.50)"),
        },
      },
      async ({ campaignId, adGroupId, criterionId, newBidDollars }) => {
        const newBidMicros = toMicros(newBidDollars);
        const result = await updateBid(
          auth,
          campaignId,
          adGroupId,
          criterionId,
          newBidMicros,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );

    server.registerTool(
      "addNegativeKeyword",
      {
        title: "Add Negative Keyword",
        description:
          "Add a negative keyword to a campaign to block irrelevant search terms from triggering your ads.",
        inputSchema: {
          campaignId: z.string().describe("Campaign ID"),
          keywordText: z
            .string()
            .min(1)
            .describe("Keyword text to add as negative (phrase match)"),
        },
      },
      async ({ campaignId, keywordText }) => {
        const result = await addNegativeKeyword(
          auth,
          campaignId,
          keywordText,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );

    server.registerTool(
      "updateCampaignBudget",
      {
        title: "Update Campaign Budget",
        description:
          "Change the daily budget for a campaign. Budget change limited to 50% by default. Minimum $1/day.",
        inputSchema: {
          campaignId: z.string().describe("Campaign ID"),
          newDailyBudgetDollars: z
            .number()
            .positive()
            .describe("New daily budget in dollars (e.g. 25.00)"),
        },
      },
      async ({ campaignId, newDailyBudgetDollars }) => {
        const newBudgetMicros = toMicros(newDailyBudgetDollars);
        const result = await updateCampaignBudget(
          auth,
          campaignId,
          newBudgetMicros,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );

    server.registerTool(
      "pauseCampaign",
      {
        title: "Pause Campaign",
        description: "Pause an active campaign to stop all ads from running.",
        inputSchema: {
          campaignId: z.string().describe("Campaign ID to pause"),
        },
      },
      async ({ campaignId }) => {
        const result = await pauseCampaign(auth, campaignId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );

    server.registerTool(
      "enableCampaign",
      {
        title: "Enable Campaign",
        description: "Re-enable a paused campaign.",
        inputSchema: {
          campaignId: z.string().describe("Campaign ID to enable"),
        },
      },
      async ({ campaignId }) => {
        const result = await enableCampaign(auth, campaignId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );
  },
  {},
  {
    basePath: "/api",
    maxDuration: 60,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
