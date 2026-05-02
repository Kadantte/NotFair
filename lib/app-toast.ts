/**
 * Client-side helper for firing toasts from anywhere in the app.
 *
 * Dispatches a `CustomEvent` on `window` that the `<AppToaster />` listens
 * for. We use this indirection instead of importing `toast` from sonner
 * directly because Next.js/Turbopack code-splits sonner per consumer
 * chunk — each chunk gets its own `ToastState` singleton, so toasts fired
 * from chunk A never reach the Toaster mounted in chunk B. The event
 * bridge sidesteps the chunk problem entirely.
 *
 * Safe to call from both client effects and event handlers; no-ops when
 * `window` isn't available (SSR).
 */

export type AppToastInput = {
  type?: "success" | "error" | "info" | "warning" | "default";
  message: string;
  description?: string;
  duration?: number;
};

export function appToast(input: AppToastInput): void {
  if (typeof window === "undefined") return;
  // Defer to a microtask so the AppToaster's listener is registered first.
  // React effects run bottom-up — without this, a caller's effect (running
  // first) would dispatch before AppToaster (an ancestor) attaches its
  // listener, and the event would be missed.
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent("app-toast", { detail: input }));
  });
}

export const appToastSuccess = (message: string, description?: string) =>
  appToast({ type: "success", message, description });

export const appToastError = (message: string, description?: string) =>
  appToast({ type: "error", message, description });
