import { createAgentUIStream, createUIMessageStreamResponse } from "ai";
import { createGoogleAdsAgent, type ChatModelId } from "@/lib/agents/google-ads-agent";
import { getSessionAuth } from "@/lib/session";
import { upsertThread, saveAllMessages } from "@/lib/db/chat";
import { getToolPermissions } from "@/lib/tool-permissions";
import { getUserSubscription, isPlanEntitled } from "@/lib/subscription";

const PAID_MODELS = new Set<ChatModelId>(["gpt-5.4", "claude-opus-4.7"]);
const ALL_MODELS = new Set<ChatModelId>(["gpt-5-mini", "gpt-5.4", "claude-opus-4.7"]);

export async function POST(request: Request) {
  const payload = await request.json();
  const messages = payload.messages;
  const session = await getSessionAuth().catch(() => null);
  const refreshToken = session?.refreshToken ?? "";
  const customerId = session?.customerId ?? "";

  if (!refreshToken || !customerId) {
    return new Response("Missing Google Ads auth context.", { status: 400 });
  }

  const toolPermissions = session?.userId
    ? await getToolPermissions(session.userId).catch(() => ({}))
    : {};

  const requestedModel = payload.modelId as ChatModelId | undefined;
  let modelId: ChatModelId = "gpt-5-mini";
  if (requestedModel && ALL_MODELS.has(requestedModel)) {
    if (PAID_MODELS.has(requestedModel)) {
      const sub = session?.userId ? await getUserSubscription(session.userId).catch(() => null) : null;
      if (sub && sub.plan !== "free" && isPlanEntitled(sub.status)) {
        modelId = requestedModel;
      }
    } else {
      modelId = requestedModel;
    }
  }

  const agent = createGoogleAdsAgent({
    refreshToken,
    customerId,
    userId: session?.userId ?? null,
    authMethod: "chat",
    toolPermissions,
    modelId,
  });

  // Persist thread metadata (fire-and-forget, don't block streaming)
  const userId = session?.userId;
  const threadId = payload.id;
  if (userId && threadId) {
    const firstUserMsg = messages.find((m: { role: string }) => m.role === "user");
    const title = firstUserMsg?.parts
      ?.filter((p: { type: string }) => p.type === "text")
      ?.map((p: { text: string }) => p.text)
      ?.join(" ")
      ?.slice(0, 48) || "New chat";

    upsertThread({ id: threadId, userId, accountId: customerId, title }).catch(() => {});
  }

  const stream = await createAgentUIStream({
    agent,
    uiMessages: messages,
    originalMessages: messages,
    abortSignal: request.signal,
    onFinish: async ({ messages: finalMessages }) => {
      // Save complete conversation snapshot (all messages including tool calls)
      if (!userId || !threadId) return;
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
          accountId: customerId,
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
