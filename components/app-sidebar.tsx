"use client";

import Image from "next/image";
import Link from "next/link";
import {
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";

export type SidebarThread = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

type AppSidebarProps = {
  currentPath: "/chat" | "/campaigns";
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onCreateThread?: () => void;
  threads?: SidebarThread[];
  activeThreadId?: string;
  onSelectThread?: (threadId: string) => void;
  onDeleteThread?: (threadId: string) => void;
};

function formatThreadTime(isoString: string): string {
  const date = new Date(isoString);

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function AppSidebar({
  currentPath,
  isCollapsed,
  onToggleCollapsed,
  onCreateThread,
  threads = [],
  activeThreadId,
  onSelectThread,
  onDeleteThread,
}: AppSidebarProps) {
  return (
    <aside className="border-b border-white/8 bg-[#171717] transition-all duration-300 ease-out lg:border-b-0 lg:border-r lg:border-r-white/8">
      <div className="flex h-screen flex-col">
        <div className="shrink-0 p-4">
          <div
            className={`group relative flex items-center transition-all duration-300 ease-out ${
              isCollapsed ? "justify-center" : "justify-between gap-2"
            }`}
          >
            <Link
              href="/"
              className={`inline-flex items-center rounded-xl px-1 py-1 transition ${
                isCollapsed ? "opacity-100 group-hover:opacity-0" : "hover:bg-white/5"
              }`}
            >
              <Image src="/logo.svg" alt="AdsAgent" width={24} height={24} />
            </Link>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onToggleCollapsed}
              className={`rounded-full text-zinc-400 transition-all duration-300 ease-out hover:bg-white/5 hover:text-white ${
                isCollapsed
                  ? "pointer-events-none absolute left-1/2 -translate-x-1/2 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
                  : ""
              }`}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div
            className={`mt-6 space-y-1 ${isCollapsed ? "flex flex-col items-center" : ""}`}
          >
            {onCreateThread ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onCreateThread}
                className={`h-12 rounded-2xl px-3 text-white transition-all duration-300 ease-out hover:bg-white/6 hover:text-white ${
                  isCollapsed
                    ? "w-12 justify-center gap-0 self-center px-0"
                    : "w-full justify-start"
                }`}
              >
                <Plus className="h-5 w-5" />
                <span
                  className={`overflow-hidden whitespace-nowrap text-[15px] transition-all duration-300 ease-out ${
                    isCollapsed ? "max-w-0 opacity-0" : "ml-4 max-w-32 opacity-100"
                  }`}
                >
                  New chat
                </span>
              </Button>
            ) : null}

            <Link href="/campaigns">
              <Button
                type="button"
                variant="ghost"
                className={`h-12 rounded-2xl px-3 text-white transition-all duration-300 ease-out hover:bg-white/6 hover:text-white ${
                  currentPath === "/campaigns" ? "bg-white/8" : ""
                } ${isCollapsed ? "w-12 justify-center gap-0 px-0" : "w-full justify-start"}`}
              >
                <LayoutDashboard className="h-5 w-5" />
                <span
                  className={`overflow-hidden whitespace-nowrap text-[15px] transition-all duration-300 ease-out ${
                    isCollapsed ? "max-w-0 opacity-0" : "ml-4 max-w-32 opacity-100"
                  }`}
                >
                  Campaigns
                </span>
              </Button>
            </Link>
          </div>
        </div>

        {threads.length > 0 ? (
          <div
            className={`min-h-0 flex-1 overflow-y-auto px-3 pb-4 transition-opacity duration-200 ${
              isCollapsed ? "hidden" : "block"
            }`}
          >
            {threads.map(thread => (
              <div
                key={thread.id}
                className={`mb-1 rounded-2xl transition ${
                  thread.id === activeThreadId ? "bg-white/8" : "bg-transparent hover:bg-white/[0.05]"
                }`}
              >
                <div className="flex min-h-12 items-start gap-2 p-3 transition-all duration-300 ease-out">
                  <button
                    type="button"
                    onClick={() => onSelectThread?.(thread.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-[14px] font-medium text-zinc-100">
                      {thread.title}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
                      <span>{formatThreadTime(thread.updatedAt)}</span>
                      <span>·</span>
                      <span>{thread.messageCount} messages</span>
                    </div>
                  </button>
                  {onDeleteThread ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={event => {
                        event.stopPropagation();
                        onDeleteThread(thread.id);
                      }}
                      className="shrink-0 rounded-full text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className={`shrink-0 border-t border-white/8 p-3 ${isCollapsed ? "flex justify-center" : ""}`}>
          <SignOutButton isCollapsed={isCollapsed} />
        </div>
      </div>
    </aside>
  );
}
