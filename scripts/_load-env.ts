import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnvLocal(): void {
  try {
    const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      // CLI scripts should prefer the repo-local environment. Hermes cron and
      // other hosts may export their own DATABASE_URL/DIRECT_URL, which would
      // otherwise shadow NotFair's Supabase URL and point feedback automation at
      // the wrong database.
      if (key) process.env[key] = value;
    }
  } catch {
    /* .env.local not found — rely on env vars */
  }
}
