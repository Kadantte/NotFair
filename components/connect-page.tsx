'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ExternalLink, AlertCircle, Loader2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Session } from '@/lib/session';
import { startGoogleConnect } from '@/lib/google-oauth';
import { trackEvent } from '@/lib/analytics';
import { BOOK_DEMO_URL } from '@/lib/links';
import { notifyHelpClicked } from '@/app/actions';
import { McpSetupTabs, parseSetupSlug } from '@/components/mcp-setup-tabs';
import { GoHighLevelConnectSurface } from '@/components/gohighlevel-connect-surface';
import { MCP_CONNECTOR_NAME, MCP_SERVER_URL } from '@/lib/brand';

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

// Account selection (initial multi-pick + management) lives at the dedicated
// /manage-ads-accounts/<platform>/select routes now. The connect page is for
// sign-in (no session) and MCP/connector setup (post-auth).

type ErrorReason = 'scope_denied' | 'scope_denied_retry' | 'load_accounts_failed' | 'session_error' | 'generic';

type ErrorCopy = {
    headline: string;
    body: string;
    /** Optional second paragraph with concrete instructions. */
    helper?: string;
    primaryCta: {
        label: string;
        /** Pass to startGoogleConnect — switches Google's `prompt` param. */
        prompt?: 'consent' | 'select_account' | 'select_account consent';
    };
};

function getErrorCopy(reason: ErrorReason, opts: { fallbackMessage?: string | null }): ErrorCopy {
    switch (reason) {
        case 'scope_denied':
        case 'scope_denied_retry':
            return {
                headline: 'Google Ads access is required',
                body: "NotFair can't read your campaigns or make changes without the Google Ads permission. When you continue, please keep that permission checked on Google's consent screen.",
                helper: "Look for the checkbox labelled \"See, edit, create, and delete your Google Ads accounts and data.\" If you uncheck it, NotFair has no way to see your campaigns.",
                primaryCta: { label: 'Continue and allow Google Ads access', prompt: 'consent' },
            };
        case 'load_accounts_failed':
        case 'session_error':
        case 'generic':
        default:
            return {
                headline: "We couldn't finish connecting your account",
                body: opts.fallbackMessage?.trim() || 'Something went wrong on our end. Please try again — if it keeps failing, reach out and we can help.',
                primaryCta: { label: 'Try again with Google' },
            };
    }
}

function isKnownReason(value: string | null | undefined): value is ErrorReason {
    return value === 'scope_denied' || value === 'scope_denied_retry' || value === 'load_accounts_failed' || value === 'session_error';
}


type SetupTab = 'claude-code' | 'connector' | 'codex' | 'any-mcp' | 'gohighlevel';


function connectPathForTab(tab: SetupTab): string {
    switch (tab) {
        case 'connector':
            return '/connect/claude-connector';
        case 'codex':
            return '/connect/codex';
        case 'any-mcp':
            return '/connect/any-mcp';
        case 'gohighlevel':
            return '/connect/gohighlevel';
        case 'claude-code':
        default:
            return '/connect/claude-code';
    }
}


function ConnectContent({ initialSession, slug }: { initialSession: Session; slug?: string[] }) {
    const isGhl = slug?.[0] === 'gohighlevel' || slug?.[0] === 'go-high-level' || slug?.[0] === 'ghl';
    const { activeTab: baseTab } = isGhl ? { activeTab: 'connector' as const } : parseSetupSlug(slug);
    const activeTab: SetupTab = isGhl ? 'gohighlevel' : baseTab;
    const searchParams = useSearchParams();
    const router = useRouter();
    const urlToken = searchParams.get('token');
    const urlError = searchParams.get('error');
    const urlErrorReason = searchParams.get('reason');
    const currentConnectPath = connectPathForTab(activeTab);

    const [session, setSession] = useState<Session>(initialSession);
    const [error, setError] = useState<string | null>(urlError);
    const [errorReason, setErrorReason] = useState<string | null>(urlErrorReason);

    const token = urlToken || (session.connected ? session.token : null);

    useEffect(() => {
        if (urlToken) {
            // account_connected is now fired centrally from PostHogProvider
            // via the gads_connect_event cookie set by the auth callback.
            window.history.replaceState({}, '', currentConnectPath);
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
    }, [currentConnectPath, urlToken]);

    async function beginGoogleSignIn(prompt?: 'consent' | 'select_account' | 'select_account consent') {
        setError(null);
        setErrorReason(null);
        try {
            await startGoogleConnect(currentConnectPath, prompt ? { prompt } : undefined);
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Authentication failed. Please try again.');
        }
    }

    const [demoStarting, setDemoStarting] = useState(false);
    async function startDemoSession() {
        if (demoStarting) return;
        setDemoStarting(true);
        setError(null);
        setErrorReason(null);
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


    return (
        <section className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
                <div className="mx-auto max-w-4xl">
                    {(error || isKnownReason(errorReason)) && (() => {
                        const reason: ErrorReason = isKnownReason(errorReason) ? errorReason : 'generic';
                        const copy = getErrorCopy(reason, { fallbackMessage: error });
                        return (
                            <div className="mb-8 rounded-lg border border-[#C45D4A]/30 bg-[#C45D4A]/10 p-5">
                                <div className="flex items-start gap-3">
                                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#C45D4A]" />
                                    <div className="space-y-2">
                                        <p className="text-sm font-semibold text-[#C45D4A]">{copy.headline}</p>
                                        <p className="text-sm text-[#C45D4A]">{copy.body}</p>
                                        {copy.helper && (
                                            <p className="text-xs text-[#C45D4A]/80">{copy.helper}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-4 ml-8 flex flex-wrap items-center gap-3">
                                    <Button
                                        onClick={() => beginGoogleSignIn(copy.primaryCta.prompt)}
                                        className="bg-[#C45D4A] text-white hover:bg-[#B04D3A] font-medium"
                                        size="sm"
                                    >
                                        {copy.primaryCta.label}
                                    </Button>
                                </div>
                            </div>
                        );
                    })()}

                    {activeTab === 'gohighlevel' ? (
                        <GoHighLevelConnectSurface session={session} />
                    ) : !token ? (
                        <div className="flex flex-col items-center space-y-6 pt-12 text-center">
                            <h2 className="text-3xl font-bold text-[#E8E4DD] md:text-5xl">Connect Google Ads</h2>
                            <p className="max-w-md text-lg text-[#C4C0B6]">
                                Sign in with your Google Ads account, then choose the Claude or MCP client you want to set up.
                            </p>
                            <Button
                                size="lg"
                                onClick={() => beginGoogleSignIn()}
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
                        <McpSetupTabs
                            activeTab={activeTab as Exclude<SetupTab, 'gohighlevel'>}
                            apiKey={token}
                            onSignIn={beginGoogleSignIn}
                            onTokenRotated={async () => {
                                const next = await readServerSession();
                                setSession(next);
                                router.refresh();
                            }}
                            basePath="/connect"
                            serverUrl={MCP_SERVER_URL}
                            connectorName={MCP_CONNECTOR_NAME}
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
                        activeTab: activeTab === 'gohighlevel' ? undefined : activeTab,
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
