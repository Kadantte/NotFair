"use client";

import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";

/**
 * Client-side sign-out button for the first-time onboarding screen.
 * POSTs to /api/auth/signout (which clears cookies + Supabase session) and
 * routes the user back to the home page.
 */
export function OnboardingSignOut() {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      // Best-effort — proceed to the redirect either way so the user isn't stuck.
    } finally {
      window.location.assign("/");
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      className="inline-flex items-center gap-1.5 text-sm text-[#C4C0B6] transition hover:text-[#E8E4DD] disabled:opacity-50"
    >
      {signingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
      <span>Exit and sign out</span>
    </button>
  );
}
