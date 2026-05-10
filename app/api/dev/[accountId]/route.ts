import { getSession } from "@/lib/session";
import { getAccountDetail } from "@/app/(app)/dev/[accountId]/data";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const session = await getSession();
  if (!session.connected || !session.isDev) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { accountId } = await params;
  const url = new URL(request.url);
  const tz = url.searchParams.get("tz") || "America/Los_Angeles";
  if (!/^[A-Za-z0-9_/+-]+$/.test(tz)) {
    return Response.json({ error: "Invalid timezone" }, { status: 400 });
  }

  const data = await getAccountDetail(accountId, tz);
  return Response.json(data);
}
