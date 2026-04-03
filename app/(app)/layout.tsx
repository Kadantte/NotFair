'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Home, LayoutDashboard, Activity, PanelLeftClose, PanelLeftOpen, Plus, Trash2, PlugZap, MessageSquare, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignOutButton } from '@/components/sign-out-button';
import { AccountSwitcher } from '@/components/account-switcher';
import { dispatchThreadEvent } from '@/lib/thread-events';
import { getChatSidebarServerSnapshot, getChatSidebarSnapshot, setStoredActiveThreadId, subscribeChatSidebar } from '@/lib/chat-thread-store';

import { DEV_EMAILS } from '@/lib/dev-access';

const COLLAPSED_KEY = 'sidebar_collapsed';

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getCollapsedSnapshot() {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
}

function subscribeCollapsed(callback: () => void) {
    const handleStorage = (event: StorageEvent) => {
        if (!event.key || event.key === COLLAPSED_KEY) callback();
    };
    const handleSidebar = () => callback();

    window.addEventListener('storage', handleStorage);
    window.addEventListener('adsagent:sidebar-collapsed', handleSidebar);

    return () => {
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener('adsagent:sidebar-collapsed', handleSidebar);
    };
}

function subscribeHydration() {
    return () => {};
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
    const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
    const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsedSnapshot, () => false);
    const { threads, activeThreadId } = useSyncExternalStore(
        subscribeChatSidebar,
        getChatSidebarSnapshot,
        getChatSidebarServerSnapshot,
    );
    const isOnChat = pathname === '/chat';
    const [isDev, setIsDev] = useState(false);

    useEffect(() => {
        fetch('/api/auth/session', { credentials: 'include' })
            .then(r => r.json())
            .then(s => { if (s.connected && s.googleEmail && DEV_EMAILS.includes(s.googleEmail)) setIsDev(true); })
            .catch(() => {});
    }, []);

    function toggleCollapsed() {
        localStorage.setItem(COLLAPSED_KEY, String(!collapsed));
        window.dispatchEvent(new Event('adsagent:sidebar-collapsed'));
    }

    function handleNewChat() {
        if (isOnChat) {
            dispatchThreadEvent('create');
        } else {
            router.push('/chat');
        }
    }

    function handleSelectThread(threadId: string) {
        if (isOnChat) {
            dispatchThreadEvent('select', threadId);
        } else {
            setStoredActiveThreadId(threadId);
            router.push('/chat');
        }
    }

    return (
        <div className="flex h-full bg-[#1A1917]">
            <aside
                className={`relative z-10 flex h-full shrink-0 flex-col border-r border-[#3D3C36] bg-[#24231F] transition-[width] duration-300 ease-out ${
                    collapsed ? 'w-[60px]' : 'w-[240px]'
                }`}
            >
                {/* Header */}
                <div className={`flex h-14 shrink-0 items-center px-2 ${collapsed ? 'justify-center' : 'justify-between'}`}>
                    {!collapsed && (
                        <Link
                            href="/"
                            className="flex items-center rounded-lg px-3 py-1 transition hover:bg-[#E8E4DD]/5"
                        >
                            <Image src="/logo.svg" alt="AdsAgent" width={18} height={18} className="shrink-0" />
                            <span className="ml-3 text-[13px] font-semibold text-[#E8E4DD] tracking-tight">AdsAgent</span>
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

                {/* Account switcher */}
                <AccountSwitcher collapsed={collapsed} />

                {/* Nav items */}
                <nav className="shrink-0 px-2 pb-2 space-y-0.5">
                    <NavItem href="/dashboard" icon={Home} label="Dashboard" active={pathname === '/dashboard'} collapsed={collapsed} />
                    <NavItem href="/campaigns" icon={LayoutDashboard} label="Campaigns" active={pathname.startsWith('/campaigns')} collapsed={collapsed} />
                    <NavItem href="/operations" icon={Activity} label="Operations" active={pathname === '/operations'} collapsed={collapsed} />
                    <NavItem href="/chat" icon={MessageSquare} label="Chat" active={pathname === '/chat'} collapsed={collapsed} />
                    {isDev && <NavItem href="/dev" icon={Code2} label="Dev" active={pathname === '/dev'} collapsed={collapsed} />}
                </nav>

                {isOnChat && (
                    <>
                        {/* New chat */}
                        <div className="shrink-0 px-2 pb-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={handleNewChat}
                                className={`h-9 rounded-lg px-3 text-[#9B9689] transition-all duration-200 ease-out hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD] ${
                                    collapsed ? 'mx-auto w-10 justify-center gap-0 px-0' : 'w-full justify-start'
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

                        {/* Divider */}
                        <div className="mx-3 shrink-0 border-t border-[#3D3C36]" />

                        {/* Thread list */}
                        {hydrated && !collapsed && threads.length > 0 && (
                            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                        {threads.map(thread => (
                            <div
                                key={thread.id}
                                className={`mb-0.5 rounded-lg transition ${
                                    isOnChat && thread.id === activeThreadId
                                        ? 'bg-[#E8E4DD]/5'
                                        : 'hover:bg-[#E8E4DD]/5'
                                }`}
                            >
                                <div className="flex items-start gap-1">
                                    <button
                                        type="button"
                                        onClick={() => handleSelectThread(thread.id)}
                                        className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left"
                                    >
                                        <div className="truncate text-[13px] font-medium text-[#E8E4DD]/80">
                                            {thread.title}
                                        </div>
                                        <div className="mt-0.5 text-[11px] text-[#9B9689]">
                                            {formatDate(thread.updatedAt)} · {thread.messageCount}m
                                        </div>
                                    </button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={() => dispatchThreadEvent('delete', thread.id)}
                                        className="mt-1.5 mr-1 shrink-0 rounded-lg text-[#9B9689] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD] [div:hover>&]:opacity-100"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                            </div>
                        )}
                    </>
                )}
                {collapsed && <div className="flex-1" />}
                {!collapsed && (!isOnChat || threads.length === 0) && <div className="flex-1" />}

                {/* Footer */}
                <div className="shrink-0 border-t border-[#3D3C36] p-2 space-y-0.5">
                    <NavItem href="/connect" icon={PlugZap} label="Connect" active={pathname === '/connect'} collapsed={collapsed} />
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
