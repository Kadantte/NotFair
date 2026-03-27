'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { RefreshCw, BarChart3, TrendingUp, DollarSign, MousePointer2, AlertCircle } from 'lucide-react';
import { AppSidebar, type SidebarThread } from '@/components/app-sidebar';
import { Button } from '@/components/ui/button';
import { listCampaignsAction } from '@/app/actions';
import { ACTIVE_CHAT_THREAD_KEY, CHAT_HISTORY_KEY } from '@/lib/chat-history';

interface Campaign {
    id: string;
    name: string;
    status: string;
    type: string;
    impressions: number;
    clicks: number;
    cost: number;
}

function loadSidebarThreads(): SidebarThread[] {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);

    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw);

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .filter(thread => thread && typeof thread.id === 'string' && typeof thread.title === 'string')
            .map(thread => ({
                id: thread.id,
                title: thread.title,
                updatedAt: thread.updatedAt ?? new Date().toISOString(),
                messageCount: Array.isArray(thread.messages) ? thread.messages.length : 0,
            }))
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch {
        return [];
    }
}

export default function CampaignsPage() {
    const router = useRouter();
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [sidebarThreads, setSidebarThreads] = useState<SidebarThread[]>([]);
    const [loading, setLoading] = useState(true);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [error, setError] = useState<string | null>(null);

    const fetchCampaigns = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await listCampaignsAction();
            setCampaigns(data);
        } catch (err) {
            console.error(err);
            setError('Failed to fetch campaigns. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCampaigns();
    }, [fetchCampaigns]);

    useEffect(() => {
        setSidebarThreads(loadSidebarThreads());
    }, []);

    const statusColors = {
        ENABLED: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        PAUSED: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        REMOVED: 'bg-red-500/10 text-red-500 border-red-500/20',
        UNKNOWN: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
    };

    return (
        <main className="h-full overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-black to-black z-0 pointer-events-none" />

            <div className={`relative z-10 grid h-full w-full overflow-hidden transition-[grid-template-columns] duration-300 ease-out ${isSidebarCollapsed ? 'lg:grid-cols-[72px_minmax(0,1fr)]' : 'lg:grid-cols-[280px_minmax(0,1fr)]'}`}>
                <AppSidebar
                    currentPath="/campaigns"
                    isCollapsed={isSidebarCollapsed}
                    onToggleCollapsed={() => setIsSidebarCollapsed(current => !current)}
                    onCreateThread={() => router.push('/chat')}
                    threads={sidebarThreads}
                    onSelectThread={(threadId) => {
                        localStorage.setItem(ACTIVE_CHAT_THREAD_KEY, threadId);
                        router.push('/chat');
                    }}
                />

                <section className="flex min-h-0 h-full flex-col overflow-hidden">
                    <header className="shrink-0 border-b border-white/10 bg-black/50 backdrop-blur-xl">
                        <div className="flex w-full items-center justify-between gap-4 px-6 py-4">
                            <div>
                                <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
                                <p className="mt-1 text-sm text-zinc-500">Manage and track your Google Ads performance</p>
                            </div>
                            <Button
                                onClick={fetchCampaigns}
                                disabled={loading}
                                variant="outline"
                                className="border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 gap-2"
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                        </div>
                    </header>

                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
                        {error && (
                            <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-4 mb-8 flex items-center gap-3 text-red-400">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <p>{error}</p>
                            </div>
                        )}

                        {loading && campaigns.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <div className="w-8 h-8 border-2 border-[#4CAF6E] border-t-transparent rounded-full animate-spin" />
                                <p className="text-zinc-500 animate-pulse">Loading campaigns...</p>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {campaigns.length === 0 && !error ? (
                                    <div className="text-center py-20 bg-zinc-900/30 border border-zinc-800/50 rounded-xl">
                                        <BarChart3 className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                                        <h3 className="text-lg font-medium text-zinc-300">No campaigns found</h3>
                                        <p className="text-zinc-500 max-w-sm mx-auto mt-2">Create your first campaign in Google Ads to see it here.</p>
                                    </div>
                                ) : (
                                    campaigns.map((campaign, index) => (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.05 }}
                                            key={campaign.id}
                                            onClick={() => router.push(`/campaigns/${campaign.id}`)}
                                            className="group relative bg-zinc-900/40 hover:bg-zinc-900/60 border border-zinc-800/50 hover:border-zinc-700 transition-all duration-300 rounded-xl p-5 cursor-pointer"
                                        >
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-wide uppercase ${statusColors[campaign.status as keyof typeof statusColors] || statusColors.UNKNOWN}`}>
                                                            {campaign.status}
                                                        </span>
                                                        <span className="text-xs text-zinc-500 font-mono">ID: {campaign.id}</span>
                                                    </div>
                                                    <h3 className="text-lg font-medium text-zinc-100 truncate pr-4 group-hover:text-white transition-colors">
                                                        {campaign.name}
                                                    </h3>
                                                    <p className="text-xs text-zinc-500 mt-1 capitalize">{String(campaign.type || '').replace(/_/g, ' ').toLowerCase()}</p>
                                                </div>

                                                <div className="grid grid-cols-3 gap-8 border-t md:border-t-0 md:border-l border-zinc-800/50 pt-4 md:pt-0 md:pl-8">
                                                    <div>
                                                        <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
                                                            <TrendingUp className="w-3.5 h-3.5" />
                                                            Impressions
                                                        </div>
                                                        <p className="text-sm font-semibold text-zinc-200">{(campaign.impressions || 0).toLocaleString()}</p>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
                                                            <MousePointer2 className="w-3.5 h-3.5" />
                                                            Clicks
                                                        </div>
                                                        <p className="text-sm font-semibold text-zinc-200">{(campaign.clicks || 0).toLocaleString()}</p>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
                                                            <DollarSign className="w-3.5 h-3.5" />
                                                            Cost
                                                        </div>
                                                        <p className="text-sm font-semibold text-zinc-200">${(campaign.cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}
