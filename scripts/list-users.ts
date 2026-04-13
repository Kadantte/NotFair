/**
 * List all connected users with their audit data.
 * Usage: npx tsx scripts/list-users.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import postgres from "postgres";

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

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  const rows = await sql`
    SELECT DISTINCT ON (s.google_email)
      s.google_email, s.customer_id,
      a.overall_score, a.category, a.waste_rate, a.demand_captured,
      a.cpa, a.wasted_spend, a.total_spend, a.campaign_count, a.top_actions,
      a.created_at as audit_date
    FROM mcp_sessions s
    LEFT JOIN audit_snapshots a ON a.account_id = s.customer_id
    WHERE s.google_email IS NOT NULL
      AND s.google_email != ''
      AND s.customer_id != ''
    ORDER BY s.google_email, a.created_at DESC NULLS LAST
  `;

  for (const r of rows) {
    const raw = r.top_actions;
    let topActions: string[] | null = null;
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        topActions = Array.isArray(parsed) ? parsed.slice(0, 3).map((a: any) => a.action || a.title || String(a)) : null;
      } catch {}
    }
    console.log(`${r.google_email} | ${r.customer_id} | score=${r.overall_score ?? 'N/A'} | ${r.category ?? 'no audit'} | spend=$${r.total_spend ?? '0'} | cpa=$${r.cpa ?? 'N/A'} | demand=${r.demand_captured ?? 'N/A'}% | campaigns=${r.campaign_count ?? 0} | actions=${topActions ? topActions.join('; ') : 'none'}`);
  }

  await sql.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
