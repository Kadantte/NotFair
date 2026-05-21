import { z } from "zod";
import {
  createConversionAction,
  updateConversionAction,
  removeConversionAction,
  uploadClickConversions,
} from "@/lib/google-ads";
import { execWrite } from "@/lib/tools/execute";
import { enforceRateLimit } from "@/lib/mcp/rate-limit";
import { typedResult, safeHandler, accountIdParam, WRITE_ANNOTATIONS } from "../types";
import { resolveToolAuth } from "../helpers";
import type { WriteToolDeps } from "./_deps";

export function registerConversionWriteTools(deps: WriteToolDeps) {
  const { server, currentAuth, writeToolCall } = deps;

  // ─── Conversion Action Management ────────────────────────────────

  server.registerTool("createConversionAction", {
    description: "Create a conversion action for tracking offline conversions (imports), web events, or calls. Optionally enable Enhanced Conversions for Leads (ECFL) for user-data matching. Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      name: z.string().min(1).describe("Conversion action name, e.g. 'First Booking'"),
      category: z.enum([
        "PURCHASE", "LEAD", "IMPORTED_LEAD", "QUALIFIED_LEAD", "CONVERTED_LEAD",
        "SIGNUP", "BOOK_APPOINTMENT", "SUBMIT_LEAD_FORM", "REQUEST_QUOTE",
        "SUBSCRIBE_PAID", "ADD_TO_CART", "BEGIN_CHECKOUT", "PAGE_VIEW",
        "DOWNLOAD", "PHONE_CALL_LEAD", "GET_DIRECTIONS", "OUTBOUND_CLICK",
        "CONTACT", "ENGAGEMENT", "STORE_VISIT", "STORE_SALE", "DEFAULT",
      ]).default("PURCHASE"),
      type: z.enum(["UPLOAD_CLICKS", "WEBPAGE", "UPLOAD_CALLS"]).default("UPLOAD_CLICKS")
        .describe("UPLOAD_CLICKS for offline/import conversions, WEBPAGE for website events, UPLOAD_CALLS for call tracking"),
      countingType: z.enum(["ONE_PER_CLICK", "MANY_PER_CLICK"]).default("ONE_PER_CLICK")
        .describe("ONE_PER_CLICK counts one conversion per click (leads), MANY_PER_CLICK counts every conversion (purchases)"),
      defaultValue: z.number().optional().describe("Default conversion value in account currency"),
      alwaysUseDefaultValue: z.boolean().default(true).describe("Always use default value vs. transaction-specific values"),
      status: z.enum(["ENABLED"]).default("ENABLED"),
      primaryForGoal: z.boolean().default(true)
        .describe("true = primary (included in Conversions column for bidding), false = secondary (observation only)"),
      enhancedConversionsForLeads: z.boolean().default(false)
        .describe("Enable Enhanced Conversions for Leads at account level. Requires customer data terms to be accepted in Google Ads UI first."),
      viewThroughLookbackWindowDays: z.number().int().min(1).max(30).optional()
        .describe("View-through conversion lookback window (1-30 days)"),
      clickThroughLookbackWindowDays: z.number().int().min(1).max(90).optional()
        .describe("Click-through conversion lookback window (1-90 days)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, name, category, type, countingType, defaultValue, alwaysUseDefaultValue, status, primaryForGoal, enhancedConversionsForLeads, viewThroughLookbackWindowDays, clickThroughLookbackWindowDays }) =>
    writeToolCall({ accountId }, (a) =>
      createConversionAction(a, {
        name, category, type, countingType, defaultValue, alwaysUseDefaultValue,
        status, primaryForGoal, enhancedConversionsForLeads, viewThroughLookbackWindowDays, clickThroughLookbackWindowDays,
      }),
    ),
  ));

  server.registerTool("updateConversionAction", {
    description: "Update an existing conversion action's settings — promote secondary to primary, change value, rename, fix currency. Conversion actions imported from GA4/UA/Floodlight/Firebase/Salesforce/Search Ads 360, Smart Campaign auto-actions, Store Visits, app-store actions, local_services_* / Local Services Ads actions, and manager-inherited actions are read-only via the API — the update call will be rejected locally before reaching Google. To check before calling: read `conversion_action.type` and `conversion_action.owner_customer` via `runScript` (e.g. `await ads.gaql(ads.queries.conversionActions)`) or write a direct `FROM conversion_action` query. LSA conversion names may appear in segments.conversion_action_name without appearing as mutable FROM conversion_action rows. To delete a conversion action, use removeConversionAction (status=REMOVED is not accepted by Google for updates). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      conversionActionId: z.string().describe("Conversion action ID (query conversion_action via runScript)"),
      name: z.string().min(1).optional(),
      category: z.enum([
        "PURCHASE", "LEAD", "IMPORTED_LEAD", "QUALIFIED_LEAD", "CONVERTED_LEAD",
        "SIGNUP", "BOOK_APPOINTMENT", "SUBMIT_LEAD_FORM", "REQUEST_QUOTE",
        "SUBSCRIBE_PAID", "ADD_TO_CART", "BEGIN_CHECKOUT", "PAGE_VIEW",
        "DOWNLOAD", "PHONE_CALL_LEAD", "GET_DIRECTIONS", "OUTBOUND_CLICK",
        "CONTACT", "ENGAGEMENT", "STORE_VISIT", "STORE_SALE", "DEFAULT",
      ]).optional(),
      countingType: z.enum(["ONE_PER_CLICK", "MANY_PER_CLICK"]).optional(),
      defaultValue: z.number().optional().describe("Default conversion value in account currency"),
      alwaysUseDefaultValue: z.boolean().optional(),
      currencyCode: z
        .string()
        .length(3)
        .regex(/^[A-Za-z]{3}$/, "Must be a 3-letter ISO 4217 code (e.g. 'USD', 'EUR')")
        .optional()
        .describe("ISO 4217 currency code (e.g. 'USD', 'EUR') for this action's conversion values. Use this to migrate legacy 'XXX' (unset) actions to a real currency so reporting can roll up. 'XXX' is rejected on writes."),
      status: z.enum(["ENABLED"]).optional()
        .describe("ENABLED = active. To delete, use removeConversionAction instead — Google rejects status=REMOVED on update."),
      primaryForGoal: z.boolean().optional()
        .describe("true = primary (included in Conversions column for bidding), false = secondary (observation only)"),
      enhancedConversionsForLeads: z.boolean().optional()
        .describe("Enable Enhanced Conversions for Leads at account level"),
      viewThroughLookbackWindowDays: z.number().int().min(1).max(30).optional(),
      clickThroughLookbackWindowDays: z.number().int().min(1).max(90).optional(),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, conversionActionId, name, category, countingType, defaultValue, alwaysUseDefaultValue, currencyCode, status, primaryForGoal, enhancedConversionsForLeads, viewThroughLookbackWindowDays, clickThroughLookbackWindowDays }) =>
    writeToolCall({ accountId }, (a) =>
      updateConversionAction(a, {
        conversionActionId, name, category, countingType, defaultValue, alwaysUseDefaultValue, currencyCode,
        status, primaryForGoal, enhancedConversionsForLeads, viewThroughLookbackWindowDays, clickThroughLookbackWindowDays,
      }),
    ),
  ));

  server.registerTool("removeConversionAction", {
    description: "Permanently delete a conversion action. Not undoable. Use this instead of updateConversionAction with status=REMOVED — Google rejects that with request_error=18. Conversion actions imported from GA4/UA/Floodlight/Firebase/Salesforce/Search Ads 360, Smart Campaign auto-actions, Store Visits, app-store actions, local_services_* / Local Services Ads actions, and manager-inherited actions are read-only via the API — the remove call will be rejected locally before reaching Google. To check before calling: read `conversion_action.type` and `conversion_action.owner_customer` via `runScript` (e.g. `await ads.gaql(ads.queries.conversionActions)`) or write a direct `FROM conversion_action` query. Modify read-only actions in the Google Ads UI or in the source system (GA4, Firebase, Salesforce, Floodlight). Returns changeId.",
    inputSchema: {
      accountId: accountIdParam,
      conversionActionId: z.string().describe("Conversion action ID to permanently delete"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, conversionActionId }) =>
    writeToolCall({ accountId }, (a) => removeConversionAction(a, conversionActionId)),
  ));

  server.registerTool("uploadClickConversions", {
    description: "Upload offline click conversions to Google Ads for attribution. Supports Enhanced Conversions for Leads via hashed email/phone matching. Each conversion needs a gclid OR hashed user identifiers. Max 2000 conversions per call. Partial failures are reported per-row.",
    inputSchema: {
      accountId: accountIdParam,
      conversionActionId: z.string().describe("Conversion action ID to attribute conversions to"),
      conversions: z.array(z.object({
        gclid: z.string().optional().describe("Google Click ID — required unless using hashed user identifiers"),
        conversionDateTime: z.string().describe("Conversion time in ISO 8601 with timezone, e.g. '2024-01-15T14:30:00-05:00'"),
        conversionValue: z.number().optional().describe("Value in account currency"),
        currencyCode: z.string().length(3).optional().describe("ISO 4217 currency code, e.g. 'USD'"),
        orderId: z.string().optional().describe("External order/transaction ID for deduplication"),
        hashedEmail: z.string().optional().describe("SHA-256 hash of lowercase trimmed email (for Enhanced Conversions for Leads)"),
        hashedPhoneNumber: z.string().optional().describe("SHA-256 hash of E.164 phone number (for Enhanced Conversions for Leads)"),
      })).min(1).max(2000).describe("Conversions to upload (max 2000 per request)"),
    },
    annotations: WRITE_ANNOTATIONS,
  }, safeHandler(async ({ accountId, conversionActionId, conversions }) => {
    const { auth, targetId, targetAuth } = resolveToolAuth(currentAuth, accountId);

    const t0 = performance.now();
    const result = await uploadClickConversions(targetAuth, conversionActionId, conversions);
    const overrideLatencyMs = Math.round(performance.now() - t0);

    // Log as a write operation for tracking (execWrite handles rate limiting)
    if (result.successCount > 0) {
      const writeResult = {
        success: true,
        action: "upload_click_conversions",
        entityId: conversionActionId,
        beforeValue: "",
        afterValue: `${result.successCount} conversions`,
      };
      await execWrite(auth, targetId, null, async () => writeResult, undefined, { overrideLatencyMs });
    } else {
      // Still rate-limit even when no successes (prevents abuse via invalid uploads)
      await enforceRateLimit(auth.userId);
    }

    return typedResult(result);
  }));
}
