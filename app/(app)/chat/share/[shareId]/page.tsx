import { notFound } from "next/navigation";
import { loadSharedThread } from "@/lib/db/chat";
import { Message } from "@/components/chat/chat-shared";
import type { GoogleAdsAgentUIMessage } from "@/lib/agents/google-ads-agent";

export default async function SharedChatPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const data = await loadSharedThread(shareId);

  if (!data) notFound();

  const { thread, messages } = data;
  const uiMessages = messages.map(m => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    parts: m.parts as GoogleAdsAgentUIMessage["parts"],
  })) as GoogleAdsAgentUIMessage[];

  return (
    <section className="flex h-full flex-col bg-[#222221]">
      <header className="shrink-0 bg-[#222221]">
        <div className="px-6 py-3">
          <h1 className="text-base font-medium text-[#E8E4DD]/80">
            {thread.title ?? "Shared chat"}
          </h1>
          <p className="mt-0.5 text-xs text-[#8b8b89]">
            Shared conversation — read only
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div>
          {uiMessages.map(message => (
            <Message key={message.id} message={message} />
          ))}
        </div>
      </div>
    </section>
  );
}
