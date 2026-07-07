"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  FileText,
  Sparkles,
  Clock,
  Settings,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

// Chat leads — users start by talking to the agent; tasks materialize from
// that conversation. The Tasks tab is the audit/history view of work the
// agent (or its orchestrator) has filed, not a place to create work.
const TABS: Tab[] = [
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "tasks", label: "Tasks", icon: ListChecks },
  { key: "files", label: "Files", icon: FileText },
  { key: "skills", label: "Skills", icon: Sparkles },
  { key: "cron", label: "Cron", icon: Clock },
  { key: "settings", label: "Settings", icon: Settings },
];

export function AgentTabs({
  projectSlug,
  agentSlug,
}: {
  projectSlug: string;
  agentSlug: string;
}) {
  const pathname = usePathname();
  const base = `/${projectSlug}/agents/${agentSlug}`;

  return (
    <nav
      className="sticky top-0 z-20 flex items-center gap-1 bg-[hsl(var(--background)/0.82)] px-4 py-1.5 backdrop-blur-md"
      aria-label="Agent sections"
      style={{
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
      }}
    >
      {TABS.map(({ key, label, icon: Icon }) => {
        const href = `${base}/${key}`;
        const isActive =
          pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link
            key={key}
            href={href}
            className={cn(
              "relative flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[13px] font-medium tracking-tight transition-colors",
              isActive
                ? "bg-[hsl(var(--notfair-surface-2))] text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
