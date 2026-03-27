'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Activity, RotateCcw, AlertCircle, ChevronRight, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { AppSidebar, type SidebarThread } from '@/components/app-sidebar';
import { Button } from '@/components/ui/button';
import { getChangesAction, undoChangeAction } from '@/app/actions';
import { ACTIVE_CHAT_THREAD_KEY, CHAT_HISTORY_KEY } from '@/lib/chat-history';

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

function loadSidebarThreads(): SidebarThread[] {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(t => t && typeof t.id === 'string' && typeof t.title === 'string')
            .map(t => ({
                id: t.id,
                title: t.title,
                updatedAt: t.updatedAt ?? new Date().toISOString(),
                messageCount: Array.isArray(t.messages) ? t.messages.length : 0,
            }))
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch {
        return [];
    }
}

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
    if (before === after) return <Minus className="w-3.5 h-3.5 text-zinc-600" />;
    if (after === 'PAUSED') return <ArrowDown className="w-3.5 h-3.5 text-amber-400" />;
    if (after === 'ENABLED') return <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />;
    const bNum = Number(before);
    const aNum = Number(after);
    if (!isNaN(bNum) && !isNaN(aNum)) {
        if (aNum < bNum) return <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />;
        if (aNum > bNum) return <ArrowUp className="w-3.5 h-3.5 text-amber-400" />;
    }
    return <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />;
}

function entityTypeBadge(type: string) {
    const map: Record<string, string> = {
        keyword: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        campaign: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        unknown: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    };
    return map[type] ?? map.unknown;
}

export default function OperationsPage() {
    const router = useRouter();
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [sidebarThreads, setSidebarThreads] = useState<SidebarThread[]>([]);
    const [changes, setChanges] = useState<Change[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [undoing, setUndoing] = useState<number | null>(null);
    const [undoError, setUndoError] = useState<{ id: number; message: string } | null>(null);

    const fetchChanges = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getChangesAction({ limit: 100 });
            setChanges(data as Change[]);
        } catch (err) {
            console.error(err);
            setError('Failed to load operations. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchChanges();
        setSidebarThreads(loadSidebarThreads());
    }, [fetchChanges]);

    async function handleUndo(changeId: number) {
        setUndoing(changeId);
        setUndoError(null);
        try {
            await undoChangeAction(changeId);
            await fetchChanges();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Undo failed';
            setUndoError({ id: changeId, message: msg });
        } finally {
            setUndoing(null);
        }
    }

    const UNDO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
    const REVERSIBLE = new Set(['pause_keyword', 'enable_keyword', 'update_bid', 'update_budget', 'add_negative_keyword', 'remove_negative_keyword', 'pause_campaign', 'enable_campaign']);

    function canUndo(change: Change): boolean {
        const age = Date.now() - new Date(change.timestamp).getTime();
        return REVERSIBLE.has(change.action) && age < UNDO_WINDOW_MS;
    }

    return (
        <main className="h-full overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-black to-black z-0 pointer-events-none" />

            <div className={`relative z-10 grid h-full w-full overflow-hidden transition-[grid-template-columns] duration-300 ease-out ${isSidebarCollapsed ? 'lg:grid-cols-[72px_minmax(0,1fr)]' : 'lg:grid-cols-[280px_minmax(0,1fr)]'}`}>
                <AppSidebar
                    currentPath="/operations"
                    isCollapsed={isSidebarCollapsed}
                    onToggleCollapsed={() => setIsSidebarCollapsed(c => !c)}
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
                                <h1 className="text-3xl font-bold tracking-tight">Operations</h1>
                                <p className="mt-1 text-sm text-zinc-500">Every change made by the MCP agent — with one-click revert</p>
                            </div>
                            <Button
                                onClick={fetchChanges}
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
                            <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-4 mb-6 flex items-center gap-3 text-red-400">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <p>{error}</p>
                            </div>
                        )}

                        {loading && changes.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                <p className="text-zinc-500 animate-pulse">Loading operations...</p>
                            </div>
                        ) : changes.length === 0 ? (
                            <div className="text-center py-20 border border-zinc-800 rounded-xl bg-zinc-900/30">
                                <Activity className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-zinc-300">No operations yet</h3>
                                <p className="text-zinc-500 max-w-sm mx-auto mt-2">
                                    Connect AdsAgent via MCP and ask it to make changes. Every write operation will appear here.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-zinc-800">
                                            <th className="pb-3 pr-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Time</th>
                                            <th className="pb-3 pr-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Action</th>
                                            <th className="pb-3 pr-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Type</th>
                                            <th className="pb-3 pr-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Entity</th>
                                            <th className="pb-3 pr-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Before</th>
                                            <th className="pb-3 pr-1 text-xs font-medium text-zinc-500 uppercase tracking-wider" />
                                            <th className="pb-3 pr-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">After</th>
                                            <th className="pb-3 pr-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Reasoning</th>
                                            <th className="pb-3 text-xs font-medium text-zinc-500 uppercase tracking-wider" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {changes.map(change => (
                                            <>
                                                <tr key={change.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/30 transition-colors">
                                                    <td className="py-3 pr-4 text-xs text-zinc-500 whitespace-nowrap font-mono">
                                                        {new Date(change.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </td>
                                                    <td className="py-3 pr-4">
                                                        <span className="text-sm font-medium text-zinc-100">{formatAction(change.action)}</span>
                                                    </td>
                                                    <td className="py-3 pr-4">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${entityTypeBadge(change.entityType)}`}>
                                                            {change.entityType}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 pr-4 text-xs text-zinc-400 font-mono max-w-[120px] truncate" title={change.entityId}>
                                                        {change.entityId}
                                                    </td>
                                                    <td className="py-3 pr-4 text-sm text-zinc-400 font-mono">
                                                        {formatValue(change.action, change.beforeValue)}
                                                    </td>
                                                    <td className="py-3 pr-2">
                                                        <DeltaBadge before={change.beforeValue} after={change.afterValue} />
                                                    </td>
                                                    <td className="py-3 pr-4 text-sm font-mono text-zinc-200">
                                                        {formatValue(change.action, change.afterValue)}
                                                    </td>
                                                    <td className="py-3 pr-4 text-xs text-zinc-500 max-w-[200px] truncate" title={change.reasoning ?? ''}>
                                                        {change.reasoning ?? <span className="text-zinc-700">—</span>}
                                                    </td>
                                                    <td className="py-3">
                                                        {change.rolledBack ? (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium bg-zinc-800/50 text-zinc-500 border-zinc-700">
                                                                Reverted
                                                            </span>
                                                        ) : canUndo(change) ? (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={undoing === change.id}
                                                                onClick={() => handleUndo(change.id)}
                                                                className="h-7 px-2 border-zinc-700 bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 gap-1.5 text-xs"
                                                            >
                                                                <RotateCcw className={`w-3 h-3 ${undoing === change.id ? 'animate-spin' : ''}`} />
                                                                {undoing === change.id ? 'Reverting…' : 'Revert'}
                                                            </Button>
                                                        ) : (
                                                            <span className="text-xs text-zinc-700">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                                {undoError?.id === change.id && (
                                                    <tr key={`${change.id}-error`} className="border-b border-zinc-800/50">
                                                        <td colSpan={9} className="py-2 px-0">
                                                            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/20 border border-red-900/30 rounded px-3 py-2">
                                                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                                {undoError.message}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {changes.length > 0 && (
                            <p className="mt-6 text-xs text-zinc-600">
                                Revert is available within 7 days for write operations. Reverted changes are logged as new entries for full audit trail.
                            </p>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}
