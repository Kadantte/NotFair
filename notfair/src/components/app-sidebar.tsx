import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { SidebarBrand } from "@/components/sidebar-brand";
import { BookOpen, Plug, Settings, Target, type LucideIcon } from "lucide-react";
import { listProjects } from "@/server/db/projects";
import { getActiveProject } from "@/server/active-project";
import { listProjectAgents } from "@/server/agent-meta";
import { getGoalForAgent, getLatestGoalForAgent, type GoalStatus } from "@/server/db/goals";
import { colorForAgentSlug } from "@/lib/agent-colors";
import { readHarnessUsage } from "@/server/harness-usage";
import { projectHref } from "@/lib/project-href";
import { cn } from "@/lib/utils";
import { goalLabel } from "@/lib/goal-label";
import { ProjectSwitcher } from "./project-switcher";
import { HarnessFooter } from "./harness-footer";
import { SidebarVersion } from "./sidebar-version";
import { ThemeToggle } from "./theme-toggle";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const NAV: NavItem[] = [
  { href: "/context", label: "Shared context", icon: BookOpen },
  { href: "/connections", label: "Connections", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Compact status dot per goal state — the sidebar's only status signal. */
const GOAL_DOT: Record<GoalStatus, string> = {
  intake: "ns-dot-warn",
  proposed: "ns-dot-warn",
  active: "ns-dot-live",
  paused: "ns-dot-mute",
  achieved: "ns-dot-on",
  failed: "ns-dot-err",
  killed: "ns-dot-mute",
};

export async function AppSidebar() {
  const projects = listProjects();
  const active = await getActiveProject();
  const agentEntries = active ? await listProjectAgents(active.slug) : [];
  // Best-effort fetch of harness usage. For Codex this hits the
  // chatgpt.com wham/usage endpoint (cached 60s in-process); for
  // Claude Code it just reads the local stats-cache. Either failure
  // mode collapses to a quieter chip.
  const harnessUsage = active
    ? await readHarnessUsage(active.harness_adapter)
    : null;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* Brand mark + project switcher. The mark doubles as the expand
            toggle when collapsed (SidebarBrand handles both modes);
            SidebarTrigger only renders in the expanded state so the icon
            rail isn't doubled up. */}
        <div className="flex items-center gap-1">
          <SidebarBrand homeHref={active ? projectHref(active.slug, "") : "/"} />
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <SidebarMenu>
              <SidebarMenuItem>
                <ProjectSwitcher
                  projects={projects}
                  activeSlug={active?.slug ?? null}
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
          <SidebarTrigger className="shrink-0 group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {active && (
          <SidebarGroup>
            <SidebarGroupLabel>Goals</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {agentEntries.map((a) => {
                  const goal = getGoalForAgent(a.agent_id) ?? getLatestGoalForAgent(a.agent_id);
                  const color = colorForAgentSlug(a.slug);
                  return (
                    <SidebarMenuItem key={a.agent_id}>
                      <SidebarMenuButton asChild>
                        <Link href={projectHref(active.slug, `/goals/${a.slug}`)}>
                          <span
                            className={cn("ns-dot", goal ? GOAL_DOT[goal.status] : "ns-dot-mute")}
                            aria-hidden
                          />
                          <span className={cn("truncate", color.label)}>
                            {goal ? goalLabel(goal) : a.name}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href={projectHref(active.slug, "")}>
                      <Target />
                      <span>New goal…</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {active && (
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map((item) => (
                  <SidebarMenuItem key={item.href || "home"}>
                    <SidebarMenuButton asChild>
                      <Link href={projectHref(active.slug, item.href)}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="px-3 py-2 group-data-[collapsible=icon]:hidden">
        {active && harnessUsage && (
          <HarnessFooter
            adapter={active.harness_adapter}
            usage={harnessUsage}
          />
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <SidebarVersion />
          </div>
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
