"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CreditCard, LogOut } from "lucide-react";
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
  displayName?: string | null;
  picture?: string | null;
  customerName?: string | null;
}

interface SubscriptionShape {
  hasStripeCustomer: boolean;
}

function initial(name: string | null | undefined, email: string | null | undefined): string {
  // Prefer initials from the user's display name (first letter of each word,
  // up to 2). Fall back to the first letter of the email's local part.
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (parts.length === 1) {
      return parts[0][0].toUpperCase();
    }
  }
  if (email && email.trim()) {
    return email.trim()[0].toUpperCase();
  }
  return "?";
}

function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function UserMenu() {
  const router = useRouter();
  const t = useTranslations("UserMenu");
  const [session, setSession] = useState<SessionShape | null>(null);
  const [sub, setSub] = useState<SubscriptionShape | null>(null);
  const [loading, setLoading] = useState<null | "portal" | "signout">(null);

  useEffect(() => {
    fetch("/api/auth/session", { credentials: "include" })
      .then((r) => r.json())
      .then((s) => {
        setSession(s);
        if (!s?.connected) return null;
        return fetch("/api/subscription", { credentials: "include" })
          .then((r) => (r.ok ? r.json() : null));
      })
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
  const rawDisplayName = session?.displayName ?? null;
  const displayName = rawDisplayName ? titleCase(rawDisplayName) : null;
  const picture = session?.picture ?? null;
  const initialChar = initial(displayName, email);
  const canManage = !!sub?.hasStripeCustomer;
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          suppressHydrationWarning
          title={email ?? t("account")}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#C4C0B6] transition-all duration-200 ease-out hover:ring-2 hover:ring-[#E8E4DD]/15"
        >
          {picture && !imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={picture}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-[#3D3C36]"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/15 text-[13px] font-semibold uppercase text-[#4CAF6E] ring-1 ring-[#4CAF6E]/30"
            >
              {initialChar}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={4}
        className="w-[240px] border-[#3D3C36] bg-[#24231F] text-[#E8E4DD]"
      >
        {/* Profile header */}
        <div className="px-2 py-1.5">
          <p className="truncate text-[11px] font-mono uppercase tracking-wider text-[#C4C0B6]">
            {t("signedInAs")}
          </p>
          {displayName && (
            <p className="mt-0.5 truncate text-[13px] font-semibold text-[#E8E4DD]">
              {displayName}
            </p>
          )}
          {email && (
            <p className={`truncate text-[11px] text-[#C4C0B6] ${displayName ? "" : "mt-0.5"}`}>
              {email}
            </p>
          )}
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
          {loading === "portal" ? t("openingPortal") : t("manageSubscription")}
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
          {loading === "signout" ? t("signingOut") : t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
