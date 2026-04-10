'use client';

import { useCallback, useEffect, useState, use, useMemo } from 'react';
import { motion } from 'framer-motion';
import { History, Search, AlertCircle, Sparkles, Loader2, TrendingUp, MousePointer2, DollarSign, Target, FileText, Link as LinkIcon, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    getCampaignHistoryAction,
    getCampaignKeywordsAction,
    getCampaignAdsAction,
    generateCampaignSummaryAction,
    listCampaignsAction,
    getConversionActionsAction,
    getCampaignKeywordThemesAction,
    getSmartCampaignSettingAction,
} from '@/app/actions';
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────

interface CampaignHistory {
    date: string;
    impressions: number;
    clicks: number;
    cost: number;
    ctr: number;
    averageCpc: number;
    conversions: number;
}

interface CampaignAd {
    adId: string;
    status: string;
    adGroupName: string;
    finalUrls: string[];
    headlines: string[];
    descriptions: string[];
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
}

interface CampaignKeyword {
    id: string;
    text: string;
    status: string;
    qualityScore: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cost: number;
    averageCpc: number;
}

interface KeywordTheme {
    criterionId: string;
    text: string;
    isFreeForm: boolean;
    status: string;
}

interface SmartCampaignSetting {
    finalUrl: string | null;
    businessName: string | null;
    phoneNumber: string | null;
}

