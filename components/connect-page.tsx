'use client';

import { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Copy, Check, ExternalLink, AlertCircle, CheckCircle2, RotateCw, Key, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Session } from '@/lib/session';
import { startGoogleConnect } from '@/lib/google-oauth';
import { trackEvent } from '@/lib/analytics';

function imageKeyFromSrc(src: string): string {
    const file = src.split('/').pop() ?? src;
    return file.replace(/\.[^.]+$/, '').replace(/-/g, '_');
}

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
                <p className="mt-4 pr-24 text-xs text-[#C4C0B6]/60">
                    This contains your personal access token. Don&apos;t share it publicly.
                </p>
            </div>
        </div>
    );
}

function CopyButton({ text, onCopyTracked }: { text: string; onCopyTracked?: () => void }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => {
                navigator.clipboard.writeText(text);
                setCopied(true);
                onCopyTracked?.();
                setTimeout(() => setCopied(false), 2000);
            }}
            className="inline-flex shrink-0 rounded border border-[#3D3C36] bg-[#24231F] p-1 text-[#C4C0B6] transition-colors hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD]"
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

function CredentialField({ label, value, mono, onCopyTracked }: { label: string; value: string; mono?: boolean; onCopyTracked?: () => void }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="space-y-1.5">
            {label && <label className="text-[11px] font-semibold uppercase tracking-widest text-[#C4C0B6]">{label}</label>}
            <div className="flex items-center gap-2">
                <div className={`min-w-0 flex-1 truncate rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2 text-sm text-[#E8E4DD] ${mono ? 'font-mono' : ''}`}>
                    {value}
                </div>
                <button
                    onClick={() => {
                        navigator.clipboard.writeText(value);
                        setCopied(true);
                        onCopyTracked?.();
                        setTimeout(() => setCopied(false), 2000);
                    }}
                    className="shrink-0 rounded-lg border border-[#3D3C36] bg-[#24231F] p-2 text-[#C4C0B6] transition-colors hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD]"
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

    // Check for existing credentials on mount; auto-generate if none exist
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/oauth/clients', { credentials: 'include' });
                const data = await res.json();
                if (cancelled) return;
                if (data.exists) {
                    setCredentials({
                        client_id: data.client_id,
                        client_secret: data.client_secret,
                        mcp_server_url: data.mcp_server_url,
                    });
                    setLoading(false);
                } else {
                    setLoading(false);
                    generateCredentials();
                }
            } catch {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [generateCredentials]);

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
                    <p className="text-sm text-[#C4C0B6]">
                        Go to{' '}
                        <a
                            href="https://claude.ai/customize/connectors"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
                        >
                            claude.ai/customize/connectors
                        </a>{' '}
                        and click the <strong className="text-[#E8E4DD]">+</strong> icon, then choose <strong className="text-[#E8E4DD]">Add custom connector</strong>.
                    </p>
                    <SetupScreenshot
                        src="/connector-setup/01-add.png"
                        alt="Click the plus icon in Connectors and choose Add custom connector"
                    />
                </div>
            </div>

            {/* Step 2 */}
            <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/12 text-xs font-semibold text-[#4CAF6E]">2</span>
                    <p className="text-sm font-medium text-[#E8E4DD]">Configure the connector</p>
                </div>
                <div className="ml-8 space-y-3">
                    <p className="text-sm text-[#C4C0B6]">Fill in the connector form:</p>
                    <CredentialField
                        label="Name"
                        value="AdsAgent"
                        onCopyTracked={() => trackEvent('connector_credential_copied', { field: 'name' })}
                    />
                    <CredentialField
                        label="Remote MCP Server URL"
                        value={serverUrl}
                        onCopyTracked={() => trackEvent('connector_credential_copied', { field: 'server_url' })}
                    />

                    <p className="text-sm text-[#C4C0B6]">
                        Expand <strong className="text-[#E8E4DD]">Advanced Settings</strong> and enter:
                    </p>

                    {loading || generating || !credentials ? (
                        <div className="flex items-center gap-2 py-2">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#3D3C36] border-t-[#4CAF6E]" />
                            <span className="text-sm text-[#C4C0B6]">Preparing credentials...</span>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-sm text-[#C4C0B6]">
                                <strong className="text-[#E8E4DD]">Client ID:</strong>
                            </p>
                            <CredentialField
                                label=""
                                value={credentials.client_id}
                                mono
                                onCopyTracked={() => trackEvent('connector_credential_copied', { field: 'client_id' })}
                            />

                            <p className="text-sm text-[#C4C0B6]">
                                <strong className="text-[#E8E4DD]">Client Secret:</strong>
                            </p>
                            <CredentialField
                                label=""
                                value={credentials.client_secret}
                                mono
                                onCopyTracked={() => trackEvent('connector_credential_copied', { field: 'client_secret' })}
                            />

                            <button
                                onClick={() => setShowRegenConfirm(true)}
                                className="flex items-center gap-1.5 text-sm text-[#C4C0B6] transition-colors hover:text-[#E8E4DD]"
                            >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Regenerate credentials
                            </button>

                            {showRegenConfirm && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowRegenConfirm(false)}>
                                    <div className="mx-4 w-full max-w-md rounded-lg border border-[#3D3C36] bg-[#24231F] p-6" onClick={e => e.stopPropagation()}>
                                        <h3 className="text-lg font-semibold text-[#E8E4DD]">Regenerate credentials?</h3>
                                        <p className="mt-3 text-sm text-[#C4C0B6]">
                                            This will invalidate your current credentials. You&apos;ll need to <strong className="text-[#E8E4DD]">remove the existing connector</strong> in Claude and <strong className="text-[#E8E4DD]">add a new one</strong> with the new credentials.
                                        </p>
                                        <div className="mt-5 flex justify-end gap-3">
                                            <Button
                                                variant="outline"
                                                onClick={() => setShowRegenConfirm(false)}
                                                className="border-[#3D3C36] bg-[#24231F] text-[#C4C0B6] hover:bg-[#2E2D28] hover:text-[#E8E4DD]"
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

                    <SetupScreenshot
                        src="/connector-setup/02-configure.png"
                        alt="Add custom connector dialog with Name, Remote MCP Server URL, Client ID and Client Secret filled in under Advanced settings"
                    />
                </div>
            </div>

            {/* Step 3 */}
            <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/12 text-xs font-semibold text-[#4CAF6E]">3</span>
                    <p className="text-sm font-medium text-[#E8E4DD]">Add the connector</p>
                </div>
                <div className="ml-8 space-y-3">
                    <p className="text-sm text-[#C4C0B6]">
                        Click <strong className="text-[#E8E4DD]">Add</strong>. The <strong className="text-[#E8E4DD]">AdsAgent</strong> connector will appear in your Connectors list with all available tools.
                    </p>
                    <SetupScreenshot
                        src="/connector-setup/03-saved.png"
                        alt="AdsAgent connector saved and listed under Connectors with its tool permissions"
                    />
                </div>
            </div>

            {/* Step 4 */}
            <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/12 text-xs font-semibold text-[#4CAF6E]">4</span>
                    <p className="text-sm font-medium text-[#E8E4DD]">Install the toprank plugin</p>
                </div>
                <div className="ml-8 space-y-3">
                    <p className="text-sm text-[#C4C0B6]">
                        In the same <strong className="text-[#E8E4DD]">Customize</strong> panel, find <strong className="text-[#E8E4DD]">Personal plugins</strong>, click <strong className="text-[#E8E4DD]">+</strong>, then choose <strong className="text-[#E8E4DD]">Browse plugins</strong>. Paste the{' '}
                        <a
                            href="https://github.com/nowork-studio/toprank"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
                        >
                            toprank
                        </a>{' '}
                        repo URL into the <strong className="text-[#E8E4DD]">Add marketplace</strong> dialog and click <strong className="text-[#E8E4DD]">Sync</strong>. Toprank ships with pre-made Google Ads and SEO skills that teach Claude how to audit, optimize, and manage your campaigns alongside the AdsAgent connector.
                    </p>
                    <CredentialField
                        label="Marketplace URL"
                        value="https://github.com/nowork-studio/toprank"
                        onCopyTracked={() => trackEvent('connector_credential_copied', { field: 'plugin_marketplace_url' })}
                    />
                    <SetupScreenshot
                        src="/connector-setup/04a-browse-plugins.png"
                        alt="Customize panel with Personal plugins, click the plus icon and choose Browse plugins"
                    />
                    <SetupScreenshot
                        src="/connector-setup/04b-add-marketplace.png"
                        alt="Add marketplace dialog with the toprank GitHub URL pasted, then click Sync"
                    />
                </div>
            </div>

            {/* Step 5 */}
            <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/12 text-xs font-semibold text-[#4CAF6E]">5</span>
                    <p className="text-sm font-medium text-[#E8E4DD]">Enable AdsAgent in a chat</p>
                </div>
                <div className="ml-8 space-y-3">
                    <p className="text-sm text-[#C4C0B6]">
                        Open a new chat on <strong className="text-[#E8E4DD]">claude.ai</strong>, click the <strong className="text-[#E8E4DD]">+</strong> button, go to <strong className="text-[#E8E4DD]">Connectors</strong>, and toggle <strong className="text-[#E8E4DD]">AdsAgent</strong> on.
                    </p>
                    <SetupScreenshot
                        src="/connector-setup/04-enable-in-chat.png"
                        alt="In a Claude chat, open the + menu and toggle the AdsAgent connector on"
                    />
                </div>
            </div>

            {/* Step 6 */}
            <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/12 text-xs font-semibold text-[#4CAF6E]">6</span>
                    <p className="text-sm font-medium text-[#E8E4DD]">Ask Claude about your ads</p>
                </div>
                <div className="ml-8 space-y-3">
                    <p className="text-sm text-[#C4C0B6]">
                        Try a prompt like <em className="text-[#E8E4DD]">&ldquo;Audit my connected Google Ads account and tell me the 3 biggest optimization opportunities.&rdquo;</em> Claude will call AdsAgent tools to read your account and respond with insights.
                    </p>
                    <SetupScreenshot
                        src="/connector-setup/05-use-in-chat.png"
                        alt="Claude using the AdsAgent connector to audit a Google Ads account in a chat"
                    />
                </div>
            </div>
        </div>
    );
}

function SetupScreenshot({ src, alt }: { src: string; alt: string }) {
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (!expanded) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setExpanded(false);
        };
        window.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [expanded]);

    function handleExpand() {
        setExpanded(true);
        trackEvent('connector_screenshot_expanded', {
            image: imageKeyFromSrc(src),
            surface: 'in_app',
        });
    }

    return (
        <>
            <button
                type="button"
                onClick={handleExpand}
                className="group block w-full overflow-hidden rounded-lg border border-[#3D3C36] bg-[#1A1917] transition hover:border-[#4CAF6E]/60"
                aria-label={`Expand image: ${alt}`}
            >
                <Image
                    src={src}
                    alt={alt}
                    width={1200}
                    height={750}
                    className="h-auto w-full transition-transform duration-200 group-hover:scale-[1.01]"
                    unoptimized
                />
            </button>
            {expanded && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 sm:p-8"
                    onClick={() => setExpanded(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-label={alt}
                >
                    <button
                        type="button"
                        onClick={() => setExpanded(false)}
                        className="absolute right-4 top-4 rounded-full bg-[#24231F] px-3 py-1.5 text-sm text-[#E8E4DD] shadow-md hover:bg-[#2E2D28]"
                    >
                        Close
                    </button>
                    <Image
                        src={src}
                        alt={alt}
                        width={2400}
                        height={1500}
                        className="max-h-[90vh] w-auto max-w-[95vw] rounded-lg object-contain shadow-2xl"
                        onClick={e => e.stopPropagation()}
                        unoptimized
                    />
                </div>
            )}
        </>
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
                    <p className="text-sm text-[#C4C0B6]">Inside Claude Code, run these commands:</p>
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <code className="flex-1 rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2 font-mono text-sm text-[#E8E4DD]/80">/plugin marketplace add nowork-studio/toprank</code>
                            <CopyButton
                                text="/plugin marketplace add nowork-studio/toprank"
                                onCopyTracked={() => trackEvent('install_command_copied', { setup_tab: 'claude-code', step: 'marketplace_add' })}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2 font-mono text-sm text-[#E8E4DD]/80">/plugin install toprank@nowork-studio</code>
                            <CopyButton
                                text="/plugin install toprank@nowork-studio"
                                onCopyTracked={() => trackEvent('install_command_copied', { setup_tab: 'claude-code', step: 'plugin_install' })}
                            />
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
                <div className="ml-8 space-y-2">
                    <p className="text-sm text-[#C4C0B6]">Restart Claude Code and run:</p>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2 font-mono text-sm text-[#E8E4DD]/80">/ads</code>
                        <CopyButton
                            text="/ads"
                            onCopyTracked={() => trackEvent('install_command_copied', { setup_tab: 'claude-code', step: 'ads_command' })}
                        />
                    </div>
                </div>
            </div>

            {/* Step 3 */}
            <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/12 text-xs font-semibold text-[#4CAF6E]">3</span>
                    <p className="text-sm font-medium text-[#E8E4DD]">Paste your API key</p>
                </div>
                <div className="ml-8 space-y-2">
                    <p className="text-sm text-[#C4C0B6]">
                        Claude will ask you for your API key. Paste it into Claude Code:
                    </p>
                    <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2 font-mono text-sm text-[#E8E4DD]/80">{token}</code>
                        <CopyButton
                            text={token}
                            onCopyTracked={() => trackEvent('install_command_copied', { setup_tab: 'claude-code', step: 'api_key' })}
                        />
                    </div>
                    <p className="text-xs text-[#C4C0B6]/60">
                        This is your personal access token. Don&apos;t share it publicly.
                    </p>
                </div>
            </div>
        </div>
    );
}

function SetupTabs({ prompt, copied, onCopy, onOpenChat, token, activeTab, codeSubTab }: {
    prompt: string;
    copied: boolean;
    onCopy: () => void;
    onOpenChat: () => void;
    token: string;
    activeTab: SetupTab;
    codeSubTab: ClaudeCodeSubTab;
}) {
    return (
        <div className="flex flex-col items-center space-y-8 text-center">
            <h2 className="text-3xl font-bold text-[#E8E4DD] md:text-5xl">Set up your client</h2>
            {/* Tab switcher */}
            <div className="flex w-full max-w-md rounded-lg border border-[#3D3C36] bg-[#1A1917] p-1">
                <Link
                    href="/connect/claude-code/manual"
                    prefetch
                    className={`flex-1 rounded-md px-4 py-2.5 text-center text-sm font-medium transition-all duration-150 ${activeTab === 'claude-code'
                            ? 'bg-[#24231F] text-[#E8E4DD] shadow-sm'
                            : 'text-[#C4C0B6] hover:text-[#E8E4DD]'
                        }`}
                >
                    Claude Code
                </Link>
                <Link
                    href="/connect/claude-connector"
                    prefetch
                    className={`flex-1 whitespace-nowrap rounded-md px-4 py-2.5 text-center text-sm font-medium transition-all duration-150 ${activeTab === 'connector'
                            ? 'bg-[#24231F] text-[#E8E4DD] shadow-sm'
                            : 'text-[#C4C0B6] hover:text-[#E8E4DD]'
                        }`}
                >
                    Claude Connector (Web / Cowork)
                </Link>
            </div>

            {/* Tab content */}
            {activeTab === 'claude-code' ? (
                <>
                    {/* Sub-tab switcher */}
                    <div className="flex w-full max-w-xs rounded-md border border-[#3D3C36]/60 bg-[#1A1917]/60 p-0.5">
                        <Link
                            href="/connect/claude-code/manual"
                            prefetch
                            className={`flex-1 rounded px-3 py-1.5 text-center text-xs font-medium transition-all duration-150 ${codeSubTab === 'manual'
                                    ? 'bg-[#2E2D28] text-[#E8E4DD] shadow-sm'
                                    : 'text-[#C4C0B6] hover:text-[#E8E4DD]'
                                }`}
                        >
                            Install manually
                        </Link>
                        <Link
                            href="/connect/claude-code/auto"
                            prefetch
                            className={`flex-1 rounded px-3 py-1.5 text-center text-xs font-medium transition-all duration-150 ${codeSubTab === 'auto'
                                    ? 'bg-[#2E2D28] text-[#E8E4DD] shadow-sm'
                                    : 'text-[#C4C0B6] hover:text-[#E8E4DD]'
                                }`}
                        >
                            Let Claude set it up
                        </Link>
                    </div>

                    {codeSubTab === 'auto' ? (
                        <>
                            <p className="max-w-md text-sm text-[#C4C0B6]">
                                Copy this prompt and paste it into Claude Code. It will install the toprank plugin and configure your API key automatically.
                            </p>
                            <SetupCodeBlock content={prompt} copied={copied} onCopy={onCopy} />
                            <p className="max-w-md text-sm text-[#C4C0B6]">
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
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-[#C4C0B6]">or</span>
                <div className="h-px flex-1 bg-[#3D3C36]" />
            </div>

            <div className="w-full rounded-lg border border-[#3D3C36] bg-[#24231F] p-5 text-left">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-[#E8E4DD]">Don&apos;t want to set up MCP yourself?</p>
                        <p className="text-sm text-[#C4C0B6]">
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

function parseSlug(slug?: string[]): { activeTab: SetupTab; codeSubTab: ClaudeCodeSubTab } {
    if (!slug || slug.length === 0) return { activeTab: 'connector', codeSubTab: 'manual' };
    if (slug[0] === 'claude-connector') return { activeTab: 'connector', codeSubTab: 'manual' };
    if (slug[0] === 'claude-code') {
        const sub = slug[1] === 'auto' ? 'auto' : 'manual';
        return { activeTab: 'claude-code', codeSubTab: sub };
    }
    return { activeTab: 'connector', codeSubTab: 'manual' };
}

function ConnectContent({ initialSession, slug }: { initialSession: Session; slug?: string[] }) {
    const { activeTab, codeSubTab } = parseSlug(slug);
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
    const [showRotateConfirm, setShowRotateConfirm] = useState(false);
    const [keyCopied, setKeyCopied] = useState(false);
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

    const token = urlToken || (session.connected ? session.token : null);
    const customerName = urlCustomerName || (session.connected ? session.customerName : null);
    const actionBtnClass = 'flex items-center gap-2 rounded-lg border border-[#3D3C36] bg-[#24231F] px-4 py-2 text-sm text-[#C4C0B6] transition-all hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD]';

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
            // account_connected is now fired centrally from PostHogProvider
            // via the gads_connect_event cookie set by the auth callback.
            window.history.replaceState({}, '', '/connect/claude-code/manual');
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
                        <p className="mt-0.5 text-sm text-[#C4C0B6]">Connect Google Ads and get the setup prompt for Claude Code.</p>
                    </div>
                    {token ? (
                        <div className="flex flex-wrap items-center justify-end gap-3">
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(token);
                                    setKeyCopied(true);
                                    setTimeout(() => setKeyCopied(false), 2000);
                                }}
                                className={actionBtnClass}
                            >
                                {keyCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                {keyCopied ? 'Copied' : 'Copy API Key'}
                            </button>
                            <button
                                onClick={() => setShowRotateConfirm(true)}
                                disabled={rotating}
                                className={`${actionBtnClass} disabled:opacity-50`}
                            >
                                <RotateCw className={`h-4 w-4 ${rotating ? 'animate-spin' : ''}`} />
                                {rotating ? 'Rotating...' : 'Rotate API Key'}
                            </button>
                        </div>
                    ) : null}
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
                <div className="mx-auto max-w-2xl">
                    {error && (
                        <div className="mb-8 rounded-lg border border-[#C45D4A]/30 bg-[#C45D4A]/10 p-5">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#C45D4A]" />
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-[#C45D4A]">{error}</p>
                                    {error.toLowerCase().includes("permission") && (
                                        <p className="text-xs text-[#C45D4A]/80">
                                            AdsAgent needs Google Ads access to manage your campaigns. On the Google consent screen, make sure the &quot;Google Ads&quot; checkbox stays checked.
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
                            activeTab={activeTab}
                            codeSubTab={codeSubTab}
                        />
                    )}
                </div>
            </div>
            {/* Rotate API Key confirmation modal */}
            {showRotateConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="mx-4 w-full max-w-md rounded-xl border border-[#3D3C36] bg-[#24231F] p-6 shadow-2xl">
                        <h3 className="text-lg font-semibold text-[#E8E4DD]">Rotate API Key?</h3>
                        <p className="mt-2 text-sm text-[#C4C0B6]">
                            This will invalidate your current API key immediately. Any integrations using the old key will stop working until updated with the new one.
                        </p>
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setShowRotateConfirm(false)}
                                className="rounded-lg border border-[#3D3C36] px-4 py-2 text-sm text-[#C4C0B6] transition hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD]"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    setShowRotateConfirm(false);
                                    rotateToken();
                                }}
                                className="rounded-lg bg-[#C45D4A] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#B04E3D]"
                            >
                                Rotate API Key
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
