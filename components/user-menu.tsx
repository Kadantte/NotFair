"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, LogOut, ChevronUp } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface SessionShape {
  connected: boolean;
  googleEmail?: string | null;
  customerName?: string | null;
}

interface SubscriptionShape {
  hasStripeCustomer: boolean;
}

function initialFromEmail(email: string | null | undefined): string {
  if (!email) return "?";
  const trimmed = email.trim();
  if (!trimmed) return "?";
  return trimmed[0].toUpperCase();
}

function displayName(email: string | null | undefined): string {
  if (!email) return "Account";
  // Strip the @domain for the sidebar label — full email shown in the dropdown header.
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return email.slice(0, at);
}

export function UserMenu({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionShape | null>(null);
  const [sub, setSub] = useState<SubscriptionShape | null>(null);
  const [loading, setLoading] = useState<null | "portal" | "signout">(null);

  useEffect(() => {
    fetch("/api/auth/session", { credentials: "include" })
      .then((r) => r.json())
      .then((s) => setSession(s))
      .catch(() => {});
    fetch("/api/subscription", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (s) setSub({ hasStripeCustomer: !!s.stripeCustomerId });
      })
      .catch(() => {});
  }, []);

  async function handlePortal() {
    setLoading("portal");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
    } catch {
      /* fall through */
    }
    setLoading(null);
  }

  async function handleSignOut() {
    if (loading) return;
    setLoading("signout");
    try {
      await fetch("/api/auth/signout", { method: "POST", credentials: "include" });
    } catch {
      /* still redirect */
    }
    router.push("/");
    router.refresh();
  }

  const email = session?.googleEmail ?? null;
  const initial = initialFromEmail(email);
  const label = displayName(email);
  const canManage = !!sub?.hasStripeCustomer;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={email ?? "Account"}
          className={`group flex h-12 items-center rounded-lg text-[#9B9689] transition-all duration-200 ease-out hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD] ${
            isCollapsed ? "w-12 justify-center px-0" : "w-full justify-start gap-3 px-2"
          }`}
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/15 text-[13px] font-semibold uppercase text-[#4CAF6E] ring-1 ring-[#4CAF6E]/30"
          >
            {initial}
          </span>
          <span
            className={`min-w-0 flex-1 overflow-hidden whitespace-nowrap text-left text-[13px] font-medium text-[#E8E4DD] transition-all duration-200 ease-out ${
              isCollapsed ? "max-w-0 opacity-0" : "max-w-32 opacity-100"
            }`}
          >
            {label}
          </span>
          <ChevronUp
            className={`h-4 w-4 shrink-0 text-[#9B9689] transition-all duration-200 ease-out ${
              isCollapsed ? "max-w-0 opacity-0" : "opacity-100"
            }`}
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-[220px] border-[#3D3C36] bg-[#24231F] text-[#E8E4DD]"
      >
        {/* Email header */}
        <div className="px-2 py-1.5">
          <p className="truncate text-[11px] font-mono uppercase tracking-wider text-[#9B9689]">
            Signed in as
          </p>
          <p className="mt-0.5 truncate text-[13px] font-medium text-[#E8E4DD]">
            {email ?? "Account"}
          </p>
        </div>

        <DropdownMenuSeparator className="bg-[#3D3C36]" />

        <DropdownMenuItem
          disabled={!canManage || loading !== null}
          onSelect={(e) => {
            e.preventDefault();
            if (canManage) handlePortal();
          }}
          className="cursor-pointer text-[13px] text-[#E8E4DD] focus:bg-[#2E2D28] focus:text-[#E8E4DD]"
        >
          <CreditCard className="mr-2 h-4 w-4" />
          {loading === "portal" ? "Opening portal…" : "Manage subscription"}
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            handleSignOut();
          }}
          disabled={loading !== null}
          className="cursor-pointer text-[13px] text-[#E8E4DD] focus:bg-[#2E2D28] focus:text-[#E8E4DD]"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {loading === "signout" ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