interface CampaignInfo {
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

interface ConversionAction {
    id: string;
    name: string;
    category: string;
    includeInConversions: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────

type HealthWarning = { severity: 'danger' | 'warning'; message: string };

function getCampaignWarnings(campaign: CampaignInfo): HealthWarning[] {
    if (campaign.status !== 'ENABLED') return [];
    const warnings: HealthWarning[] = [];
    if (campaign.type === 'SEARCH' && campaign.networkDisplayEnabled)
        warnings.push({ severity: 'warning', message: 'Display Network enabled on Search campaign' });
    if (!campaign.trackingTemplate)
        warnings.push({ severity: 'warning', message: 'No tracking template configured' });
    if (campaign.biddingStrategy === 'MAXIMIZE_CONVERSIONS' && campaign.conversions === 0)
        warnings.push({ severity: 'warning', message: 'Maximize Conversions with no conversion data' });
    return warnings;
}

const statusColors: Record<string, string> = {
    ENABLED: 'bg-[#4CAF6E]/10 text-[#4CAF6E] border-[#4CAF6E]/20',
    PAUSED: 'bg-[#D4882A]/10 text-[#D4882A] border-[#D4882A]/20',
    REMOVED: 'bg-[#C45D4A]/10 text-[#C45D4A] border-[#C45D4A]/20',
    UNKNOWN: 'bg-[#9B9689]/10 text-[#9B9689] border-[#9B9689]/20',
};

type TimeRange = 'ALL' | '5Y' | '1Y' | '6M' | '3M' | '1M' | '1W' | 'YESTERDAY' | 'TODAY';

function formatDate(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function extractHostname(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function getDateRange(range: TimeRange) {
    const today = new Date();
    const end = new Date(today);
    const start = new Date(today);

    switch (range) {
        case 'ALL': return { startDate: '2000-01-01', endDate: '2030-12-31' };
        case '5Y': start.setFullYear(today.getFullYear() - 5); break;
        case '1Y': start.setFullYear(today.getFullYear() - 1); break;
        case '6M': start.setMonth(today.getMonth() - 6); break;
        case '3M': start.setMonth(today.getMonth() - 3); break;
        case '1M': start.setMonth(today.getMonth() - 1); break;
        case '1W': start.setDate(today.getDate() - 7); break;
        case 'YESTERDAY':
            start.setDate(today.getDate() - 1);
            end.setDate(today.getDate() - 1);
            break;
        case 'TODAY': break;
    }
    return { startDate: formatDate(start), endDate: formatDate(end) };
}

// ─── Page ────────────────────────────────────────────────────────

export default function CampaignDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const campaignId = resolvedParams.id;

    const [timeRange, setTimeRange] = useState<TimeRange>('1M');
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<CampaignHistory[]>([]);
    const [keywords, setKeywords] = useState<CampaignKeyword[]>([]);
    const [keywordThemes, setKeywordThemes] = useState<KeywordTheme[]>([]);
    const [ads, setAds] = useState<CampaignAd[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [campaignInfo, setCampaignInfo] = useState<CampaignInfo | null>(null);
    const [smartSetting, setSmartSetting] = useState<SmartCampaignSetting | null>(null);
    const [conversionActions, setConversionActions] = useState<ConversionAction[]>([]);
    const [summary, setSummary] = useState<string | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryError, setSummaryError] = useState<string | null>(null);

    // Sum history rows so top-line cards always match the chart for the selected time range
    const totals = useMemo(() => history.reduce(
        (acc, d) => ({
            impressions: acc.impressions + d.impressions,
            clicks: acc.clicks + d.clicks,
            cost: acc.cost + d.cost,
            conversions: acc.conversions + d.conversions,
        }),
        { impressions: 0, clicks: 0, cost: 0, conversions: 0 },
    ), [history]);

    const isSmartCampaign = campaignInfo?.type === 'SMART';

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        const { startDate, endDate } = getDateRange(timeRange);

        try {
            // Phase 1: core data always needed
            const [historyData, keywordsData, adsData, campaignsData, conversionActionsData] = await Promise.all([
                getCampaignHistoryAction(campaignId, startDate, endDate),
                getCampaignKeywordsAction(campaignId, startDate, endDate),
                getCampaignAdsAction(campaignId),
                listCampaignsAction(),
                getConversionActionsAction(),
            ]);

            const match = campaignsData.find(c => c.id === campaignId);

            // Phase 2: Smart-campaign-only data, skipped for standard campaigns
            const [keywordThemesData, smartSettingData] = match?.type === 'SMART'
                ? await Promise.all([
                    getCampaignKeywordThemesAction(campaignId),
                    getSmartCampaignSettingAction(campaignId),
                ])
                : [[], null];

            setHistory(historyData);
            setKeywords(keywordsData);
            setKeywordThemes(keywordThemesData ?? []);
            setAds(adsData);
            setSmartSetting(smartSettingData ?? null);
            setConversionActions((conversionActionsData ?? []).filter((ca: ConversionAction) => ca.includeInConversions));
            if (match) setCampaignInfo(match);
        } catch (err) {
            console.error(err);
            setError('Failed to fetch campaign details. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [campaignId, timeRange]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleGenerateSummary = async () => {
        setSummaryLoading(true);
        setSummaryError(null);
        try {
            const result = await generateCampaignSummaryAction(history, keywords, campaignId);
            setSummary(result);
        } catch (err) {
            console.error(err);
            setSummaryError('Failed to generate AI summary. Please try again.');
        } finally {
            setSummaryLoading(false);
        }
    };

    const CustomTooltip = ({ active, payload, label }: {
        active?: boolean;
        payload?: Array<{ color: string; name: string; value: number }>;
        label?: string;
    }) => {
        if (!active || !payload?.length) return null;
        return (
            <div className="bg-[#24231F] border border-[#3D3C36] p-3 rounded-lg shadow-xl">
                <p className="text-[#E8E4DD] mb-2 font-medium">{label}</p>
                {payload.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-[#9B9689]">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span>{entry.name}:</span>
                        <span className="font-mono text-[#E8E4DD]">
                            {entry.name === 'Cost' ? `$${Number(entry.value).toFixed(2)}` : entry.value.toLocaleString()}
                        </span>
                    </div>
                ))}
            </div>
        );
    };

    const warnings = campaignInfo ? getCampaignWarnings(campaignInfo) : [];

    return (
        <section className="flex min-h-0 h-full flex-col overflow-hidden">
            {/* ── Header ── */}
            <header className="shrink-0 border-b border-[#3D3C36] bg-[#24231F]/80 backdrop-blur-xl">
                <div className="flex flex-col gap-4 px-6 py-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2.5 mb-1">
                            {campaignInfo && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-wide uppercase ${statusColors[campaignInfo.status] || statusColors.UNKNOWN}`}>
                                    {campaignInfo.status}
                                </span>
                            )}
                            <span className="text-xs text-[#9B9689] font-mono">ID: {campaignId}</span>
                        </div>
                        <h1 className="text-2xl font-semibold tracking-tight text-[#E8E4DD]">
                            {campaignInfo?.name || 'Campaign Details'}
                        </h1>
                    </div>

                    <div className="flex flex-wrap items-center gap-1 bg-[#1A1917] p-1 rounded-lg border border-[#3D3C36] shrink-0">
                        {(['ALL', '5Y', '1Y', '6M', '3M', '1M', '1W', 'YESTERDAY', 'TODAY'] as const).map((range) => (
                            <button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${timeRange === range
                                    ? 'bg-[#4CAF6E]/15 text-[#4CAF6E] border border-[#4CAF6E]/20'
                                    : 'text-[#9B9689] hover:text-[#E8E4DD] hover:bg-[#2E2D28]'
                                }`}
                            >
                                {range === 'ALL' ? 'All Time' : range === 'YESTERDAY' ? 'Yesterday' : range === 'TODAY' ? 'Today' : range}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            {/* ── Content ── */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                {error && (
                    <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-lg p-4 mb-6 flex items-center gap-3 text-[#C45D4A]">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-8 h-8 border-2 border-[#4CAF6E] border-t-transparent rounded-full animate-spin" />
                        <p className="text-[#9B9689] animate-pulse text-sm">Loading campaign data...</p>
                    </div>
                ) : (
                    <div className="space-y-6">

                        {/* ── 1. Campaign Settings + Health ── */}
                        {campaignInfo && (
                            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                                {/* Primary info: website, CPA, conversions */}
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Smart campaign: show business name */}
                                    {isSmartCampaign && smartSetting?.businessName && (
                                        <div className="flex items-center gap-1.5 text-xs bg-[#1A1917] border border-[#3D3C36] rounded-lg px-3 py-1.5">
                                            <Building2 className="w-3 h-3 text-[#4CAF6E]" />
                                            <span className="text-[#9B9689]">Business</span>
                                            <span className="text-[#E8E4DD] font-medium">{smartSetting.businessName}</span>
                                        </div>
                                    )}
                                    {/* Standard campaign: show landing domain */}
                                    {!isSmartCampaign && (() => {
                                        const domains = [...new Set(ads.flatMap(a => a.finalUrls).map(extractHostname).filter(Boolean))];
                                        return domains.length > 0 ? (
                                            <div className="flex items-center gap-1.5 text-xs bg-[#1A1917] border border-[#3D3C36] rounded-lg px-3 py-1.5">
                                                <LinkIcon className="w-3 h-3 text-[#4CAF6E]" />
                                                <span className="text-[#9B9689]">Website</span>
                                                <span className="text-[#E8E4DD] font-medium font-mono">{domains.join(', ')}</span>
                                            </div>
                                        ) : null;
                                    })()}
                                    {/* Smart campaign: show final URL */}
                                    {isSmartCampaign && smartSetting?.finalUrl && (
                                        <div className="flex items-center gap-1.5 text-xs bg-[#1A1917] border border-[#3D3C36] rounded-lg px-3 py-1.5">
                                            <LinkIcon className="w-3 h-3 text-[#4CAF6E]" />
                                            <span className="text-[#9B9689]">URL</span>
                                            <span className="text-[#E8E4DD] font-medium font-mono">
                                                {extractHostname(smartSetting.finalUrl)}
                                            </span>
                                        </div>
                                    )}
                                    {totals.conversions > 0 && (
                                        <div className="flex items-center gap-1.5 text-xs bg-[#1A1917] border border-[#3D3C36] rounded-lg px-3 py-1.5">
                                            <Target className="w-3 h-3 text-[#4CAF6E]" />
                                            <span className="text-[#9B9689]">Cost / Conv.</span>
                                            <span className="text-[#E8E4DD] font-medium font-mono">${(totals.cost / totals.conversions).toFixed(2)}</span>
                                        </div>
                                    )}
                                    {conversionActions.length > 0 && (
                                        <div className="flex items-center gap-1.5 text-xs bg-[#1A1917] border border-[#3D3C36] rounded-lg px-3 py-1.5">
                                            <Target className="w-3 h-3 text-[#9B9689]" />
                                            <span className="text-[#9B9689]">Tracking</span>
                                            <span className="text-[#E8E4DD] font-medium">{conversionActions.map(ca => ca.name).join(', ')}</span>
                                        </div>
                                    )}
                                </div>
                                {/* Secondary info: campaign settings */}
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="flex items-center gap-1.5 text-xs bg-[#1A1917] border border-[#3D3C36] rounded-lg px-3 py-1.5">
                                        <span className="text-[#9B9689]">Type</span>
                                        <span className="text-[#E8E4DD] font-medium capitalize">{campaignInfo.type.replace(/_/g, ' ').toLowerCase()}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs bg-[#1A1917] border border-[#3D3C36] rounded-lg px-3 py-1.5">
                                        <span className="text-[#9B9689]">Bidding</span>
                                        <span className="text-[#E8E4DD] font-medium capitalize">{campaignInfo.biddingStrategy.replace(/_/g, ' ').toLowerCase()}</span>
                                    </div>
                                    {!isSmartCampaign && (
                                        <div className="flex items-center gap-1.5 text-xs bg-[#1A1917] border border-[#3D3C36] rounded-lg px-3 py-1.5">
                                            <span className="text-[#9B9689]">UTM</span>
                                            <span className="text-[#E8E4DD] font-medium font-mono">{campaignInfo.trackingTemplate || 'Not set'}</span>
                                        </div>
                                    )}
                                    {warnings.map((w, i) => (
                                        <span
                                            key={i}
                                            className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full border ${
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
                            </motion.div>
                        )}

                        {/* ── 2. Metrics Overview ── */}
                        {/* Totals are computed by summing history rows, so they always match the chart for the selected time range */}
                        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { icon: TrendingUp, label: 'Impressions', value: totals.impressions.toLocaleString() },
                                { icon: MousePointer2, label: 'Clicks', value: totals.clicks.toLocaleString() },
                                { icon: DollarSign, label: 'Cost', value: `$${totals.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                                { icon: Target, label: 'Conversions', value: totals.conversions.toLocaleString(undefined, { maximumFractionDigits: 0 }) },
                            ].map(({ icon: Icon, label, value }) => (
                                <div key={label} className="bg-[#24231F] border border-[#3D3C36] rounded-xl p-5">
                                    <div className="flex items-center gap-1.5 text-[#9B9689] text-xs mb-2">
                                        <Icon className="w-3.5 h-3.5" />
                                        {label}
                                    </div>
                                    <p className="text-xl font-semibold text-[#E8E4DD] tabular-nums">{value}</p>
                                </div>
                            ))}
                        </motion.div>

                        {/* ── 3. Performance History ── */}
                        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-[#24231F] border border-[#3D3C36] rounded-xl p-6">
                            <div className="flex items-center gap-2 mb-6">
                                <History className="w-4 h-4 text-[#9B9689]" />
                                <h2 className="text-base font-semibold text-[#E8E4DD]">Performance History</h2>
                            </div>
                            <div className="h-[360px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={history} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorImpressions" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#4CAF6E" stopOpacity={0.25} />
                                                <stop offset="95%" stopColor="#4CAF6E" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#D4882A" stopOpacity={0.25} />
                                                <stop offset="95%" stopColor="#D4882A" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#3D3C36" vertical={false} />
                                        <XAxis dataKey="date" stroke="#3D3C36" tick={{ fill: '#9B9689', fontSize: 11 }} tickLine={false} />
                                        <YAxis yAxisId="left" stroke="#4CAF6E" tick={{ fill: '#4CAF6E', fontSize: 11 }} tickLine={false} axisLine={false} />
                                        <YAxis yAxisId="right" orientation="right" stroke="#D4882A" tick={{ fill: '#D4882A', fontSize: 11 }} tickLine={false} axisLine={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ color: '#9B9689', fontSize: 12 }} />
                                        <Area yAxisId="left" type="monotone" dataKey="impressions" name="Impressions" stroke="#4CAF6E" fillOpacity={1} fill="url(#colorImpressions)" strokeWidth={2} />
                                        <Area yAxisId="right" type="monotone" dataKey="clicks" name="Clicks" stroke="#D4882A" fillOpacity={1} fill="url(#colorClicks)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </motion.div>

                        {/* ── 4. Ad Copy ── */}
                        {ads.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-[#24231F] border border-[#3D3C36] rounded-xl overflow-hidden">
                                <div className="px-6 py-4 border-b border-[#3D3C36]">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-[#9B9689]" />
                                        <h2 className="text-base font-semibold text-[#E8E4DD]">Ad Copy</h2>
                                        {isSmartCampaign && (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-[#4CAF6E]/10 text-[#4CAF6E] border-[#4CAF6E]/20 uppercase tracking-wide">Smart</span>
                                        )}
                                    </div>
                                </div>
                                <div className="divide-y divide-[#3D3C36]/50">
                                    {ads.map((ad) => (
                                        <div key={ad.adId} className="px-6 py-5 space-y-4">
                                            <div className="flex items-center gap-2 text-xs text-[#9B9689]">
                                                <span className="font-mono">Ad {ad.adId}</span>
                                                <span className="text-[#3D3C36]">|</span>
                                                <span>{ad.adGroupName}</span>
                                                {ad.finalUrls.length > 0 && (
                                                    <>
                                                        <span className="text-[#3D3C36]">|</span>
                                                        <LinkIcon className="w-3 h-3 text-[#4CAF6E]" />
                                                        <span className="font-mono text-[#4CAF6E]">{ad.finalUrls[0]}</span>
                                                    </>
                                                )}
                                            </div>

                                            <div>
                                                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9B9689] mb-1.5">Headlines</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {ad.headlines.map((h, i) => (
                                                        <span key={i} className="text-xs bg-[#1A1917] border border-[#3D3C36] rounded px-2.5 py-1 text-[#E8E4DD]">{h}</span>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9B9689] mb-1.5">Descriptions</p>
                                                <div className="space-y-1">
                                                    {ad.descriptions.map((d, i) => (
                                                        <p key={i} className="text-xs text-[#9B9689] bg-[#1A1917] border border-[#3D3C36] rounded px-2.5 py-1.5">{d}</p>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* ── 5. Keywords / Keyword Themes ── */}
                        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-[#24231F] border border-[#3D3C36] rounded-xl overflow-hidden">
                            {isSmartCampaign ? (
                                <>
                                    <div className="px-6 py-4 border-b border-[#3D3C36] flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex items-center gap-2">
                                            <Search className="w-4 h-4 text-[#9B9689]" />
                                            <h2 className="text-base font-semibold text-[#E8E4DD]">Keyword Themes</h2>
                                        </div>
                                        <div className="text-xs text-[#9B9689]">Smart campaigns use keyword themes, not individual keywords</div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm">
                                            <thead>
                                                <tr className="border-b border-[#3D3C36] text-[#9B9689]">
                                                    <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest">Theme</th>
                                                    <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest">Type</th>
                                                    <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-right">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#3D3C36]/50">
                                                {keywordThemes.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={3} className="px-6 py-8 text-center text-[#9B9689] text-sm">
                                                            No keyword themes configured for this campaign.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    keywordThemes.map((theme) => (
                                                        <tr key={theme.criterionId} className="hover:bg-[#2E2D28] transition-colors">
                                                            <td className="px-6 py-3 font-medium text-[#E8E4DD]">{theme.text}</td>
                                                            <td className="px-6 py-3 text-xs text-[#9B9689]">
                                                                {theme.isFreeForm ? 'Custom' : 'Suggested'}
                                                            </td>
                                                            <td className="px-6 py-3 text-right">
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                                                                    theme.status === 'ENABLED'
                                                                        ? 'bg-[#4CAF6E]/10 text-[#4CAF6E] border-[#4CAF6E]/20'
                                                                        : 'bg-[#9B9689]/10 text-[#9B9689] border-[#9B9689]/20'
                                                                }`}>
                                                                    {theme.status}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="px-6 py-4 border-b border-[#3D3C36] flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex items-center gap-2">
                                            <Search className="w-4 h-4 text-[#9B9689]" />
                                            <h2 className="text-base font-semibold text-[#E8E4DD]">Keywords</h2>
                                        </div>
                                        <div className="text-xs text-[#9B9689]">Top keywords by impressions</div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm">
                                            <thead>
                                                <tr className="border-b border-[#3D3C36] text-[#9B9689]">
                                                    <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest">Keyword</th>
                                                    <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-center">Quality</th>
                                                    <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-right">Impressions</th>
                                                    <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-right">Clicks</th>
                                                    <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-right">CTR</th>
                                                    <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-right">Avg. CPC</th>
                                                    <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-right">Cost</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#3D3C36]/50">
                                                {keywords.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={7} className="px-6 py-8 text-center text-[#9B9689] text-sm">
                                                            No keyword data available for this campaign.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    keywords.map((keyword, i) => (
                                                        <tr key={i} className="hover:bg-[#2E2D28] transition-colors">
                                                            <td className="px-6 py-3 font-medium text-[#E8E4DD]">{keyword.text}</td>
                                                            <td className="px-6 py-3 text-center">
                                                                {keyword.qualityScore > 0 ? (
                                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                                                                        keyword.qualityScore >= 7
                                                                            ? 'bg-[#4CAF6E]/10 text-[#4CAF6E] border-[#4CAF6E]/20'
                                                                            : keyword.qualityScore >= 5
                                                                                ? 'bg-[#D4882A]/10 text-[#D4882A] border-[#D4882A]/20'
                                                                                : 'bg-[#C45D4A]/10 text-[#C45D4A] border-[#C45D4A]/20'
                                                                    }`}>
                                                                        {keyword.qualityScore}/10
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[#9B9689]/30">—</span>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-3 text-right tabular-nums text-[#9B9689]">{keyword.impressions.toLocaleString()}</td>
                                                            <td className="px-6 py-3 text-right tabular-nums text-[#9B9689]">{keyword.clicks.toLocaleString()}</td>
                                                            <td className="px-6 py-3 text-right tabular-nums text-[#9B9689]">{(keyword.ctr * 100).toFixed(2)}%</td>
                                                            <td className="px-6 py-3 text-right tabular-nums text-[#9B9689]">${keyword.averageCpc.toFixed(2)}</td>
                                                            <td className="px-6 py-3 text-right tabular-nums font-medium text-[#E8E4DD]">${keyword.cost.toFixed(2)}</td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </motion.div>

                        {/* ── 6. AI Summary ── */}
                        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-[#24231F] border border-[#3D3C36] rounded-xl p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-[#4CAF6E]" />
                                    <h2 className="text-base font-semibold text-[#E8E4DD]">AI Summary</h2>
                                </div>
                                <Button
                                    onClick={handleGenerateSummary}
                                    disabled={summaryLoading || history.length === 0}
                                    variant="outline"
                                    size="sm"
                                    className="border-[#3D3C36] bg-[#4CAF6E]/10 text-[#4CAF6E] hover:bg-[#4CAF6E]/20 border-[#4CAF6E]/20 disabled:opacity-50"
                                >
                                    {summaryLoading ? (
                                        <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Analyzing...</>
                                    ) : (
                                        <><Sparkles className="w-3.5 h-3.5 mr-2" />{summary ? 'Regenerate' : 'Generate Summary'}</>
                                    )}
                                </Button>
                            </div>

                            {summaryError && (
                                <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-lg p-3 flex items-center gap-2 text-[#C45D4A] text-sm">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <p>{summaryError}</p>
                                </div>
                            )}

                            {!summary && !summaryLoading && !summaryError && (
                                <p className="text-[#9B9689] text-sm">
                                    Click &quot;Generate Summary&quot; to get an AI-powered analysis of your campaign performance, trends, and recommendations.
                                </p>
                            )}

                            {summary && (
                                <div className="prose prose-sm max-w-none text-[#9B9689]
                                    [&_strong]:text-[#E8E4DD] [&_h1]:text-[#4CAF6E] [&_h2]:text-[#4CAF6E] [&_h3]:text-[#4CAF6E]
                                    [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs">
                                    <div dangerouslySetInnerHTML={{ __html: summary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
                                </div>
                            )}
                        </motion.div>

                    </div>
                )}
            </div>
        </section>
    );
}
