'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ExternalLink, AlertCircle, CheckCircle2, Loader2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Session } from '@/lib/session';
import { startGoogleConnect } from '@/lib/google-oauth';
import { trackEvent } from '@/lib/analytics';
import { BOOK_DEMO_URL } from '@/lib/links';
import { notifyHelpClicked } from '@/app/actions';
import { ClaudeCodePluginSteps } from '@/components/claude-code-plugin-steps';
import { ConnectorSetupSteps } from '@/components/connector-setup-steps';
import { CodexSetupSteps } from '@/components/codex-setup-steps';
import { AnyMcpClientSetup } from '@/components/any-mcp-client-setup';
import { MCP_SERVER_URL } from '@/lib/brand';

const emptySession: Session = { connected: false };

async function readServerSession(): Promise<Session> {
    const response = await fetch('/api/auth/session', {
        credentials: 'include',
        cache: 'no-store',
    });

    if (!response.ok) return emptySession;
    return response.json();
}

type ConnectPageProps = {
    initialSession?: Session;
    slug?: string[];
};

export function ConnectPage({ initialSession = emptySession, slug }: ConnectPageProps) {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-[50vh] items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3D3C36] border-t-[#4CAF6E]" />
                </div>
            }
        >
            <ConnectContent initialSession={initialSession} slug={slug} />
        </Suspense>
    );
}



function ClaudeConnectorSection() {
    return (
        <div className="w-full max-w-3xl text-left">
            <ConnectorSetupSteps surface="in_app" />
        </div>
    );
}

type SetupTab = 'claude-code' | 'connector' | 'codex' | 'any-mcp';

function ClaudeCodeManualSection() {
    return (
        <div className="w-full max-w-3xl text-left">
            <ClaudeCodePluginSteps surface="in_app" />
        </div>
    );
}

function CodexSection() {
    return (
        <div className="w-full max-w-3xl text-left">
            <CodexSetupSteps surface="in_app" />
        </div>
    );
}

function SetupTabs({ activeTab, apiKey, onSignIn, onTokenRotated }: {
    activeTab: SetupTab;
    apiKey: string | null;
    onSignIn: () => void;
    onTokenRotated: () => Promise<void>;
}) {
    const tabBtn = (active: boolean) =>
        `flex-1 whitespace-nowrap rounded-md px-3 py-2.5 text-center text-sm font-medium transition-all duration-150 ${active
            ? 'bg-[#24231F] text-[#E8E4DD] shadow-sm'
            : 'text-[#C4C0B6] hover:text-[#E8E4DD]'
        }`;
    return (
        <div className="flex flex-col items-center space-y-8 text-center">
            {/* Tab switcher */}
            <div className="flex w-full max-w-3xl rounded-lg border border-[#3D3C36] bg-[#1A1917] p-1">
                <Link href="/connect/claude-code" prefetch className={tabBtn(activeTab === 'claude-code')}>
                    Claude Code
                </Link>
                <Link href="/connect/claude-connector" prefetch className={tabBtn(activeTab === 'connector')}>
                    Claude Cowork / Web
                </Link>
                <Link href="/connect/codex" prefetch className={tabBtn(activeTab === 'codex')}>
                    Codex
                </Link>
                <Link href="/connect/any-mcp" prefetch className={tabBtn(activeTab === 'any-mcp')}>
                    Any MCP Client
                </Link>
            </div>

            {/* Tab content */}
            {activeTab === 'claude-code' ? (
                <ClaudeCodeManualSection />
            ) : activeTab === 'connector' ? (
                <ClaudeConnectorSection />
            ) : activeTab === 'codex' ? (
                <CodexSection />
            ) : (
                <div className="w-full max-w-3xl text-left">
                    <AnyMcpClientSetup
                        apiKey={apiKey}
                        onSignIn={onSignIn}
                        onRotated={onTokenRotated}
                        surface="in_app"
                    />
                </div>
            )}

        </div>
    );
}

function parseSlug(slug?: string[]): { activeTab: SetupTab } {
    if (!slug || slug.length === 0) return { activeTab: 'claude-code' };
    if (slug[0] === 'claude-connector') return { activeTab: 'connector' };
    if (slug[0] === 'chatgpt-codex' || slug[0] === 'codex') return { activeTab: 'codex' };
    if (slug[0] === 'any-mcp') return { activeTab: 'any-mcp' };
    return { activeTab: 'claude-code' };
}

