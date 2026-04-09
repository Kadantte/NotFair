'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Home, LayoutDashboard, Activity, PanelLeftClose, PanelLeftOpen, Plus, Trash2, PlugZap, MessageSquare, Code2, Gauge, Menu, X, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignOutButton } from '@/components/sign-out-button';
import { AccountSwitcher } from '@/components/account-switcher';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { onThreadEvent } from '@/lib/thread-events';

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

const noopUnsubscribe = () => {};
function subscribeHydration() {
    return noopUnsubscribe;
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

function MobileNavItem({
    href,
    icon: Icon,
    label,
    active,
}: {
    href: string;
    icon: React.ElementType;
    label: string;
    active: boolean;
}) {
    return (
        <Link
            href={href}
            prefetch
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                active ? 'text-[#4CAF6E]' : 'text-[#9B9689]'
            }`}
        >
            <Icon className="h-[18px] w-[18px]" />
            <span>{label}</span>
        </Link>
    );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
    const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsedSnapshot, () => false);
    const [sidebarThreads, setSidebarThreads] = useState<{ id: string; title: string; updatedAt: string }[]>([]);
    const isOnChat = pathname.startsWith('/chat');
    const [isDev, setIsDev] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const refreshThreads = useCallback(() => {
        fetch('/api/chat/threads', { credentials: 'include' })
            .then(r => r.json())
            .then(({ threads }) => {
                if (threads) setSidebarThreads(threads.map((t: { id: string; title: string | null; updatedAt: string }) => ({
                    id: t.id,
                    title: t.title ?? 'New chat',
                    updatedAt: t.updatedAt,
                })));
            })
            .catch(() => {});
    }, []);

    // Fetch threads on mount and when "refresh" event fires
    useEffect(() => {
        refreshThreads();
        const unsub = onThreadEvent('refresh', () => refreshThreads());
        return unsub;
    }, [refreshThreads]);

    // Close mobile menu on navigation
    useEffect(() => {
        setMobileMenuOpen(false);
    }, [pathname]);

    // Lock body scroll and handle Escape key when mobile menu is open
    useEffect(() => {
        if (!mobileMenuOpen) return;
        document.body.style.overflow = 'hidden';
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileMenuOpen(false); };
        document.addEventListener('keydown', handleKey);
        return () => {
            document.body.style.overflow = '';
            document.removeEventListener('keydown', handleKey);
        };
    }, [mobileMenuOpen]);

    useEffect(() => {
        fetch('/api/auth/session', { credentials: 'include' })
            .then(r => r.json())
            .then(s => { if (s.connected && s.isDev) setIsDev(true); })
            .catch(() => {});
    }, []);

    function toggleCollapsed() {
        localStorage.setItem(COLLAPSED_KEY, String(!collapsed));
        window.dispatchEvent(new Event('adsagent:sidebar-collapsed'));
    }

    function handleNewChat() {
        const newId = crypto.randomUUID();
        setSidebarThreads(prev => [{
            id: newId,
            title: 'New chat',
            updatedAt: new Date().toISOString(),
        }, ...prev]);
        router.push(`/chat/${newId}`);
    }

    function handleSelectThread(threadId: string) {
        router.push(`/chat/${threadId}`);
    }

    function renderSidebar(isCollapsed: boolean, isMobile: boolean) { return (
        <>
            {/* Header */}
            <div className={`flex h-14 shrink-0 items-center px-2 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                {!isCollapsed && (
                    <Link
                        href="/"
                        className="flex items-center rounded-lg px-3 py-1 transition hover:bg-[#E8E4DD]/5"
                    >
                        <Image src="/logo.svg" alt="AdsAgent" width={18} height={18} className="shrink-0" />
                        <span className="ml-3 text-[13px] font-semibold text-[#E8E4DD] tracking-tight">AdsAgent</span>
                    </Link>
                )}
                {isMobile ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setMobileMenuOpen(false)}
                        className="rounded-lg text-[#9B9689] hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD]"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                ) : (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={toggleCollapsed}
                        className="rounded-lg text-[#9B9689] hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD]"
                    >
                        {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                    </Button>
                )}
            </div>

            {/* Account switcher */}
            <AccountSwitcher collapsed={isCollapsed} />

            {/* Nav items */}
            <nav className="shrink-0 px-2 pb-2 space-y-0.5">
                <NavItem href="/campaigns" icon={LayoutDashboard} label="Campaigns" active={pathname.startsWith('/campaigns')} collapsed={isCollapsed} />
                <NavItem href="/audit" icon={ClipboardCheck} label="Audit" active={pathname === '/audit'} collapsed={isCollapsed} />
                <NavItem href="/operations" icon={Activity} label="Operations" active={pathname === '/operations'} collapsed={isCollapsed} />
                <NavItem href="/chat" icon={MessageSquare} label="Chat" active={pathname.startsWith('/chat')} collapsed={isCollapsed} />
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
                                isCollapsed ? 'mx-auto w-10 justify-center gap-0 px-0' : 'w-full justify-start'
                            }`}
                        >
                            <Plus className="h-4 w-4 shrink-0" />
                            <span
                                className={`overflow-hidden whitespace-nowrap text-[13px] transition-all duration-200 ease-out ${
                                    isCollapsed ? 'max-w-0 opacity-0' : 'ml-2.5 max-w-32 opacity-100'
                                }`}
                            >
                                New chat
                            </span>
                        </Button>
                    </div>

                    {/* Divider */}
                    <div className="mx-3 shrink-0 border-t border-[#3D3C36]" />

                    {/* Thread list */}
                    {hydrated && !isCollapsed && sidebarThreads.length > 0 && (
                        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                    {sidebarThreads.map(thread => {
                        const isActive = pathname === `/chat/${thread.id}`;
                        return (
                        <div
                            key={thread.id}
                            className={`mb-0.5 rounded-lg transition ${isActive ? 'bg-[#E8E4DD]/5' : 'hover:bg-[#E8E4DD]/5'}`}
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
                                        {formatDate(thread.updatedAt)}
                                    </div>
                                </button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => {
                                        fetch('/api/chat/threads', {
                                            method: 'DELETE',
                                            credentials: 'include',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ threadId: thread.id }),
                                        })
                                            .then(() => {
                                                refreshThreads();
                                                // If we're viewing the deleted thread, navigate away
                                                if (pathname === `/chat/${thread.id}`) {
                                                    router.push('/chat');
                                                }
                                            })
                                            .catch(() => {});
                                    }}
                                    className="mt-1.5 mr-1 shrink-0 rounded-lg text-[#9B9689] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD] [div:hover>&]:opacity-100"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                        );
                    })}
                        </div>
                    )}
                </>
            )}
            {(isCollapsed || !isOnChat || sidebarThreads.length === 0) && <div className="flex-1" />}

            {/* Footer */}
            <div className="shrink-0 border-t border-[#3D3C36] p-2 space-y-0.5">
                <NavItem href="/connect" icon={PlugZap} label="Connect Claude" active={pathname === '/connect'} collapsed={isCollapsed} />
                <NavItem href="/usage" icon={Gauge} label="Usage" active={pathname === '/usage'} collapsed={isCollapsed} />
                {isDev && <NavItem href="/dev" icon={Code2} label="Dev" active={pathname === '/dev'} collapsed={isCollapsed} />}
                <SignOutButton isCollapsed={isCollapsed} />
            </div>
        </>
    ); }

    return (
        <div className="flex h-full flex-col md:flex-row bg-[#1A1917]">
            {/* Mobile header */}
            <header className="flex md:hidden h-12 shrink-0 items-center justify-between border-b border-[#3D3C36] bg-[#24231F] px-4">
                <Link href="/" className="flex items-center gap-2">
                    <Image src="/logo.svg" alt="AdsAgent" width={16} height={16} />
                    <span className="text-[13px] font-semibold text-[#E8E4DD] tracking-tight">AdsAgent</span>
                </Link>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setMobileMenuOpen(true)}
                    className="rounded-lg text-[#9B9689] hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD]"
                >
                    <Menu className="h-5 w-5" />
                </Button>
            </header>

            {/* Mobile sidebar overlay */}
            {mobileMenuOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40 bg-black/60 md:hidden"
                        onClick={() => setMobileMenuOpen(false)}
                    />
                    <aside className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-[#3D3C36] bg-[#24231F] md:hidden">
                        {renderSidebar(false, true)}
                    </aside>
                </>
            )}

            {/* Desktop sidebar */}
            <aside
                className={`relative z-10 hidden md:flex h-full shrink-0 flex-col border-r border-[#3D3C36] bg-[#24231F] transition-[width] duration-300 ease-out ${
                    collapsed ? 'w-[60px]' : 'w-[240px]'
                }`}
            >
                {renderSidebar(collapsed, false)}
            </aside>

            {/* Content */}
            <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-y-auto">
                <ImpersonationBanner />
                {children}
            </div>

            {/* Mobile bottom navigation */}
            <nav className="flex md:hidden shrink-0 border-t border-[#3D3C36] bg-[#24231F]">
                <MobileNavItem href="/dashboard" icon={Home} label="Home" active={pathname === '/dashboard'} />
                <MobileNavItem href="/campaigns" icon={LayoutDashboard} label="Campaigns" active={pathname.startsWith('/campaigns')} />
                <MobileNavItem href="/audit" icon={ClipboardCheck} label="Audit" active={pathname === '/audit'} />
                <MobileNavItem href="/operations" icon={Activity} label="Ops" active={pathname === '/operations'} />
                <MobileNavItem href="/chat" icon={MessageSquare} label="Chat" active={pathname.startsWith('/chat')} />
            </nav>
        </div>
    );
}
