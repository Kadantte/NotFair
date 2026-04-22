'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Home, LayoutDashboard, Activity, PanelLeftClose, PanelLeftOpen, Plus, Trash2, PlugZap, MessageSquare, Code2, Gauge, Menu, X, ClipboardCheck, Rocket, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/user-menu';
import { AccountSwitcher } from '@/components/account-switcher';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { onThreadEvent } from '@/lib/thread-events';
import { DiscordLink } from '@/components/discord-link';
import { FeedbackButton } from '@/components/feedback-modal';
import { ProductHuntBanner } from '@/components/product-hunt-banner';
import { trackEvent } from '@/lib/analytics';
import { getUsageSummaryAction } from '@/app/actions';

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
    onClick,
}: {
    href: string;
    icon: React.ElementType;
    label: string;
    active: boolean;
    collapsed: boolean;
    onClick?: () => void;
}) {
    return (
        <Link href={href} prefetch onClick={onClick}>
            <Button
                type="button"
                variant="ghost"
                className={`h-10 rounded-lg px-3 transition-all duration-200 ease-out hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD] ${
                    active
                        ? 'bg-[#4CAF6E]/12 text-[#4CAF6E] hover:bg-[#4CAF6E]/16 hover:text-[#4CAF6E]'
                        : 'text-[#C4C0B6]'
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
                active ? 'text-[#4CAF6E]' : 'text-[#C4C0B6]'
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
    const [plan, setPlan] = useState<string | null>(null);
    const isFree = plan === 'free';
    const planLoaded = plan !== null;
    const [usageExceeded, setUsageExceeded] = useState(false);
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

    useEffect(() => {
        fetch('/api/subscription', { credentials: 'include' })
            .then(r => (r.ok ? r.json() : null))
            .then(sub => setPlan(sub?.plan ?? 'free'))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (plan !== 'free') return;
        getUsageSummaryAction()
            .then(info => {
                const exceeded = !info.unlimited && info.remaining !== null && info.remaining <= 0;
                setUsageExceeded(exceeded);
            })
            .catch(() => {});
    }, [plan]);

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
                        className="rounded-lg text-[#C4C0B6] hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD]"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                ) : (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={toggleCollapsed}
                        className="rounded-lg text-[#C4C0B6] hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD]"
                    >
                        {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                    </Button>
                )}
            </div>

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
                            className={`h-9 rounded-lg px-3 text-[#C4C0B6] transition-all duration-200 ease-out hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD] ${
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
                                    <div className="mt-0.5 text-[11px] text-[#C4C0B6]">
                                        {formatDate(thread.updatedAt)}
                                    </div>
                                </button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const deletedId = thread.id;
                                        const wasViewing = pathname === `/chat/${deletedId}`;

                                        // 1. Optimistic removal + snapshot for rollback
                                        let snapshot: typeof sidebarThreads = [];
                                        let deletedIndex = -1;
                                        setSidebarThreads(prev => {
                                            snapshot = prev;
                                            deletedIndex = prev.findIndex(t => t.id === deletedId);
                                            return prev.filter(t => t.id !== deletedId);
                                        });

                                        // 2. Navigate to neighbor synchronously if viewing the deleted thread
                                        if (wasViewing) {
                                            const remaining = snapshot.filter(t => t.id !== deletedId);
                                            const nextThread = remaining[deletedIndex] ?? remaining[deletedIndex - 1];
                                            router.push(nextThread ? `/chat/${nextThread.id}` : '/chat');
                                        }

                                        // 3. Fire DELETE; on failure, re-insert at original position
                                        fetch('/api/chat/threads', {
                                            method: 'DELETE',
                                            credentials: 'include',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ threadId: deletedId }),
                                        })
                                            .then(r => {
                                                if (!r.ok) throw new Error(`delete failed: ${r.status}`);
                                            })
                                            .catch(err => {
                                                console.error('Failed to delete thread', err);
                                                setSidebarThreads(snapshot);
                                            });
                                    }}
                                    className="mt-1.5 mr-1 shrink-0 rounded-lg text-[#C4C0B6] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD] [div:hover>&]:opacity-100"
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
                <NavItem
                    href="/upgrade"
                    icon={Rocket}
                    label={isFree ? 'Upgrade' : 'Pricing'}
                    active={pathname === '/upgrade'}
                    collapsed={isCollapsed}
                    onClick={() => trackEvent('upgrade_clicked', { location: 'sidebar', page: pathname })}
                />
                {isDev && <NavItem href="/dev" icon={Code2} label="Dev" active={pathname === '/dev'} collapsed={isCollapsed} />}
                <DiscordLink
                    location="sidebar"
                    className={`flex h-10 items-center rounded-lg px-3 transition-all duration-200 ease-out text-[#8B9FF5] hover:bg-[#8B9FF5]/10 hover:text-[#B0BFF9] ${isCollapsed ? 'w-10 justify-center gap-0 px-0' : 'w-full justify-start'}`}
                    iconClassName="h-[18px] w-[18px] shrink-0 fill-current"
                >
                    <span
                        className={`overflow-hidden whitespace-nowrap text-[14px] font-medium transition-all duration-200 ease-out ${
                            isCollapsed ? 'max-w-0 opacity-0' : 'ml-3 max-w-32 opacity-100'
                        }`}
                    >
                        Join Discord
                    </span>
                </DiscordLink>
            </div>
        </>
    ); }

    return (
        <div className="flex h-full flex-col bg-[#1A1917]">
            <ProductHuntBanner surface="app" isAuthenticated={true} />
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
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
                    className="rounded-lg text-[#C4C0B6] hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD]"
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
            <div className="relative z-10 flex min-w-0 flex-1 flex-col">
                {/* Top header bar — fixed, does not scroll */}
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#3D3C36] bg-[#24231F] px-5">
                    <div className="flex items-center gap-2.5">
                        <AccountSwitcher collapsed={false} />
                        {planLoaded && (
                            <span className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold tracking-wide ${
                                isFree
                                    ? 'bg-[#E8E4DD]/8 text-[#C4C0B6]'
                                    : 'bg-[#4CAF6E]/15 text-[#4CAF6E]'
                            }`}>
                                {plan.charAt(0).toUpperCase() + plan.slice(1)}
                            </span>
                        )}
                        {planLoaded && isFree && usageExceeded && (
                            <Link
                                href="/upgrade"
                                prefetch
                                onClick={() => trackEvent('upgrade_clicked', { location: 'usage_exceeded_badge', page: pathname })}
                                className="group hidden lg:inline-flex items-center gap-2 rounded-md border border-[#C45D4A] bg-[#C45D4A] px-3 py-1.5 text-[13px] font-semibold text-white shadow-[0_0_0_3px_rgba(196,93,74,0.18)] transition-all hover:bg-[#B54E3D] hover:shadow-[0_0_0_4px_rgba(196,93,74,0.28)]"
                                aria-label="Monthly usage limit reached — upgrade to Growth for unlimited operations"
                            >
                                <span className="relative flex h-2 w-2 shrink-0">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                                </span>
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                <span>Monthly usage limit reached — upgrade to get unlimited access</span>
                                <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                            </Link>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <FeedbackButton />
                        {planLoaded && isFree && (
                            <Link href="/upgrade" prefetch onClick={() => trackEvent('upgrade_clicked', { location: 'header', page: pathname })}>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-8 rounded-md px-4 text-[13px] font-semibold text-[#1A1917] bg-[#4CAF6E] hover:bg-[#3D9A5C] hover:text-[#1A1917]"
                                >
                                    Upgrade
                                </Button>
                            </Link>
                        )}
                        <UserMenu isCollapsed={false} />
                    </div>
                </div>
                {/* Usage-exceeded banner — shown below the header on < lg screens where the inline pill is hidden */}
                {planLoaded && isFree && usageExceeded && (
                    <Link
                        href="/upgrade"
                        prefetch
                        onClick={() => trackEvent('upgrade_clicked', { location: 'usage_exceeded_banner', page: pathname })}
                        className="group flex shrink-0 items-center justify-center gap-2 border-b border-[#C45D4A]/60 bg-[#C45D4A] px-4 py-2 text-center text-[13px] font-semibold text-white transition-colors hover:bg-[#B54E3D] lg:hidden"
                        aria-label="Monthly usage limit reached — upgrade to Growth for unlimited operations"
                    >
                        <span className="relative flex h-2 w-2 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                        </span>
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span className="hidden sm:inline">
                            Monthly usage limit reached — upgrade to get unlimited access
                        </span>
                        <span className="sm:hidden">Monthly limit reached — upgrade</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                    </Link>
                )}
                {/* Scrollable content area */}
                <div className="flex-1 overflow-y-auto">
                    <ImpersonationBanner />
                    {children}
                </div>
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
        </div>
    );
}
