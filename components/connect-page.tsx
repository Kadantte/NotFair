'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Copy, Check, ExternalLink, AlertCircle, CheckCircle2, Plus, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Session } from '@/lib/session';
import { startGoogleConnect } from '@/lib/google-oauth';
import { trackEvent } from '@/lib/analytics';

function buildSetupPrompt(token: string): string {
    return `curl -fsSL ${process.env.NEXT_PUBLIC_APP_URL}/install?token=${token} | bash`;
}

function buildCoworkPrompt(token: string): string {
    const config = JSON.stringify({
        'google-ads': {
            command: 'npx',
            args: [
                '-y',
                'mcp-remote',
                `${process.env.NEXT_PUBLIC_APP_URL}/api/mcp`,
                '--transport',
                'http-first',
                '--header',
                `Authorization:Bearer ${token}`,
            ],
        },
    }, null, 2);
    return `Find the claude_desktop_config.json file on my local machine (check ~/Library/Application Support/Claude/ on macOS or %APPDATA%/Claude/ on Windows). Read it, merge the following MCP server into the mcpServers object, and write the file back.\n\n${config}`;
}

const UNINSTALL_COMMAND = `# Remove skill files from all clients
rm -rf ~/.claude/skills/toprank ~/.claude/skills/ads
rm -rf ~/.codex/skills/toprank-*
rm -rf ~/.openclaw/workspace/skills/ads
rm -rf ~/.adsagent ~/.toprank`;

type SetupTab = 'claude-code' | 'codex' | 'openclaw' | 'claude-cowork' | 'uninstall';

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
};

export function ConnectPage({ initialSession = emptySession }: ConnectPageProps) {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-[50vh] items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3D3C36] border-t-[#4CAF6E]" />
                </div>
            }
        >
            <ConnectContent initialSession={initialSession} />
        </Suspense>
    );
}

function SetupCodeBlock({ content, copied, onCopy }: { content: string; copied: boolean; onCopy: () => void }) {
    return (
        <div className="w-full text-left">
            <div className="relative rounded-lg border border-[#3D3C36] bg-[#24231F] p-6">
                <pre className="max-h-[280px] overflow-y-auto whitespace-pre-wrap pr-16 font-mono text-sm leading-relaxed text-[#E8E4DD]/80">
                    {content}
                </pre>
                <button
                    onClick={onCopy}
                    className="absolute right-4 top-4 flex items-center gap-2 rounded-md bg-[#4CAF6E] px-3 py-1.5 text-sm font-medium text-[#1A1917] transition-colors hover:bg-[#3D9A5C]"
                >
                    {copied ? (
                        <>
                            <Check className="h-4 w-4 text-[#1A1917]" />
                            <span className="text-[#1A1917]">Copied</span>
                        </>
                    ) : (
                        <>
                            <Copy className="h-4 w-4 text-[#1A1917]" />
                            <span className="text-[#1A1917]">Copy</span>
                        </>
                    )}
                </button>
                <p className="mt-4 pr-24 text-xs text-[#9B9689]/60">
                    This contains your personal access token. Don&apos;t share it publicly.
                </p>
            </div>
        </div>
    );
}

