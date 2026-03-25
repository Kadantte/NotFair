import { createAgentUIStreamResponse } from "ai";
import { createGoogleAdsAgent } from "@/lib/agents/google-ads-agent";

export async function POST(request: Request) {
  const payload = await request.json();
  const messages = payload.messages;
  const refreshToken =
    payload.refreshToken ??
    request.headers.get("x-google-ads-refresh-token") ??
    "";
  const customerId =
    payload.customerId ??
    request.headers.get("x-google-ads-customer-id") ??
    "";

  if (!refreshToken || !customerId) {
    return new Response("Missing Google Ads auth context.", { status: 400 });
  }

  const agent = createGoogleAdsAgent({
    refreshToken,
    customerId,
  });

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    abortSignal: request.signal,
  });
}
