/**
 * Empirical mutability test for ConversionAction types our preflight blocks.
 * Uses Google Ads API `validate_only: true` so ZERO state changes happen.
 *
 * Usage: bun run scripts/test-conversion-action-mutability.ts
 */
import { GoogleAdsApi } from "google-ads-api";
import postgres from "postgres";
import { loadEnvLocal } from "./_load-env";

loadEnvLocal();

const TEST_USER_EMAIL = "tongchen92@gmail.com";
const PAWSVIP_ACCOUNT = "7521406707";
const ADSAGENT_ACCOUNT = "3251706605";

type Test = {
  label: string;
  customerId: string;
  conversionActionId: string;
  typeName: string;
  field: string;
  resource: Record<string, unknown>;
  expectedByPreflight: "BLOCKED" | "ALLOWED";
};

const TESTS: Test[] = [
  // ── PawsVIP: types our preflight currently BLOCKS ─────────────────
  {
    label: "type 28 GOOGLE_HOSTED: flip primary_for_goal",
    customerId: PAWSVIP_ACCOUNT,
    conversionActionId: "7123238104",
    typeName: "GOOGLE_HOSTED",
    field: "primary_for_goal",
    resource: { primary_for_goal: false },
    expectedByPreflight: "BLOCKED",
  },
  {
    label: "type 36 STORE_VISITS: flip primary_for_goal",
    customerId: PAWSVIP_ACCOUNT,
    conversionActionId: "7101836615",
    typeName: "STORE_VISITS",
    field: "primary_for_goal",
    resource: { primary_for_goal: false },
    expectedByPreflight: "BLOCKED",
  },
  {
    label: "type 25 ANDROID_INSTALLS: flip primary_for_goal",
    customerId: PAWSVIP_ACCOUNT,
    conversionActionId: "7242148448",
    typeName: "ANDROID_INSTALLS_ALL_OTHER_APPS",
    field: "primary_for_goal",
    resource: { primary_for_goal: true },
    expectedByPreflight: "BLOCKED",
  },
  // ── PawsVIP: types our preflight ALLOWS (need to verify mutability) ──
  {
    label: "type 8 WEBPAGE: flip primary_for_goal (user-created)",
    customerId: PAWSVIP_ACCOUNT,
    conversionActionId: "7042715895", // "New Customer Submit Lead Form"
    typeName: "WEBPAGE",
    field: "primary_for_goal",
    resource: { primary_for_goal: false },
    expectedByPreflight: "ALLOWED",
  },
  {
    label: "type 8 WEBPAGE: change name",
    customerId: PAWSVIP_ACCOUNT,
    conversionActionId: "7042715895",
    typeName: "WEBPAGE",
    field: "name",
    resource: { name: "New Customer Submit Lead Form (TEST)" },
    expectedByPreflight: "ALLOWED",
  },
  {
    label: "type 2 AD_CALL: flip primary_for_goal",
    customerId: PAWSVIP_ACCOUNT,
    conversionActionId: "7042708468", // "Calls from ads"
    typeName: "AD_CALL",
    field: "primary_for_goal",
    resource: { primary_for_goal: false },
    expectedByPreflight: "ALLOWED",
  },
  {
    label: "type 7 UPLOAD_CALLS: flip primary_for_goal",
    customerId: PAWSVIP_ACCOUNT,
    conversionActionId: "7570562574", // "First Booking Import"
    typeName: "UPLOAD_CALLS",
    field: "primary_for_goal",
    resource: { primary_for_goal: false },
    expectedByPreflight: "ALLOWED",
  },
  {
    label: "type 7 UPLOAD_CALLS: change name",
    customerId: PAWSVIP_ACCOUNT,
    conversionActionId: "7570562574",
    typeName: "UPLOAD_CALLS",
    field: "name",
    resource: { name: "First Booking Import (TEST)" },
    expectedByPreflight: "ALLOWED",
  },
  {
    label: "type 29 WEBPAGE_ONCLICK: flip primary_for_goal (lead form)",
    customerId: PAWSVIP_ACCOUNT,
    conversionActionId: "7242639548", // "Lead form - Submit"
    typeName: "WEBPAGE_ONCLICK",
    field: "primary_for_goal",
    resource: { primary_for_goal: false },
    expectedByPreflight: "ALLOWED",
  },
];

async function main() {
  // Pull refresh token + login_customer_id for the test user.
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const rows = await sql<
    Array<{ refresh_token: string; login_customer_id: string | null; google_email: string }>
  >`
    SELECT refresh_token, login_customer_id, google_email
    FROM mcp_sessions
    WHERE lower(google_email) = ${TEST_USER_EMAIL}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  await sql.end();
  if (rows.length === 0) {
    console.error(`No mcp_sessions for ${TEST_USER_EMAIL}. Connect via MCP first.`);
    process.exit(1);
  }
  const { refresh_token, login_customer_id } = rows[0];
  console.log(`Auth: ${rows[0].google_email}, login_customer_id=${login_customer_id ?? "(none)"}`);
  console.log("─".repeat(80));

  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  });

  type Result = {
    label: string;
    typeName: string;
    field: string;
    expectedByPreflight: string;
    googleVerdict: "ACCEPTED" | "REJECTED";
    googleError: string | null;
    preflightCorrect: boolean;
  };
  const results: Result[] = [];

  for (const t of TESTS) {
    const customer = client.Customer({
      customer_id: t.customerId,
      refresh_token,
      ...(login_customer_id ? { login_customer_id } : {}),
    });
    const resourceName = `customers/${t.customerId}/conversionActions/${t.conversionActionId}`;
    let googleVerdict: "ACCEPTED" | "REJECTED" = "ACCEPTED";
    let googleError: string | null = null;
    try {
      // validate_only: true — Google runs server-side validation but does NOT apply changes.
      await customer.conversionActions.update(
        [{ resource_name: resourceName, ...t.resource } as never],
        { validate_only: true },
      );
    } catch (e) {
      googleVerdict = "REJECTED";
      const err = e as { errors?: Array<{ message?: string }>; message?: string };
      googleError = err.errors?.[0]?.message ?? err.message ?? String(e);
    }
    const preflightCorrect =
      (t.expectedByPreflight === "BLOCKED" && googleVerdict === "REJECTED") ||
      (t.expectedByPreflight === "ALLOWED" && googleVerdict === "ACCEPTED");
    results.push({
      label: t.label,
      typeName: t.typeName,
      field: t.field,
      expectedByPreflight: t.expectedByPreflight,
      googleVerdict,
      googleError,
      preflightCorrect,
    });
    const icon = preflightCorrect ? "✓" : "✗ MISMATCH";
    console.log(`${icon}  ${t.label}`);
    console.log(`    preflight: ${t.expectedByPreflight}  |  google: ${googleVerdict}`);
    if (googleError) console.log(`    error: ${googleError}`);
    console.log("");
  }

  console.log("─".repeat(80));
  console.log("Summary:");
  const wrong = results.filter((r) => !r.preflightCorrect);
  if (wrong.length === 0) {
    console.log("All preflight verdicts match Google's behavior.");
  } else {
    console.log(`${wrong.length} MISMATCH(ES):`);
    for (const r of wrong) {
      const direction =
        r.expectedByPreflight === "ALLOWED"
          ? "preflight too permissive — Google rejects what we allow"
          : "preflight too strict — Google accepts what we block";
      console.log(`  - ${r.typeName} / ${r.field}: ${direction}`);
    }
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
