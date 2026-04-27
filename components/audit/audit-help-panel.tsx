"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Mail, Calendar, MessageCircle, ArrowUpRight, X } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { BOOK_DEMO_URL } from "@/lib/links";

type HelpAction = "connect_claude" | "join_discord" | "email_expert" | "book_demo" | "chat_agent";

function trackHelpAction(action: HelpAction) {
  trackEvent("audit_help_action_clicked", { action });
}

const DISCORD_URL = "https://discord.gg/5nzUggmVdG";
const EMAIL = "tong.chen@adsagent.org";
const CONNECTOR_URL = "/connect/claude-connector";
const STORAGE_KEY = "audit-help-panel-collapsed";

export function AuditHelpPanel({ onChatClick }: { onChatClick?: () => void }) {
  const [collapsed, setCollapsed] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let initialCollapsed = false;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) initialCollapsed = stored === "1";
    } catch {
      /* ignore */
    }
    setCollapsed(initialCollapsed);
    setHydrated(true);
    trackEvent("audit_help_panel_shown", {
      initial_state: initialCollapsed ? "collapsed" : "expanded",
    });
  }, []);

  function toggle(next: boolean) {
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (next) trackEvent("audit_help_panel_dismissed");
    else trackEvent("audit_help_panel_expanded");
  }

  if (!hydrated) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => toggle(false)}
        className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full border border-[#4CAF6E]/60 bg-[#4CAF6E] px-5 py-3 text-[14px] font-semibold text-[#1A1917] shadow-lg shadow-[#4CAF6E]/30 ring-2 ring-[#4CAF6E]/20 transition hover:bg-[#5BC07F] hover:shadow-xl hover:shadow-[#4CAF6E]/40 md:bottom-6 md:right-6"
        aria-label="Open: let Claude fix it for you"
      >
        <Sparkles className="h-4 w-4" />
        Let Claude fix it for you!
      </button>
    );
  }

  return (
    <aside
      className="fixed bottom-20 right-4 z-30 w-[320px] max-w-[calc(100vw-24px)] rounded-lg border border-[#3D3C36] bg-[#24231F] p-4 shadow-2xl shadow-black/40 md:bottom-6 md:right-6"
      aria-label="Let Claude fix your account"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#4CAF6E] shadow-md shadow-[#4CAF6E]/30">
            <Sparkles className="h-3.5 w-3.5 text-[#1A1917]" />
          </span>
          <div>
            <h2 className="text-[14px] font-bold text-white">
              Let Claude fix it for you!
            </h2>
            <p className="text-[11px] text-[#B8B4AC]">Pick the way you&apos;d like help</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => toggle(true)}
          className="rounded p-1 text-[#C4C0B6] transition hover:bg-[#2E2D28] hover:text-[#E8E4DD]"
          aria-label="Collapse panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        <HelpItem
          href={CONNECTOR_URL}
          icon={<ClaudeIcon />}
          iconWrapperClass="border-transparent bg-[#D97757] group-hover:border-transparent"
          title="Connect to Claude"
          description="Add AdsAgent to Claude.ai and let Claude fix issues directly."
          external={false}
          onClick={() => trackHelpAction("connect_claude")}
        />
        <HelpItem
          href={DISCORD_URL}
          icon={<DiscordIcon />}
          iconWrapperClass="border-transparent bg-[#8B9FF5] group-hover:border-transparent"
          title="Join Discord"
          description="Get help from the community and our team."
          external
          onClick={() => trackHelpAction("join_discord")}
        />
        <HelpItem
          href={`https://mail.google.com/mail/?view=cm&fs=1&to=${EMAIL}&su=${encodeURIComponent(
            "AdsAgent account help"
          )}&body=${encodeURIComponent(
            "Hi Tong,\n\nI'd like help fixing issues in my Google Ads account."
          )}`}
          icon={<Mail className="h-3.5 w-3.5 text-[#4CAF6E]" />}
          title="Email our expert"
          description={EMAIL}
          external
          onClick={() => trackHelpAction("email_expert")}
        />
        <HelpItem
          href={BOOK_DEMO_URL}
          icon={<Calendar className="h-3.5 w-3.5 text-[#4CAF6E]" />}
          title="Book a demo"
          description="30-min call to walk through your account."
          external
          onClick={() => trackHelpAction("book_demo")}
        />
        {onChatClick && (
          <button
            type="button"
            onClick={() => {
              trackHelpAction("chat_agent");
              onChatClick();
            }}
            className="group flex w-full items-start gap-3 rounded-md border border-[#3D3C36] bg-[#1A1917] p-3 text-left transition hover:border-[#4CAF6E]/50 hover:bg-[#2E2D28]"
          >
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#3D3C36] bg-[#24231F] group-hover:border-[#4CAF6E]/40">
              <MessageCircle className="h-3.5 w-3.5 text-[#4CAF6E]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-[#E8E4DD]">
                Chat with our Agentic AI
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-[#C4C0B6]">
                Ask questions about this audit and get instant answers.
              </span>
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}

function HelpItem({
  href,
  icon,
  iconWrapperClass,
  title,
  description,
  external,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  iconWrapperClass?: string;
  title: string;
  description: string;
  external: boolean;
  onClick?: () => void;
}) {
  const className =
    "group flex w-full items-start gap-3 rounded-md border border-[#3D3C36] bg-[#1A1917] p-3 text-left transition hover:border-[#4CAF6E]/50 hover:bg-[#2E2D28]";

  const wrapperClass =
    iconWrapperClass ??
    "border-[#3D3C36] bg-[#24231F] group-hover:border-[#4CAF6E]/40";

  const inner = (
    <>
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${wrapperClass}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[12px] font-semibold text-[#E8E4DD]">
          {title}
          {external && (
            <ArrowUpRight className="h-3 w-3 text-[#C4C0B6] group-hover:text-[#4CAF6E]" />
          )}
        </span>
        <span className="mt-0.5 block truncate text-[11px] leading-snug text-[#C4C0B6]">
          {description}
        </span>
      </span>
    </>
  );

  if (external) {
    return (
      <a
        href={href}
        target={href.startsWith("mailto:") ? undefined : "_blank"}
        rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
        className={className}
        onClick={onClick}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} prefetch className={className} onClick={onClick}>
      {inner}
    </Link>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-white" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function ClaudeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="#FFFFFF" aria-hidden="true">
      <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.694-.073-2.337-.097-2.265-.122-.571-.121L0 11.795l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.146-.103.018-.072-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.139.08-.674 7.254-.316.37-.728.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" />
    </svg>
  );
}
