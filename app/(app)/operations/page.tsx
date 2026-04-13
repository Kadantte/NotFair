'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Activity, RotateCcw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeltaBadge } from '@/components/delta-badge';
import { formatAction, formatValue, ENTITY_BADGE_COLORS } from '@/lib/operations-format';
import { getChangesAction, undoChangeAction } from '@/app/actions';

type Change = {
    id: number;
    action: string;
    entityType: string;
    entityId: string;
    label: string | null;
    beforeValue: string;
    afterValue: string;
    reasoning: string | null;
    rolledBack: boolean;
    timestamp: Date;
};

const PAGE_SIZE = 25;

function ExpandableCell({ text, className }: { text: string; className?: string }) {
    const [expanded, setExpanded] = useState(false);
    const [clamped, setClamped] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (el) setClamped(el.scrollHeight > el.clientHeight + 1);
    }, [text]);

    return (
        <div className={`max-w-[200px] ${className ?? ''}`}>
            <div
                ref={ref}
                className={expanded ? '' : 'line-clamp-2'}
                style={{ overflowWrap: 'break-word', wordBreak: 'break-all' }}
            >
                {text}
            </div>
            {clamped && (
                <button
                    type="button"
                    onClick={() => setExpanded(e => !e)}
                    className="text-[11px] text-[#4CAF6E] hover:text-[#5BC07F] mt-0.5"
                >
                    {expanded ? 'less' : '...more'}
                </button>
            )}
        </div>
    );
}

