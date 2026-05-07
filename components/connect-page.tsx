'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ExternalLink, AlertCircle, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Session } from '@/lib/session';
import { startGoogleConnect } from '@/lib/google-oauth';
import { trackEvent } from '@/lib/analytics';
import { BOOK_DEMO_URL } from '@/lib/links';
import { notifyHelpClicked } from '@/app/actions';
import { McpSetupTabs, parseSetupSlug } from '@/components/mcp-setup-tabs';
import { GoHighLevelConnectSurface } from '@/components/gohighlevel-connect-surface';
import { GoogleConnectedToast } from '@/components/google-connected-toast';
import { MissingPlatformWarning } from '@/components/missing-platform-warning';
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

type ConnectTranslator = ReturnType<typeof useTranslations>;

function getErrorCopy(
    reason: ErrorReason,
    opts: { fallbackMessage?: string | null; t: ConnectTranslator },
): ErrorCopy {
    const { t } = opts;
    switch (reason) {
        case 'scope_denied':
        case 'scope_denied_retry':
            return {
                headline: t('error.scopeHeadline'),
                body: t('error.scopeBody'),
                helper: t('error.scopeHelper'),
                primaryCta: { label: t('error.scopeCta'), prompt: 'consent' },
            };
        case 'load_accounts_failed':
        case 'session_error':
        case 'generic':
        default:
            return {
                headline: t('error.genericHeadline'),
                body: opts.fallbackMessage?.trim() || t('error.genericBody'),
                primaryCta: { label: t('error.genericCta') },
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
    const t = useTranslations('Connect');
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
    // Setup-tabs visibility tracks connectivity, NOT token presence. Pre-phase-4
    // these were equivalent (every connected user had an `mcp_sessions.access_token`
    // surfaced as `session.token`), but Supabase-only users (post-STOP_CREATING_MCP_SESSIONS)
    // are connected with `session.token === ""` — gating on `!token` would
    // hide the setup UI from a fully-connected user and show a sign-in prompt
    // for an account they're already signed into. McpSetupTabs already
    // handles a null/empty apiKey: OAuth tabs (Connector/Claude Code/Codex)
    // don't need it, and the Any-MCP tab swaps the bearer block for a CTA.
    const showSetup = session.connected && !session.pendingSetup;

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
            setError(error instanceof Error ? error.message : t('authFailed'));
        }
    }

    const hasGoogleCustomer = session.connected && !session.pendingSetup && !!session.customerId;

    return (
        <section className="flex h-full min-h-0 flex-col overflow-hidden">
            <GoogleConnectedToast />
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
                <div className="mx-auto max-w-4xl">
                    {!hasGoogleCustomer && session.connected && <MissingPlatformWarning platform="google_ads" />}
                    {(error || isKnownReason(errorReason)) && (() => {
                        const reason: ErrorReason = isKnownReason(errorReason) ? errorReason : 'generic';
                        const copy = getErrorCopy(reason, { fallbackMessage: error, t });
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
                    ) : !showSetup ? (
                        <div className="flex flex-col items-center space-y-6 pt-12 text-center">
                            <h2 className="text-3xl font-bold text-[#E8E4DD] md:text-5xl">{t('headline')}</h2>
                            <p className="max-w-md text-lg text-[#C4C0B6]">
                                {t('body')}
                            </p>
                            <Button
                                size="lg"
                                onClick={() => beginGoogleSignIn()}
                                className="h-14 rounded-full bg-[#4CAF6E] px-10 text-lg font-semibold text-[#1A1917] transition-all hover:scale-105 hover:bg-[#3D9A5C]"
                            >
                                {t('signInWithGoogle')} <ExternalLink className="ml-2 h-5 w-5" />
                            </Button>
                            <p className="text-xs text-[#C4C0B6]/60">{t('oauthNote')}</p>
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
                            basePath="/connect/google-ads"
                            serverUrl={MCP_SERVER_URL}
                            connectorName={MCP_CONNECTOR_NAME}
                            platformLabel="Google Ads"
                            slashCommand="/google-ads"
                            examplePrompt={t('googleAdsPrompt')}
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
                    // Use session connectivity (not token presence) so post-STOP_CREATING_MCP_SESSIONS
                    // users still report as connected — their session.token is "".
                    const isConnected = showSetup;
                    trackEvent('setup_help_requested', {
                        connected: isConnected,
                        pathname,
                        active_tab: activeTab,
                    });
                    void notifyHelpClicked({
                        activeTab: activeTab === 'gohighlevel' ? undefined : activeTab,
                        pathname,
                        connected: isConnected,
                        source: 'connect_floating',
                    }).catch(() => {});
                }}
                className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 rounded-full border border-[#4CAF6E]/60 bg-[#4CAF6E] px-5 py-3 text-sm font-semibold text-[#1A1917] shadow-lg shadow-[#4CAF6E]/30 ring-2 ring-[#4CAF6E]/20 transition hover:bg-[#5BC07F] hover:shadow-xl hover:shadow-[#4CAF6E]/40"
                aria-label={t('helpAria')}
            >
                <Calendar className="h-4 w-4" />
                {t('needHelp')}
            </a>
        </section>
    );
}
