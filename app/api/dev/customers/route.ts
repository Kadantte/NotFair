import { requireDevEmail } from "@/lib/dev-access";
import { getCustomersData } from "@/app/(app)/dev/(tabs)/customers/data";

// Single-tenant admin cache: dev dashboard is hit by a tiny set of authorized
// users, and the underlying data (sessions, ops counts, account snapshots)
// changes on the order of minutes. A 60s TTL turns repeat refreshes into a
// memory hit — DB time goes from ~250ms to <1ms.
const CACHE_TTL_MS = 60_000;
let cache: { data: unknown; ts: number } | null = null;

export async function GET(request: Request) {
  const denied = await requireDevEmail();
  if (denied) return denied;

  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  if (!fresh && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return Response.json(cache.data);
  }

  const payload = await getCustomersData();
  cache = { data: payload, ts: Date.now() };
  return Response.json(payload);
}
