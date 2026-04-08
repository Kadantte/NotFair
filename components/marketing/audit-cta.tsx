"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startGoogleConnect } from "@/lib/google-oauth";
import { trackEvent } from "@/lib/analytics";

export const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

export function AuditCTA({
  session,
  page,
  size = "default",
  connectedLabel = "View Your Audit",
  disconnectedLabel = "Audit Now",
}: {
  session: { connected: boolean };
  page: "homepage" | "google-ads-audit" | "google-ads-claude" | "google-ads-mcp-server";
  size?: "default" | "lg";
  connectedLabel?: string;
  disconnectedLabel?: string;
}) {
  const [loading, setLoading] = useState(false);

  function handleCTA() {
    if (loading) return;
    setLoading(true);
    trackEvent("cta_clicked", {
      page,
      cta: session.connected ? "view_audit" : "audit_now",
    });
    if (session.connected) {
      window.location.assign("/audit");
    } else {
      startGoogleConnect("/audit");
    }
  }

  const sizeClasses = size === "lg"
    ? "h-14 w-full px-10 text-lg md:w-auto"
    : "h-12 px-8 text-base";

  return (
    <Button
      onClick={handleCTA}
      disabled={loading}
      className={`${sizeClasses} rounded-full bg-[#4CAF6E] font-semibold text-[#1A1917] transition-all hover:scale-[1.02] hover:bg-[#3D9A5C] disabled:opacity-70`}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#1A1917] border-t-transparent" />
          Connecting...
        </span>
      ) : (
        <>
          {session.connected ? connectedLabel : disconnectedLabel}
          <ArrowRight className="ml-2 h-5 w-5" />
        </>
      )}
    </Button>
  );
}
