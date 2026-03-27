/** Lightweight pub/sub for chat thread operations between the (app) layout sidebar and the chat page. */

export type ThreadEventType = "select" | "create" | "delete" | "refresh";

export function dispatchThreadEvent(type: ThreadEventType, detail?: string) {
  window.dispatchEvent(new CustomEvent(`thread:${type}`, { detail }));
}

export function onThreadEvent(
  type: ThreadEventType,
  handler: (detail?: string) => void,
): () => void {
  const listener = (e: Event) => handler((e as CustomEvent).detail);
  window.addEventListener(`thread:${type}`, listener);
  return () => window.removeEventListener(`thread:${type}`, listener);
}
