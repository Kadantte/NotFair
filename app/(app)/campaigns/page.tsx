'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { RefreshCw, BarChart3, TrendingUp, DollarSign, MousePointer2, AlertCircle, Loader2, ChevronRight, Pause, Play, Trash2, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { listCampaignsAction, pauseCampaignAction, enableCampaignAction, removeCampaignAction } from '@/app/actions';

interface Campaign {
    id: string;
    name: string;
    status: string;
    type: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    biddingStrategy: string;
    networkDisplayEnabled: boolean;
    trackingTemplate: string | null;
}

type HealthWarning = {
    key: string;
    severity: 'danger' | 'warning';
    message: string;
};

function getCampaignWarnings(campaign: Campaign): HealthWarning[] {
    const warnings: HealthWarning[] = [];

    if (campaign.status !== 'ENABLED') return warnings;

    if (campaign.type === 'SEARCH' && campaign.networkDisplayEnabled) {
        warnings.push({
            key: 'display-on-search',
            severity: 'warning',
            message: 'Display Network enabled on Search campaign',
        });
    }

    if (!campaign.trackingTemplate) {
        warnings.push({
            key: 'no-tracking-template',
            severity: 'warning',
            message: 'No tracking template',
        });
    }

    if (campaign.biddingStrategy === 'MAXIMIZE_CONVERSIONS' && campaign.conversions === 0) {
        warnings.push({
            key: 'max-conv-no-history',
            severity: 'warning',
            message: 'Maximize Conversions with no conversion data',
        });
    }

    return warnings;
}

const statusColors = {
    ENABLED: 'bg-[#4CAF6E]/10 text-[#4CAF6E] border-[#4CAF6E]/20',
    PAUSED: 'bg-[#D4882A]/10 text-[#D4882A] border-[#D4882A]/20',
    REMOVED: 'bg-[#C45D4A]/10 text-[#C45D4A] border-[#C45D4A]/20',
    UNKNOWN: 'bg-[#9B9689]/10 text-[#9B9689] border-[#9B9689]/20',
};

type CampaignStatusFilter = 'ALL' | 'ENABLED' | 'PAUSED';

// Module-level cache so data survives client-side navigations
let cachedCampaigns: Campaign[] | null = null;

