'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Zap, ShieldCheck, TrendingUp, DollarSign, Search, PauseCircle, Target, Copy, Check } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

function GridPattern() {
    return (
        <div className="absolute inset-0 z-0 flex items-center justify-center opacity-[0.15] pointer-events-none">
            <div className="absolute h-full w-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
            <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-blue-500 opacity-20 blur-[100px]" />
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
            className="ml-2 p-1.5 rounded-md hover:bg-zinc-700 transition-colors"
            title="Copy to clipboard"
        >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-zinc-400" />}
        </button>
    );
}

export default function Home() {
    const mcpUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/api/mcp`
        : 'https://your-domain.vercel.app/api/mcp';

    return (
        <>
            {/* Hero */}
            <section className="relative flex flex-col items-center justify-center min-h-[90vh] py-20 px-4 overflow-hidden">
                <GridPattern />

                <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-600/20 rounded-full blur-[128px] pointer-events-none"
                />
                <motion.div
                    animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.4, 0.2] }}
                    transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                    className="absolute bottom-1/4 -right-20 w-96 h-96 bg-emerald-600/20 rounded-full blur-[128px] pointer-events-none"
                />

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="z-10 flex flex-col items-center max-w-5xl mx-auto text-center space-y-8"
                >
                    <div className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-300 backdrop-blur-xl mb-4">
                        <span className="flex h-2 w-2 rounded-full bg-blue-400 mr-2 animate-pulse" />
                        MCP Server for Google Ads
                    </div>

                    <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight drop-shadow-2xl leading-[0.95]">
                        <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/50">Your AI ads advisor</span>
                        <br />
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-400">on your side</span>
                    </h1>

                    <p className="text-zinc-400 text-lg md:text-xl font-light tracking-wide max-w-2xl mx-auto leading-relaxed">
                        An MCP server that connects your Google Ads account to Claude, Cursor, or any AI tool.
                        It tells you what to change, makes the change with your approval, and tracks whether it worked.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <Link href="#connect">
                            <Button size="lg" className="h-14 px-10 text-lg font-semibold bg-white text-black hover:bg-zinc-200 rounded-full transition-all hover:scale-105 shadow-[0_0_40px_rgba(255,255,255,0.3)]">
                                Connect Now <ArrowRight className="w-5 h-5 ml-2" />
                            </Button>
                        </Link>
                        <Link href="/chat">
                            <Button size="lg" variant="outline" className="h-14 px-10 text-lg font-semibold rounded-full border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500">
                                Try the Demo
                            </Button>
                        </Link>
                    </div>

                    <p className="text-zinc-600 text-sm">Free to use. No credit card required.</p>
                </motion.div>
            </section>

            {/* How It Works */}
            <section className="py-24 bg-black px-4 relative z-10">
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />
                <div className="container mx-auto max-w-5xl">
                    <h2 className="text-3xl md:text-5xl font-bold text-center mb-16 bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-500">
                        How it works
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {[
                            {
                                step: "1",
                                title: "Connect",
                                description: "Add the AdsAgent MCP server URL to Claude Coworker, Cursor, or any MCP-compatible AI tool. Authorize with your Google Ads account."
                            },
                            {
                                step: "2",
                                title: "Get Recommendations",
                                description: "Ask your AI: \"How are my ads doing?\" AdsAgent analyzes your campaigns, keywords, and search terms, then ranks what to change by estimated dollar impact."
                            },
                            {
                                step: "3",
                                title: "Execute & Track",
                                description: "Approve the changes right in your AI tool. AdsAgent tracks every change and reports whether it improved your numbers."
                            }
                        ].map((item) => (
                            <div key={item.step} className="relative p-8 rounded-2xl border border-zinc-800 bg-zinc-900/30">
                                <div className="text-5xl font-bold text-zinc-800 mb-4">{item.step}</div>
                                <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
                                <p className="text-zinc-400 leading-relaxed">{item.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* What It Can Do */}
            <section id="features" className="py-24 bg-zinc-950/50 px-4 border-t border-zinc-900">
                <div className="container mx-auto max-w-5xl">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-500 mb-4">
                            Intelligence, not just tools
                        </h2>
                        <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                            Other Google Ads tools give you buttons to push. AdsAgent tells you <em>which</em> buttons to push and <em>why</em>.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {[
                            {
                                icon: <DollarSign className="w-6 h-6 text-red-400" />,
                                title: "Find Wasted Spend",
                                description: "Identifies keywords burning money with zero conversions and recommends pausing them."
                            },
                            {
                                icon: <Search className="w-6 h-6 text-blue-400" />,
                                title: "Block Irrelevant Traffic",
                                description: "Analyzes your search term report to find queries that cost money but never convert. Adds them as negative keywords."
                            },
                            {
                                icon: <Target className="w-6 h-6 text-emerald-400" />,
                                title: "Hit Your CPA Target",
                                description: "Set your target CPA. AdsAgent flags campaigns that exceed it and recommends specific actions to bring it down."
                            },
                            {
                                icon: <TrendingUp className="w-6 h-6 text-amber-400" />,
                                title: "Scale What Works",
                                description: "Identifies campaigns hitting their daily budget with CPA below target — and recommends increasing budget to capture more conversions."
                            },
                            {
                                icon: <PauseCircle className="w-6 h-6 text-purple-400" />,
                                title: "Safe Write Operations",
                                description: "Pause keywords, adjust bids, change budgets — all with guardrails. Bid changes capped at 25%, budget changes at 50%."
                            },
                            {
                                icon: <Zap className="w-6 h-6 text-yellow-400" />,
                                title: "Track Impact",
                                description: "Every change is logged. AdsAgent compares before/after performance and tells you if the change actually worked."
                            }
                        ].map((feature, i) => (
                            <div key={i} className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/50 transition-colors">
                                <div className="w-10 h-10 rounded-xl bg-zinc-800/50 flex items-center justify-center mb-4">
                                    {feature.icon}
                                </div>
                                <h3 className="text-lg font-bold mb-2 text-white">{feature.title}</h3>
                                <p className="text-zinc-400 leading-relaxed">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Connect Section */}
            <section id="connect" className="py-24 px-4 bg-black border-t border-zinc-900">
                <div className="container mx-auto max-w-3xl">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">Connect in 30 seconds</h2>
                        <p className="text-zinc-400 text-lg">Add this MCP server URL to your AI tool:</p>
                    </div>

                    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-8 space-y-8">
                        {/* MCP URL */}
                        <div>
                            <label className="text-sm font-medium text-zinc-400 mb-2 block">MCP Server URL</label>
                            <div className="flex items-center bg-zinc-950 rounded-lg border border-zinc-700 px-4 py-3 font-mono text-sm text-blue-300">
                                <span className="flex-1 truncate">{mcpUrl}</span>
                                <CopyButton text={mcpUrl} />
                            </div>
                        </div>

                        {/* Instructions */}
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-white font-semibold mb-2">Claude Coworker</h3>
                                <p className="text-zinc-400 text-sm">Settings &rarr; MCP Servers &rarr; Add Server &rarr; paste the URL above</p>
                            </div>
                            <div>
                                <h3 className="text-white font-semibold mb-2">Cursor</h3>
                                <p className="text-zinc-400 text-sm">Add to your MCP config:</p>
                                <pre className="mt-2 bg-zinc-950 rounded-lg p-4 text-xs text-zinc-300 overflow-x-auto border border-zinc-800">
{`{
  "adsagent": {
    "url": "${mcpUrl}"
  }
}`}
                                </pre>
                            </div>
                            <div>
                                <h3 className="text-white font-semibold mb-2">Other MCP Clients</h3>
                                <p className="text-zinc-400 text-sm">
                                    Any client supporting Streamable HTTP can connect directly to the URL above.
                                    For stdio-only clients, use{' '}
                                    <code className="text-blue-300 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">npx mcp-remote {mcpUrl}</code>
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="text-center mt-8">
                        <p className="text-zinc-500 text-sm mb-4">Want to try without installing MCP?</p>
                        <Link href="/chat">
                            <Button variant="outline" className="rounded-full border-zinc-700 text-zinc-300 hover:text-white">
                                Try the hosted demo <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Security */}
            <section className="py-24 px-4 border-t border-zinc-900">
                <div className="container mx-auto max-w-4xl text-center">
                    <div className="inline-flex items-center justify-center p-3 rounded-full bg-green-900/10 border border-green-900/30 mb-8 text-green-400">
                        <ShieldCheck className="w-5 h-5 mr-2" />
                        <span className="text-sm font-semibold tracking-wide">YOUR DATA STAYS YOURS</span>
                    </div>
                    <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">Built for trust</h2>
                    <p className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
                        AdsAgent uses OAuth 2.1 — we never see your Google password. All write operations require your explicit approval.
                        Every change is logged and reversible. Guardrails prevent catastrophic changes by default.
                    </p>
                </div>
            </section>
        </>
    );
}
