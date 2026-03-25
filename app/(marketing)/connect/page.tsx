'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Copy, Check, ExternalLink, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

function CopyBlock({ label, text }: { label: string; text: string }) {
    const [copied, setCopied] = useState(false);

    return (
        <div>
            <label className="text-sm font-medium text-zinc-400 mb-2 block">{label}</label>
            <div className="flex items-center bg-zinc-950 rounded-lg border border-zinc-700 px-4 py-3 font-mono text-sm text-blue-300">
                <span className="flex-1 truncate select-all">{text}</span>
                <button
                    onClick={() => {
                        navigator.clipboard.writeText(text);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                    }}
                    className="ml-2 p-1.5 rounded-md hover:bg-zinc-700 transition-colors flex-shrink-0"
                >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-zinc-400" />}
                </button>
            </div>
        </div>
    );
}

export default function ConnectPage() {
    return (
        <Suspense fallback={
            <div className="pt-24 pb-16 px-4 flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-700 border-t-blue-400" />
            </div>
        }>
            <ConnectContent />
        </Suspense>
    );
}

function ConnectContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const customerName = searchParams.get('customer_name');
    const error = searchParams.get('error');

    const [mcpUrl, setMcpUrl] = useState('');

    useEffect(() => {
        setMcpUrl(`${window.location.origin}/api/mcp`);
    }, []);

    const configJson = token
        ? JSON.stringify({
            adsagent: {
                url: mcpUrl,
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            },
        }, null, 2)
        : '';

    return (
        <div className="pt-24 pb-16 px-4">
            <div className="container mx-auto max-w-2xl">
                <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">Connect Your Ads</h1>
                <p className="text-zinc-400 text-lg mb-12">
                    Sign in with Google to get your personal MCP config. One copy-paste and your AI agent can manage your ads.
                </p>

                {error && (
                    <div className="mb-8 p-4 rounded-xl border border-red-900/50 bg-red-950/30 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-red-300 text-sm">{decodeURIComponent(error)}</p>
                    </div>
                )}

                {!token ? (
                    /* Step 1: Sign in */
                    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-8 text-center">
                        <h2 className="text-xl font-semibold text-white mb-3">Step 1: Sign in with Google Ads</h2>
                        <p className="text-zinc-400 text-sm mb-6">
                            We'll connect to your Google Ads account and generate a personal token for your AI agent.
                        </p>
                        <Link href="/api/auth/mcp/signin">
                            <Button size="lg" className="h-14 px-10 text-lg font-semibold bg-white text-black hover:bg-zinc-200 rounded-full">
                                Sign in with Google <ExternalLink className="w-5 h-5 ml-2" />
                            </Button>
                        </Link>
                        <p className="text-zinc-600 text-xs mt-4">
                            We use OAuth 2.1 — we never see your Google password.
                            You can revoke access anytime from your Google account settings.
                        </p>
                    </div>
                ) : (
                    /* Step 2: Show config */
                    <div className="space-y-8">
                        <div className="p-4 rounded-xl border border-green-900/50 bg-green-950/30">
                            <p className="text-green-300 text-sm">
                                Connected to <strong>{customerName || 'Google Ads'}</strong>. Your personal MCP config is ready.
                            </p>
                        </div>

                        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-8 space-y-6">
                            <h2 className="text-xl font-semibold text-white">Step 2: Add to your AI agent</h2>

                            <div>
                                <h3 className="text-white font-medium mb-2">Claude Coworker</h3>
                                <p className="text-zinc-400 text-sm mb-3">Settings &rarr; MCP Servers &rarr; Add Server &rarr; paste the URL and add the authorization header:</p>
                                <CopyBlock label="Server URL" text={mcpUrl} />
                                <div className="mt-3">
                                    <CopyBlock label="Authorization Header" text={`Bearer ${token}`} />
                                </div>
                            </div>

                            <div className="border-t border-zinc-800 pt-6">
                                <h3 className="text-white font-medium mb-2">Cursor / Other MCP Clients</h3>
                                <p className="text-zinc-400 text-sm mb-3">Add this to your MCP config file:</p>
                                <div className="relative">
                                    <pre className="bg-zinc-950 rounded-lg p-4 text-xs text-zinc-300 overflow-x-auto border border-zinc-800 select-all">
                                        {configJson}
                                    </pre>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(configJson);
                                        }}
                                        className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-zinc-700 transition-colors"
                                        title="Copy config"
                                    >
                                        <Copy className="w-4 h-4 text-zinc-400" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/30">
                            <h3 className="text-sm font-medium text-zinc-400 mb-2">Your token is personal</h3>
                            <p className="text-sm text-zinc-500 leading-relaxed">
                                This token is tied to your Google Ads account. Don't share it — anyone with this token
                                can read and modify your campaigns through the MCP server.
                                Your token expires in 1 year. Come back here to generate a new one.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
