import { createAgentUIStream, createUIMessageStreamResponse } from "ai";
import { and, eq } from "drizzle-orm";
import { createGoogleAdsAgent, type ChatModelId } from "@/lib/agents/google-ads-agent";
import { createMetaAdsAgent } from "@/lib/agents/meta-ads-agent";
import { getSession, getSessionAuth } from "@/lib/session";
import { db, schema } from "@/lib/db";
import { upsertThread, saveAllMessages } from "@/lib/db/chat";
import { getToolPermissions } from "@/lib/tool-permissions";
import { getUserSubscription, isPlanEntitled } from "@/lib/subscription";

const PAID_MODELS = new Set<ChatModelId>(["gpt-5.4", "claude-opus-4.7"]);
const ALL_MODELS = new Set<ChatModelId>(["gpt-5-mini", "gpt-5.4", "claude-opus-4.7"]);

export async function POST(request: Request) {
  const payload = await request.json();
  const messages = payload.messages;

  // Use the non-strict getSession so Meta-only users (no Google customerId)
  // can still chat. The route then dispatches on session.activePlatform.
  const session = await getSession();
  if (!session.connected || !session.userId) {
    return new Response("Not authenticated.", { status: 401 });
  }

  const userId = session.userId;
  const platform = session.activePlatform;

  // Resolve model + tool permissions BEFORE branching on platform — both
  // branches share these.
  const toolPermissions = await getToolPermissions(userId).catch(() => ({}));
  const requestedModel = payload.modelId as ChatModelId | undefined;
  let modelId: ChatModelId = "gpt-5-mini";
  if (requestedModel && ALL_MODELS.has(requestedModel)) {
    if (PAID_MODELS.has(requestedModel)) {
      const sub = await getUserSubscription(userId).catch(() => null);
      if (sub && sub.plan !== "free" && isPlanEntitled(sub.status)) {
        modelId = requestedModel;
      }
    } else {
      modelId = requestedModel;
    }
  }

  // ── Build the platform-specific agent ────────────────────────────────────
  // Google Ads uses the user's refresh_token from `mcp_sessions`; Meta Ads
  // uses the long-lived access token stored on `ad_platform_connections`.
  let agent: ReturnType<typeof createGoogleAdsAgent> | ReturnType<typeof createMetaAdsAgent>;
  let threadAccountId: string;

  if (platform === "meta_ads") {
    const [conn] = await db()
      .select({
        refreshToken: schema.adPlatformConnections.refreshToken,
        activeAccountId: schema.adPlatformConnections.activeAccountId,
        accountIds: schema.adPlatformConnections.accountIds,
      })
      .from(schema.adPlatformConnections)
      .where(
        and(
          eq(schema.adPlatformConnections.userId, userId),
          eq(schema.adPlatformConnections.platform, "meta_ads"),
        ),
      )
      .limit(1);
    if (!conn || !conn.refreshToken || !conn.activeAccountId) {
      return new Response(
        "No Meta Ads connection. Connect Meta at /manage-ads-accounts/meta-ads.",
        { status: 400 },
      );
    }
    threadAccountId = conn.activeAccountId;
    agent = createMetaAdsAgent({
      refreshToken: conn.refreshToken,
      customerId: conn.activeAccountId,
      customerIds: (conn.accountIds ?? []).map((a) => ({
        id: a.id,
        name: a.name ?? "",
      })),
      userId,
      authMethod: "chat",
      toolPermissions,
      modelId,
    });
  } else {
    // Google Ads default. getSessionAuth still requires a customerId, so
    // ads-less users won't reach here.
    const sessionAuth = await getSessionAuth().catch(() => null);
    if (!sessionAuth?.refreshToken || !sessionAuth?.customerId) {
      return new Response("Missing Google Ads auth context.", { status: 400 });
    }
    threadAccountId = sessionAuth.customerId;
    agent = createGoogleAdsAgent({
      refreshToken: sessionAuth.refreshToken,
      customerId: sessionAuth.customerId,
      userId,
      authMethod: "chat",
      toolPermissions,
      modelId,
    });
  }

  // Persist thread metadata (fire-and-forget, don't block streaming).
  // accountId stores the platform-specific id: Google customer id for
  // Google chats, Meta numeric ad-account id for Meta chats.
  const threadId = payload.id;
  if (threadId) {
    const firstUserMsg = messages.find((m: { role: string }) => m.role === "user");
    const title = firstUserMsg?.parts
      ?.filter((p: { type: string }) => p.type === "text")
      ?.map((p: { text: string }) => p.text)
      ?.join(" ")
      ?.slice(0, 48) || "New chat";

    upsertThread({ id: threadId, userId, accountId: threadAccountId, title }).catch(() => {});
  }

  const stream = await createAgentUIStream({
    agent,
    uiMessages: messages,
    originalMessages: messages,
    abortSignal: request.signal,
    onFinish: async ({ messages: finalMessages }) => {
      if (!threadId) return;
      try {
        await saveAllMessages(
          threadId,
          finalMessages
            .filter(m => m.role === "user" || m.role === "assistant")
            .map(m => ({
              id: m.id || crypto.randomUUID(),
              role: m.role,
              parts: m.parts,
            })),
        );
        await upsertThread({
          id: threadId,
          userId,
          accountId: threadAccountId,
          title: null,
        });
      } catch (err) {
        console.error("[chat] Failed to persist conversation:", err);
      }
    },
  });

  return createUIMessageStreamResponse({
    stream,
    consumeSseStream: async ({ stream: sseStream }) => {
      // Consume the forked stream server-side to ensure onFinish fires
      // even if the client disconnects
      const reader = sseStream.getReader();
      try {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      } catch {
        // Client disconnected — stream still consumed so onFinish fires
      }
    },
  });
}
