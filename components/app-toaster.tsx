"use client";

import { useEffect } from "react";
import { Toaster, toast } from "sonner";

/**
 * Event payload for window.dispatchEvent(new CustomEvent("app-toast", { detail }))
 * — see appToast() helper in lib/app-toast.ts.
 */
type AppToastDetail = {
  type?: "success" | "error" | "info" | "warning" | "default";
  message: string;
  description?: string;
  duration?: number;
};

const APP_TOAST_EVENT = "app-toast";

/**
 * Client-component wrapper around sonner's Toaster.
 *
 * Why the event bridge: when Next.js code-splits a multi-platform app,
 * sonner ends up in different client chunks for different consumers
 * (each holding its own copy of sonner's `ToastState` singleton), so
 * `toast()` calls from outside this file never reach this Toaster.
 * Instead, every other consumer dispatches a CustomEvent on `window`,
 * and this component listens and forwards to the local `toast` — which
 * IS in the same module as the Toaster, so it always works.
 */
export function AppToaster() {
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<AppToastDetail>).detail;
      if (!detail || typeof detail.message !== "string") return;
      const opts = {
        ...(detail.description ? { description: detail.description } : {}),
        ...(detail.duration ? { duration: detail.duration } : {}),
      };
      switch (detail.type) {
        case "error":
          toast.error(detail.message, opts);
          break;
        case "info":
          toast.info(detail.message, opts);
          break;
        case "warning":
          toast.warning(detail.message, opts);
          break;
        case "success":
          toast.success(detail.message, opts);
          break;
        default:
          toast(detail.message, opts);
      }
    }
    window.addEventListener(APP_TOAST_EVENT, handler);
    return () => window.removeEventListener(APP_TOAST_EVENT, handler);
  }, []);
  // Top-right; offset clears the (app) layout's 56px navbar.
  // Brand colors + width come from app/sonner.css overrides.
  return (
    <Toaster
      theme="dark"
      position="top-right"
      richColors
      closeButton
      offset={{ top: "72px", right: "16px" }}
    />
  );
}
