import type { UIMessage } from "ai";

/**
 * The AI SDK rejects UI messages whose `parts` array is empty. Older saved
 * threads and interrupted/malformed client sends can include those empty shell
 * messages, which turns a recoverable bad history row into a 500. Keep only
 * messages the model can validate.
 */
export function sanitizeNonEmptyPartMessages(messages: unknown): UIMessage[] {
  if (!Array.isArray(messages)) return [];

  return messages.filter((message): message is UIMessage => {
    if (!message || typeof message !== "object") return false;
    const candidate = message as { id?: unknown; role?: unknown; parts?: unknown };
    return (
      typeof candidate.id === "string" &&
      (candidate.role === "system" || candidate.role === "user" || candidate.role === "assistant") &&
      Array.isArray(candidate.parts) &&
      candidate.parts.length > 0
    );
  });
}
