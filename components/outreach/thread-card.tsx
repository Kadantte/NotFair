import type { GmailThreadSummary } from "@/lib/gmail";

export function formatDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ThreadCard({ thread }: { thread: GmailThreadSummary }) {
  return (
    <div className="rounded-lg border border-[#3D3C36] bg-[#1A1917] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#3D3C36]/50 bg-[#24231F]/40">
        <div className="text-[14px] text-[#E8E4DD] font-medium">
          {thread.subject || "(no subject)"}
        </div>
        <div className="text-[11px] text-[#C4C0B6] mt-0.5">
          {thread.messageCount} message{thread.messageCount === 1 ? "" : "s"} · last{" "}
          {formatDateTime(thread.lastDate)}
        </div>
      </div>
      <div className="divide-y divide-[#3D3C36]/40">
        {thread.messages.map((m) => (
          <div key={m.id} className="px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={
                  "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider " +
                  (m.isFromMe
                    ? "bg-[#4CAF6E]/20 text-[#4CAF6E]"
                    : "bg-[#C084FC]/20 text-[#C084FC]")
                }
              >
                {m.isFromMe ? "Sent" : "Received"}
              </span>
              <span className="text-[11px] text-[#C4C0B6] font-mono truncate">
                {m.isFromMe ? `to ${m.to}` : `from ${m.from}`}
              </span>
              <span className="text-[11px] text-[#C4C0B6]/60 ml-auto shrink-0">
                {formatDateTime(m.date)}
              </span>
            </div>
            <pre className="text-[13px] text-[#E8E4DD]/85 whitespace-pre-wrap font-sans leading-relaxed">
              {m.bodyText || m.snippet}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
