import { requireDevEmail } from "@/lib/dev-access";
import { isGmailConfigured, listDraftRecipientEmails } from "@/lib/gmail";

// Lists Gmail draft recipient emails so the dev customers table can flag
// out-of-band drafts (created via the Gmail MCP, not the contacts table).
// Split out from /api/dev/customers because Gmail does N sequential
// drafts.get round-trips per page and was gating the whole response.
//
// 5-minute cache: drafts only matter for the "is there an outreach draft
// queued for this customer" pill, which is fine to be 5 min stale.
const CACHE_TTL_MS = 5 * 60_000;
let cache: { emails: string[]; ts: number } | null = null;

export async function GET(request: Request) {
  const denied = await requireDevEmail();
  if (denied) return denied;

  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  if (!fresh && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return Response.json({ emails: cache.emails });
  }

  if (!isGmailConfigured()) {
    cache = { emails: [], ts: Date.now() };
    return Response.json({ emails: [] });
  }

  try {
    const set = await listDraftRecipientEmails();
    const emails = [...set];
    cache = { emails, ts: Date.now() };
    return Response.json({ emails });
  } catch (err) {
    console.error("listDraftRecipientEmails failed:", err);
    return Response.json({ emails: [] });
  }
}
