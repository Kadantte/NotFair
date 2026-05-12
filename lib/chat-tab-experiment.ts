export const CHAT_TAB_EXPERIMENT_FLAG = "chat-tab-visibility";
export const CHAT_TAB_EXPERIMENT_EXPOSURE_EVENT = "chat_tab_experiment_exposed";
export const CHAT_TAB_EXPERIMENT_CLICK_EVENT = "chat_tab_clicked";
export const CHAT_TAB_EXPERIMENT_BLOCK_EVENT = "chat_tab_experiment_chat_blocked";

export type ChatTabExperimentVariant = "show_chat" | "hide_chat" | "unassigned";

export function normalizeChatTabExperimentVariant(value: unknown): ChatTabExperimentVariant {
  if (value === false) return "hide_chat";
  if (value === true) return "show_chat";
  if (typeof value !== "string") return "unassigned";

  const normalized = value.trim().toLowerCase();
  if (["hide_chat", "hidden", "hide", "control", "off", "false"].includes(normalized)) {
    return "hide_chat";
  }
  if (["show_chat", "visible", "show", "test", "on", "true"].includes(normalized)) {
    return "show_chat";
  }

  return "unassigned";
}

export function isChatTabVisibleForVariant(value: unknown): boolean {
  return normalizeChatTabExperimentVariant(value) !== "hide_chat";
}
