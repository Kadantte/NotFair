'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { LayoutDashboard, Activity, PanelLeftClose, PanelLeftOpen, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignOutButton } from '@/components/sign-out-button';
import { ACTIVE_CHAT_THREAD_KEY, CHAT_HISTORY_KEY } from '@/lib/chat-history';

type Thread = { id: string; title: string; updatedAt: string; messageCount: number };

const COLLAPSED_KEY = 'sidebar_collapsed';

function loadThreads(): Thread[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) ?? '[]');
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((t: unknown): t is Thread => !!t && typeof (t as Thread).id === 'string')
            .map(t => ({
                id: t.id,
                title: t.title,
                updatedAt: t.updatedAt ?? new Date().toISOString(),
                messageCount: t.messageCount ?? 0,
            }))
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch {
        return [];
    }
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function NavItem({
    href,
    icon: Icon,
    label,
    active,
    collapsed,
}: {
    href: string;
    icon: React.ElementType;
    label: string;
    active: boolean;
    collapsed: boolean;
}) {
    return (
        <Link href={href} prefetch>
            <Button
                type="button"
                variant="ghost"
                className={`h-10 rounded-lg px-3 transition-all duration-200 ease-out hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD] ${
                    active
                        ? 'bg-[#4CAF6E]/12 text-[#4CAF6E] hover:bg-[#4CAF6E]/16 hover:text-[#4CAF6E]'
                        : 'text-[#9B9689]'
                } ${collapsed ? 'w-10 justify-center gap-0 px-0' : 'w-full justify-start'}`}
            >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span
                    className={`overflow-hidden whitespace-nowrap text-[14px] font-medium transition-all duration-200 ease-out ${
                        collapsed ? 'max-w-0 opacity-0' : 'ml-3 max-w-32 opacity-100'
                    }`}
                >
                    {label}
                </span>
            </Button>
        </Link>
    );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);
    const [threads, setThreads] = useState<Thread[]>([]);

    useEffect(() => {
        const stored = localStorage.getItem(COLLAPSED_KEY);
        if (stored !== null) setCollapsed(stored === 'true');
        setThreads(loadThreads());
    }, []);

    function toggleCollapsed() {
        setCollapsed(c => {
            localStorage.setItem(COLLAPSED_KEY, String(!c));
            return !c;
        });
    }

    return (
        <div className="flex h-full bg-[#1A1917]">
            <aside
                className={`relative z-10 flex h-full shrink-0 flex-col border-r border-[#3D3C36] bg-[#24231F] transition-[width] duration-300 ease-out ${
                    collapsed ? 'w-[60px]' : 'w-[240px]'
                }`}
            >
                {/* Header */}
                <div className={`flex h-14 shrink-0 items-center px-3 ${collapsed ? 'justify-center' : 'justify-between'}`}>
                    {!collapsed && (
                        <Link
                            href="/"
                            className="flex items-center gap-2.5 rounded-lg px-1 py-1 transition hover:bg-[#E8E4DD]/5"
                        >
                            <Image src="/logo.svg" alt="AdsAgent" width={22} height={22} />
                            <span className="text-[13px] font-semibold text-[#E8E4DD] tracking-tight">AdsAgent</span>
                        </Link>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={toggleCollapsed}
                        className="rounded-lg text-[#9B9689] hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD]"
                    >
                        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                    </Button>
                </div>

                {/* New chat */}
                <div className="shrink-0 px-2 pb-1">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => router.push('/chat')}
                        className={`h-9 rounded-lg px-3 text-[#9B9689] transition-all duration-200 ease-out hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD] ${
                            collapsed ? 'w-10 justify-center gap-0 px-0 mx-auto' : 'w-full justify-start'
                        }`}
                    >
                        <Plus className="h-4 w-4 shrink-0" />
                        <span
                            className={`overflow-hidden whitespace-nowrap text-[13px] transition-all duration-200 ease-out ${
                                collapsed ? 'max-w-0 opacity-0' : 'ml-2.5 max-w-32 opacity-100'
                            }`}
                        >
                            New chat
                        </span>
                    </Button>
                </div>

                {/* Nav items */}
                <nav className="shrink-0 px-2 pb-2 space-y-0.5">
                    <NavItem href="/campaigns" icon={LayoutDashboard} label="Campaigns" active={pathname.startsWith('/campaigns')} collapsed={collapsed} />
                    <NavItem href="/operations" icon={Activity} label="Operations" active={pathname === '/operations'} collapsed={collapsed} />
                </nav>

                {/* Divider */}
                <div className="mx-3 shrink-0 border-t border-[#3D3C36]" />

                {/* Thread list */}
                {!collapsed && threads.length > 0 && (
                    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                        {threads.map(thread => (
                            <button
                                key={thread.id}
                                type="button"
                                onClick={() => {
                                    localStorage.setItem(ACTIVE_CHAT_THREAD_KEY, thread.id);
                                    router.push('/chat');
                                }}
                                className="w-full rounded-lg px-3 py-2 text-left transition hover:bg-[#E8E4DD]/5"
                            >
                                <div className="truncate text-[13px] font-medium text-[#E8E4DD]/80">
                                    {thread.title}
                                </div>
                                <div className="mt-0.5 text-[11px] text-[#9B9689]">
                                    {formatDate(thread.updatedAt)} · {thread.messageCount}m
                                </div>
                            </button>
                        ))}
                    </div>
                )}
                {collapsed && <div className="flex-1" />}

                {/* Footer */}
                <div className="shrink-0 border-t border-[#3D3C36] p-2">
                    <SignOutButton isCollapsed={collapsed} />
                </div>
            </aside>

            {/* Content */}
            <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
                {children}
            </div>
        </div>
    );
}
