"use client";

import Image from "next/image";
import Link from "next/link";
import {
  LayoutDashboard,
  Activity,
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
  currentPath: "/chat" | "/campaigns" | "/operations";
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
    <aside className="border-b border-[#3D3C36] bg-[#24231F] transition-all duration-300 ease-out lg:border-b-0 lg:border-r lg:border-r-[#3D3C36]">
      <div className="flex h-full flex-col">
        <div className="shrink-0">
          <div
            className={`flex h-14 shrink-0 items-center px-3 ${
              isCollapsed ? "justify-center" : "justify-between"
            }`}
          >
            {!isCollapsed && (
              <Link
                href="/"
                className="inline-flex items-center rounded-lg px-1 py-1 transition hover:bg-[#E8E4DD]/5"
              >
                <Image src="/logo.svg" alt="AdsAgent" width={24} height={24} />
                <span className="ml-2.5 text-[13px] font-semibold text-[#E8E4DD] tracking-tight">AdsAgent</span>
              </Link>
            )}

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onToggleCollapsed}
              className="rounded-lg text-[#9B9689] transition-all duration-300 ease-out hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD]"
            >
              {isCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div
            className={`px-2 space-y-0.5 ${isCollapsed ? "flex flex-col items-center" : ""}`}
          >
            {onCreateThread ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onCreateThread}
                className={`h-10 rounded-lg px-3 text-[#9B9689] transition-all duration-200 ease-out hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD] ${
                  isCollapsed
                    ? "w-10 justify-center gap-0 self-center px-0"
                    : "w-full justify-start"
                }`}
              >
                <Plus className="h-[18px] w-[18px] shrink-0" />
                <span
                  className={`overflow-hidden whitespace-nowrap text-[14px] font-medium transition-all duration-200 ease-out ${
                    isCollapsed ? "max-w-0 opacity-0" : "ml-3 max-w-32 opacity-100"
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
                className={`h-10 rounded-lg px-3 transition-all duration-200 ease-out hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD] ${
                  currentPath === "/campaigns"
                    ? "bg-[#4CAF6E]/12 text-[#4CAF6E] hover:bg-[#4CAF6E]/16 hover:text-[#4CAF6E]"
                    : "text-[#9B9689]"
                } ${isCollapsed ? "w-10 justify-center gap-0 px-0" : "w-full justify-start"}`}
              >
                <LayoutDashboard className="h-[18px] w-[18px] shrink-0" />
                <span
                  className={`overflow-hidden whitespace-nowrap text-[14px] font-medium transition-all duration-200 ease-out ${
                    isCollapsed ? "max-w-0 opacity-0" : "ml-3 max-w-32 opacity-100"
                  }`}
                >
                  Campaigns
                </span>
              </Button>
            </Link>

            <Link href="/operations">
              <Button
                type="button"
                variant="ghost"
                className={`h-10 rounded-lg px-3 transition-all duration-200 ease-out hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD] ${
                  currentPath === "/operations"
                    ? "bg-[#4CAF6E]/12 text-[#4CAF6E] hover:bg-[#4CAF6E]/16 hover:text-[#4CAF6E]"
                    : "text-[#9B9689]"
                } ${isCollapsed ? "w-10 justify-center gap-0 px-0" : "w-full justify-start"}`}
              >
                <Activity className="h-[18px] w-[18px] shrink-0" />
                <span
                  className={`overflow-hidden whitespace-nowrap text-[14px] font-medium transition-all duration-200 ease-out ${
                    isCollapsed ? "max-w-0 opacity-0" : "ml-3 max-w-32 opacity-100"
                  }`}
                >
                  Operations
                </span>
              </Button>
            </Link>
          </div>
        </div>

        {threads.length > 0 ? (
          <div
            className={`min-h-0 flex-1 overflow-y-auto px-2 pb-4 transition-opacity duration-200 ${
              isCollapsed ? "hidden" : "block"
            }`}
          >
            <div className="mx-1 mb-2 border-t border-[#3D3C36]" />
            {threads.map(thread => (
              <div
                key={thread.id}
                className={`mb-0.5 rounded-lg transition ${
                  thread.id === activeThreadId ? "bg-[#E8E4DD]/5" : "bg-transparent hover:bg-[#E8E4DD]/5"
                }`}
              >
                <div className="flex items-start gap-2 px-3 py-2 transition-all duration-200 ease-out">
                  <button
                    type="button"
                    onClick={() => onSelectThread?.(thread.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-[13px] font-medium text-[#E8E4DD]/80">
                      {thread.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#9B9689]">
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
                      className="shrink-0 rounded-lg text-[#9B9689] hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className={`shrink-0 border-t border-[#3D3C36] p-3 ${isCollapsed ? "flex justify-center" : ""}`}>
          <SignOutButton isCollapsed={isCollapsed} />
        </div>
      </div>
    </aside>
  );
}
