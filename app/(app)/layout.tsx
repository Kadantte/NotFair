'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Home, LayoutDashboard, Activity, PanelLeftClose, PanelLeftOpen, Plus, Trash2, PlugZap, MessageSquare, Code2, Gauge, Menu, X, ClipboardCheck, Rocket, AlertTriangle, ArrowRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/user-menu';
import { AccountSwitcher } from '@/components/account-switcher';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { DemoBanner } from '@/components/demo-banner';
import { onThreadEvent } from '@/lib/thread-events';
import { DiscordLink } from '@/components/discord-link';
import { FeedbackButton } from '@/components/feedback-modal';
import { BrandLockup } from '@/components/brand-lockup';
import { trackEvent } from '@/lib/analytics';
import { BRAND_NAME } from '@/lib/brand';
import { computePlanBadge } from '@/lib/plan-badge';

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
    const [authLoaded, setAuthLoaded] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [plan, setPlan] = useState<string | null>(null);
    const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
    const [inTrial, setInTrial] = useState(false);
    const planLoaded = plan !== null;
    const isFree = plan === 'free';
    const badge = computePlanBadge({
        plan,
        inTrial,
        trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null,
    });
    const trialDaysLeft = badge.kind === 'trial' ? badge.daysLeft : null;
    const trialExpired = badge.kind === 'trial_expired';
    const trialEndingSoon = badge.kind === 'trial' && badge.endingSoon;
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

    // Close mobile menu only when navigation changes the route.
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
            .then(s => {
                const connected = Boolean(s?.connected);
                setIsAuthenticated(connected);
                setIsDev(Boolean(connected && s?.isDev));
                if (!connected) {
                    setPlan(null);
                    setTrialEndsAt(null);
                    setInTrial(false);
                }
            })
            .catch(() => {
                setIsAuthenticated(false);
                setIsDev(false);
                setPlan(null);
                setTrialEndsAt(null);
                setInTrial(false);
            })
            .finally(() => setAuthLoaded(true));
    }, []);

    useEffect(() => {
        if (!authLoaded || !isAuthenticated) return;

        fetch('/api/subscription', { credentials: 'include' })
            .then(r => (r.ok ? r.json() : null))
            .then(sub => {
                setPlan(sub?.plan ?? 'free');
                setTrialEndsAt(sub?.trialEndsAt ?? null);
                setInTrial(Boolean(sub?.inTrial));
            })
            .catch(() => {
                setPlan('free');
                setTrialEndsAt(null);
                setInTrial(false);
            });
    }, [authLoaded, isAuthenticated]);

    function toggleCollapsed() {
        localStorage.setItem(COLLAPSED_KEY, String(!collapsed));
        window.dispatchEvent(new Event('adsagent:sidebar-collapsed'));
    }

    function handleNewChat() {
        setMobileMenuOpen(false);
        const newId = crypto.randomUUID();
        setSidebarThreads(prev => [{
            id: newId,
            title: 'New chat',
            updatedAt: new Date().toISOString(),
        }, ...prev]);
        router.push(`/chat/${newId}`);
    }

    function handleSelectThread(threadId: string) {
        setMobileMenuOpen(false);
        router.push(`/chat/${threadId}`);
    }

    function renderSidebar(isCollapsed: boolean, isMobile: boolean) { return (
        <>
            {/* Header */}
            <div className={`group/header flex h-14 shrink-0 items-center px-2 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                {!isCollapsed && (
                    <Link
                        href="/"
                        onClick={isMobile ? () => setMobileMenuOpen(false) : undefined}
                        className="flex items-center rounded-lg px-3 py-1 transition hover:bg-[#E8E4DD]/5"
                    >
                        <BrandLockup size="xs" />
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
                ) : isCollapsed ? (
                    <div className="relative h-8 w-8">
                        <Image
                            src="/notfiar_logo/notfair-mark-dark.svg"
                            alt={BRAND_NAME}
                            width={20}
                            height={20}
                            className="absolute inset-0 m-auto h-5 w-auto transition-opacity duration-150 group-hover/header:opacity-0"
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={toggleCollapsed}
                            aria-label="Expand sidebar"
                            className="absolute inset-0 rounded-lg text-[#C4C0B6] opacity-0 transition-opacity duration-150 hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD] group-hover/header:opacity-100 focus-visible:opacity-100"
                        >
                            <PanelLeftOpen className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={toggleCollapsed}
                        className="rounded-lg text-[#C4C0B6] hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD]"
                    >
                        <PanelLeftClose className="h-4 w-4" />
                    </Button>
                )}
            </div>

            <div className="shrink-0 px-2 pb-2">
                <Link href="/connect" prefetch onClick={isMobile ? () => setMobileMenuOpen(false) : undefined}>
                    <Button
                        type="button"
                        className={`h-10 rounded-lg border border-[#4CAF6E] bg-[#4CAF6E]/12 text-[#4CAF6E] shadow-[0_0_0_3px_rgba(76,175,110,0.10)] transition-all duration-200 ease-out hover:bg-[#4CAF6E]/20 hover:text-[#4CAF6E] ${
                            isCollapsed ? 'w-10 justify-center gap-0 px-0' : 'w-full justify-start px-3'
                        }`}
                    >
                        <PlugZap className="h-[18px] w-[18px] shrink-0" />
                        <span
                            className={`overflow-hidden whitespace-nowrap text-[14px] font-semibold transition-all duration-200 ease-out ${
                                isCollapsed ? 'max-w-0 opacity-0' : 'ml-3 max-w-32 opacity-100'
                            }`}
                        >
                            Connect Claude
                        </span>
                    </Button>
                </Link>
            </div>

            {/* Nav items */}
            <nav className="shrink-0 px-2 pb-2 space-y-0.5">
                <NavItem href="/campaigns" icon={LayoutDashboard} label="Campaigns" active={pathname.startsWith('/campaigns')} collapsed={isCollapsed} onClick={isMobile ? () => setMobileMenuOpen(false) : undefined} />
                <NavItem href="/audit" icon={ClipboardCheck} label="Audit" active={pathname === '/audit'} collapsed={isCollapsed} onClick={isMobile ? () => setMobileMenuOpen(false) : undefined} />
                <NavItem href="/impact-monitor" icon={Gauge} label="Impact Monitor" active={pathname.startsWith('/impact-monitor')} collapsed={isCollapsed} onClick={isMobile ? () => setMobileMenuOpen(false) : undefined} />
                <NavItem href="/operations" icon={Activity} label="Operations" active={pathname === '/operations'} collapsed={isCollapsed} onClick={isMobile ? () => setMobileMenuOpen(false) : undefined} />
                <NavItem href="/chat" icon={MessageSquare} label="Chat" active={pathname.startsWith('/chat')} collapsed={isCollapsed} onClick={isMobile ? () => setMobileMenuOpen(false) : undefined} />
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
                <NavItem href="/usage" icon={Gauge} label="Usage" active={pathname === '/usage'} collapsed={isCollapsed} onClick={isMobile ? () => setMobileMenuOpen(false) : undefined} />
                <NavItem
                    href="/upgrade"
                    icon={Rocket}
                    label={isFree ? 'Upgrade' : 'Pricing'}
                    active={pathname === '/upgrade'}
                    collapsed={isCollapsed}
                    onClick={() => {
                        if (isMobile) setMobileMenuOpen(false);
                        trackEvent('upgrade_clicked', { location: 'sidebar', page: pathname });
                    }}
                />
                {isDev && <NavItem href="/dev" icon={Code2} label="Dev" active={pathname === '/dev'} collapsed={isCollapsed} onClick={isMobile ? () => setMobileMenuOpen(false) : undefined} />}
                {isDev && <NavItem href="/add-google-ads-account" icon={PlugZap} label="Add Google Ads Account" active={pathname.startsWith('/add-google-ads-account')} collapsed={isCollapsed} onClick={isMobile ? () => setMobileMenuOpen(false) : undefined} />}
                {isDev && <NavItem href="/add-meta-ads-account" icon={PlugZap} label="Add Meta Ads Account" active={pathname.startsWith('/add-meta-ads-account')} collapsed={isCollapsed} onClick={isMobile ? () => setMobileMenuOpen(false) : undefined} />}
                {isDev && <NavItem href="/connect-meta-ads-mcp" icon={PlugZap} label="Meta Ads MCP" active={pathname.startsWith('/connect-meta-ads-mcp')} collapsed={isCollapsed} onClick={isMobile ? () => setMobileMenuOpen(false) : undefined} />}
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
        <div className="flex h-full flex-col md:flex-row bg-[#1A1917]">
            {/* Mobile header */}
            <header className="flex md:hidden h-12 shrink-0 items-center justify-between border-b border-[#3D3C36] bg-[#24231F] px-4">
                <Link href="/" className="flex items-center">
                    <BrandLockup size="xs" />
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
                        {badge.kind === 'paid' && (
                            <span className="inline-flex h-5 items-center rounded-full bg-[#4CAF6E]/15 px-2 text-[11px] font-semibold tracking-wide text-[#4CAF6E]">
                                {badge.planName}
                            </span>
                        )}
                        {badge.kind === 'trial' && (
                            <Link
                                href="/upgrade"
                                prefetch
                                onClick={() => trackEvent('upgrade_clicked', {
                                    location: badge.endingSoon ? 'trial_ending_soon_pill' : 'trial_active_pill',
                                    page: pathname,
                                })}
                                aria-label={badge.daysLeft === 0
                                    ? 'Free trial ends today — upgrade to keep access'
                                    : `Free trial · ${badge.daysLeft} day${badge.daysLeft === 1 ? '' : 's'} left — upgrade to keep access`}
                                className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold tracking-wide ring-1 ring-inset transition-colors ${
                                    badge.endingSoon
                                        ? 'bg-[#D4882A]/15 text-[#D4882A] ring-[#D4882A]/35 hover:bg-[#D4882A]/22'
                                        : 'bg-[#E8E4DD]/10 text-[#E8E4DD] ring-[#3D3C36] hover:bg-[#E8E4DD]/15'
                                }`}
                            >
                                {badge.endingSoon ? (
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                ) : (
                                    <Clock className="h-3.5 w-3.5 shrink-0" />
                                )}
                                <span>
                                    {badge.daysLeft === 0
                                        ? 'Free trial ends today'
                                        : `Free trial · ${badge.daysLeft} day${badge.daysLeft === 1 ? '' : 's'} left`}
                                </span>
                            </Link>
                        )}
                        {badge.kind === 'trial_expired' && (
                            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#C45D4A]/15 px-3 text-[12px] font-semibold tracking-wide text-[#C45D4A] ring-1 ring-inset ring-[#C45D4A]/35">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                Trial ended
                            </span>
                        )}
                        {planLoaded && trialExpired && (
                            <Link
                                href="/upgrade"
                                prefetch
                                onClick={() => trackEvent('upgrade_clicked', { location: 'trial_ended_badge', page: pathname })}
                                className="group hidden lg:inline-flex items-center gap-2 rounded-md border border-[#C45D4A] bg-[#C45D4A] px-3 py-1.5 text-[13px] font-semibold text-white shadow-[0_0_0_3px_rgba(196,93,74,0.18)] transition-all hover:bg-[#B54E3D] hover:shadow-[0_0_0_4px_rgba(196,93,74,0.28)]"
                                aria-label="Free trial ended — upgrade to Growth to continue"
                            >
                                <span className="relative flex h-2 w-2 shrink-0">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                                </span>
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                <span>Free trial ended — upgrade to keep using NotFair</span>
                                <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                            </Link>
                        )}
                        {planLoaded && trialEndingSoon && (
                            <Link
                                href="/upgrade"
                                prefetch
                                onClick={() => trackEvent('upgrade_clicked', { location: 'trial_ending_soon_badge', page: pathname })}
                                className="group hidden lg:inline-flex items-center gap-2 rounded-md border border-[#D4882A] bg-[#D4882A] px-3 py-1.5 text-[13px] font-semibold text-white shadow-[0_0_0_3px_rgba(212,136,42,0.18)] transition-all hover:bg-[#B8731F] hover:shadow-[0_0_0_4px_rgba(212,136,42,0.28)]"
                                aria-label="Free trial ending soon — upgrade to Growth"
                            >
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                <span>
                                    {trialDaysLeft === 0
                                        ? 'Free trial ends today — upgrade to keep access'
                                        : `Free trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} — upgrade to keep access`}
                                </span>
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
                        <UserMenu />
                    </div>
                </div>
                {/* Trial-ended banner — shown below the header on < lg screens where the inline pill is hidden */}
                {planLoaded && trialExpired && (
                    <Link
                        href="/upgrade"
                        prefetch
                        onClick={() => trackEvent('upgrade_clicked', { location: 'trial_ended_banner', page: pathname })}
                        className="group flex shrink-0 items-center justify-center gap-2 border-b border-[#C45D4A]/60 bg-[#C45D4A] px-4 py-2 text-center text-[13px] font-semibold text-white transition-colors hover:bg-[#B54E3D] lg:hidden"
                        aria-label="Free trial ended — upgrade to Growth to continue"
                    >
                        <span className="relative flex h-2 w-2 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                        </span>
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span className="hidden sm:inline">
                            Free trial ended — upgrade to keep using NotFair
                        </span>
                        <span className="sm:hidden">Trial ended — upgrade</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                    </Link>
                )}
                {planLoaded && trialEndingSoon && (
                    <Link
                        href="/upgrade"
                        prefetch
                        onClick={() => trackEvent('upgrade_clicked', { location: 'trial_ending_soon_banner', page: pathname })}
                        className="group flex shrink-0 items-center justify-center gap-2 border-b border-[#D4882A]/60 bg-[#D4882A] px-4 py-2 text-center text-[13px] font-semibold text-white transition-colors hover:bg-[#B8731F] lg:hidden"
                        aria-label="Free trial ending soon — upgrade to Growth"
                    >
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span className="hidden sm:inline">
                            {trialDaysLeft === 0
                                ? 'Free trial ends today — upgrade to keep access'
                                : `Free trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} — upgrade to keep access`}
                        </span>
                        <span className="sm:hidden">
                            {trialDaysLeft === 0
                                ? 'Trial ends today — upgrade'
                                : `${trialDaysLeft}d left — upgrade`}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                    </Link>
                )}
                {/* Scrollable content area */}
                <div className="flex-1 overflow-y-auto">
                    <DemoBanner />
                    <ImpersonationBanner />
                    {children}
                </div>
            </div>

            {/* Mobile bottom navigation */}
            <nav className="flex md:hidden shrink-0 border-t border-[#3D3C36] bg-[#24231F]">
                <MobileNavItem href="/dashboard" icon={Home} label="Home" active={pathname === '/dashboard'} />
                <MobileNavItem href="/campaigns" icon={LayoutDashboard} label="Campaigns" active={pathname.startsWith('/campaigns')} />
                <MobileNavItem href="/audit" icon={ClipboardCheck} label="Audit" active={pathname === '/audit'} />
                <MobileNavItem href="/impact-monitor" icon={Gauge} label="Impact" active={pathname.startsWith('/impact-monitor')} />
                <MobileNavItem href="/chat" icon={MessageSquare} label="Chat" active={pathname.startsWith('/chat')} />
            </nav>
        </div>
    );
}
