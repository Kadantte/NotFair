import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { collectAdsTools } from "@/lib/mcp/collect";
import { collectMetaAdsTools } from "@/lib/mcp/collect-meta";

/**
 * Session-cookie-authed tools list for the chat MCP-tools sheet. Mirrors
 * what the chat agent will actually expose for the user's active platform —
 * using the same registrars the agent boots with (collectAdsTools /
 * collectMetaAdsTools), so the sheet and the agent never disagree.
 *
 * Replaces the chat sheet's old call to `/api/mcp` (which is OAuth-bearer-
 * gated and Google-only) so Meta-active users see Meta tools, and so the
 * call works without minting a Bearer token from the browser.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session.connected || !session.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedPlatform = url.searchParams.get("platform");
  const platform =
    requestedPlatform === "meta_ads" || requestedPlatform === "google_ads"
      ? requestedPlatform
      : session.activePlatform;

  // Build a shallow auth context ONLY for tool collection — registrars only
  // call back into the closure when handlers run. Listing tool metadata
  // never invokes a handler, so the placeholder ids are fine here.
  const authStub = {
    refreshToken: "",
    customerId: "",
    customerIds: [],
    userId: session.userId,
    authMethod: "chat-tools-list",
    clientName: "adsagent-chat",
  };

  const collected =
    platform === "meta_ads"
      ? collectMetaAdsTools(() => authStub)
      : collectAdsTools(() => authStub);

  const tools = collected.map((t) => ({
    name: t.name,
    description: t.description,
    readOnly: Boolean(
      (t.annotations as { readOnlyHint?: boolean } | undefined)?.readOnlyHint,
    ),
    destructive: Boolean(
      (t.annotations as { destructiveHint?: boolean } | undefined)?.destructiveHint,
    ),
  }));

  return NextResponse.json({ platform, tools });
}
