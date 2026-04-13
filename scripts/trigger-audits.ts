/**
 * Trigger audits for accounts that don't have audit snapshots yet.
 * Reads credentials from mcp_sessions and runs the full audit pipeline.
 *
 * Usage:
 *   npx tsx scripts/trigger-audits.ts                    # all missing
 *   npx tsx scripts/trigger-audits.ts 3928497502 8833866068  # specific accounts
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, desc, notInArray, sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import {
  listCampaigns,
  getAccountSettings,
  getConversionActions,
  getKeywords,
  getSearchTermReport,
  getImpressionShare,
  listAds,
  getNegativeKeywords,
  listAdGroups,
  parseCustomerIds,
  type AuthContext,
} from "../lib/google-ads";
import { computeAuditScore, type AuditInput } from "../lib/audit/scoring";
import { analyzeAdLandingPages } from "../lib/audit/landing-page";
import { saveAuditSnapshot } from "../lib/audit/persist";

function loadEnvLocal() {
  try {
    const envPath = resolve(process.cwd(), ".env.local");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}
loadEnvLocal();

async function auditAccount(auth: AuthContext, accountId: string, userId: string | null): Promise<void> {
  const [campaigns, accountSettingsResult, conversionActionsResult] =
    await Promise.all([
      listCampaigns(auth, { limit: 50, days: 30 }),
      getAccountSettings(auth),
      getConversionActions(auth),
    ]);

  const enabledCampaigns = campaigns.filter(
    (c) => c.status === "ENABLED" || c.status === 2,
  );
  const totalSpend = campaigns.reduce((s, c) => s + c.cost, 0);

  const baseSettings = {
    autoTaggingEnabled: accountSettingsResult.autoTaggingEnabled,
    conversionTrackingId: accountSettingsResult.conversionTrackingId,
    trackingUrlTemplate: accountSettingsResult.trackingUrlTemplate,
  };

  const campaignsMapped = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    cost: c.cost,
    conversions: c.conversions,
    clicks: c.clicks,
    impressions: c.impressions,
    biddingStrategy: (c as any).biddingStrategy ?? undefined,
  }));

  if (enabledCampaigns.length === 0 && totalSpend === 0) {
    const emptyInput: AuditInput = {
      accountSettings: baseSettings,
      conversionActions: conversionActionsResult,
      campaigns: campaignsMapped,
      keywords: [],
      searchTerms: [],
      ads: [],
      landingPages: [],
      impressionShare: [],
      negativeKeywords: [],
      adGroupCount: 0,
    };
    const auditResult = computeAuditScore(emptyInput);
    await saveAuditSnapshot(accountId, userId, auditResult, emptyInput);
    console.log(`  Score: ${auditResult.overallScore} (${auditResult.category}) — empty account`);
    return;
  }

  const topCampaigns = [...enabledCampaigns]
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5);
  const campaignIds = topCampaigns.map((c) => c.id);

  const [keywordResults, searchTermResults, impressionShareResults, adResults, negativeResults, adGroupResults] =
    await Promise.all([
      Promise.all(campaignIds.map(async (id) => { try { const r = await getKeywords(auth, id, 30, 100); return r.keywords; } catch { return []; } })),
      Promise.all(campaignIds.map(async (id) => { try { const r = await getSearchTermReport(auth, id, 30, 100); return r.searchTerms; } catch { return []; } })),
      Promise.all(campaignIds.map(async (id, idx) => { try { const r = await getImpressionShare(auth, id, 30); return { campaignName: topCampaigns[idx].name, impressionShare: r.impressionShare, budgetLostIS: r.budgetLostImpressionShare, rankLostIS: r.rankLostImpressionShare, totalImpressions: r.totalImpressions, totalCost: r.totalCost ?? 0 }; } catch { return { campaignName: topCampaigns[idx].name, impressionShare: null as number | null, budgetLostIS: null as number | null, rankLostIS: null as number | null, totalImpressions: 0, totalCost: 0 }; } })),
      Promise.all(campaignIds.map(async (id) => { try { const r = await listAds(auth, id, undefined, 30, 50); return r.ads; } catch { return []; } })),
      Promise.all(campaignIds.map(async (id) => { try { return await getNegativeKeywords(auth, id, 500); } catch { return []; } })),
      Promise.all(campaignIds.map(async (id) => { try { return await listAdGroups(auth, id, 100); } catch { return []; } })),
    ]);

  const allKeywords = keywordResults.flat().map((k: any) => ({
    criterionId: String(k.criterionId ?? ""), adGroupId: String(k.adGroupId ?? ""),
    text: k.text ?? "", qualityScore: k.qualityScore ?? null,
    creativeQuality: k.creativeQuality ?? null, postClickQuality: k.postClickQuality ?? null,
    searchPredictedCtr: k.searchPredictedCtr ?? null,
    impressions: k.impressions ?? 0, clicks: k.clicks ?? 0, cost: k.cost ?? 0,
    conversions: k.conversions ?? 0, status: k.status ?? "UNKNOWN",
    matchType: k.matchType ?? "UNKNOWN", campaignName: "", campaignId: "",
    adGroupName: k.adGroupName ?? "", averageCpc: k.averageCpc ?? 0, ctr: k.ctr ?? 0,
  }));
  for (let i = 0; i < campaignIds.length; i++) {
    for (const kw of keywordResults[i] as any[]) {
      const match = allKeywords.find((ak) => ak.criterionId === String(kw.criterionId ?? ""));
      if (match) { match.campaignId = campaignIds[i]; match.campaignName = topCampaigns[i].name; }
    }
  }

  const allSearchTerms = searchTermResults.flat().map((t: any) => {
    let campaignId = "", campaignName = "";
    for (let i = 0; i < campaignIds.length; i++) {
      if ((searchTermResults[i] as any[]).includes(t)) { campaignId = campaignIds[i]; campaignName = topCampaigns[i].name; break; }
    }
    return { searchTerm: t.searchTerm ?? "", impressions: t.impressions ?? 0, clicks: t.clicks ?? 0, cost: t.cost ?? 0, conversions: t.conversions ?? 0, campaignName, campaignId, adGroupName: t.adGroupName ?? "" };
  });

  const allAds = adResults.flat().map((a: any) => ({
    adId: String(a.adId ?? ""), type: a.type ?? "UNKNOWN", headlines: a.headlines ?? [],
    descriptions: a.descriptions ?? [], finalUrls: a.finalUrls ?? [],
    impressions: a.impressions ?? 0, clicks: a.clicks ?? 0, cost: a.cost ?? 0,
    conversions: a.conversions ?? 0, adGroupId: String(a.adGroupId ?? ""),
    adGroupName: a.adGroupName ?? "", status: a.status ?? "UNKNOWN", adStrength: a.adStrength ?? null,
  }));

  const allNegatives = negativeResults.flat().map((n: any) => ({ text: n.text ?? "", campaignId: "" }));
  const totalAdGroups = adGroupResults.flat().length;
  const landingPages = await analyzeAdLandingPages(allAds, 10);

  const auditInput: AuditInput = {
    accountSettings: baseSettings,
    conversionActions: conversionActionsResult,
    campaigns: campaignsMapped,
    keywords: allKeywords,
    searchTerms: allSearchTerms,
    ads: allAds,
    landingPages,
    impressionShare: impressionShareResults,
    negativeKeywords: allNegatives,
    adGroupCount: totalAdGroups,
  };

  const auditResult = computeAuditScore(auditInput);
  await saveAuditSnapshot(accountId, userId, auditResult, auditInput);
  console.log(`  Score: ${auditResult.overallScore} (${auditResult.category}) | CPA: $${auditResult.cpa?.toFixed(2) ?? "N/A"} | Demand: ${auditResult.demandCaptured?.toFixed(1) ?? "N/A"}%`);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error("Missing DATABASE_URL"); process.exit(1); }

  const client = postgres(dbUrl, { prepare: false });
  const database = drizzle(client, { schema });

  const specificIds = process.argv.slice(2);

  // Find accounts that need audits
  let accountIds: string[];
  if (specificIds.length > 0) {
    accountIds = specificIds;
  } else {
    // All accounts in mcp_sessions that don't have audit snapshots
    const existingAudits = await database
      .selectDistinct({ accountId: schema.auditSnapshots.accountId })
      .from(schema.auditSnapshots);
    const auditedIds = new Set(existingAudits.map((r) => r.accountId));

    const sessions = await database
      .select({
        customerId: schema.mcpSessions.customerId,
        refreshToken: schema.mcpSessions.refreshToken,
      })
      .from(schema.mcpSessions)
      .where(sql`${schema.mcpSessions.customerId} != '' AND ${schema.mcpSessions.refreshToken} IS NOT NULL`)
      .groupBy(schema.mcpSessions.customerId, schema.mcpSessions.refreshToken);

    accountIds = [...new Set(sessions.map((s) => s.customerId))].filter((id) => !auditedIds.has(id));
  }

  console.log(`Auditing ${accountIds.length} accounts...\n`);

  for (const accountId of accountIds) {
    // Get most recent session for this account
    const [sessionRow] = await database
      .select({
        refreshToken: schema.mcpSessions.refreshToken,
        customerId: schema.mcpSessions.customerId,
        customerIds: schema.mcpSessions.customerIds,
        loginCustomerId: schema.mcpSessions.loginCustomerId,
        userId: schema.mcpSessions.userId,
        googleEmail: schema.mcpSessions.googleEmail,
      })
      .from(schema.mcpSessions)
      .where(eq(schema.mcpSessions.customerId, accountId))
      .orderBy(desc(schema.mcpSessions.createdAt))
      .limit(1);

    if (!sessionRow?.refreshToken) {
      console.log(`[${accountId}] Skipped — no refresh token`);
      continue;
    }

    const auth: AuthContext = {
      refreshToken: sessionRow.refreshToken,
      customerId: sessionRow.customerId,
      customerIds: parseCustomerIds(sessionRow.customerIds),
      loginCustomerId: sessionRow.loginCustomerId ?? undefined,
    };

    console.log(`[${accountId}] ${sessionRow.googleEmail ?? "unknown"}...`);
    try {
      await auditAccount(auth, accountId, sessionRow.userId ?? null);
    } catch (err) {
      console.log(`  ERROR: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
    }
  }

  console.log("\nDone!");
  await client.end();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
