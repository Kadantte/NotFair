'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, History, Search, Zap, MousePointer2, TrendingUp, DollarSign, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCampaignHistoryAction, getCampaignKeywordsAction } from '@/app/actions';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';

interface CampaignHistory {
    date: string;
    impressions: number;
    clicks: number;
    cost: number;
    ctr: number;
    averageCpc: number;
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

export default function CampaignDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    // Unwrap params using use() hook since it's a promise in Next.js 15+ (if applicable, but safer pattern)
    // Or just await it if it's async component, but this is 'use client'.
    // Actually in Next.js 13+ params is prop, but recent versions made it a promise in some contexts or just object.
    // Let's assume standard object for now or handle as promise if needed. 
    // Wait, recent Next.js defines params as Promise for async server components, but this is client component.
    // However, it's safer to use `use` or await if it is passed as a promise from a parent.
    // Let's use `use` from React if available, or just standard prop access if not.
    // Given the issues with params in client components in latest Next.js, let's try standard access first but be prepared.
    // Actually, to be safe with Next.js 15, `params` should be unwrapped with `use()`.

    // Check if `use` is available (React 19). The user has `react: 19.2.3` in package.json.
    const resolvedParams = use(params);
    const campaignId = resolvedParams.id;

    type TimeRange = 'ALL' | '5Y' | '1Y' | '6M' | '3M' | '1M' | '1W' | 'YESTERDAY' | 'TODAY';
    const [timeRange, setTimeRange] = useState<TimeRange>('ALL');

    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<CampaignHistory[]>([]);
    const [keywords, setKeywords] = useState<CampaignKeyword[]>([]);
    const [error, setError] = useState<string | null>(null);

    const formatDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getDateRange = (range: TimeRange) => {
        const today = new Date();
        const end = new Date(today);
        let start = new Date(today);

        switch (range) {
            case 'ALL':
                return { startDate: '2000-01-01', endDate: '2030-12-31' };
            case '5Y':
                start.setFullYear(today.getFullYear() - 5);
                break;
            case '1Y':
                start.setFullYear(today.getFullYear() - 1);
                break;
            case '6M':
                start.setMonth(today.getMonth() - 6);
                break;
            case '3M':
                start.setMonth(today.getMonth() - 3);
                break;
            case '1M':
                start.setMonth(today.getMonth() - 1);
                break;
            case '1W':
                start.setDate(today.getDate() - 7);
                break;
            case 'YESTERDAY':
                start.setDate(today.getDate() - 1);
                end.setDate(today.getDate() - 1);
                break;
            case 'TODAY':
                break; // start and end are already today
        }

        return {
            startDate: formatDate(start),
            endDate: formatDate(end)
        };
    };

