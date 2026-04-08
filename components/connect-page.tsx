'use client';

import { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Copy, Check, ExternalLink, AlertCircle, CheckCircle2, Plus, RotateCw, Key, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Session } from '@/lib/session';
import { startGoogleConnect } from '@/lib/google-oauth';
import { trackEvent } from '@/lib/analytics';

function buildSetupPrompt(token: string): string {
    return `Set up AdsAgent for Claude Code:

1. Add your API key to ~/.claude/settings.json:

{
  "env": {
    "ADSAGENT_API_KEY": "${token}"
  }
}

2. Run these commands in Claude Code:

/plugin marketplace add nowork-studio/toprank
/plugin install toprank@nowork-studio
/reload-plugins

3. Use /ads to manage your Google Ads.`;
}

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

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => {
                navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }}
            className="inline-flex shrink-0 rounded border border-[#3D3C36] bg-[#24231F] p-1 text-[#9B9689] transition-colors hover:border-[#9B9689]/40 hover:text-[#E8E4DD]"
        >
            {copied ? <Check className="h-3 w-3 text-[#4CAF6E]" /> : <Copy className="h-3 w-3" />}
        </button>
    );
}

type OAuthCredentials = {
    client_id: string;
    client_secret: string;
    mcp_server_url: string;
};

function CredentialField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="space-y-1.5">
            {label && <label className="text-[11px] font-semibold uppercase tracking-widest text-[#9B9689]">{label}</label>}
            <div className="flex items-center gap-2">
                <div className={`min-w-0 flex-1 truncate rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2 text-sm text-[#E8E4DD] ${mono ? 'font-mono' : ''}`}>
                    {value}
                </div>
                <button
                    onClick={() => {
                        navigator.clipboard.writeText(value);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                    }}
                    className="shrink-0 rounded-lg border border-[#3D3C36] bg-[#24231F] p-2 text-[#9B9689] transition-colors hover:border-[#9B9689]/40 hover:text-[#E8E4DD]"
                >
                    {copied ? <Check className="h-4 w-4 text-[#4CAF6E]" /> : <Copy className="h-4 w-4" />}
                </button>
            </div>
        </div>
    );
}

