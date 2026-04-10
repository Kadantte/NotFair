"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Mail, Calendar, MessageCircle, ArrowUpRight, X } from "lucide-react";

const EMAIL = "tong.chen@adsagent.org";
const BOOK_DEMO_URL = "https://cal.com/tong-chen-uuovdl/30min";
const CONNECTOR_URL = "/connect/claude-connector";
const STORAGE_KEY = "audit-help-panel-collapsed";

export function AuditHelpPanel({ onChatClick }: { onChatClick: () => void }) {
  const [collapsed, setCollapsed] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) setCollapsed(stored === "1");
      else setCollapsed(false);
    } catch {
      setCollapsed(false);
    }
    setHydrated(true);
  }, []);

  function toggle(next: boolean) {
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
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
          className="rounded p-1 text-[#9B9689] transition hover:bg-[#2E2D28] hover:text-[#E8E4DD]"
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
        />
        <HelpItem
          href={BOOK_DEMO_URL}
          icon={<Calendar className="h-3.5 w-3.5 text-[#4CAF6E]" />}
          title="Book a demo"
          description="30-min call to walk through your account."
          external
        />
        <button
          type="button"
          onClick={onChatClick}
          className="group flex w-full items-start gap-3 rounded-md border border-[#3D3C36] bg-[#1A1917] p-3 text-left transition hover:border-[#4CAF6E]/50 hover:bg-[#2E2D28]"
        >
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#3D3C36] bg-[#24231F] group-hover:border-[#4CAF6E]/40">
            <MessageCircle className="h-3.5 w-3.5 text-[#4CAF6E]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold text-[#E8E4DD]">
              Chat with our Agentic AI
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-[#9B9689]">
              Ask questions about this audit and get instant answers.
            </span>
          </span>
        </button>
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
}: {
  href: string;
  icon: React.ReactNode;
  iconWrapperClass?: string;
  title: string;
  description: string;
  external: boolean;
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
            <ArrowUpRight className="h-3 w-3 text-[#9B9689] group-hover:text-[#4CAF6E]" />
          )}
        </span>
        <span className="mt-0.5 block truncate text-[11px] leading-snug text-[#9B9689]">
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
      >
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} prefetch className={className}>
      {inner}
    </Link>
  );
}

function ClaudeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="#FFFFFF" aria-hidden="true">
      <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.694-.073-2.337-.097-2.265-.122-.571-.121L0 11.795l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.146-.103.018-.072-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.139.08-.674 7.254-.316.37-.728.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" />
    </svg>
  );
}
