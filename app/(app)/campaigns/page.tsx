'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { RefreshCw, BarChart3, TrendingUp, DollarSign, MousePointer2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listCampaignsAction } from '@/app/actions';

interface Campaign {
    id: string;
    name: string;
    status: string;
    type: string;
    impressions: number;
    clicks: number;
    cost: number;
}

const statusColors = {
    ENABLED: 'bg-[#4CAF6E]/10 text-[#4CAF6E] border-[#4CAF6E]/20',
    PAUSED: 'bg-[#D4882A]/10 text-[#D4882A] border-[#D4882A]/20',
    REMOVED: 'bg-[#C45D4A]/10 text-[#C45D4A] border-[#C45D4A]/20',
    UNKNOWN: 'bg-[#9B9689]/10 text-[#9B9689] border-[#9B9689]/20',
};

export default function CampaignsPage() {
    const router = useRouter();
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

    return (
        <section className="flex min-h-0 h-full flex-col overflow-hidden">
            <header className="shrink-0 border-b border-[#3D3C36] bg-[#24231F]/80 backdrop-blur-xl">
                <div className="flex w-full items-center justify-between gap-4 px-6 py-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-[#E8E4DD]">Campaigns</h1>
                        <p className="mt-0.5 text-sm text-[#9B9689]">Manage and track your Google Ads performance</p>
                    </div>
                    <Button
                        onClick={fetchCampaigns}
                        disabled={loading}
                        variant="outline"
                        className="border-[#3D3C36] bg-[#24231F] hover:bg-[#2E2D28] text-[#9B9689] hover:text-[#E8E4DD] gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                {error && (
                    <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-lg p-4 mb-6 flex items-center gap-3 text-[#C45D4A]">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                {loading && campaigns.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-8 h-8 border-2 border-[#4CAF6E] border-t-transparent rounded-full animate-spin" />
                        <p className="text-[#9B9689] animate-pulse text-sm">Loading campaigns...</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {campaigns.length === 0 && !error ? (
                            <div className="text-center py-20 bg-[#24231F]/60 border border-[#3D3C36] rounded-xl">
                                <BarChart3 className="w-10 h-10 text-[#9B9689]/30 mx-auto mb-4" />
                                <h3 className="text-base font-medium text-[#E8E4DD]/60">No campaigns found</h3>
                                <p className="text-[#9B9689] max-w-sm mx-auto mt-2 text-sm">Create your first campaign in Google Ads to see it here.</p>
                            </div>
                        ) : (
                            campaigns.map((campaign, index) => (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.04 }}
                                    key={campaign.id}
                                    onClick={() => router.push(`/campaigns/${campaign.id}`)}
                                    className="group relative bg-[#24231F] hover:bg-[#2E2D28] border border-[#3D3C36] hover:border-[#4CAF6E]/20 transition-all duration-200 rounded-xl p-5 cursor-pointer"
                                >
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2.5 mb-2">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-wide uppercase ${statusColors[campaign.status as keyof typeof statusColors] || statusColors.UNKNOWN}`}>
                                                    {campaign.status}
                                                </span>
                                                <span className="text-xs text-[#9B9689] font-mono">ID: {campaign.id}</span>
                                            </div>
                                            <h3 className="text-[15px] font-medium text-[#E8E4DD] truncate pr-4 group-hover:text-white transition-colors">
                                                {campaign.name}
                                            </h3>
                                            <p className="text-xs text-[#9B9689] mt-1 capitalize">{String(campaign.type || '').replace(/_/g, ' ').toLowerCase()}</p>
                                        </div>

                                        <div className="grid grid-cols-3 gap-8 border-t md:border-t-0 md:border-l border-[#3D3C36] pt-4 md:pt-0 md:pl-8">
                                            <div>
                                                <div className="flex items-center gap-1.5 text-[#9B9689] text-xs mb-1">
                                                    <TrendingUp className="w-3 h-3" />
                                                    Impressions
                                                </div>
                                                <p className="text-sm font-semibold text-[#E8E4DD] tabular-nums">{(campaign.impressions || 0).toLocaleString()}</p>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-1.5 text-[#9B9689] text-xs mb-1">
                                                    <MousePointer2 className="w-3 h-3" />
                                                    Clicks
                                                </div>
                                                <p className="text-sm font-semibold text-[#E8E4DD] tabular-nums">{(campaign.clicks || 0).toLocaleString()}</p>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-1.5 text-[#9B9689] text-xs mb-1">
                                                    <DollarSign className="w-3 h-3" />
                                                    Cost
                                                </div>
                                                <p className="text-sm font-semibold text-[#E8E4DD] tabular-nums">${(campaign.cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
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
    );
}
