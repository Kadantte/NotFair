'use client';

import { useCallback, useEffect, useState, use, useMemo } from 'react';
import { motion } from 'framer-motion';
import { History, Search, AlertCircle, Sparkles, Loader2, TrendingUp, TrendingDown, MousePointer2, DollarSign, Target, FileText, Link as LinkIcon, Building2, ShieldAlert, ArrowRight } from 'lucide-react';
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
    getSmartCampaignAdsAction,
    getSmartCampaignSearchTermsAction,
    getImpressionShareAction,
    getSearchTermReportAction,
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
    type?: string;
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

interface SmartSearchTerm {
    searchTerm: string;
    impressions: number;
    clicks: number;
    cost: number;
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

interface ImpressionShareData {
    campaignId: string;
    impressionShare: number | null;
    budgetLostImpressionShare: number | null;
    rankLostImpressionShare: number | null;
    totalImpressions: number;
}

interface SearchTermRow {
    searchTerm: string;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
}

// ─── Diagnosis Engine ───────────────────────────────────────────

type DiagnosisItem = {
    severity: 'danger' | 'warning' | 'info';
    title: string;
    explanation: string;
};

function diagnoseCampaign(opts: {
    totals: { impressions: number; clicks: number; cost: number; conversions: number };
    conversionActions: ConversionAction[];
    campaign: CampaignInfo | null;
    keywords: CampaignKeyword[];
    impressionShare: ImpressionShareData | null;
    searchTerms: SearchTermRow[];
    trend: { cpaCurrent: number | null; cpaPrevious: number | null; conversionsCurrent: number; conversionsPrevious: number };
}): DiagnosisItem[] {
    const { totals, conversionActions, campaign, keywords, impressionShare, searchTerms, trend } = opts;
    const items: DiagnosisItem[] = [];

    if (!campaign || campaign.status !== 'ENABLED') return items;

    // 1. No conversion tracking
    if (conversionActions.length === 0) {
        items.push({
            severity: 'danger',
            title: 'No conversion tracking',
            explanation: 'No conversion actions are set up, so conversions can\'t be measured. Set up conversion tracking in Google Ads to measure ROI.',
        });
        return items; // Nothing else is meaningful without tracking
    }

    // 2. Spending but zero conversions
    if (totals.cost > 0 && totals.conversions === 0) {
        const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
        if (totals.clicks === 0) {
            items.push({
                severity: 'danger',
                title: 'No clicks',
                explanation: 'Ads are showing but nobody is clicking. This usually means your ad copy doesn\'t match what people are searching for, or your bids are too low to compete for relevant positions.',
            });
        } else if (ctr < 0.02) {
            items.push({
                severity: 'danger',
                title: 'Low click-through rate',
                explanation: `CTR is ${(ctr * 100).toFixed(1)}% — below the 2% benchmark. Your ads may not be relevant to the searches they\'re matching. Review your keywords and ad copy for tighter alignment.`,
            });
        } else {
            items.push({
                severity: 'danger',
                title: 'Clicks but no conversions',
                explanation: `${totals.clicks.toLocaleString()} clicks with ${(ctr * 100).toFixed(1)}% CTR — people are clicking but not converting. This points to a landing page issue (slow load, unclear CTA, mismatch with ad promise) or a conversion tracking gap.`,
            });
        }
    }

    // 3. CPA trending up
    if (trend.cpaCurrent !== null && trend.cpaPrevious !== null && trend.cpaPrevious > 0) {
        const cpaChange = (trend.cpaCurrent - trend.cpaPrevious) / trend.cpaPrevious;
        if (cpaChange > 0.2) {
            items.push({
                severity: 'warning',
                title: `CPA up ${Math.round(cpaChange * 100)}% vs previous period`,
                explanation: `Cost per conversion rose from $${trend.cpaPrevious.toFixed(2)} to $${trend.cpaCurrent.toFixed(2)}. Check if new search terms are draining budget or if competition has increased.`,
            });
        }
    }

    // 4. Conversions declining
    if (trend.conversionsPrevious > 0 && trend.conversionsCurrent === 0) {
        items.push({
            severity: 'danger',
            title: 'Conversions dropped to zero',
            explanation: `Previous period had ${trend.conversionsPrevious} conversion${trend.conversionsPrevious === 1 ? '' : 's'}, but this period has none. Check if conversion tracking is still firing, or if a landing page change broke the funnel.`,
        });
    }

    // 5. Budget-limited impression share
    if (impressionShare?.budgetLostImpressionShare != null && impressionShare.budgetLostImpressionShare > 0.10) {
        const pct = Math.round(impressionShare.budgetLostImpressionShare * 100);
        items.push({
            severity: 'warning',
            title: `Losing ${pct}% of impressions to budget`,
            explanation: 'Your budget is running out before the day ends, causing ads to stop showing. If CPA is good, raising the daily budget could increase conversions proportionally.',
        });
    }

    // 6. Rank-limited impression share
    if (impressionShare?.rankLostImpressionShare != null && impressionShare.rankLostImpressionShare > 0.20) {
        const pct = Math.round(impressionShare.rankLostImpressionShare * 100);
        items.push({
            severity: 'warning',
            title: `Losing ${pct}% of impressions to ad rank`,
            explanation: 'Competitors are outranking you due to lower quality scores or higher bids. Improving ad relevance and landing page experience has more leverage than raising bids.',
        });
    }

    // 7. Wasted search terms
    if (searchTerms.length > 0) {
        const nonConverting = searchTerms.filter(t => t.conversions === 0 && t.clicks >= 3 && t.cost > 0);
        const wastedSpend = nonConverting.reduce((s, t) => s + t.cost, 0);
        if (wastedSpend > 5 && nonConverting.length > 0) {
            const topTerms = nonConverting.sort((a, b) => b.cost - a.cost).slice(0, 3);
            items.push({
                severity: 'warning',
                title: `$${wastedSpend.toFixed(0)} spent on non-converting search terms`,
                explanation: `Top non-converting terms: ${topTerms.map(t => `"${t.searchTerm}" ($${t.cost.toFixed(0)})`).join(', ')}. Consider adding these as negative keywords.`,
            });
        }
    }

    // 8. Low quality keywords
    const lowQsKeywords = keywords.filter(k => k.qualityScore > 0 && k.qualityScore < 5 && k.cost > 0);
    if (lowQsKeywords.length > 0) {
        const totalWaste = lowQsKeywords.reduce((s, k) => s + k.cost, 0);
        if (totalWaste > 5) {
            items.push({
                severity: 'info',
                title: `${lowQsKeywords.length} keyword${lowQsKeywords.length === 1 ? '' : 's'} with low quality scores`,
                explanation: `Keywords scoring below 5/10 are paying a premium per click. Improving landing page relevance and ad copy match can reduce CPC significantly.`,
            });
        }
    }

    // 9. Display Network on Search campaign
    if (campaign.type === 'SEARCH' && campaign.networkDisplayEnabled) {
        items.push({
            severity: 'info',
            title: 'Display Network enabled on Search campaign',
            explanation: 'Display Network traffic on Search campaigns typically converts at a much lower rate. Consider disabling it to focus budget on search intent.',
        });
    }

    return items;
}

// ─── Helpers ─────────────────────────────────────────────────────

const severityStyles = {
    danger: { bg: 'bg-[#C45D4A]/5 border-[#C45D4A]/20', text: 'text-[#C45D4A]', icon: ShieldAlert },
    warning: { bg: 'bg-[#D4882A]/5 border-[#D4882A]/20', text: 'text-[#D4882A]', icon: AlertCircle },
    info: { bg: 'bg-[#C4C0B6]/5 border-[#3D3C36]', text: 'text-[#C4C0B6]', icon: ArrowRight },
} as const;

const statusColors: Record<string, string> = {
    ENABLED: 'bg-[#4CAF6E]/10 text-[#4CAF6E] border-[#4CAF6E]/20',
    PAUSED: 'bg-[#D4882A]/10 text-[#D4882A] border-[#D4882A]/20',
    REMOVED: 'bg-[#C45D4A]/10 text-[#C45D4A] border-[#C45D4A]/20',
    UNKNOWN: 'bg-[#C4C0B6]/10 text-[#C4C0B6] border-[#C4C0B6]/20',
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

function computeTrend(history: CampaignHistory[]) {
    if (history.length < 4) return { cpaCurrent: null, cpaPrevious: null, conversionsCurrent: 0, conversionsPrevious: 0 };
    // Split into two equal halves, dropping the middle day if odd length
    const halfLen = Math.floor(history.length / 2);
    const first = history.slice(0, halfLen);
    const second = history.slice(history.length - halfLen);

    const sum = (rows: CampaignHistory[]) => rows.reduce(
        (acc, d) => ({ cost: acc.cost + d.cost, conversions: acc.conversions + d.conversions }),
        { cost: 0, conversions: 0 },
    );

    const prev = sum(first);
    const curr = sum(second);

    return {
        cpaCurrent: curr.conversions > 0 ? curr.cost / curr.conversions : null,
        cpaPrevious: prev.conversions > 0 ? prev.cost / prev.conversions : null,
        conversionsCurrent: curr.conversions,
        conversionsPrevious: prev.conversions,
    };
}

type VerdictColor = 'good' | 'ok' | 'warning' | 'danger' | 'muted';

function getVerdictColor(totals: { cost: number; conversions: number; clicks: number }, conversionActions: ConversionAction[]): VerdictColor {
    if (conversionActions.length === 0) return 'muted'; // can't judge
    if (totals.cost === 0) return 'muted'; // no spend
    if (totals.conversions === 0) return 'danger';
    const convRate = totals.conversions / Math.max(totals.clicks, 1);
    if (convRate >= 0.05) return 'good';
    if (convRate >= 0.02) return 'ok';
    return 'warning';
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
    const [smartSearchTerms, setSmartSearchTerms] = useState<SmartSearchTerm[]>([]);
    const [ads, setAds] = useState<CampaignAd[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [campaignInfo, setCampaignInfo] = useState<CampaignInfo | null>(null);
    const [smartSetting, setSmartSetting] = useState<SmartCampaignSetting | null>(null);
    const [conversionActions, setConversionActions] = useState<ConversionAction[]>([]);
    const [impressionShare, setImpressionShare] = useState<ImpressionShareData | null>(null);
    const [searchTerms, setSearchTerms] = useState<SearchTermRow[]>([]);
    const [summary, setSummary] = useState<string | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryError, setSummaryError] = useState<string | null>(null);

    const totals = useMemo(() => history.reduce(
        (acc, d) => ({
            impressions: acc.impressions + d.impressions,
            clicks: acc.clicks + d.clicks,
            cost: acc.cost + d.cost,
            conversions: acc.conversions + d.conversions,
        }),
        { impressions: 0, clicks: 0, cost: 0, conversions: 0 },
    ), [history]);

    const trend = useMemo(() => computeTrend(history), [history]);
    const cpa = totals.conversions > 0 ? totals.cost / totals.conversions : null;
    const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
    const convRate = totals.clicks > 0 ? totals.conversions / totals.clicks : 0;

    const isSmartCampaign = campaignInfo?.type === 'SMART';

    const diagnosis = useMemo(() => diagnoseCampaign({
        totals,
        conversionActions,
        campaign: campaignInfo,
        keywords,
        impressionShare,
        searchTerms,
        trend,
    }), [totals, conversionActions, campaignInfo, keywords, impressionShare, searchTerms, trend]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        // Clear Phase 3 data so diagnosis doesn't show stale results during re-fetch
        setImpressionShare(null);
        setSearchTerms([]);
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
            const [keywordThemesData, smartSettingData, smartAdsData, smartSearchTermsData] = match?.type === 'SMART'
                ? await Promise.all([
                    getCampaignKeywordThemesAction(campaignId),
                    getSmartCampaignSettingAction(campaignId),
                    getSmartCampaignAdsAction(campaignId),
                    getSmartCampaignSearchTermsAction(campaignId),
                ])
                : [[], null, null, []];

            setHistory(historyData);
            setKeywords(keywordsData);
            setKeywordThemes(keywordThemesData ?? []);
            setAds(smartAdsData ?? adsData);
            setSmartSetting(smartSettingData ?? null);
            setSmartSearchTerms(smartSearchTermsData ?? []);
            setConversionActions((conversionActionsData ?? []).filter((ca: ConversionAction) => ca.includeInConversions));
            if (match) setCampaignInfo(match);

            // Phase 3: Diagnosis data (non-blocking, fetched in background after render)
            // Note: impression share and search terms always cover last 30 days
            if (match && match.type !== 'SMART') {
                Promise.all([
                    getImpressionShareAction(campaignId),
                    getSearchTermReportAction(campaignId),
                ]).then(([isData, stData]) => {
                    if (isData && 'budgetLostImpressionShare' in isData) {
                        setImpressionShare(isData as ImpressionShareData);
                    }
                    setSearchTerms(stData ?? []);
                }).catch(() => {
                    // Phase 3 is non-critical — diagnosis just won't show IS/search term findings
                });
            }
        } catch (err) {
            console.error(err);
            const msg = err instanceof Error ? err.message : String(err);
            setError(`Failed to fetch campaign details: ${msg}`);
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
                    <div key={i} className="flex items-center gap-2 text-sm text-[#C4C0B6]">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span>{entry.name}:</span>
                        <span className="font-mono text-[#E8E4DD]">
                            {entry.name === 'Cost' ? `$${Number(entry.value).toFixed(2)}`
                                : entry.name === 'Conversions' ? Number(entry.value).toFixed(1)
                                : entry.value.toLocaleString()}
                        </span>
                    </div>
                ))}
            </div>
        );
    };

    const verdictColor = getVerdictColor(totals, conversionActions);

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
                            <span className="text-xs text-[#C4C0B6] font-mono">ID: {campaignId}</span>
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
                                    : 'text-[#C4C0B6] hover:text-[#E8E4DD] hover:bg-[#2E2D28]'
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
                        <p className="text-[#C4C0B6] animate-pulse text-sm">Loading campaign data...</p>
                    </div>
                ) : (
                    <div className="space-y-6">

                        {/* ── 1. Verdict: Is this campaign doing well? ── */}
                        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_1px_1fr_1px_1fr_1px_1fr] gap-0 bg-[#24231F] border border-[#3D3C36] rounded-xl overflow-hidden">
                                {/* CPA — Hero metric */}
                                <div className="p-5 md:p-6">
                                    <div className="flex items-center gap-1.5 text-[#C4C0B6] text-xs mb-2">
                                        <Target className="w-3.5 h-3.5" />
                                        Cost per Conversion
                                    </div>
                                    {cpa !== null ? (
                                        <div className="flex items-baseline gap-2">
                                            <p className={`text-3xl font-semibold tabular-nums font-mono ${
                                                verdictColor === 'good' ? 'text-[#4CAF6E]'
                                                    : verdictColor === 'ok' ? 'text-[#D4882A]'
                                                    : verdictColor === 'danger' ? 'text-[#C45D4A]'
                                                    : 'text-[#E8E4DD]'
                                            }`}>
                                                ${cpa.toFixed(2)}
                                            </p>
                                            {trend.cpaCurrent !== null && trend.cpaPrevious !== null && trend.cpaPrevious > 0 && (
                                                <span className={`flex items-center gap-0.5 text-xs font-medium ${
                                                    trend.cpaCurrent <= trend.cpaPrevious ? 'text-[#4CAF6E]' : 'text-[#C45D4A]'
                                                }`}>
                                                    {trend.cpaCurrent <= trend.cpaPrevious
                                                        ? <TrendingDown className="w-3 h-3" />
                                                        : <TrendingUp className="w-3 h-3" />
                                                    }
                                                    {Math.abs(Math.round(((trend.cpaCurrent - trend.cpaPrevious) / trend.cpaPrevious) * 100))}%
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <p className={`text-2xl font-semibold ${totals.cost > 0 ? 'text-[#C45D4A]' : 'text-[#C4C0B6]'}`}>
                                            {totals.cost > 0 ? 'No conversions' : '—'}
                                        </p>
                                    )}
                                </div>

                                <div className="hidden md:block bg-[#3D3C36]" />

                                {/* Conversions */}
                                <div className="p-5 md:p-6 border-t md:border-t-0 border-[#3D3C36]">
                                    <div className="flex items-center gap-1.5 text-[#C4C0B6] text-xs mb-2">
                                        <Target className="w-3.5 h-3.5" />
                                        Conversions
                                    </div>
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-3xl font-semibold text-[#E8E4DD] tabular-nums font-mono">
                                            {totals.conversions.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </p>
                                        {trend.conversionsPrevious > 0 && (
                                            <span className={`flex items-center gap-0.5 text-xs font-medium ${
                                                trend.conversionsCurrent >= trend.conversionsPrevious ? 'text-[#4CAF6E]' : 'text-[#C45D4A]'
                                            }`}>
                                                {trend.conversionsCurrent >= trend.conversionsPrevious
                                                    ? <TrendingUp className="w-3 h-3" />
                                                    : <TrendingDown className="w-3 h-3" />
                                                }
                                                {Math.abs(Math.round(((trend.conversionsCurrent - trend.conversionsPrevious) / trend.conversionsPrevious) * 100))}%
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-[#C4C0B6] mt-1 tabular-nums">
                                        {(convRate * 100).toFixed(1)}% conversion rate
                                    </p>
                                </div>

                                <div className="hidden md:block bg-[#3D3C36]" />

                                {/* Cost */}
                                <div className="p-5 md:p-6 border-t md:border-t-0 border-[#3D3C36]">
                                    <div className="flex items-center gap-1.5 text-[#C4C0B6] text-xs mb-2">
                                        <DollarSign className="w-3.5 h-3.5" />
                                        Cost
                                    </div>
                                    <p className="text-3xl font-semibold text-[#E8E4DD] tabular-nums font-mono">
                                        ${totals.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                    <p className="text-xs text-[#C4C0B6] mt-1 tabular-nums">
                                        ${totals.clicks > 0 ? (totals.cost / totals.clicks).toFixed(2) : '0.00'} avg CPC
                                    </p>
                                </div>

                                <div className="hidden md:block bg-[#3D3C36]" />

                                {/* Clicks & Impressions */}
                                <div className="p-5 md:p-6 border-t md:border-t-0 border-[#3D3C36]">
                                    <div className="flex items-center gap-1.5 text-[#C4C0B6] text-xs mb-2">
                                        <MousePointer2 className="w-3.5 h-3.5" />
                                        Traffic
                                    </div>
                                    <p className="text-3xl font-semibold text-[#E8E4DD] tabular-nums font-mono">
                                        {totals.clicks.toLocaleString()}
                                    </p>
                                    <p className="text-xs text-[#C4C0B6] mt-1 tabular-nums">
                                        {totals.impressions.toLocaleString()} impr · {(ctr * 100).toFixed(1)}% CTR
                                    </p>
                                </div>
                            </div>
                        </motion.div>

                        {/* ── 2. Diagnosis: Why is it not doing well? ── */}
                        {diagnosis.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                                {diagnosis.map((item, i) => {
                                    const s = severityStyles[item.severity];
                                    return (
                                        <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${s.bg}`}>
                                            <div className={`mt-0.5 shrink-0 ${s.text}`}>
                                                <s.icon className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className={`text-sm font-medium ${s.text}`}>{item.title}</p>
                                                <p className="text-xs text-[#C4C0B6] mt-0.5 leading-relaxed">{item.explanation}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </motion.div>
                        )}

                        {/* ── Campaign Settings ── */}
                        {campaignInfo && (
                            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                                <div className="flex flex-wrap items-center gap-2">
                                    {isSmartCampaign && smartSetting?.businessName && (
                                        <div className="flex items-center gap-1.5 text-xs bg-[#1A1917] border border-[#3D3C36] rounded-lg px-3 py-1.5">
                                            <Building2 className="w-3 h-3 text-[#4CAF6E]" />
                                            <span className="text-[#C4C0B6]">Business</span>
                                            <span className="text-[#E8E4DD] font-medium">{smartSetting.businessName}</span>
                                        </div>
                                    )}
                                    {!isSmartCampaign && (() => {
                                        const domains = [...new Set(ads.flatMap(a => a.finalUrls).map(extractHostname).filter(Boolean))];
                                        return domains.length > 0 ? (
                                            <div className="flex items-center gap-1.5 text-xs bg-[#1A1917] border border-[#3D3C36] rounded-lg px-3 py-1.5">
                                                <LinkIcon className="w-3 h-3 text-[#4CAF6E]" />
                                                <span className="text-[#C4C0B6]">Website</span>
                                                <span className="text-[#E8E4DD] font-medium font-mono">{domains.join(', ')}</span>
                                            </div>
                                        ) : null;
                                    })()}
                                    {isSmartCampaign && smartSetting?.finalUrl && (
                                        <div className="flex items-center gap-1.5 text-xs bg-[#1A1917] border border-[#3D3C36] rounded-lg px-3 py-1.5">
                                            <LinkIcon className="w-3 h-3 text-[#4CAF6E]" />
                                            <span className="text-[#C4C0B6]">URL</span>
                                            <span className="text-[#E8E4DD] font-medium font-mono">
                                                {extractHostname(smartSetting.finalUrl)}
                                            </span>
                                        </div>
                                    )}
                                    {conversionActions.length > 0 && (
                                        <div className="flex items-center gap-1.5 text-xs bg-[#1A1917] border border-[#3D3C36] rounded-lg px-3 py-1.5">
                                            <Target className="w-3 h-3 text-[#C4C0B6]" />
                                            <span className="text-[#C4C0B6]">Tracking</span>
                                            <span className="text-[#E8E4DD] font-medium">{conversionActions.map(ca => ca.name).join(', ')}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1.5 text-xs bg-[#1A1917] border border-[#3D3C36] rounded-lg px-3 py-1.5">
                                        <span className="text-[#C4C0B6]">Type</span>
                                        <span className="text-[#E8E4DD] font-medium capitalize">{campaignInfo.type.replace(/_/g, ' ').toLowerCase()}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs bg-[#1A1917] border border-[#3D3C36] rounded-lg px-3 py-1.5">
                                        <span className="text-[#C4C0B6]">Bidding</span>
                                        <span className="text-[#E8E4DD] font-medium capitalize">{campaignInfo.biddingStrategy.replace(/_/g, ' ').toLowerCase()}</span>
                                    </div>
                                    {!isSmartCampaign && (
                                        <div className="flex items-center gap-1.5 text-xs bg-[#1A1917] border border-[#3D3C36] rounded-lg px-3 py-1.5">
                                            <span className="text-[#C4C0B6]">UTM</span>
                                            <span className="text-[#E8E4DD] font-medium font-mono">{campaignInfo.trackingTemplate || 'Not set'}</span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {/* ── 3. Performance History ── */}
                        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-[#24231F] border border-[#3D3C36] rounded-xl p-6">
                            <div className="flex items-center gap-2 mb-6">
                                <History className="w-4 h-4 text-[#C4C0B6]" />
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
                                            <linearGradient id="colorConversions" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#C45D4A" stopOpacity={0.25} />
                                                <stop offset="95%" stopColor="#C45D4A" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#3D3C36" vertical={false} />
                                        <XAxis dataKey="date" stroke="#3D3C36" tick={{ fill: '#C4C0B6', fontSize: 11 }} tickLine={false} />
                                        <YAxis yAxisId="left" stroke="#4CAF6E" tick={{ fill: '#4CAF6E', fontSize: 11 }} tickLine={false} axisLine={false} />
                                        <YAxis yAxisId="right" orientation="right" stroke="#D4882A" tick={{ fill: '#D4882A', fontSize: 11 }} tickLine={false} axisLine={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ color: '#C4C0B6', fontSize: 12 }} />
                                        <Area yAxisId="left" type="monotone" dataKey="impressions" name="Impressions" stroke="#4CAF6E" fillOpacity={1} fill="url(#colorImpressions)" strokeWidth={2} />
                                        <Area yAxisId="right" type="monotone" dataKey="clicks" name="Clicks" stroke="#D4882A" fillOpacity={1} fill="url(#colorClicks)" strokeWidth={2} />
                                        <Area yAxisId="right" type="monotone" dataKey="conversions" name="Conversions" stroke="#C45D4A" fillOpacity={1} fill="url(#colorConversions)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </motion.div>

                        {/* ── 4. Ad Copy (non-Smart campaigns only) ── */}
                        {!isSmartCampaign && ads.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-[#24231F] border border-[#3D3C36] rounded-xl overflow-hidden">
                                <div className="px-6 py-4 border-b border-[#3D3C36]">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-[#C4C0B6]" />
                                        <h2 className="text-base font-semibold text-[#E8E4DD]">Ad Copy</h2>
                                    </div>
                                </div>
                                <div className="divide-y divide-[#3D3C36]/50">
                                    {ads.map((ad) => (
                                        <div key={ad.adId} className="px-6 py-5 space-y-4">
                                            <div className="flex items-center gap-2 text-xs text-[#C4C0B6]">
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
                                                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6] mb-1.5">Headlines</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {ad.headlines.map((h, i) => (
                                                        <span key={i} className="text-xs bg-[#1A1917] border border-[#3D3C36] rounded px-2.5 py-1 text-[#E8E4DD]">{h}</span>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6] mb-1.5">Descriptions</p>
                                                <div className="space-y-1">
                                                    {ad.descriptions.map((d, i) => (
                                                        <p key={i} className="text-xs text-[#C4C0B6] bg-[#1A1917] border border-[#3D3C36] rounded px-2.5 py-1.5">{d}</p>
                                                    ))}
                                                </div>
                                            </div>

                                            {!isSmartCampaign && (
                                                <div className="flex flex-wrap gap-4 pt-1">
                                                    {[
                                                        { label: 'Impr.', value: ad.impressions.toLocaleString() },
                                                        { label: 'Clicks', value: ad.clicks.toLocaleString() },
                                                        { label: 'Cost', value: `$${ad.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                                                        { label: 'Conv.', value: ad.conversions.toLocaleString(undefined, { maximumFractionDigits: 0 }) },
                                                    ].map(({ label, value }) => (
                                                        <div key={label} className="flex flex-col">
                                                            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">{label}</span>
                                                            <span className="text-sm font-medium tabular-nums text-[#E8E4DD]">{value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* ── 5. Smart Campaign Search Terms ── */}
                        {isSmartCampaign && smartSearchTerms.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-[#24231F] border border-[#3D3C36] rounded-xl overflow-hidden">
                                <div className="px-6 py-4 border-b border-[#3D3C36] flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-center gap-2">
                                        <Search className="w-4 h-4 text-[#C4C0B6]" />
                                        <h2 className="text-base font-semibold text-[#E8E4DD]">Search Terms</h2>
                                    </div>
                                    <div className="text-xs text-[#C4C0B6]">What people searched before clicking your ads</div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-[#3D3C36] text-[#C4C0B6]">
                                                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest">Search Term</th>
                                                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-right">Impressions</th>
                                                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-right">Clicks</th>
                                                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-right">Cost</th>
                                                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-right">CTR</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#3D3C36]/50">
                                            {smartSearchTerms.map((term, i) => (
                                                <tr key={i} className="hover:bg-[#2E2D28] transition-colors">
                                                    <td className="px-6 py-3 font-medium text-[#E8E4DD]">{term.searchTerm}</td>
                                                    <td className="px-6 py-3 text-right tabular-nums text-[#C4C0B6]">{term.impressions.toLocaleString()}</td>
                                                    <td className="px-6 py-3 text-right tabular-nums text-[#C4C0B6]">{term.clicks.toLocaleString()}</td>
                                                    <td className="px-6 py-3 text-right tabular-nums font-medium text-[#E8E4DD]">${term.cost.toFixed(2)}</td>
                                                    <td className="px-6 py-3 text-right tabular-nums text-[#C4C0B6]">{term.impressions > 0 ? ((term.clicks / term.impressions) * 100).toFixed(2) : '0.00'}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </motion.div>
                        )}

                        {/* ── 6. Keywords / Keyword Themes ── */}
                        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-[#24231F] border border-[#3D3C36] rounded-xl overflow-hidden">
                            {isSmartCampaign ? (
                                <>
                                    <div className="px-6 py-4 border-b border-[#3D3C36] flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex items-center gap-2">
                                            <Search className="w-4 h-4 text-[#C4C0B6]" />
                                            <h2 className="text-base font-semibold text-[#E8E4DD]">Keyword Themes</h2>
                                        </div>
                                        <div className="text-xs text-[#C4C0B6]">Smart campaigns use keyword themes, not individual keywords</div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm">
                                            <thead>
                                                <tr className="border-b border-[#3D3C36] text-[#C4C0B6]">
                                                    <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest">Theme</th>
                                                    <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest">Type</th>
                                                    <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-right">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#3D3C36]/50">
                                                {keywordThemes.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={3} className="px-6 py-8 text-center text-[#C4C0B6] text-sm">
                                                            No keyword themes configured for this campaign.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    keywordThemes.map((theme) => (
                                                        <tr key={theme.criterionId} className="hover:bg-[#2E2D28] transition-colors">
                                                            <td className="px-6 py-3 font-medium text-[#E8E4DD]">{theme.text}</td>
                                                            <td className="px-6 py-3 text-xs text-[#C4C0B6]">
                                                                {theme.isFreeForm ? 'Custom' : 'Suggested'}
                                                            </td>
                                                            <td className="px-6 py-3 text-right">
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                                                                    theme.status === 'ENABLED'
                                                                        ? 'bg-[#4CAF6E]/10 text-[#4CAF6E] border-[#4CAF6E]/20'
                                                                        : 'bg-[#C4C0B6]/10 text-[#C4C0B6] border-[#C4C0B6]/20'
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
                                            <Search className="w-4 h-4 text-[#C4C0B6]" />
                                            <h2 className="text-base font-semibold text-[#E8E4DD]">Keywords</h2>
                                        </div>
                                        <div className="text-xs text-[#C4C0B6]">Top keywords by impressions</div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm">
                                            <thead>
                                                <tr className="border-b border-[#3D3C36] text-[#C4C0B6]">
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
                                                        <td colSpan={7} className="px-6 py-8 text-center text-[#C4C0B6] text-sm">
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
                                                                    <span className="text-[#C4C0B6]/30">—</span>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-3 text-right tabular-nums text-[#C4C0B6]">{keyword.impressions.toLocaleString()}</td>
                                                            <td className="px-6 py-3 text-right tabular-nums text-[#C4C0B6]">{keyword.clicks.toLocaleString()}</td>
                                                            <td className="px-6 py-3 text-right tabular-nums text-[#C4C0B6]">{(keyword.ctr * 100).toFixed(2)}%</td>
                                                            <td className="px-6 py-3 text-right tabular-nums text-[#C4C0B6]">${keyword.averageCpc.toFixed(2)}</td>
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

                        {/* ── 7. AI Summary ── */}
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
                                <p className="text-[#C4C0B6] text-sm">
                                    Click &quot;Generate Summary&quot; to get an AI-powered analysis of your campaign performance, trends, and recommendations.
                                </p>
                            )}

                            {summary && (
                                <div className="prose prose-sm max-w-none text-[#C4C0B6]
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