const UNDO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const REVERSIBLE = new Set(['pause_keyword', 'enable_keyword', 'update_bid', 'update_budget', 'add_negative_keyword', 'remove_negative_keyword', 'pause_campaign', 'enable_campaign', 'create_campaign', 'add_keyword', 'set_tracking_template']);

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
                <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#E8E4DD]">Operations</h1>
                        <p className="mt-0.5 text-xs sm:text-sm text-[#C4C0B6] hidden sm:block">Every change made by the MCP agent — with one-click revert</p>
                    </div>
                    <Button
                        onClick={() => fetchChanges(page)}
                        disabled={loading}
                        variant="outline"
                        size="sm"
                        className="border-[#3D3C36] bg-[#24231F] hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD] gap-1.5 shrink-0"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">Refresh</span>
                    </Button>
                </div>
            </header>

            <div className="shrink-0 px-0">
                {error && (
                    <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6 flex items-center gap-3 text-[#C45D4A]">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="text-sm">{error}</p>
                    </div>
                )}
            </div>

            {loading && changes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-8 h-8 border-2 border-[#4CAF6E] border-t-transparent rounded-full animate-spin" />
                    <p className="text-[#C4C0B6] animate-pulse text-sm">Loading operations...</p>
                </div>
            ) : changes.length === 0 ? (
                <div className="mx-4 sm:mx-6 text-center py-20 border border-[#3D3C36] rounded-xl bg-[#24231F]/40">
                    <Activity className="w-10 h-10 text-[#C4C0B6]/20 mx-auto mb-4" />
                    <h3 className="text-base font-medium text-[#E8E4DD]/60">No operations yet</h3>
                    <p className="text-[#C4C0B6] max-w-sm mx-auto mt-2 text-sm">
                        Connect AdsAgent via MCP and ask it to make changes. Every write operation will appear here.
                    </p>
                </div>
            ) : (
                <>
                    {/* Mobile: card layout */}
                    <div className="md:hidden min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-2">
                        {changes.map(change => (
                            <Fragment key={change.id}>
                                <div className="border border-[#3D3C36] rounded-lg bg-[#24231F]/40 p-3">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="text-sm font-medium text-[#E8E4DD]">{formatAction(change.action)}</span>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-medium ${ENTITY_BADGE_COLORS[change.entityType] ?? ENTITY_BADGE_COLORS.unknown}`}>
                                            {change.entityType}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs font-mono mb-2">
                                        <span className="text-[#C4C0B6] tabular-nums">{formatValue(change.action, change.beforeValue)}</span>
                                        <DeltaBadge before={change.beforeValue} after={change.afterValue} />
                                        <span className="text-[#E8E4DD] tabular-nums">{formatValue(change.action, change.afterValue)}</span>
                                    </div>
                                    {change.reasoning && (
                                        <p className="text-xs text-[#C4C0B6] mb-2 line-clamp-2">{change.reasoning}</p>
                                    )}
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-[#C4C0B6] font-mono tabular-nums">
                                            {new Date(change.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        {change.rolledBack ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-medium bg-[#C4C0B6]/10 text-[#C4C0B6] border-[#C4C0B6]/20">
                                                Reverted
                                            </span>
                                        ) : canUndo(change) ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={undoing === change.id}
                                                onClick={() => handleUndo(change.id)}
                                                className="h-6 px-2 border-[#3D3C36] bg-transparent hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD] gap-1 text-[10px]"
                                            >
                                                <RotateCcw className={`w-2.5 h-2.5 ${undoing === change.id ? 'animate-spin' : ''}`} />
                                                {undoing === change.id ? 'Reverting…' : 'Revert'}
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>
                                {undoError?.id === change.id && (
                                    <div className="flex items-center gap-2 text-xs text-[#C45D4A] bg-[#C45D4A]/10 border border-[#C45D4A]/20 rounded px-3 py-2">
                                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                        {undoError.message}
                                    </div>
                                )}
                            </Fragment>
                        ))}
                    </div>

                    {/* Desktop: table layout with sticky header */}
                    <div className="hidden md:flex min-h-0 flex-1 flex-col overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 z-10 bg-[#1A1917]">
                                <tr className="border-b border-[#3D3C36]">
                                    {['Time', 'Action', 'Type', 'Entity', 'Before', '', 'After', 'Reasoning', ''].map((h, i) => (
                                        <th key={i} className={`py-3 pr-4 text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest${i === 0 ? ' pl-4' : ''}`}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                    {changes.map(change => (
                                        <Fragment key={change.id}>
                                            <tr className="border-b border-[#3D3C36]/50 hover:bg-[#24231F]/60 transition-colors">
                                                <td className="py-3 pr-4 pl-4 text-xs text-[#C4C0B6] whitespace-nowrap font-mono">
                                                    {new Date(change.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="py-3 pr-4">
                                                    <span className="text-sm font-medium text-[#E8E4DD]">{formatAction(change.action)}</span>
                                                </td>
                                                <td className="py-3 pr-4">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${ENTITY_BADGE_COLORS[change.entityType] ?? ENTITY_BADGE_COLORS.unknown}`}>
                                                        {change.entityType}
                                                    </span>
                                                </td>
                                                <td className="py-3 pr-4 text-xs max-w-[160px] truncate" title={change.label ? `${change.label} (${change.entityId})` : change.entityId}>
                                                    {change.label ? (
                                                        <span className="text-[#E8E4DD]">{change.label}</span>
                                                    ) : (
                                                        <span className="text-[#C4C0B6] font-mono">{change.entityId}</span>
                                                    )}
                                                </td>
                                                <td className="py-3 pr-4 align-top">
                                                    <ExpandableCell
                                                        text={formatValue(change.action, change.beforeValue)}
                                                        className="text-sm text-[#C4C0B6] font-mono tabular-nums"
                                                    />
                                                </td>
                                                <td className="py-3 pr-2 align-top">
                                                    <DeltaBadge before={change.beforeValue} after={change.afterValue} />
                                                </td>
                                                <td className="py-3 pr-4 align-top">
                                                    <ExpandableCell
                                                        text={formatValue(change.action, change.afterValue)}
                                                        className="text-sm font-mono text-[#E8E4DD] tabular-nums"
                                                    />
                                                </td>
                                                <td className="py-3 pr-4 text-xs text-[#C4C0B6] max-w-[200px] truncate" title={change.reasoning ?? ''}>
                                                    {change.reasoning ?? <span className="text-[#C4C0B6]/30">—</span>}
                                                </td>
                                                <td className="py-3">
                                                    {change.rolledBack ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium bg-[#C4C0B6]/10 text-[#C4C0B6] border-[#C4C0B6]/20">
                                                            Reverted
                                                        </span>
                                                    ) : canUndo(change) ? (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={undoing === change.id}
                                                            onClick={() => handleUndo(change.id)}
                                                            className="h-7 px-2 border-[#3D3C36] bg-transparent hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD] gap-1.5 text-xs"
                                                        >
                                                            <RotateCcw className={`w-3 h-3 ${undoing === change.id ? 'animate-spin' : ''}`} />
                                                            {undoing === change.id ? 'Reverting…' : 'Revert'}
                                                        </Button>
                                                    ) : (
                                                        <span className="text-xs text-[#C4C0B6]/30">—</span>
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
                    </>
                )}

                {total > 0 && (
                    <div className="shrink-0 px-4 py-3 sm:py-4 border-t border-[#3D3C36] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <p className="text-[10px] sm:text-xs text-[#C4C0B6]/40">
                            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}.
                            <span className="hidden sm:inline"> Revert available within 7 days.</span>
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={page === 0 || loading}
                                onClick={() => setPage(p => p - 1)}
                                className="h-7 px-3 border-[#3D3C36] bg-transparent hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD] text-xs disabled:opacity-30"
                            >
                                Previous
                            </Button>
                            <span className="text-xs text-[#C4C0B6] tabular-nums font-mono">
                                {page + 1} / {totalPages}
                            </span>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={page >= totalPages - 1 || loading}
                                onClick={() => setPage(p => p + 1)}
                                className="h-7 px-3 border-[#3D3C36] bg-transparent hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD] text-xs disabled:opacity-30"
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                )}
        </section>
    );
}
