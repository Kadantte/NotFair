/**
 * Schedule drafted contacts for staggered sending.
 *
 * Usage:
 *   npx tsx scripts/schedule-sends.ts --start "2026-04-07T09:00:00-07:00" --per-day 3
 *
 * Assigns send times to all "drafted" contacts, spreading them across
 * Tue-Thu mornings (skipping weekends). Marks status as "scheduled".
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";

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

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith("--") && i + 1 < argv.length) {
      args[argv[i].slice(2)] = argv[++i];
    }
  }
  return args;
}

function nextWeekday(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  // Skip Saturday (6) and Sunday (0)
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

async function main() {
  const args = parseArgs(process.argv);
  const startStr = args.start || "2026-04-07T09:00:00-07:00";
  const perDay = parseInt(args["per-day"] || "3", 10);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error("Missing DATABASE_URL"); process.exit(1); }

  const client = postgres(dbUrl, { prepare: false });
  const database = drizzle(client, { schema });

  // Get all drafted contacts
  const drafted = await database
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.status, "drafted"));

  if (drafted.length === 0) {
    console.log("No drafted contacts to schedule.");
    await client.end();
    return;
  }

  console.log(`\n📅 Scheduling ${drafted.length} contacts, ${perDay}/day starting ${startStr}\n`);

  let currentDate = new Date(startStr);
  let countToday = 0;

  const gapMinutes = parseInt(args["gap"] || "3", 10);
  let emailIndex = 0;

  for (const contact of drafted) {
    // Space emails 3 minutes apart within each day
    const offset = emailIndex * gapMinutes * 60 * 1000;
    const scheduledAt = new Date(currentDate.getTime() + offset);

    await database
      .update(schema.contacts)
      .set({ status: "scheduled", scheduledAt })
      .where(eq(schema.contacts.id, contact.id));

    const dayStr = scheduledAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const timeStr = scheduledAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    console.log(`  ${contact.company?.padEnd(25)} → ${dayStr} ${timeStr}`);

    emailIndex++;
    countToday++;
    if (countToday >= perDay) {
      countToday = 0;
      emailIndex = 0;
      currentDate = nextWeekday(currentDate);
      // Reset to 9am on the next day
      currentDate.setHours(currentDate.getHours(), 0, 0, 0);
    }
  }

  console.log(`\n✅ ${drafted.length} contacts scheduled.\n`);
  await client.end();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