export default function CampaignsPage() {
    const [loading, setLoading] = useState(!cachedCampaigns);
    const [campaigns, setCampaigns] = useState<Campaign[]>(cachedCampaigns ?? []);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<CampaignStatusFilter>('ALL');
    const [actingOnCampaignId, setActingOnCampaignId] = useState<string | null>(null);
    const isRefreshing = useRef(false);

    const fetchCampaigns = useCallback(async (background = false, skipCache = false) => {
        if (!background) setLoading(true);
        isRefreshing.current = true;
        setError(null);
        try {
            const data = await listCampaignsAction(skipCache ? { skipCache: true } : undefined);
            setCampaigns(data);
            cachedCampaigns = data;
        } catch (err) {
            console.error(err);
            if (!background) setError('Failed to fetch campaigns. Please try again.');
        } finally {
            setLoading(false);
            isRefreshing.current = false;
        }
    }, []);

    useEffect(() => {
        // If we have cached data, show it immediately and refresh in background
        fetchCampaigns(!!cachedCampaigns);
    }, [fetchCampaigns]);

    const filteredCampaigns = campaigns
        .filter((campaign) => {
            if (statusFilter === 'ALL') return true;
            return campaign.status === statusFilter;
        })
        .sort((a, b) => {
            // ENABLED first, then PAUSED, then others
            const statusOrder: Record<string, number> = { ENABLED: 0, PAUSED: 1 };
            const aOrder = statusOrder[a.status] ?? 2;
            const bOrder = statusOrder[b.status] ?? 2;
            if (aOrder !== bOrder) return aOrder - bOrder;
            // Within same status, keep impressions DESC (original API order)
            return (b.impressions || 0) - (a.impressions || 0);
        });

    function applyOptimistic(campaignId: string, patch: Partial<Campaign> | null) {
        const updated = patch
            ? campaigns.map(c => c.id === campaignId ? { ...c, ...patch } : c)
            : campaigns.filter(c => c.id !== campaignId);
        setCampaigns(updated);
        cachedCampaigns = updated;
    }

    const handlePauseCampaign = async (campaignId: string) => {
        setActingOnCampaignId(campaignId);
        setError(null);
        try {
            const { afterValue } = await pauseCampaignAction(campaignId);
            applyOptimistic(campaignId, { status: afterValue ?? 'PAUSED' });
        } catch (err) {
            console.error(err);
            setError('Failed to pause campaign. Please try again.');
        } finally {
            setActingOnCampaignId(null);
        }
    };

    const handleEnableCampaign = async (campaignId: string) => {
        setActingOnCampaignId(campaignId);
        setError(null);
        try {
            const { afterValue } = await enableCampaignAction(campaignId);
            applyOptimistic(campaignId, { status: afterValue ?? 'ENABLED' });
        } catch (err) {
            console.error(err);
            setError('Failed to enable campaign. Please try again.');
        } finally {
            setActingOnCampaignId(null);
        }
    };

    const handleRemoveCampaign = async (campaignId: string) => {
        if (!window.confirm('Delete this paused campaign? This will remove it from Google Ads.')) {
            return;
        }

        setActingOnCampaignId(campaignId);
        setError(null);
        try {
            await removeCampaignAction(campaignId);
            applyOptimistic(campaignId, null);
        } catch (err) {
            console.error(err);
            setError('Failed to delete campaign. Please try again.');
        } finally {
            setActingOnCampaignId(null);
        }
    };

    return (
        <section className="flex min-h-0 h-full flex-col overflow-hidden">
            <header className="shrink-0 border-b border-[#3D3C36] bg-[#24231F]/80 backdrop-blur-xl">
                <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#E8E4DD]">Campaigns</h1>
                        <p className="mt-0.5 text-xs sm:text-sm text-[#9B9689] hidden sm:block">Manage and track your Google Ads performance</p>
                    </div>
                    <Button
                        onClick={() => { cachedCampaigns = null; fetchCampaigns(false, true); }}
                        disabled={loading}
                        variant="outline"
                        size="sm"
                        className="border-[#3D3C36] bg-[#24231F] hover:bg-[#2E2D28] text-[#9B9689] hover:text-[#E8E4DD] gap-1.5 shrink-0"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">Refresh</span>
                    </Button>
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
                {error && (
                    <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-lg p-4 mb-6 flex items-center gap-3 text-[#C45D4A]">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-[#9B9689]">
                        Showing <span className="text-[#E8E4DD]">{filteredCampaigns.length}</span> of <span className="text-[#E8E4DD]">{campaigns.length}</span> campaigns
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-[#9B9689]">Status</span>
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as CampaignStatusFilter)}>
                            <SelectTrigger className="w-[180px] border-[#3D3C36] bg-[#24231F] text-[#E8E4DD] hover:bg-[#2E2D28] focus:ring-[#4CAF6E]/20">
                                <SelectValue placeholder="All statuses" />
                            </SelectTrigger>
                            <SelectContent className="border-[#3D3C36] bg-[#24231F] text-[#E8E4DD]">
                                <SelectItem value="ALL">All statuses</SelectItem>
                                <SelectItem value="ENABLED">Enabled</SelectItem>
                                <SelectItem value="PAUSED">Paused</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {loading && campaigns.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-8 h-8 border-2 border-[#4CAF6E] border-t-transparent rounded-full animate-spin" />
                        <p className="text-[#9B9689] animate-pulse text-sm">Loading campaigns...</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {filteredCampaigns.length === 0 && !error ? (
                            <div className="text-center py-20 bg-[#24231F]/60 border border-[#3D3C36] rounded-xl">
                                <BarChart3 className="w-10 h-10 text-[#9B9689]/30 mx-auto mb-4" />
                                <h3 className="text-base font-medium text-[#E8E4DD]/60">
                                    {campaigns.length === 0 ? 'No campaigns found' : `No ${statusFilter.toLowerCase()} campaigns found`}
                                </h3>
                                <p className="text-[#9B9689] max-w-sm mx-auto mt-2 text-sm">
                                    {campaigns.length === 0
                                        ? 'Create your first campaign in Google Ads to see it here.'
                                        : 'Try a different status filter to see more campaigns.'}
                                </p>
                            </div>
                        ) : (
                            filteredCampaigns.map((campaign, index) => {
                                const isActing = actingOnCampaignId === campaign.id;
                                return (
                                    <motion.div
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.04 }}
                                        key={campaign.id}
                                    >
                                    <Link
                                        href={`/campaigns/${campaign.id}`}
                                        prefetch
                                        className={`group relative block bg-[#24231F] border border-[#3D3C36] transition-all duration-150 rounded-xl p-4 sm:p-5 select-none
                                            ${actingOnCampaignId
                                                ? 'opacity-50 pointer-events-none'
                                                : 'hover:bg-[#2E2D28] hover:border-[#4CAF6E]/20 active:scale-[0.995]'
                                            }`}
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
                                                <p className="text-xs text-[#9B9689] mt-1">
                                                    <span className="capitalize"><span className="text-[#9B9689]/60">Ads Type</span> {String(campaign.type || '').replace(/_/g, ' ').toLowerCase()}</span>
                                                    <span className="mx-1.5 text-[#3D3C36]">|</span>
                                                    <span className="capitalize"><span className="text-[#9B9689]/60">Bidding Strategy</span> {String(campaign.biddingStrategy || '').replace(/_/g, ' ').toLowerCase()}</span>
                                                </p>
                                                {(() => {
                                                    const warnings = getCampaignWarnings(campaign);
                                                    if (warnings.length === 0) return null;
                                                    return (
                                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                                            {warnings.map(w => (
                                                                <span
                                                                    key={w.key}
                                                                    className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                                                                        w.severity === 'danger'
                                                                            ? 'bg-[#C45D4A]/10 text-[#C45D4A] border-[#C45D4A]/20'
                                                                            : 'bg-[#D4882A]/10 text-[#D4882A] border-[#D4882A]/20'
                                                                    }`}
                                                                >
                                                                    <AlertCircle className="w-2.5 h-2.5" />
                                                                    {w.message}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-8 border-t sm:border-t-0 sm:border-l border-[#3D3C36] pt-3 sm:pt-0 sm:pl-8">
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
                                                    <div>
                                                        <div className="flex items-center gap-1.5 text-[#9B9689] text-xs mb-1">
                                                            <Target className="w-3 h-3" />
                                                            Conversions
                                                        </div>
                                                        <p className="text-sm font-semibold text-[#E8E4DD] tabular-nums">{(campaign.conversions || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {campaign.status === 'ENABLED' && (
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={Boolean(actingOnCampaignId)}
                                                            onClick={(event) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                                void handlePauseCampaign(campaign.id);
                                                            }}
                                                            className="border-[#D4882A]/30 bg-[#D4882A]/10 text-[#D9B26B] hover:bg-[#D4882A]/20 hover:text-[#F1D4A0]"
                                                        >
                                                            {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                                                            Pause
                                                        </Button>
                                                    )}
                                                    {campaign.status === 'PAUSED' && (
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={Boolean(actingOnCampaignId)}
                                                            onClick={(event) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                                void handleEnableCampaign(campaign.id);
                                                            }}
                                                            className="border-[#4CAF6E]/30 bg-[#4CAF6E]/10 text-[#4CAF6E] hover:bg-[#4CAF6E]/20 hover:text-[#6FD992]"
                                                        >
                                                            {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                                            Enable
                                                        </Button>
                                                    )}
                                                    {campaign.status === 'PAUSED' && (
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={Boolean(actingOnCampaignId)}
                                                            onClick={(event) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                                void handleRemoveCampaign(campaign.id);
                                                            }}
                                                            className="border-[#C45D4A]/30 bg-[#C45D4A]/10 text-[#E28A79] hover:bg-[#C45D4A]/20 hover:text-[#F3B2A5]"
                                                        >
                                                            {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                            Delete
                                                        </Button>
                                                    )}
                                                </div>
                                                <div className="hidden md:flex items-center text-[#9B9689]">
                                                    {isActing
                                                        ? <Loader2 className="w-4 h-4 animate-spin text-[#4CAF6E]" />
                                                        : <ChevronRight className="w-4 h-4 group-hover:text-[#E8E4DD] transition-colors" />
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                    </motion.div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