function ConnectContent({ initialSession }: { initialSession: Session }) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const urlToken = searchParams.get('token');
    const urlCustomerName = searchParams.get('customer_name');
    const urlError = searchParams.get('error');
    const pendingToken = searchParams.get('pending');
    const selectionMode = searchParams.get('mode');
    const accountsParam = searchParams.get('accounts');
    const selectedParam = searchParams.get('selected');

    const [session, setSession] = useState<Session>(initialSession);
    const [error, setError] = useState<string | null>(urlError);
    const [copied, setCopied] = useState(false);
    const [selecting, setSelecting] = useState(false);
    const [rotating, setRotating] = useState(false);
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
    const [setupTab, setSetupTab] = useState<SetupTab>('claude-code');

    const token = urlToken || (session.connected ? session.token : null);
    const customerName = urlCustomerName || (session.connected ? session.customerName : null);
    const actionBtnClass = 'flex items-center gap-2 rounded-lg border border-[#3D3C36] bg-[#24231F] px-4 py-2 text-sm text-[#9B9689] transition-all hover:border-[#9B9689]/40 hover:text-[#E8E4DD]';

    const accounts = useMemo(() => {
        if (!accountsParam) return [] as { id: string; name: string }[];
        try {
            const parsed = JSON.parse(accountsParam);
            if (!Array.isArray(parsed)) return [] as { id: string; name: string }[];
            return parsed.filter(
                (account: unknown): account is { id: string; name: string } =>
                    typeof account === 'object' &&
                    account !== null &&
                    'id' in account &&
                    typeof account.id === 'string' &&
                    'name' in account &&
                    typeof account.name === 'string',
            );
        } catch {
            return [] as { id: string; name: string }[];
        }
    }, [accountsParam]);

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
            trackEvent('account_connected', {
                account_count: 1,
                auth_method: 'google',
            });
            window.history.replaceState({}, '', '/connect');
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

    const prompt = token ? buildSetupPrompt(token) : '';
    const coworkPrompt = token ? buildCoworkPrompt(token) : '';

    async function beginGoogleSignIn() {
        setError(null);
        try {
            await startGoogleConnect('/connect');
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Authentication failed. Please try again.');
        }
    }

    function beginAddAccount() {
        setError(null);
        window.location.assign('/api/auth/add-account');
    }

    function openAgenticAi() {
        trackEvent('chat_opened_from_connect');
        window.location.assign('/chat');
    }

    function toggleAccount(accountId: string) {
        setSelectedAccounts(prev => {
            if (prev.includes(accountId)) {
                return prev.filter(id => id !== accountId);
            }
            return [...prev, accountId];
        });
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
                }),
            });
            const data = await res.json();
            if (data.redirectUrl) {
                trackEvent('account_connected', {
                    account_count: selected.length,
                    auth_method: 'google',
                });
                window.location.assign(data.redirectUrl);
            } else if (data.error) {
                router.push(`/connect?error=${encodeURIComponent(data.error)}`);
            }
        } finally {
            setSelecting(false);
        }
    }

    async function rotateToken() {
        setRotating(true);
        try {
            const res = await fetch('/api/auth/rotate-token', { method: 'POST' });
            const data = await res.json();
            if (!res.ok || data.error) {
                setError(data.error || 'Failed to rotate token');
                return;
            }
            setCopied(false);
            const nextSession = await readServerSession();
            setSession(nextSession);
            router.refresh();
        } catch {
            setError('Failed to rotate token');
        } finally {
            setRotating(false);
        }
    }

    return (
        <section className="flex h-full min-h-0 flex-col overflow-hidden">
            <header className="shrink-0 border-b border-[#3D3C36] bg-[#24231F]/80 backdrop-blur-xl">
                <div className="flex w-full items-center justify-between gap-4 px-6 py-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-[#E8E4DD]">Connect</h1>
                        <p className="mt-0.5 text-sm text-[#9B9689]">Connect Google Ads and generate the MCP setup prompt for your AI client.</p>
                    </div>
                    {token ? (
                        <div className="flex flex-wrap items-center justify-end gap-3">
                            <div className="flex items-center gap-2 text-[#4CAF6E]">
                                <CheckCircle2 className="h-4 w-4" />
                                <span className="text-sm font-medium">{customerName || 'Google Ads'}</span>
                            </div>
                            <button onClick={beginAddAccount} className={actionBtnClass}>
                                <Plus className="h-4 w-4" />
                                Add Account
                            </button>
                            <button
                                onClick={rotateToken}
                                disabled={rotating}
                                className={`${actionBtnClass} disabled:opacity-50`}
                            >
                                <RotateCw className={`h-4 w-4 ${rotating ? 'animate-spin' : ''}`} />
                                {rotating ? 'Rotating...' : 'Rotate Token'}
                            </button>
                        </div>
                    ) : null}
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
                <div className="mx-auto max-w-2xl">
                    {error && (
                        <div className="mb-8 flex items-start gap-3 rounded-lg border border-[#C45D4A]/30 bg-[#C45D4A]/10 p-4">
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#C45D4A]" />
                            <p className="text-sm text-[#C45D4A]">{error}</p>
                        </div>
                    )}

                    {(pendingToken || selectionMode === 'update') && accounts.length > 0 ? (
                        <div className="flex flex-col items-center space-y-6 text-center">
                            <div className="flex items-center gap-2 text-[#4CAF6E]">
                                <CheckCircle2 className="h-5 w-5" />
                                <span className="text-sm font-medium">Google connected</span>
                            </div>
                            <h2 className="text-3xl font-bold text-[#E8E4DD] md:text-5xl">Select accounts</h2>
                            <p className="max-w-md text-lg text-[#9B9689]">
                                Which Google Ads accounts do you want to manage?
                            </p>
                            <div className="w-full max-w-md space-y-3">
                                {accounts.map(account => {
                                    const isSelected = selectedAccounts.includes(account.id);
                                    return (
                                        <button
                                            key={account.id}
                                            onClick={() => toggleAccount(account.id)}
                                            disabled={selecting}
                                            className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-all disabled:opacity-50 ${
                                                isSelected
                                                    ? 'border-[#4CAF6E]/30 bg-[#4CAF6E]/10'
                                                    : 'border-[#3D3C36] bg-[#24231F] hover:border-[#9B9689]/40 hover:bg-[#2E2D28]'
                                            }`}
                                        >
                                            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                                                isSelected ? 'border-[#4CAF6E] bg-[#4CAF6E]' : 'border-[#9B9689]/40'
                                            }`}>
                                                {isSelected && <Check className="h-3 w-3 text-[#1A1917]" />}
                                            </div>
                                            <div>
                                                <p className="font-medium text-[#E8E4DD]">{account.name}</p>
                                                <p className="mt-0.5 text-sm text-[#9B9689]">{account.id}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            {selectedAccounts.length > 0 && (
                                <p className="text-sm text-[#9B9689]">
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
                            <p className="max-w-md text-lg text-[#9B9689]">
                                Sign in with your Google Ads account. You&apos;ll get a prompt to paste into your AI.
                            </p>
                            <Button
                                size="lg"
                                onClick={beginGoogleSignIn}
                                className="h-14 rounded-full bg-[#4CAF6E] px-10 text-lg font-semibold text-[#1A1917] transition-all hover:scale-105 hover:bg-[#3D9A5C]"
                            >
                                Sign in with Google <ExternalLink className="ml-2 h-5 w-5" />
                            </Button>
                            <p className="text-xs text-[#9B9689]/60">OAuth 2.0 — we never see your password.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center space-y-8 text-center">
                            <h2 className="text-3xl font-bold text-[#E8E4DD] md:text-5xl">Set up your AI client</h2>

                            {/* Tab switcher */}
                            <div className="inline-flex flex-wrap justify-center rounded-lg border border-[#3D3C36] bg-[#24231F] p-1">
                                {([
                                    ['claude-code', 'Claude Code'],
                                    ['codex', 'Codex'],
                                    ['openclaw', 'OpenClaw'],
                                    ['claude-cowork', 'Claude Cowork'],
                                    ...(process.env.NODE_ENV === 'development' ? [['uninstall', 'Uninstall'] as const] : []),
                                ] as const).map(([id, label]) => (
                                    <button
                                        key={id}
                                        onClick={() => {
                                            setSetupTab(id);
                                            trackEvent('setup_tab_selected', { tab: id });
                                        }}
                                        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                                            setupTab === id
                                                ? 'bg-[#3D3C36] text-[#E8E4DD]'
                                                : 'text-[#9B9689] hover:text-[#E8E4DD]'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {setupTab === 'uninstall' ? (
                                <>
                                    <p className="max-w-md text-sm text-[#9B9689]">
                                        Run this in your terminal to remove AdsAgent from all clients.
                                    </p>

                                    <SetupCodeBlock
                                        content={UNINSTALL_COMMAND}
                                        copied={copied}
                                        onCopy={() => {
                                            navigator.clipboard.writeText(UNINSTALL_COMMAND);
                                            setCopied(true);
                                            setTimeout(() => setCopied(false), 2000);
                                        }}
                                    />
                                </>
                            ) : setupTab === 'claude-cowork' ? (
                                <>
                                    <p className="max-w-md text-sm text-[#9B9689]">
                                        Paste this into Claude Cowork. It will install the MCP server for you.
                                    </p>

                                    <SetupCodeBlock
                                        content={coworkPrompt}
                                        copied={copied}
                                        onCopy={() => {
                                            navigator.clipboard.writeText(coworkPrompt);
                                            setCopied(true);
                                            trackEvent('install_command_copied', { setup_tab: 'claude-cowork', step: 'install' });
                                            setTimeout(() => setCopied(false), 2000);
                                        }}
                                    />
                                </>
                            ) : (
                                <div className="w-full space-y-6 text-left">
                                    {/* Step 1 */}
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E] text-sm font-semibold text-[#1A1917]">1</span>
                                            <p className="text-sm font-medium text-[#E8E4DD]">Run install command in your terminal</p>
                                        </div>
                                        <div className="ml-10">
                                            <SetupCodeBlock
                                                content={prompt}
                                                copied={copied}
                                                onCopy={() => {
                                                    navigator.clipboard.writeText(prompt);
                                                    setCopied(true);
                                                    trackEvent('install_command_copied', { setup_tab: setupTab, step: 'install' });
                                                    setTimeout(() => setCopied(false), 2000);
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Step 2 */}
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E] text-sm font-semibold text-[#1A1917]">2</span>
                                            <p className="text-sm font-medium text-[#E8E4DD]">
                                                {setupTab === 'claude-code' ? (
                                                    <>
                                                        Run <code className="rounded bg-[#2E2D28] px-1.5 py-0.5 font-mono text-xs text-[#4CAF6E]">/ads</code> inside Claude Code to start managing your Google Ads with your AI.
                                                    </>
                                                ) : setupTab === 'codex' ? (
                                                    <>
                                                        Run <code className="rounded bg-[#2E2D28] px-1.5 py-0.5 font-mono text-xs text-[#4CAF6E]">$toprank-ads</code> inside Codex to start managing your Google Ads with your AI.
                                                    </>
                                                ) : (
                                                    <>
                                                        Start a new session with <code className="rounded bg-[#2E2D28] px-1.5 py-0.5 font-mono text-xs text-[#4CAF6E]">/new</code> and ask OpenClaw to <code className="rounded bg-[#2E2D28] px-1.5 py-0.5 font-mono text-xs text-[#4CAF6E]">use the ads skill to show my campaigns and their performance.</code>
                                                    </>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex w-full items-center gap-4">
                                <div className="h-px flex-1 bg-[#3D3C36]" />
                                <span className="text-xs font-medium uppercase tracking-[0.18em] text-[#9B9689]">or</span>
                                <div className="h-px flex-1 bg-[#3D3C36]" />
                            </div>

                            <div className="w-full rounded-lg border border-[#3D3C36] bg-[#24231F] p-5 text-left">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-[#E8E4DD]">Don&apos;t want to set up MCP yourself?</p>
                                        <p className="text-sm text-[#9B9689]">
                                            Try our agentic AI instead. AdsAgent Chat is already wired up and ready to use out of the box.
                                        </p>
                                    </div>
                                    <Button
                                        onClick={openAgenticAi}
                                        className="h-11 shrink-0 rounded-full bg-[#4CAF6E] px-6 text-sm font-semibold text-[#1A1917] transition-all hover:bg-[#3D9A5C]"
                                    >
                                        Open Chat
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
