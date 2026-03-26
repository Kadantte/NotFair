'use client';

import { useState, useEffect } from 'react';
import { ArrowDown, ArrowUp, Minus, Activity } from 'lucide-react';

type Change = {
    id: number;
    action: string;
    entityType: string;
    entityId: string;
    beforeValue: string;
    afterValue: string;
    reasoning: string | null;
    timestamp: string;
};

type ImpactData = {
    changes: Change[];
    totalEstimatedSavings: number;
};

function formatAction(action: string): string {
    return action
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(action: string, value: string): string {
    if (action.includes('bid') || action.includes('budget')) {
        const micros = Number(value);
        if (!isNaN(micros) && micros > 0) {
            return `$${(micros / 1_000_000).toFixed(2)}`;
        }
    }
    return value;
}

function DeltaIndicator({ before, after }: { before: string; after: string }) {
    if (before === after) return <Minus className="w-4 h-4 text-zinc-500" />;

    // For status changes
    if (after === 'PAUSED') return <ArrowDown className="w-4 h-4 text-amber-400" />;
    if (after === 'ENABLED') return <ArrowUp className="w-4 h-4 text-green-400" />;

    // For numeric changes
    const beforeNum = Number(before);
    const afterNum = Number(after);
    if (!isNaN(beforeNum) && !isNaN(afterNum)) {
        if (afterNum < beforeNum) return <ArrowDown className="w-4 h-4 text-green-400" />;
        if (afterNum > beforeNum) return <ArrowUp className="w-4 h-4 text-amber-400" />;
    }

    return <Minus className="w-4 h-4 text-zinc-500" />;
}

export default function ImpactPage() {
    const [changes, setChanges] = useState<Change[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // For now, show empty state. Once MCP sessions are active,
        // this will fetch from the tracking API.
        setLoading(false);
    }, []);

    return (
        <div className="pt-24 pb-16 px-4">
            <div className="container mx-auto max-w-5xl">
                <div className="mb-12">
                    <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">Impact Tracker</h1>
                    <p className="text-zinc-400 text-lg">
                        Every change AdsAgent makes is logged here with before/after performance data.
                        See what worked and what didn't.
                    </p>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-700 border-t-blue-400" />
                    </div>
                ) : changes.length === 0 ? (
                    <div className="text-center py-20 border border-zinc-800 rounded-2xl bg-zinc-900/30">
                        <Activity className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-zinc-300 mb-2">No changes yet</h3>
                        <p className="text-zinc-500 max-w-md mx-auto">
                            Connect AdsAgent to your Google Ads account via MCP and start making changes.
                            Every action will appear here with its impact.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-zinc-800">
                                    <th className="pb-3 text-sm font-medium text-zinc-400">Date</th>
                                    <th className="pb-3 text-sm font-medium text-zinc-400">Action</th>
                                    <th className="pb-3 text-sm font-medium text-zinc-400">Target</th>
                                    <th className="pb-3 text-sm font-medium text-zinc-400">Before</th>
                                    <th className="pb-3 text-sm font-medium text-zinc-400" />
                                    <th className="pb-3 text-sm font-medium text-zinc-400">After</th>
                                    <th className="pb-3 text-sm font-medium text-zinc-400">Reasoning</th>
                                </tr>
                            </thead>
                            <tbody>
                                {changes.map((change) => (
                                    <tr key={change.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/30">
                                        <td className="py-4 text-sm text-zinc-400 whitespace-nowrap">
                                            {new Date(change.timestamp).toLocaleDateString()}
                                        </td>
                                        <td className="py-4">
                                            <span className="text-sm font-medium text-white">
                                                {formatAction(change.action)}
                                            </span>
                                        </td>
                                        <td className="py-4 text-sm text-zinc-300 font-mono">
                                            {change.entityId}
                                        </td>
                                        <td className="py-4 text-sm text-zinc-400">
                                            {formatValue(change.action, change.beforeValue)}
                                        </td>
                                        <td className="py-4 px-2">
                                            <DeltaIndicator before={change.beforeValue} after={change.afterValue} />
                                        </td>
                                        <td className="py-4 text-sm text-zinc-300">
                                            {formatValue(change.action, change.afterValue)}
                                        </td>
                                        <td className="py-4 text-sm text-zinc-500 max-w-xs truncate">
                                            {change.reasoning ?? '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="mt-12 p-6 rounded-2xl border border-zinc-800 bg-zinc-900/30">
                    <h3 className="text-sm font-medium text-zinc-400 mb-2">About impact attribution</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                        Impact estimates are correlated, not causal. Google Ads performance is affected by many
                        factors including seasonality, competitor activity, and Google's own algorithm changes.
                        We show what changed after each action — you judge whether it helped.
                    </p>
                </div>
            </div>
        </div>
    );
}
