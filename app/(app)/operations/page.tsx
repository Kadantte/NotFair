'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { RefreshCw, Activity, RotateCcw, AlertCircle, ChevronRight, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getChangesAction, undoChangeAction } from '@/app/actions';

type Change = {
    id: number;
    action: string;
    entityType: string;
    entityId: string;
    beforeValue: string;
    afterValue: string;
    reasoning: string | null;
    rolledBack: boolean;
    timestamp: Date;
};

const PAGE_SIZE = 25;

function formatAction(action: string): string {
    return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatValue(action: string, value: string): string {
    if (action.includes('bid') || action.includes('budget')) {
        const micros = Number(value);
        if (!isNaN(micros) && micros > 0) return `$${(micros / 1_000_000).toFixed(2)}`;
    }
    return value;
}

function DeltaBadge({ before, after }: { before: string; after: string }) {
    if (before === after) return <Minus className="w-3.5 h-3.5 text-[#9B9689]/40" />;
    if (after === 'PAUSED') return <ArrowDown className="w-3.5 h-3.5 text-[#D4882A]" />;
    if (after === 'ENABLED') return <ArrowUp className="w-3.5 h-3.5 text-[#4CAF6E]" />;
    const bNum = Number(before);
    const aNum = Number(after);
    if (!isNaN(bNum) && !isNaN(aNum)) {
        if (aNum < bNum) return <ArrowDown className="w-3.5 h-3.5 text-[#4CAF6E]" />;
        if (aNum > bNum) return <ArrowUp className="w-3.5 h-3.5 text-[#D4882A]" />;
    }
    return <ChevronRight className="w-3.5 h-3.5 text-[#9B9689]/40" />;
}

function entityTypeBadge(type: string) {
    const map: Record<string, string> = {
        keyword: 'bg-[#4CAF6E]/10 text-[#4CAF6E] border-[#4CAF6E]/20',
        campaign: 'bg-[#D4882A]/10 text-[#D4882A] border-[#D4882A]/20',
        unknown: 'bg-[#9B9689]/10 text-[#9B9689] border-[#9B9689]/20',
    };
    return map[type] ?? map.unknown;
}

const UNDO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const REVERSIBLE = new Set(['pause_keyword', 'enable_keyword', 'update_bid', 'update_budget', 'add_negative_keyword', 'remove_negative_keyword', 'pause_campaign', 'enable_campaign', 'create_campaign', 'add_keyword']);

export default function OperationsPage() {
    const [changes, setChanges] = useState<Change[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [undoing, setUndoing] = useState<number | null>(null);
    const [undoError, setUndoError] = useState<{ id: number; message: string } | null>(null);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const fetchChanges = useCallback(async (p: number) => {
        setLoading(true);
        setError(null);
        try {
            const data = await getChangesAction({ limit: PAGE_SIZE, offset: p * PAGE_SIZE });
            setChanges(data.items as Change[]);
            setTotal(data.total);
        } catch (err) {
            console.error(err);
            setError('Failed to load operations. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchChanges(page); }, [fetchChanges, page]);

    async function handleUndo(changeId: number) {
        setUndoing(changeId);
        setUndoError(null);
        try {
            await undoChangeAction(changeId);
            await fetchChanges(page);
        } catch (err) {
            setUndoError({ id: changeId, message: err instanceof Error ? err.message : 'Undo failed' });
        } finally {
            setUndoing(null);
        }
    }

    function canUndo(change: Change): boolean {
        return REVERSIBLE.has(change.action) && (Date.now() - new Date(change.timestamp).getTime()) < UNDO_WINDOW_MS;
    }

    return (
        <section className="flex min-h-0 h-full flex-col overflow-hidden">
            <header className="shrink-0 border-b border-[#3D3C36] bg-[#24231F]/80 backdrop-blur-xl">
                <div className="flex w-full items-center justify-between gap-4 px-6 py-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-[#E8E4DD]">Operations</h1>
                        <p className="mt-0.5 text-sm text-[#9B9689]">Every change made by the MCP agent — with one-click revert</p>
                    </div>
                    <Button
                        onClick={() => fetchChanges(page)}
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

                {loading && changes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-8 h-8 border-2 border-[#4CAF6E] border-t-transparent rounded-full animate-spin" />
                        <p className="text-[#9B9689] animate-pulse text-sm">Loading operations...</p>
                    </div>
                ) : changes.length === 0 ? (
                    <div className="text-center py-20 border border-[#3D3C36] rounded-xl bg-[#24231F]/40">
                        <Activity className="w-10 h-10 text-[#9B9689]/20 mx-auto mb-4" />
                        <h3 className="text-base font-medium text-[#E8E4DD]/60">No operations yet</h3>
                        <p className="text-[#9B9689] max-w-sm mx-auto mt-2 text-sm">
                            Connect AdsAgent via MCP and ask it to make changes. Every write operation will appear here.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[#3D3C36]">
                                    {['Time', 'Action', 'Type', 'Entity', 'Before', '', 'After', 'Reasoning', ''].map((h, i) => (
                                        <th key={i} className="pb-3 pr-4 text-[10px] font-semibold text-[#9B9689] uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {changes.map(change => (
                                    <Fragment key={change.id}>
                                        <tr className="border-b border-[#3D3C36]/50 hover:bg-[#24231F]/60 transition-colors">
                                            <td className="py-3 pr-4 text-xs text-[#9B9689] whitespace-nowrap font-mono">
                                                {new Date(change.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="py-3 pr-4">
                                                <span className="text-sm font-medium text-[#E8E4DD]">{formatAction(change.action)}</span>
                                            </td>
                                            <td className="py-3 pr-4">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${entityTypeBadge(change.entityType)}`}>
                                                    {change.entityType}
                                                </span>
                                            </td>
                                            <td className="py-3 pr-4 text-xs text-[#9B9689] font-mono max-w-[120px] truncate" title={change.entityId}>
                                                {change.entityId}
                                            </td>
                                            <td className="py-3 pr-4 text-sm text-[#9B9689] font-mono tabular-nums">
                                                {formatValue(change.action, change.beforeValue)}
                                            </td>
                                            <td className="py-3 pr-2">
                                                <DeltaBadge before={change.beforeValue} after={change.afterValue} />
                                            </td>
                                            <td className="py-3 pr-4 text-sm font-mono text-[#E8E4DD] tabular-nums">
                                                {formatValue(change.action, change.afterValue)}
                                            </td>
                                            <td className="py-3 pr-4 text-xs text-[#9B9689] max-w-[200px] truncate" title={change.reasoning ?? ''}>
                                                {change.reasoning ?? <span className="text-[#9B9689]/30">—</span>}
                                            </td>
                                            <td className="py-3">
                                                {change.rolledBack ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium bg-[#9B9689]/10 text-[#9B9689] border-[#9B9689]/20">
                                                        Reverted
                                                    </span>
                                                ) : canUndo(change) ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={undoing === change.id}
                                                        onClick={() => handleUndo(change.id)}
                                                        className="h-7 px-2 border-[#3D3C36] bg-transparent hover:bg-[#2E2D28] text-[#9B9689] hover:text-[#E8E4DD] gap-1.5 text-xs"
                                                    >
                                                        <RotateCcw className={`w-3 h-3 ${undoing === change.id ? 'animate-spin' : ''}`} />
                                                        {undoing === change.id ? 'Reverting…' : 'Revert'}
                                                    </Button>
                                                ) : (
                                                    <span className="text-xs text-[#9B9689]/30">—</span>
                                                )}
                                            </td>
                                        </tr>
                                        {undoError?.id === change.id && (
                                            <tr className="border-b border-[#3D3C36]/50">
                                                <td colSpan={9} className="py-2 px-0">
                                                    <div className="flex items-center gap-2 text-xs text-[#C45D4A] bg-[#C45D4A]/10 border border-[#C45D4A]/20 rounded px-3 py-2">
                                                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                        {undoError.message}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {total > 0 && (
                    <div className="mt-6 flex items-center justify-between">
                        <p className="text-xs text-[#9B9689]/40">
                            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} operations.
                            Revert available within 7 days.
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={page === 0 || loading}
                                onClick={() => setPage(p => p - 1)}
                                className="h-7 px-3 border-[#3D3C36] bg-transparent hover:bg-[#2E2D28] text-[#9B9689] hover:text-[#E8E4DD] text-xs disabled:opacity-30"
                            >
                                Previous
                            </Button>
                            <span className="text-xs text-[#9B9689] tabular-nums font-mono">
                                {page + 1} / {totalPages}
                            </span>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={page >= totalPages - 1 || loading}
                                onClick={() => setPage(p => p + 1)}
                                className="h-7 px-3 border-[#3D3C36] bg-transparent hover:bg-[#2E2D28] text-[#9B9689] hover:text-[#E8E4DD] text-xs disabled:opacity-30"
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
