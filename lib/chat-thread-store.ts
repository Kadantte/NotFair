import { ACTIVE_CHAT_THREAD_KEY, CHAT_HISTORY_KEY } from "@/lib/chat-history";

export type StoredChatThread<TMessage = unknown> = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: TMessage[];
};

export type ChatThreadSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

type ChatSidebarSnapshot = {
  threads: ChatThreadSummary[];
  activeThreadId: string;
};

const EMPTY_SNAPSHOT: ChatSidebarSnapshot = {
  threads: [],
  activeThreadId: "",
};

const listeners = new Set<() => void>();

let snapshotCache = EMPTY_SNAPSHOT;
let initialized = false;
let storageListening = false;

function readStoredThreads<TMessage>(): StoredChatThread<TMessage>[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (thread: unknown): thread is StoredChatThread<TMessage> =>
        !!thread &&
        typeof (thread as StoredChatThread<TMessage>).id === "string" &&
        typeof (thread as StoredChatThread<TMessage>).title === "string" &&
        typeof (thread as StoredChatThread<TMessage>).updatedAt === "string" &&
        Array.isArray((thread as StoredChatThread<TMessage>).messages),
    );
  } catch {
    return [];
  }
}

function summarizeThreads<TMessage>(
  threads: StoredChatThread<TMessage>[],
): ChatThreadSummary[] {
  return threads
    .map(thread => ({
      id: thread.id,
      title: thread.title,
      updatedAt: thread.updatedAt,
      messageCount: thread.messages.length,
    }))
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
}

function readSnapshotFromStorage(): ChatSidebarSnapshot {
  if (typeof window === "undefined") return EMPTY_SNAPSHOT;

  return {
    threads: summarizeThreads(readStoredThreads()),
    activeThreadId: localStorage.getItem(ACTIVE_CHAT_THREAD_KEY) ?? "",
  };
}

function snapshotsEqual(
  left: ChatSidebarSnapshot,
  right: ChatSidebarSnapshot,
): boolean {
  if (left.activeThreadId !== right.activeThreadId) return false;
  if (left.threads.length !== right.threads.length) return false;

  return left.threads.every((thread, index) => {
    const other = right.threads[index];
    return (
      thread.id === other.id &&
      thread.title === other.title &&
      thread.updatedAt === other.updatedAt &&
      thread.messageCount === other.messageCount
    );
  });
}

function ensureInitialized() {
  if (typeof window === "undefined" || initialized) return;
  snapshotCache = readSnapshotFromStorage();
  initialized = true;
}

function emitSnapshot(nextSnapshot: ChatSidebarSnapshot) {
  if (snapshotsEqual(snapshotCache, nextSnapshot)) return;
  snapshotCache = nextSnapshot;
  listeners.forEach(listener => listener());
}

function syncSnapshotFromStorage() {
  ensureInitialized();
  emitSnapshot(readSnapshotFromStorage());
}

function handleStorage(event: StorageEvent) {
  if (!event.key || event.key === CHAT_HISTORY_KEY || event.key === ACTIVE_CHAT_THREAD_KEY) {
    syncSnapshotFromStorage();
  }
}

function ensureStorageSubscription() {
  if (typeof window === "undefined" || storageListening) return;
  window.addEventListener("storage", handleStorage);
  storageListening = true;
}

function cleanupStorageSubscription() {
  if (typeof window === "undefined" || !storageListening || listeners.size > 0) return;
  window.removeEventListener("storage", handleStorage);
  storageListening = false;
}

export function subscribeChatSidebar(listener: () => void) {
  ensureInitialized();
  ensureStorageSubscription();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    cleanupStorageSubscription();
  };
}

export function getChatSidebarSnapshot() {
  ensureInitialized();
  return snapshotCache;
}

export function getChatSidebarServerSnapshot() {
  return EMPTY_SNAPSHOT;
}

export function getStoredChatThreads<TMessage>(): StoredChatThread<TMessage>[] {
  return readStoredThreads<TMessage>();
}

export function getStoredActiveThreadId() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ACTIVE_CHAT_THREAD_KEY) ?? "";
}

export function persistChatThreads<TMessage>(
  threads: StoredChatThread<TMessage>[],
  activeThreadId: string,
) {
  if (typeof window === "undefined") return;

  localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(threads));
  localStorage.setItem(ACTIVE_CHAT_THREAD_KEY, activeThreadId);

  emitSnapshot({
    threads: summarizeThreads(threads),
    activeThreadId,
  });
}

export function setStoredActiveThreadId(activeThreadId: string) {
  if (typeof window === "undefined") return;

  localStorage.setItem(ACTIVE_CHAT_THREAD_KEY, activeThreadId);
  emitSnapshot({
    ...getChatSidebarSnapshot(),
    activeThreadId,
  });
}
