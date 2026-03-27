import { createAgentUIStreamResponse } from "ai";
import { createGoogleAdsAgent } from "@/lib/agents/google-ads-agent";
import { getSessionAuth } from "@/lib/session";

export async function POST(request: Request) {
  const payload = await request.json();
  const messages = payload.messages;
  const session = await getSessionAuth().catch(() => null);
  const refreshToken =
    payload.refreshToken ??
    request.headers.get("x-google-ads-refresh-token") ??
    session?.refreshToken ??
    "";
  const customerId =
    payload.customerId ??
    request.headers.get("x-google-ads-customer-id") ??
    session?.customerId ??
    "";

  if (!refreshToken || !customerId) {
    return new Response("Missing Google Ads auth context.", { status: 400 });
  }

  const agent = createGoogleAdsAgent({
    refreshToken,
    customerId,
    userId: session?.userId ?? null,
  });

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    abortSignal: request.signal,
  });
}