    useEffect(() => {
        fetchData();
    }, [campaignId, timeRange]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem('google_ads_refresh_token');
        const cid = localStorage.getItem('google_ads_customer_id');
        const { startDate, endDate } = getDateRange(timeRange);

        if (!token || !cid) {
            router.push('/');
            return;
        }

        try {
            const [historyData, keywordsData] = await Promise.all([
                getCampaignHistoryAction(token, cid, campaignId, startDate, endDate),
                getCampaignKeywordsAction(token, cid, campaignId, startDate, endDate)
            ]);
            setHistory(historyData);
            setKeywords(keywordsData);
        } catch (err) {
            console.error(err);
            setError('Failed to fetch campaign details. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-lg shadow-xl">
                    <p className="text-zinc-300 mb-2 font-medium">{label}</p>
                    {payload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center gap-2 text-sm text-zinc-400">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span>{entry.name}:</span>
                            <span className="font-mono text-zinc-200">
                                {entry.name === 'Cost' ? `$${Number(entry.value).toFixed(2)}` : entry.value.toLocaleString()}
                            </span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <main className="min-h-screen bg-black text-white font-sans selection:bg-indigo-500/30">
            <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-black to-black z-0 pointer-events-none" />

            <div className="relative z-10 container mx-auto px-4 py-8 max-w-6xl">
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                    <div className="flex items-center gap-4">
                        <Link href="/campaigns">
                            <Button variant="ghost" size="icon" className="hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-full">
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">Campaign Details</h1>
                            <p className="text-zinc-500 text-sm mt-1">Campaign ID: {campaignId}</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1 bg-zinc-900/50 p-1 rounded-lg border border-zinc-800/50">
                        {(['ALL', '5Y', '1Y', '6M', '3M', '1M', '1W', 'YESTERDAY', 'TODAY'] as const).map((range) => (
                            <button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${timeRange === range
                                        ? 'bg-indigo-500/20 text-indigo-300 shadow-sm border border-indigo-500/20'
                                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                                    }`}
                            >
                                {range === 'ALL' ? 'All Time' :
                                    range === 'YESTERDAY' ? 'Yesterday' :
                                        range === 'TODAY' ? 'Today' :
                                            range}
                            </button>
                        ))}
                    </div>
                </header>

                {error && (
                    <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-4 mb-8 flex items-center gap-3 text-red-400">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-zinc-500 animate-pulse">Loading campaign data...</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* History Chart */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl p-6"
                        >
                            <div className="flex items-center gap-2 mb-6">
                                <History className="w-5 h-5 text-indigo-400" />
                                <h2 className="text-xl font-semibold text-zinc-200">Performance History</h2>
                            </div>

                            <div className="h-[400px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={history} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorImpressions" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                        <XAxis
                                            dataKey="date"
                                            stroke="#52525b"
                                            tick={{ fill: '#71717a' }}
                                            tickLine={{ stroke: '#52525b' }}
                                        />
                                        <YAxis
                                            yAxisId="left"
                                            stroke="#818cf8"
                                            tick={{ fill: '#818cf8' }}
                                            tickLine={{ stroke: '#818cf8' }}
                                        />
                                        <YAxis
                                            yAxisId="right"
                                            orientation="right"
                                            stroke="#34d399"
                                            tick={{ fill: '#34d399' }}
                                            tickLine={{ stroke: '#34d399' }}
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend />
                                        <Area
                                            yAxisId="left"
                                            type="monotone"
                                            dataKey="impressions"
                                            name="Impressions"
                                            stroke="#818cf8"
                                            fillOpacity={1}
                                            fill="url(#colorImpressions)"
                                            strokeWidth={2}
                                        />
                                        <Area
                                            yAxisId="right"
                                            type="monotone"
                                            dataKey="clicks"
                                            name="Clicks"
                                            stroke="#34d399"
                                            fillOpacity={1}
                                            fill="url(#colorClicks)"
                                            strokeWidth={2}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </motion.div>

                        {/* Keywords Table */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="bg-zinc-900/40 border border-zinc-800/50 rounded-xl overflow-hidden"
                        >
                            <div className="p-6 border-b border-zinc-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                    <Search className="w-5 h-5 text-indigo-400" />
                                    <h2 className="text-xl font-semibold text-zinc-200">Keyword Performance</h2>
                                </div>
                                <div className="text-sm text-zinc-500">
                                    Top performing keywords by impressions
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-zinc-800/50 text-zinc-500">
                                            <th className="px-6 py-4 font-medium">Keyword</th>
                                            <th className="px-6 py-4 font-medium text-center">Quality Score</th>
                                            <th className="px-6 py-4 font-medium text-right">Impressions</th>
                                            <th className="px-6 py-4 font-medium text-right">Clicks</th>
                                            <th className="px-6 py-4 font-medium text-right">CTR</th>
                                            <th className="px-6 py-4 font-medium text-right">Avg. CPC</th>
                                            <th className="px-6 py-4 font-medium text-right">Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                                        {keywords.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">
                                                    No keyword data available for this campaign.
                                                </td>
                                            </tr>
                                        ) : (
                                            keywords.map((keyword, i) => (
                                                <tr key={i} className="hover:bg-zinc-800/30 transition-colors">
                                                    <td className="px-6 py-4 font-medium text-white">{keyword.text}</td>
                                                    <td className="px-6 py-4 text-center">
                                                        {keyword.qualityScore > 0 ? (
                                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${keyword.qualityScore >= 7 ? 'bg-emerald-500/10 text-emerald-500' :
                                                                keyword.qualityScore >= 5 ? 'bg-amber-500/10 text-amber-500' :
                                                                    'bg-red-500/10 text-red-500'
                                                                }`}>
                                                                {keyword.qualityScore}/10
                                                            </span>
                                                        ) : (
                                                            <span className="text-zinc-600">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-right tabular-nums">{keyword.impressions.toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-right tabular-nums">{keyword.clicks.toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-right tabular-nums">{(keyword.ctr * 100).toFixed(2)}%</td>
                                                    <td className="px-6 py-4 text-right tabular-nums">${keyword.averageCpc.toFixed(2)}</td>
                                                    <td className="px-6 py-4 text-right tabular-nums font-medium text-zinc-200">${keyword.cost.toFixed(2)}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    </div>
                )}
            </div>
        </main>
    );
}