function ConnectContent({ initialSession, slug }: { initialSession: Session; slug?: string[] }) {
    const { activeTab } = parseSlug(slug);
    const searchParams = useSearchParams();
    const router = useRouter();
    const urlToken = searchParams.get('token');
    const urlCustomerName = searchParams.get('customer_name');
    const urlError = searchParams.get('error');
    const pendingToken = searchParams.get('pending');
    const selectionMode = searchParams.get('mode');
    const accountsParam = searchParams.get('accounts');
    const selectedParam = searchParams.get('selected');
    const nextAfterConnect = searchParams.get('next') ?? '/connect';

    const [session, setSession] = useState<Session>(initialSession);
    const [error, setError] = useState<string | null>(urlError);
    const [selecting, setSelecting] = useState(false);
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

    const token = urlToken || (session.connected ? session.token : null);
    const customerName = urlCustomerName || (session.connected ? session.customerName : null);

    type SelectableAccount = {
        id: string;
        name: string;
        loginCustomerId?: string;
        loginCustomerName?: string;
    };

    const accounts = useMemo<SelectableAccount[]>(() => {
        if (!accountsParam) return [];
        try {
            const parsed = JSON.parse(accountsParam);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(
                (account: unknown): account is SelectableAccount =>
                    typeof account === 'object' &&
                    account !== null &&
                    'id' in account &&
                    typeof (account as { id: unknown }).id === 'string' &&
                    'name' in account &&
                    typeof (account as { name: unknown }).name === 'string',
            );
        } catch {
            return [];
        }
    }, [accountsParam]);

    // Group accounts: direct first, then by manager. Used to render section
    // headers ("Via manager: Acme MCC") so users see the manager grouping.
    const accountGroups = useMemo(() => {
        const groups = new Map<string, { key: string; label: string; isManager: boolean; accounts: SelectableAccount[] }>();
        for (const a of accounts) {
            const key = a.loginCustomerId ?? '__direct__';
            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    label: a.loginCustomerId
                        ? a.loginCustomerName || `Manager ${a.loginCustomerId}`
                        : 'Direct access',
                    isManager: !!a.loginCustomerId,
                    accounts: [],
                });
            }
            groups.get(key)!.accounts.push(a);
        }
        return Array.from(groups.values());
    }, [accounts]);


    const preselectedAccountIds = useMemo(() => {
        if (!selectedParam) return [] as string[];
        try {
            const parsed = JSON.parse(selectedParam);
            if (!Array.isArray(parsed)) return [] as string[];
            return parsed.filter((value): value is string => typeof value === 'string');
        } catch {
            return [] as string[];
        }
    }, [selectedParam]);

    useEffect(() => {
        if (urlToken) {
            // account_connected is now fired centrally from PostHogProvider
            // via the gads_connect_event cookie set by the auth callback.
            window.history.replaceState({}, '', '/connect/claude-code');
            return;
        }

        let cancelled = false;
        readServerSession().then(nextSession => {
            if (!cancelled) setSession(nextSession);
        }).catch(() => {
            if (!cancelled) setSession(emptySession);
        });

        return () => {
            cancelled = true;
        };
    }, [urlToken]);

    useEffect(() => {
        if ((!pendingToken && selectionMode !== 'update') || accounts.length === 0) {
            setSelectedAccounts([]);
            return;
        }

        const accessiblePreselected = preselectedAccountIds.filter(id =>
            accounts.some(account => account.id === id),
        );
        setSelectedAccounts(accessiblePreselected);
    }, [pendingToken, selectionMode, accounts, preselectedAccountIds]);

    async function beginGoogleSignIn() {
        setError(null);
        try {
            await startGoogleConnect('/connect');
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Authentication failed. Please try again.');
        }
    }

    const [demoStarting, setDemoStarting] = useState(false);
    async function startDemoSession() {
        if (demoStarting) return;
        setDemoStarting(true);
        setError(null);
        try {
            const res = await fetch('/api/demo/start', {
                method: 'POST',
                credentials: 'include',
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? 'Failed to start demo');
                setDemoStarting(false);
                return;
            }
            trackEvent('demo_mode_started');
            window.location.assign(data.redirectUrl ?? '/dashboard');
        } catch {
            setError('Failed to start demo');
            setDemoStarting(false);
        }
    }

    function toggleAccount(accountId: string) {
        setSelectedAccounts(prev =>
            prev.includes(accountId) ? prev.filter(id => id !== accountId) : [...prev, accountId],
        );
    }

    async function submitSelectedAccounts() {
        setSelecting(true);
        const selected = accounts.filter(account => selectedAccounts.includes(account.id));
        try {
            const res = await fetch('/api/auth/select-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pendingToken,
                    accounts: selected,
                    next: nextAfterConnect,
                }),
            });
            const data = await res.json();
            if (data.redirectUrl) {
                // account_connected is now fired centrally from PostHogProvider
                // via the gads_connect_event cookie set by select-account route.
                window.location.assign(data.redirectUrl);
            } else if (data.error) {
                router.push(`/connect?error=${encodeURIComponent(data.error)}`);
            }
        } finally {
            setSelecting(false);
        }
    }


    return (
        <section className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
                <div className="mx-auto max-w-4xl">
                    {error && (
                        <div className="mb-8 rounded-lg border border-[#C45D4A]/30 bg-[#C45D4A]/10 p-5">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#C45D4A]" />
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-[#C45D4A]">{error}</p>
                                    {error.toLowerCase().includes("permission") && (
                                        <p className="text-xs text-[#C45D4A]/80">
                                            NotFair needs Google Ads access to manage your campaigns. On the Google consent screen, make sure the &quot;Google Ads&quot; checkbox stays checked.
                                        </p>
                                    )}
                                </div>
                            </div>
                            <Button
                                onClick={beginGoogleSignIn}
                                className="mt-4 ml-8 bg-[#C45D4A] text-white hover:bg-[#B04D3A] font-medium"
                                size="sm"
                            >
                                Try again with Google
                            </Button>
                        </div>
                    )}

                    {(pendingToken || selectionMode === 'update') && accounts.length > 0 ? (
                        <div className="flex flex-col items-center space-y-6 text-center">
                            <div className="flex items-center gap-2 text-[#4CAF6E]">
                                <CheckCircle2 className="h-5 w-5" />
                                <span className="text-sm font-medium">Google connected</span>
                            </div>
                            <h2 className="text-3xl font-bold text-[#E8E4DD] md:text-5xl">Select accounts</h2>
                            <p className="max-w-md text-lg text-[#C4C0B6]">
                                Which Google Ads accounts do you want to manage?
                            </p>
                            <div className="w-full max-w-md space-y-5">
                                {accountGroups.map(group => (
                                    <div key={group.key} className="space-y-2">
                                        <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#C4C0B6]/80">
                                            {group.isManager ? (
                                                <>
                                                    <span>Via manager</span>
                                                    <span className="rounded-md border border-[#3D3C36] bg-[#1A1917] px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-[#E8E4DD]">
                                                        {group.label}
                                                    </span>
                                                </>
                                            ) : (
                                                <span>Direct access</span>
                                            )}
                                        </div>
                                        <div className="space-y-3">
                                            {group.accounts.map(account => {
                                                const isSelected = selectedAccounts.includes(account.id);
                                                return (
                                                    <button
                                                        key={account.id}
                                                        onClick={() => toggleAccount(account.id)}
                                                        disabled={selecting}
                                                        className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-all disabled:opacity-50 ${isSelected
                                                                ? 'border-[#4CAF6E]/30 bg-[#4CAF6E]/10'
                                                                : 'border-[#3D3C36] bg-[#24231F] hover:border-[#C4C0B6]/40 hover:bg-[#2E2D28]'
                                                            }`}
                                                    >
                                                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${isSelected ? 'border-[#4CAF6E] bg-[#4CAF6E]' : 'border-[#C4C0B6]/40'
                                                            }`}>
                                                            {isSelected && <Check className="h-3 w-3 text-[#1A1917]" />}
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-[#E8E4DD]">{account.name}</p>
                                                            <p className="mt-0.5 text-sm text-[#C4C0B6]">{account.id}</p>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {selectedAccounts.length > 0 && (
                                <p className="text-sm text-[#C4C0B6]">
                                    {selectedAccounts.length} of {accounts.length} account{accounts.length > 1 ? 's' : ''} selected.
                                </p>
                            )}
                            <Button
                                size="lg"
                                onClick={submitSelectedAccounts}
                                disabled={selectedAccounts.length === 0 || selecting}
                                className="h-14 rounded-full bg-[#4CAF6E] px-10 text-lg font-semibold text-[#1A1917] transition-all hover:scale-105 hover:bg-[#3D9A5C] disabled:opacity-50 disabled:hover:scale-100"
                            >
                                {selecting ? 'Connecting...' : `Connect ${selectedAccounts.length || ''} account${selectedAccounts.length !== 1 ? 's' : ''}`}
                            </Button>
                        </div>
                    ) : !token ? (
                        <div className="flex flex-col items-center space-y-6 pt-12 text-center">
                            <h2 className="text-3xl font-bold text-[#E8E4DD] md:text-5xl">Connect Google Ads</h2>
                            <p className="max-w-md text-lg text-[#C4C0B6]">
                                Sign in with your Google Ads account. You&apos;ll get a setup prompt to paste into Claude Code.
                            </p>
                            <Button
                                size="lg"
                                onClick={beginGoogleSignIn}
                                className="h-14 rounded-full bg-[#4CAF6E] px-10 text-lg font-semibold text-[#1A1917] transition-all hover:scale-105 hover:bg-[#3D9A5C]"
                            >
                                Sign in with Google <ExternalLink className="ml-2 h-5 w-5" />
                            </Button>
                            <p className="text-xs text-[#C4C0B6]/60">OAuth 2.0 — we never see your password.</p>
                            <div className="flex w-full max-w-sm items-center gap-3 pt-4">
                                <div className="h-px flex-1 bg-[#3D3C36]" />
                                <span className="text-xs font-medium uppercase tracking-[0.18em] text-[#C4C0B6]/60">or</span>
                                <div className="h-px flex-1 bg-[#3D3C36]" />
                            </div>
                            <div className="flex flex-col items-center space-y-2">
                                <p className="max-w-md text-sm text-[#C4C0B6]">
                                    Don&apos;t have a Google Ads account yet? Try NotFair with sample data.
                                </p>
                                <Button
                                    onClick={startDemoSession}
                                    disabled={demoStarting}
                                    variant="outline"
                                    className="h-11 rounded-full border-[#3D3C36] bg-[#24231F] px-6 text-sm font-medium text-[#E8E4DD] hover:bg-[#2E2D28] hover:text-[#E8E4DD] disabled:opacity-60"
                                >
                                    {demoStarting ? (
                                        <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Starting demo…</span>
                                    ) : (
                                        <>Explore with demo data</>
                                    )}
                                </Button>
                                <p className="text-xs text-[#C4C0B6]/60">Simulated ecommerce clothing brand · 30 days of data · no sign-up required</p>
                            </div>
                        </div>
                    ) : (
                        <SetupTabs
                            activeTab={activeTab}
                            apiKey={token}
                            onSignIn={beginGoogleSignIn}
                            onTokenRotated={async () => {
                                const next = await readServerSession();
                                setSession(next);
                                router.refresh();
                            }}
                        />
                    )}
                </div>
            </div>
            <a
                href={BOOK_DEMO_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                    const pathname = typeof window !== 'undefined' ? window.location.pathname : '/connect';
                    trackEvent('setup_help_requested', {
                        connected: Boolean(token),
                        pathname,
                        active_tab: activeTab,
                    });
                    void notifyHelpClicked({
                        activeTab,
                        pathname,
                        connected: Boolean(token),
                        source: 'connect_floating',
                    }).catch(() => {});
                }}
                className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 rounded-full border border-[#4CAF6E]/60 bg-[#4CAF6E] px-5 py-3 text-sm font-semibold text-[#1A1917] shadow-lg shadow-[#4CAF6E]/30 ring-2 ring-[#4CAF6E]/20 transition hover:bg-[#5BC07F] hover:shadow-xl hover:shadow-[#4CAF6E]/40"
                aria-label="Need help? Book a call"
            >
                <Calendar className="h-4 w-4" />
                Need help?
            </a>
        </section>
    );
}
