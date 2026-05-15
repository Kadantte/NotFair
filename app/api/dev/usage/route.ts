import { requireDevEmail } from "@/lib/dev-access";
import { getUsageData } from "@/app/(app)/dev/(tabs)/usage/data";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { data: unknown; ts: number }>();

export async function GET(request: Request) {
  const denied = await requireDevEmail();
  if (denied) return denied;

  const url = new URL(request.url);

  const rawDays = parseInt(url.searchParams.get("days") || "60", 10);
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 120) : 60;

  const tz = url.searchParams.get("tz") || "America/Los_Angeles";
  if (!/^[A-Za-z0-9_/+-]+$/.test(tz)) {
    return Response.json({ error: "Invalid timezone" }, { status: 400 });
  }

  const source = url.searchParams.get("source") || null;
  const rawPlatform = url.searchParams.get("platform");
  const platform =
    rawPlatform === "google_ads" || rawPlatform === "meta_ads"
      ? rawPlatform
      : null;
  const fresh = url.searchParams.get("fresh") === "1";
  const includeDev = url.searchParams.get("includeDev") === "1";

  const cacheKey = `${tz}|${days}|${platform ?? "all"}|${includeDev ? "dev" : "prod"}`;
  if (!fresh) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      if (!source) return Response.json(hit.data);
    }
  }

  const payload = await getUsageData({ days, tz, source, platform, includeDev });

  if (!source) {
    cache.set(cacheKey, { data: payload, ts: Date.now() });
  }

  return Response.json(payload);
}
