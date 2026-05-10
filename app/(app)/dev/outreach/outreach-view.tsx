'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    RefreshCw, AlertCircle, Loader2, X, Upload, Users, Send,
    ChevronDown, ChevronRight, Filter, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    getContactsAction,
    importContactsAction,
    deleteContactAction,
    sendOutreachAction,
    scheduleContactAction,
} from '@/app/(app)/outreach/actions';
import { deriveMetrics, STATUS_CONFIG, BOUNCE_RATE_WARN } from '@/lib/outreach-metrics';
import type { Contact } from '../_components/dev-types';

// Module-level stale-while-revalidate cache.
let cachedContacts: Contact[] | null = null;

type Props = { initialContacts?: Contact[] };

export function OutreachView({ initialContacts }: Props) {
    // Seed from server prefetch if available and cache is empty.
    if (initialContacts && !cachedContacts) {
        cachedContacts = initialContacts;
    }
    const [contacts, setContacts] = useState<Contact[]>(cachedContacts ?? []);
    const [loadingContacts, setLoadingContacts] = useState(!cachedContacts);
    const [error, setError] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [deletingContactId, setDeletingContactId] = useState<number | null>(null);
    const [sendingId, setSendingId] = useState<number | null>(null);
    const [schedulingId, setSchedulingId] = useState<number | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');

    const fetchContacts = useCallback(async (background = false) => {
        if (!background) setLoadingContacts(true);
        try {
            const data = await getContactsAction();
            setContacts(data);
            cachedContacts = data;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load contacts');
        } finally {
            setLoadingContacts(false);
        }
    }, []);

    useEffect(() => {
        fetchContacts(!!cachedContacts);
    }, [fetchContacts]);

    const metrics = useMemo(() => contacts.length > 0 ? deriveMetrics(contacts) : null, [contacts]);
    const filteredContacts = useMemo(() => statusFilter === 'all' ? contacts : contacts.filter((c) => c.status === statusFilter), [contacts, statusFilter]);

    async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);
        const text = await file.text();
        const lines = text.split('\n').filter((l) => l.trim());
        if (lines.length < 2) { setImporting(false); return; }
        const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const emailIdx = header.findIndex((h) => ['email', 'e-mail', 'email_address'].includes(h));
        const companyIdx = header.findIndex((h) => ['company', 'organization', 'company_name'].includes(h));
        if (emailIdx === -1) { setImporting(false); return; }
        const rows = lines.slice(1).map((line) => {
            const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
            return { email: cols[emailIdx] || '', company: companyIdx >= 0 ? cols[companyIdx] : undefined };
        }).filter((r) => r.email && r.email.includes('@'));
        await importContactsAction(rows);
        await fetchContacts(true);
        setImporting(false);
        e.target.value = '';
    }

    async function handleDeleteContact(id: number) {
        setDeletingContactId(id);
        await deleteContactAction(id);
        await fetchContacts(true);
        setDeletingContactId(null);
    }

    async function handleSend(id: number) {
        setSendingId(id);
        setSendError(null);
        try {
            await sendOutreachAction(id);
            await fetchContacts(true);
        } catch (err) {
            setSendError(err instanceof Error ? err.message : 'Send failed');
        } finally {
            setSendingId(null);
        }
    }

    async function handleSchedule(id: number) {
        setSchedulingId(id);
        setSendError(null);
        try {
            const ptOffsetMs = 7 * 60 * 60 * 1000;
            const nowPT = new Date(Date.now() - ptOffsetMs);
            const next = new Date(nowPT);
            const startHour = next.getDay() === 1 ? 12 : 9;
            next.setHours(startHour, 0, 0, 0);
            if (next <= nowPT) {
                next.setDate(next.getDate() + 1);
                next.setHours(next.getDay() === 1 ? 12 : 9, 0, 0, 0);
            }
            while (next.getDay() === 0 || next.getDay() === 6) {
                next.setDate(next.getDate() + 1);
                next.setHours(next.getDay() === 1 ? 12 : 9, 0, 0, 0);
            }
            await scheduleContactAction(id, new Date(next.getTime() + ptOffsetMs));
            await fetchContacts(true);
        } catch (err) {
            setSendError(err instanceof Error ? err.message : 'Schedule failed');
        } finally {
            setSchedulingId(null);
        }
    }

    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-6 space-y-5 sm:space-y-8">
            <div className="flex items-center justify-end">
                <Button
                    onClick={() => {
                        cachedContacts = null;
                        fetchContacts(false);
                    }}
                    disabled={loadingContacts}
                    variant="outline"
                    size="sm"
                    className="h-8 border-[#3D3C36] bg-[#24231F] hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD] gap-1.5 sm:h-9"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingContacts ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Refresh</span>
                </Button>
            </div>

            {error && (
                <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-lg p-3 sm:p-4 flex items-center gap-3 text-[#C45D4A]">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {metrics && metrics.sent > 0 && (
                <div>
                    <h2 className="text-base sm:text-lg font-semibold text-[#E8E4DD] mb-3 sm:mb-4">Outreach</h2>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
                        {[
                            { label: 'Total Leads', value: metrics.total, color: 'text-[#E8E4DD]' },
                            { label: 'Sent', value: metrics.sent, color: 'text-[#E8E4DD]' },
                            { label: 'Bounce Rate', value: `${(metrics.bounceRate * 100).toFixed(1)}%`, color: metrics.bounceRate > BOUNCE_RATE_WARN ? 'text-[#C45D4A]' : 'text-[#4CAF6E]' },
                            { label: 'Reply Rate', value: `${(metrics.replyRate * 100).toFixed(1)}%`, color: metrics.replyRate > 0 ? 'text-[#4CAF6E]' : 'text-[#C4C0B6]' },
                        ].map((card) => (
                            <div key={card.label} className="border border-[#3D3C36] rounded-lg bg-[#24231F]/40 p-3 sm:p-4">
                                <div className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest mb-1">{card.label}</div>
                                <div className={`text-xl sm:text-2xl font-mono tabular-nums font-semibold ${card.color}`}>{card.value}</div>
                            </div>
                        ))}
                    </div>

                    {metrics.domainBreakdown.length > 0 && (
                        <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
                            <div className="px-4 py-3 border-b border-[#3D3C36]">
                                <span className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest">Bounce Rate by Domain</span>
                            </div>
                            <div className="divide-y divide-[#3D3C36]/50">
                                {metrics.domainBreakdown.map((d) => (
                                    <div key={d.domain} className="flex items-center gap-3 px-4 py-2">
                                        <span className="text-[13px] font-mono text-[#E8E4DD] min-w-0 truncate flex-1">{d.domain}</span>
                                        <span className="text-[12px] font-mono tabular-nums text-[#C4C0B6] shrink-0">{d.total} sent</span>
                                        <span className="text-[12px] font-mono tabular-nums text-[#C45D4A] shrink-0">{d.bounced} bounced</span>
                                        <span className={`text-[12px] font-mono tabular-nums shrink-0 w-14 text-right font-medium ${d.bounceRate > BOUNCE_RATE_WARN ? 'text-[#C45D4A]' : 'text-[#4CAF6E]'}`}>
                                            {(d.bounceRate * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div>
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div className="flex items-center gap-3">
                        <h2 className="text-base sm:text-lg font-semibold text-[#E8E4DD]">Leads</h2>
                        {!loadingContacts && (
                            <span className="font-mono text-xs text-[#C4C0B6]">
                                {statusFilter === 'all' ? contacts.length : `${filteredContacts.length}/${contacts.length}`}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#C4C0B6] pointer-events-none" />
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="appearance-none pl-7 pr-6 py-1.5 text-[12px] rounded-md border border-[#3D3C36] bg-[#24231F] text-[#E8E4DD] hover:bg-[#2E2D28] focus:outline-none focus:ring-1 focus:ring-[#4CAF6E]/50 cursor-pointer"
                            >
                                <option value="all">All statuses</option>
                                {STATUS_CONFIG.map((s) => (
                                    <option key={s.key} value={s.key}>{s.label}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#C4C0B6] pointer-events-none" />
                        </div>
                        <label>
                            <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
                            <Button variant="outline" size="sm" disabled={importing} className="gap-1.5 border-[#3D3C36] bg-[#24231F] hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD]" asChild>
                                <span>
                                    {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                    <span className="hidden sm:inline">Import CSV</span>
                                </span>
                            </Button>
                        </label>
                    </div>
                </div>

                {loadingContacts ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-5 w-5 animate-spin text-[#C4C0B6]" />
                    </div>
                ) : filteredContacts.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#3D3C36] bg-[#24231F]/40 p-10 text-center">
                        <Users className="mx-auto mb-3 h-8 w-8 text-[#C4C0B6]/30" />
                        <p className="text-sm text-[#C4C0B6]">{contacts.length === 0 ? 'No leads yet. Import a CSV or add via script.' : 'No leads match this filter.'}</p>
                    </div>
                ) : (
                    <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
                        {sendError && (
                            <div className="bg-[#C45D4A]/10 border-b border-[#C45D4A]/30 px-4 py-2.5 flex items-center gap-2 text-[13px] text-[#C45D4A]">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                {sendError}
                                <button onClick={() => setSendError(null)} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
                            </div>
                        )}
                        <div className="max-h-[32rem] overflow-y-auto divide-y divide-[#3D3C36]/50">
                            {filteredContacts.map((c) => {
                                const sc = STATUS_CONFIG.find((s) => s.key === c.status);
                                const badgeStyle = sc
                                    ? { backgroundColor: `${sc.color}26`, color: sc.color }
                                    : { backgroundColor: '#C4C0B626', color: '#C4C0B6' };
                                const hasDraft = !!c.draftSubject;
                                return (
                                    <Link
                                        key={c.id}
                                        href={`/dev/contacts/${c.id}`}
                                        prefetch
                                        className="group flex items-center gap-2 px-4 py-2.5 hover:bg-[#24231F]/60 transition-colors cursor-pointer"
                                    >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate text-[13px] text-[#E8E4DD] font-mono">{c.email}</span>
                                                    <span className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider" style={badgeStyle}>
                                                        {c.status}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[12px] text-[#C4C0B6]">{c.company || '—'}</span>
                                                    {hasDraft && c.status === 'drafted' && <span className="text-[11px] text-[#C4C0B6]/60">· draft ready</span>}
                                                    {c.status === 'scheduled' && c.scheduledAt && <span className="text-[11px] text-[#C084FC]/60">· sends {new Date(c.scheduledAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {hasDraft && c.status === 'drafted' && (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            disabled={schedulingId === c.id || sendingId === c.id}
                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSchedule(c.id); }}
                                                            className="gap-1.5 bg-[#C084FC]/20 text-[#C084FC] hover:bg-[#C084FC]/30 border border-[#C084FC]/40 h-7 text-[12px] px-2.5"
                                                        >
                                                            {schedulingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}
                                                            Schedule
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            disabled={sendingId === c.id || schedulingId === c.id}
                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSend(c.id); }}
                                                            className="gap-1.5 bg-[#4CAF6E] text-[#E8E4DD] hover:bg-[#3D9A5C] h-7 text-[12px] px-2.5"
                                                        >
                                                            {sendingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                                            Send
                                                        </Button>
                                                    </>
                                                )}
                                                {hasDraft && c.status === 'scheduled' && (
                                                    <Button
                                                        size="sm"
                                                        disabled={sendingId === c.id}
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSend(c.id); }}
                                                        className="gap-1.5 bg-[#24231F] text-[#C4C0B6] hover:text-[#E8E4DD] border border-[#3D3C36] h-7 text-[12px] px-2.5"
                                                    >
                                                        {sendingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                                        Send now
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    disabled={deletingContactId === c.id}
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteContact(c.id); }}
                                                    className="text-[#C4C0B6] opacity-0 group-hover:opacity-100 hover:text-[#C45D4A] transition-opacity"
                                                >
                                                    {deletingContactId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                                                </Button>
                                                <ChevronRight className="w-4 h-4 text-[#C4C0B6]" />
                                            </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
