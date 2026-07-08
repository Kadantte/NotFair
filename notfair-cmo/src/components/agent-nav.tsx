"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { AgentTemplateKey } from "@/server/agent-templates";
import { colorForRole } from "@/lib/agent-colors";
import { cn } from "@/lib/utils";
import { projectHref } from "@/lib/project-href";
import { AgentAvatar } from "./agent-avatar";
import { useLiveCounts } from "./live-counts-context";

type AgentNavEntry = {
  /** Stable key for React, e.g. the agent_id. */
  key: string;
  slug: string;
  /** Personal name shown as the primary sidebar label (e.g. "Greg"). */
  name: string;
  /** Role label for the pill next to the name (e.g. "CMO"). Undefined for
   *  cloned/custom agents that aren't backed by a template. */
  role_label?: string;
  description?: string;
  /** Filled for template agents; undefined for cloned/custom ones. */
  template_key?: AgentTemplateKey;
};

type Props = {
  projectSlug: string;
  agents: AgentNavEntry[];
  /**
   * Optional server-side initial map (agent_id → attention entry) used
   * for the first paint only. After mount, live values come from
   * LiveCountsContext so we don't re-render the parent server component
   * just to flip a number.
   */
  attention?: Record<string, { count: number; task_id: string | null }>;
};

export function AgentNav({ projectSlug, agents, attention = {} }: Props) {
  const pathname = usePathname();
  const live = useLiveCounts();
  const attentionByAgent = { ...attention, ...live.attention };

  return (
    <SidebarMenu>
      {agents.map((a) => {
        // Slack model: when the agent is blocked on the user, the row IS
        // the notification — red badge, and the click lands directly in
        // the decision space (the blocked task's page) instead of Chat.
        const agentAttention = attentionByAgent[a.key];
        const needsYou = (agentAttention?.count ?? 0) > 0;
        // Every agent lands on Chat by default — users start by talking to
        // the agent. Tasks tab (the audit/history view of filed work) is one
        // click away.
        const href = needsYou
          ? projectHref(
              projectSlug,
              `/agents/${a.slug}/tasks${
                agentAttention?.task_id
                  ? `?task=${encodeURIComponent(agentAttention.task_id)}`
                  : ""
              }`,
            )
          : projectHref(projectSlug, `/agents/${a.slug}/chat`);
        const agentBase = `/${projectSlug}/agents/${a.slug}`;
        const isActive =
          pathname === agentBase || pathname?.startsWith(`${agentBase}/`);
        const rolePalette = a.template_key ? colorForRole(a.template_key) : null;
        return (
          <SidebarMenuItem key={a.key}>
            <SidebarMenuButton asChild isActive={isActive}>
              <Link href={href}>
                {a.template_key ? (
                  <AgentAvatar role={a.template_key} size={20} />
                ) : (
                  <Bot />
                )}
                <span className="truncate">{a.name}</span>
                {a.role_label && rolePalette && (
                  <span
                    className={cn(
                      "ml-1 rounded-[4px] border px-1.5 py-[1px] text-[9.5px] font-medium uppercase tracking-wide leading-none",
                      rolePalette.chip,
                    )}
                  >
                    {a.role_label}
                  </span>
                )}
                {needsYou && (
                  <span
                    role="status"
                    aria-label={`${agentAttention!.count} waiting on your answer`}
                    className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[hsl(var(--destructive))] px-1 text-[10px] font-semibold tabular-nums leading-none text-white"
                  >
                    {agentAttention!.count}
                  </span>
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