function ClaudeConnectorSection() {
    const [credentials, setCredentials] = useState<OAuthCredentials | null>(null);
    const [generating, setGenerating] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showRegenConfirm, setShowRegenConfirm] = useState(false);

    // Check for existing credentials on mount
    useEffect(() => {
        fetch('/api/oauth/clients', { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                if (data.exists) {
                    setCredentials({
                        client_id: data.client_id,
                        client_secret: data.client_secret,
                        mcp_server_url: data.mcp_server_url,
                    });
                }
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const generateCredentials = useCallback(async () => {
        setGenerating(true);
        setError(null);
        try {
            const res = await fetch('/api/oauth/clients', {
                method: 'POST',
                credentials: 'include',
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Failed to generate credentials');
                return;
            }
            setCredentials(data);
            trackEvent('oauth_credentials_generated');
        } catch {
            setError('Failed to generate credentials');
        } finally {
            setGenerating(false);
        }
    }, []);

    const serverUrl = credentials?.mcp_server_url ?? 'https://adsagent.org/api/mcp';

    return (
        <div className="w-full space-y-6 text-left">
            {error && (
                <div className="flex items-start gap-2 rounded-lg border border-[#C45D4A]/30 bg-[#C45D4A]/10 p-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#C45D4A]" />
                    <p className="text-sm text-[#C45D4A]">{error}</p>
                </div>
            )}

            {/* Step 1 */}
            <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/12 text-xs font-semibold text-[#4CAF6E]">1</span>
                    <p className="text-sm font-medium text-[#E8E4DD]">Open Claude Connectors</p>
                </div>
                <div className="ml-8">
                    <p className="text-sm text-[#9B9689]">
                        Go to{' '}
                        <a
                            href="https://claude.ai/customize/connectors"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
                        >
                            claude.ai/customize/connectors
                        </a>{' '}
                        and click the <strong className="text-[#E8E4DD]">+</strong> icon to add a custom connector.
                    </p>
                </div>
            </div>

            {/* Step 2 */}
            <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/12 text-xs font-semibold text-[#4CAF6E]">2</span>
                    <p className="text-sm font-medium text-[#E8E4DD]">Configure the connector</p>
                </div>
                <div className="ml-8 space-y-3">
                    <p className="text-sm text-[#9B9689]">Fill in the connector form:</p>
                    <CredentialField label="Name" value="AdsAgent" />
                    <CredentialField label="Remote MCP Server URL" value={serverUrl} />

                    <p className="text-sm text-[#9B9689]">
                        Expand <strong className="text-[#E8E4DD]">Advanced Settings</strong> and enter:
                    </p>

                    {loading ? (
                        <div className="flex items-center gap-2 py-2">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#3D3C36] border-t-[#4CAF6E]" />
                            <span className="text-sm text-[#9B9689]">Loading credentials...</span>
                        </div>
                    ) : !credentials ? (
                        <div className="space-y-3">
                            <p className="text-sm text-[#9B9689]">Generate credentials to get your Client ID and Client Secret.</p>
                            <Button
                                onClick={generateCredentials}
                                disabled={generating}
                                className="h-10 rounded-lg bg-[#4CAF6E] px-5 text-sm font-semibold text-[#1A1917] transition-all hover:bg-[#3D9A5C] disabled:opacity-50"
                            >
                                {generating ? (
                                    <>
                                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    'Generate Credentials'
                                )}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <ul className="space-y-1.5 text-sm text-[#9B9689]">
                                <li className="flex gap-2">
                                    <span className="shrink-0 text-[#9B9689]/60">&#8226;</span>
                                    <span><strong className="text-[#E8E4DD]">Client ID:</strong></span>
                                </li>
                            </ul>
                            <div className="ml-4">
                                <CredentialField label="" value={credentials.client_id} mono />
                            </div>

                            <ul className="space-y-1.5 text-sm text-[#9B9689]">
                                <li className="flex gap-2">
                                    <span className="shrink-0 text-[#9B9689]/60">&#8226;</span>
                                    <span><strong className="text-[#E8E4DD]">Client Secret:</strong></span>
                                </li>
                            </ul>

                            <div className="ml-4">
                                <CredentialField label="" value={credentials.client_secret} mono />
                            </div>

                            <button
                                onClick={() => setShowRegenConfirm(true)}
                                className="flex items-center gap-1.5 text-sm text-[#9B9689] transition-colors hover:text-[#E8E4DD]"
                            >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Regenerate credentials
                            </button>

                            {showRegenConfirm && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowRegenConfirm(false)}>
                                    <div className="mx-4 w-full max-w-md rounded-lg border border-[#3D3C36] bg-[#24231F] p-6" onClick={e => e.stopPropagation()}>
                                        <h3 className="text-lg font-semibold text-[#E8E4DD]">Regenerate credentials?</h3>
                                        <p className="mt-3 text-sm text-[#9B9689]">
                                            This will invalidate your current credentials. You&apos;ll need to <strong className="text-[#E8E4DD]">remove the existing connector</strong> in Claude and <strong className="text-[#E8E4DD]">add a new one</strong> with the new credentials.
                                        </p>
                                        <div className="mt-5 flex justify-end gap-3">
                                            <Button
                                                variant="outline"
                                                onClick={() => setShowRegenConfirm(false)}
                                                className="border-[#3D3C36] bg-[#24231F] text-[#9B9689] hover:bg-[#2E2D28] hover:text-[#E8E4DD]"
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                onClick={() => {
                                                    setShowRegenConfirm(false);
                                                    setCredentials(null);
                                                    generateCredentials();
                                                }}
                                                className="bg-[#C45D4A] text-white hover:bg-[#C45D4A]/80"
                                            >
                                                Regenerate
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Step 3 */}
            <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/12 text-xs font-semibold text-[#4CAF6E]">3</span>
                    <p className="text-sm font-medium text-[#E8E4DD]">Save and start using</p>
                </div>
                <div className="ml-8">
                    <p className="text-sm text-[#9B9689]">
                        Click <strong className="text-[#E8E4DD]">Save</strong>. Claude will now have access to your Google Ads tools through AdsAgent.
                    </p>
                </div>
            </div>
        </div>
    );
}

type SetupTab = 'claude-code' | 'connector';
type ClaudeCodeSubTab = 'auto' | 'manual';

function ClaudeCodeManualSection({ token }: { token: string }) {
    return (
        <div className="w-full space-y-6 text-left">
            {/* Step 1 */}
            <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/12 text-xs font-semibold text-[#4CAF6E]">1</span>
                    <p className="text-sm font-medium text-[#E8E4DD]">Install the toprank plugin</p>
                </div>
                <div className="ml-8 space-y-2">
                    <p className="text-sm text-[#9B9689]">Inside Claude Code, run these commands:</p>
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <code className="flex-1 rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2 font-mono text-sm text-[#E8E4DD]/80">/plugin marketplace add nowork-studio/toprank</code>
                            <CopyButton text="/plugin marketplace add nowork-studio/toprank" />
                        </div>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2 font-mono text-sm text-[#E8E4DD]/80">/plugin install toprank@nowork-studio</code>
                            <CopyButton text="/plugin install toprank@nowork-studio" />
                        </div>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2 font-mono text-sm text-[#E8E4DD]/80">/reload-plugins</code>
                            <CopyButton text="/reload-plugins" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Step 2 */}
            <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/12 text-xs font-semibold text-[#4CAF6E]">2</span>
                    <p className="text-sm font-medium text-[#E8E4DD]">Run /ads</p>
                </div>
                <div className="ml-8">
                    <p className="text-sm text-[#9B9689]">
                        Restart Claude Code and run{' '}
                        <code className="rounded bg-[#2E2D28] px-1.5 py-0.5 font-mono text-xs text-[#4CAF6E]">/ads</code>{' '}
                        to start managing your Google Ads.
                    </p>
                </div>
            </div>

            {/* Step 3 */}
            <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/12 text-xs font-semibold text-[#4CAF6E]">3</span>
                    <p className="text-sm font-medium text-[#E8E4DD]">Paste your API key</p>
                </div>
                <div className="ml-8 space-y-2">
                    <p className="text-sm text-[#9B9689]">
                        Claude will ask you for your API key. Paste it into Claude Code:
                    </p>
                    <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2 font-mono text-sm text-[#E8E4DD]/80">{token}</code>
                        <CopyButton text={token} />
                    </div>
                    <p className="text-xs text-[#9B9689]/60">
                        This is your personal access token. Don&apos;t share it publicly.
                    </p>
                </div>
            </div>
        </div>
    );
}

function SetupTabs({ prompt, copied, onCopy, onOpenChat, token }: {
    prompt: string;
    copied: boolean;
    onCopy: () => void;
    onOpenChat: () => void;
    token: string;
}) {
    const [activeTab, setActiveTab] = useState<SetupTab>('claude-code');
    const [codeSubTab, setCodeSubTab] = useState<ClaudeCodeSubTab>('auto');

    return (
        <div className="flex flex-col items-center space-y-8 text-center">
            <h2 className="text-3xl font-bold text-[#E8E4DD] md:text-5xl">Set up your client</h2>
            {/* Tab switcher */}
            <div className="flex w-full max-w-md rounded-lg border border-[#3D3C36] bg-[#1A1917] p-1">
                <button
                    onClick={() => setActiveTab('claude-code')}
                    className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-all duration-150 ${activeTab === 'claude-code'
                            ? 'bg-[#24231F] text-[#E8E4DD] shadow-sm'
                            : 'text-[#9B9689] hover:text-[#E8E4DD]'
                        }`}
                >
                    Claude Code
                </button>
                <button
                    onClick={() => setActiveTab('connector')}
                    className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-all duration-150 ${activeTab === 'connector'
                            ? 'bg-[#24231F] text-[#E8E4DD] shadow-sm'
                            : 'text-[#9B9689] hover:text-[#E8E4DD]'
                        }`}
                >
                    Claude Connector
                </button>
            </div>

            {/* Tab content */}
            {activeTab === 'claude-code' ? (
                <>
                    {/* Sub-tab switcher */}
                    <div className="flex w-full max-w-xs rounded-md border border-[#3D3C36]/60 bg-[#1A1917]/60 p-0.5">
                        <button
                            onClick={() => setCodeSubTab('auto')}
                            className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-all duration-150 ${codeSubTab === 'auto'
                                    ? 'bg-[#2E2D28] text-[#E8E4DD] shadow-sm'
                                    : 'text-[#9B9689] hover:text-[#E8E4DD]'
                                }`}
                        >
                            Let Claude set it up
                        </button>
                        <button
                            onClick={() => setCodeSubTab('manual')}
                            className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-all duration-150 ${codeSubTab === 'manual'
                                    ? 'bg-[#2E2D28] text-[#E8E4DD] shadow-sm'
                                    : 'text-[#9B9689] hover:text-[#E8E4DD]'
                                }`}
                        >
                            Install manually
                        </button>
                    </div>

                    {codeSubTab === 'auto' ? (
                        <>
                            <p className="max-w-md text-sm text-[#9B9689]">
                                Copy this prompt and paste it into Claude Code. It will install the toprank plugin and configure your API key automatically.
                            </p>
                            <SetupCodeBlock content={prompt} copied={copied} onCopy={onCopy} />
                            <p className="max-w-md text-sm text-[#9B9689]">
                                After setup, restart Claude Code and run{' '}
                                <code className="rounded bg-[#2E2D28] px-1.5 py-0.5 font-mono text-xs text-[#4CAF6E]">/ads</code>{' '}
                                to start managing your Google Ads.
                            </p>
                        </>
                    ) : (
                        <ClaudeCodeManualSection token={token} />
                    )}
                </>
            ) : (
                <ClaudeConnectorSection />
            )}

            {/* Chat CTA */}
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
                        onClick={onOpenChat}
                        className="h-11 shrink-0 rounded-full bg-[#4CAF6E] px-6 text-sm font-semibold text-[#1A1917] transition-all hover:bg-[#3D9A5C]"
                    >
                        Open Chat
                    </Button>
                </div>
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
    const nextAfterConnect = searchParams.get('next') ?? '/connect';

    const [session, setSession] = useState<Session>(initialSession);
    const [error, setError] = useState<string | null>(urlError);
    const [copied, setCopied] = useState(false);
    const [selecting, setSelecting] = useState(false);
    const [rotating, setRotating] = useState(false);
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

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
                    next: nextAfterConnect,
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
                        <p className="mt-0.5 text-sm text-[#9B9689]">Connect Google Ads and get the setup prompt for Claude Code.</p>
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
                        <div className="mb-8 rounded-lg border border-[#C45D4A]/30 bg-[#C45D4A]/10 p-4">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#C45D4A]" />
                                <p className="text-sm text-[#C45D4A]">{error}</p>
                            </div>
                            <button
                                onClick={beginGoogleSignIn}
                                className="mt-3 ml-8 text-sm font-medium text-[#C45D4A] underline underline-offset-2 hover:text-[#E8E4DD]"
                            >
                                Try again
                            </button>
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
                                            className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-all disabled:opacity-50 ${isSelected
                                                    ? 'border-[#4CAF6E]/30 bg-[#4CAF6E]/10'
                                                    : 'border-[#3D3C36] bg-[#24231F] hover:border-[#9B9689]/40 hover:bg-[#2E2D28]'
                                                }`}
                                        >
                                            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${isSelected ? 'border-[#4CAF6E] bg-[#4CAF6E]' : 'border-[#9B9689]/40'
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
                                Sign in with your Google Ads account. You&apos;ll get a setup prompt to paste into Claude Code.
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
                        <SetupTabs
                            prompt={prompt}
                            copied={copied}
                            onCopy={() => {
                                navigator.clipboard.writeText(prompt);
                                setCopied(true);
                                trackEvent('install_command_copied', { setup_tab: 'claude-code', step: 'install' });
                                setTimeout(() => setCopied(false), 2000);
                            }}
                            onOpenChat={openAgenticAi}
                            token={token}
                        />
                    )}
                </div>
            </div>
        </section>
    );
}
