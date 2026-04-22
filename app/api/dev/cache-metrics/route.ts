import { requireDevEmail } from "@/lib/dev-access";
import { getCacheMetrics } from "@/lib/google-ads/query-cache";

/**
 * Dev-only observability endpoint for the Google Ads query cache.
 * Returns hit/miss/coalesced/eviction counters plus current size. Gated
 * by the same dev-email check as the rest of `/api/dev/*`.
 */
export async function GET() {
  const denied = await requireDevEmail();
  if (denied) return denied;
  return Response.json(getCacheMetrics());
}
