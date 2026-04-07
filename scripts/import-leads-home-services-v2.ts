/**
 * Import cleaned home-services leads from CSV into contacts table.
 * Built with /import-leads skill.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/import-leads-home-services-v2.ts          # dry run
 *   npx tsx --tsconfig tsconfig.json scripts/import-leads-home-services-v2.ts --import # real import
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import postgres from "postgres";

// ─── Load .env.local ────────────────────────────────────────────────

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
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}
loadEnvLocal();

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";

// ─── CSV Parser (handles quoted fields with commas/newlines) ────────

function parseCSV(content: string): Record<string, string>[] {
  const results: Record<string, string>[] = [];
  const lines = content.split("\n");
  const headers = parseCSVRow(lines[0]);

  let i = 1;
  while (i < lines.length) {
    let row = lines[i];
    while (countQuotes(row) % 2 !== 0 && i + 1 < lines.length) {
      i++;
      row += "\n" + lines[i];
    }
    i++;
    if (!row.trim()) continue;

    const values = parseCSVRow(row);
    if (values.length < headers.length) continue;

    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = (values[j] || "").trim();
    }
    results.push(obj);
  }
  return results;
}

function countQuotes(s: string): number {
  let n = 0;
  for (const c of s) if (c === '"') n++;
  return n;
}

function parseCSVRow(row: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"' && row[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { result.push(current); current = ""; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

// ─── Email Filters ──────────────────────────────────────────────────

const BLOCKLIST_EMAILS = new Set([
  "john@doe.com", "jane@doe.com", "v@l.kn",
  "test@test.com", "example@example.com",
]);

const USELESS_PREFIXES = new Set([
  // Privacy/legal
  "privacy", "copyright", "legal", "compliance", "legal-notices",
  // HR/recruiting
  "hr", "benefits", "careers", "jobs", "apply", "resumes", "resume", "recruiting",
  // Bots/system
  "noreply", "no-reply", "donotreply", "postmaster", "webmaster", "hostmaster", "mailer-daemon", "chatbot",
  // Media/PR
  "press", "media", "investor", "investors", "ir", "communications",
  // Low-value generic
  "privacypolicy", "advertising", "adpromemberships", "membersupport",
  "digitalcare", "digitalsupport", "closedoffice", "franchising",
  "loyalcustomer", "commercial",
]);

const BLOCKLIST_DOMAINS = new Set([
  // Corporate parent holding companies
  "nbly.com", "dwyergroup.com", "wrenchgroup.com",
  // Marketing agencies / fulfillment
  "clickcallsell.com", "gist-apps.com", "cdsfulfillment.com",
  // Media / publishing
  "fox.com", "archdigest.com", "bobvila.com", "thisoldhouse.com",
  "thisoldhousereviews.com", "trustedmediabrands.com", "familyhandyman.com",
  "thefamilyhandyman.com", "condenast.com", "newyorker.com", "recurrent.io",
  // Fortune 500 / retail / non-home-services
  "dollargeneral.com", "mcmaster.com", "ferguson.com", "nordstrom.com",
  "paintingwithatwist.com",
  // Aggregators / marketplaces
  "angi.com", "mapquest.com", "lawnguru.co",
  // National chains too big for cold outreach
  "rotorooter.com", "visitingangels.com", "rollins.com", "trutechinc.com",
  // Utilities / non-target
  "pse.com", "andersencorp.com", "centralholland.org", "centraltransport.com",
  // Industrial / not home services
  "ato.com", "ny-engineers.com",
  // Bad data (maps to multiple unrelated companies)
  "stagheaddesigns.com",
]);

const EMAIL_REGEX = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const IMAGE_EXTENSIONS = [".avif", ".png", ".jpg", ".webp"];

// ─── Company Name Cleaning ──────────────────────────────────────────

const JUNK_NAMES = new Set([
  "wordpress", "access to this page has been denied", "checking your browser...",
  "all best search options for you!", "free quote & fast turnaround",
  "maps, driving directions, live traffic", "jp cozby site",
]);

const DESC_PATTERNS = [
  /^(repair|removal|shop |plumbing |heating |one-stop|top-rated|award-winning|local |24\/7|expert )/i,
  /^(bathroom and kitchen|plumbing supplies|mitsubishi)/i,
  /^(the premier brick|siding contractors|construction software)/i,
  /^(modular homes|quality construction|custom builders$)/i,
  /^(california's premier|commercial refrigeration|greater seattle area)/i,
  /^(south west plumbing|kitchen, bath)/i,
  /^(waterproofing contractors|seattle tile installer$)/i,
  /^(seattle,|seattle metro|roof repair,|electrical & solar)/i,
  /^(top solar battery|foundation and crawl)/i,
  /your browser/i,
  /^[A-Z][a-z]+,\s+[A-Z]/, // Pure locations: "Seattle, WA"
];

function cleanCompanyName(raw: string): string {
  if (!raw) return "";
  let name = raw.trim();

  if (JUNK_NAMES.has(name.toLowerCase())) return "";

  // Long names — try to extract before separator first
  if (name.length > 80) {
    for (const sep of [" | ", " - ", " — "]) {
      const idx = name.indexOf(sep);
      if (idx > 3) { name = name.slice(0, idx).trim(); break; }
    }
    if (name.length > 80) return "";
  }

  // Strip separators: " | ", " - ", " — "
  for (const sep of [" | ", " - ", " — "]) {
    const idx = name.indexOf(sep);
    if (idx > 0 && name.slice(0, idx).trim().length >= 3) {
      name = name.slice(0, idx).trim();
      break;
    }
  }

  // Strip trailing punctuation
  name = name.replace(/[,\s|*\-—]+$/, "").trim();

  // Strip location suffixes: " in Bellevue Seattle"
  name = name.replace(/\s+in\s+[\w\s,]+$/i, "").trim();

  // Strip ": tagline" suffixes
  const colonIdx = name.indexOf(": ");
  if (colonIdx > 3) name = name.slice(0, colonIdx).trim();

  // Reject descriptive names
  for (const pat of DESC_PATTERNS) {
    if (pat.test(name)) return "";
  }

  return name;
}

// ─── Email Priority (for dedup — lower = better) ────────────────────

const GENERIC_PREFIXES = new Set([
  "info", "hello", "hi", "contact", "office", "service", "support",
  "help", "sales", "marketing", "admin", "team", "customerservice",
  "customercare", "inquiries", "enquiries",
]);

function emailPriority(email: string): number {
  const local = email.split("@")[0].toLowerCase();
  if (!GENERIC_PREFIXES.has(local)) return 0; // named person — best
  if (local === "info") return 1;
  if (local === "hello" || local === "hi") return 2;
  if (local === "contact") return 3;
  if (local === "office") return 4;
  if (local === "sales") return 5;
  if (local === "marketing") return 6;
  if (local === "admin") return 7;
  return 8;
}

function isNamedPerson(email: string): boolean {
  return emailPriority(email) === 0;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const csvPath = resolve(process.env.HOME || "/tmp", "Downloads/leads_home_services.csv");
  const csvContent = readFileSync(csvPath, "utf-8");
  const rows = parseCSV(csvContent);

  console.log(`Parsed ${rows.length} rows from CSV`);
  console.log(`Columns: ${Object.keys(rows[0]).join(", ")}`);
  console.log(`Column mapping: email -> email, company_name -> company, website -> website\n`);

  // ── Step 1: Filter ────────────────────────────────────────────────

  const filtered = { blocklist: 0, invalidFormat: 0, imageFile: 0, uselessPrefix: 0, blockedDomain: 0, noCompany: 0, noEmail: 0 };
  const leads: { email: string; company: string; website: string }[] = [];
  const filterLog: string[] = [];

  for (const row of rows) {
    const email = row.email?.toLowerCase().trim();

    if (!email || !email.includes("@")) {
      filtered.noEmail++;
      filterLog.push(`  SKIP (missing/invalid email): ${email || "(empty)"}`);
      continue;
    }

    if (!EMAIL_REGEX.test(email)) {
      filtered.invalidFormat++;
      filterLog.push(`  SKIP (invalid format): ${email}`);
      continue;
    }

    if (IMAGE_EXTENSIONS.some(ext => email.endsWith(ext))) {
      filtered.imageFile++;
      filterLog.push(`  SKIP (image filename): ${email}`);
      continue;
    }

    if (BLOCKLIST_EMAILS.has(email)) {
      filtered.blocklist++;
      filterLog.push(`  SKIP (blocklisted): ${email}`);
      continue;
    }

    const prefix = email.split("@")[0];
    if (USELESS_PREFIXES.has(prefix)) {
      filtered.uselessPrefix++;
      filterLog.push(`  SKIP (useless prefix '${prefix}@'): ${email}`);
      continue;
    }

    const domain = email.split("@")[1];
    if (BLOCKLIST_DOMAINS.has(domain)) {
      filtered.blockedDomain++;
      filterLog.push(`  SKIP (blocked domain): ${email}`);
      continue;
    }

    const company = cleanCompanyName(row.company_name || row.ads_legal_name || "");
    const website = row.website?.trim() || "";

    if (!company) {
      filtered.noCompany++;
      filterLog.push(`  SKIP (no company after cleaning): ${email} — raw: "${(row.company_name || "").slice(0, 60)}"`);
      continue;
    }

    leads.push({ email, company, website });
  }

  console.log(`--- Filter details ---`);
  for (const line of filterLog) console.log(line);

  console.log(`\nFilter summary:`);
  console.log(`  ${filtered.noEmail} missing/invalid emails`);
  console.log(`  ${filtered.invalidFormat} invalid email format`);
  console.log(`  ${filtered.imageFile} image filenames parsed as emails`);
  console.log(`  ${filtered.blocklist} blocklisted fake/placeholder emails`);
  console.log(`  ${filtered.uselessPrefix} useless prefixes (privacy@, hr@, noreply@, etc.)`);
  console.log(`  ${filtered.blockedDomain} blocked domains (media, aggregators, national chains)`);
  console.log(`  ${filtered.noCompany} dropped after company name cleaning`);
  console.log(`  -> ${leads.length} leads remaining after filtering\n`);

  // ── Step 2: Deduplicate ───────────────────────────────────────────

  const byDomain = new Map<string, typeof leads>();
  for (const lead of leads) {
    const key = lead.website || lead.email.split("@")[1];
    if (!byDomain.has(key)) byDomain.set(key, []);
    byDomain.get(key)!.push(lead);
  }

  const deduped: { email: string; company: string }[] = [];
  const dedupLog: string[] = [];

  for (const [domain, group] of byDomain) {
    group.sort((a, b) => emailPriority(a.email) - emailPriority(b.email));
    const best = group[0];
    deduped.push({ email: best.email, company: best.company });
    if (group.length > 1) {
      const dropped = group.slice(1).map(g => g.email).join(", ");
      dedupLog.push(`  ${domain}: picked ${best.email} (beat: ${dropped})`);
    }
  }

  console.log(`--- Deduplication details ---`);
  for (const line of dedupLog) console.log(line);
  console.log(`\nDeduplicated: ${leads.length} -> ${deduped.length} (best email per domain)\n`);

  // ── Step 3: Quality breakdown ─────────────────────────────────────

  const namedCount = deduped.filter(l => isNamedPerson(l.email)).length;
  const genericCount = deduped.length - namedCount;

  console.log(`Quality breakdown:`);
  console.log(`  ${namedCount} named-person emails (high response rate)`);
  console.log(`  ${genericCount} generic emails (info@, hello@, contact@, etc.)`);
  console.log(`  Named-person ratio: ${deduped.length > 0 ? Math.round(namedCount / deduped.length * 100) : 0}%\n`);

  // ── Step 4: Final list ────────────────────────────────────────────

  console.log(`Final leads to import:\n`);
  for (const lead of deduped) {
    const tag = isNamedPerson(lead.email) ? "[person]" : "[generic]";
    console.log(`  ${lead.email.padEnd(50)} ${lead.company.padEnd(50)} ${tag}`);
  }

  // ── Step 5: Dry-run or import ─────────────────────────────────────

  const dryRun = !process.argv.includes("--import");

  if (dryRun) {
    console.log(`\nDRY RUN — pass --import to actually insert into DB.`);
    console.log(`Would import ${deduped.length} leads.\n`);
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) { console.error("\nMissing DATABASE_URL"); process.exit(1); }

  const client = postgres(url, { prepare: false });
  const database = drizzle(client, { schema });

  console.log(`\nImporting ${deduped.length} leads...`);
  let imported = 0;
  let skipped = 0;

  for (const lead of deduped) {
    const [contact] = await database
      .insert(schema.contacts)
      .values({ email: lead.email, company: lead.company })
      .onConflictDoNothing()
      .returning();

    if (contact) {
      imported++;
    } else {
      skipped++;
      const [existing] = await database
        .select({ id: schema.contacts.id })
        .from(schema.contacts)
        .where(eq(schema.contacts.email, lead.email))
        .limit(1);
      console.log(`  ~ ${lead.email} (exists, id: ${existing?.id})`);
    }
  }

  console.log(`\nDone: ${imported} new, ${skipped} already existed.`);
  await client.end();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
