import { requireDevEmail } from "@/lib/dev-access";
import {
  getUsageSection,
  isUsageSection,
  USAGE_SECTIONS,
  type UsageQueryOptions,
  type UsageSection,
} from "@/app/(app)/dev/(tabs)/usage/data";

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
  const platform: UsageQueryOptions["platform"] =
    rawPlatform === "google_ads" || rawPlatform === "meta_ads" ? rawPlatform : null;
  const includeDev = url.searchParams.get("includeDev") === "1";

  const opts: UsageQueryOptions = { days, tz, source, platform, includeDev };

  const rawSection = url.searchParams.get("section");
  if (rawSection) {
    if (!isUsageSection(rawSection)) {
      return Response.json({ error: "Invalid section" }, { status: 400 });
    }
    const payload = await getUsageSection(rawSection, opts);
    return Response.json(payload);
  }

  // No section specified → fetch every section in parallel and return a
  // section-keyed bundle. The client always passes ?section=, so this only
  // serves diagnostic / curl-from-console use; keeping it lets the endpoint
  // stay self-describing. Catch per-section so one slow/failing CTE during
  // an incident doesn't take down the entire diagnostic response — that
  // would defeat the section-split resilience the rest of this page relies
  // on (which is exactly when this endpoint is most useful).
  const entries = await Promise.all(
    USAGE_SECTIONS.map(async (s) => {
      try {
        const data = await getUsageSection(s, opts);
        return [s, data, null] as const;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return [s, null, message] as const;
      }
    }),
  );
  const payload: Partial<Record<UsageSection, unknown>> = {};
  const errors: Partial<Record<UsageSection, string>> = {};
  for (const [section, data, error] of entries) {
    if (error) errors[section] = error;
    else payload[section] = data;
  }
  return Response.json({
    ...payload,
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
  });
}
