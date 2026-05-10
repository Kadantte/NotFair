'use client';

import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatTime, formatBytes, errorRateColor, DEV_RANGE_OPTIONS, RangePicker, Picker } from '@/lib/dev-format';
import type { ActivityPayload } from '@/lib/dev-types';

const PLATFORM_OPTIONS = [
    { label: 'All', value: 'all' as const },
    { label: 'Google Ads', value: 'google_ads' as const },
    { label: 'Meta Ads', value: 'meta_ads' as const },
] as const;

const activityCache = new Map<string, ActivityPayload>();

export type ActivityPanelHandle = {
    refresh: () => void;
};

export const ActivityPanel = forwardRef<ActivityPanelHandle, { accountId: string }>(
    function ActivityPanel({ accountId }, ref) {
        const [activityDays, setActivityDays] = useState(30);
        const [activityPlatform, setActivityPlatform] = useState<'all' | 'google_ads' | 'meta_ads'>('all');
        const [activityData, setActivityData] = useState<ActivityPayload | null>(
            activityCache.get(`${accountId}|30|all|0`) ?? null,
        );
        const [activityLoading, setActivityLoading] = useState(!activityData);
        const [expandedCallId, setExpandedCallId] = useState<number | null>(null);

        const fetchActivity = useCallback(async (days: number, platform: 'all' | 'google_ads' | 'meta_ads' = 'all', background = false) => {
            const key = `${accountId}|${days}|${platform}|0`;
            const cached = activityCache.get(key);
            if (cached) {
                setActivityData(cached);
                if (background) return;
            }
            if (!background || !cached) setActivityLoading(true);
            try {
                const params = new URLSearchParams({ days: String(days) });
                if (platform !== 'all') params.set('platform', platform);
                const res = await fetch(`/api/dev/${accountId}/activity?${params}`, { credentials: 'include' });
                if (!res.ok) return;
                const payload: ActivityPayload = await res.json();
                setActivityData(payload);
                activityCache.set(key, payload);
            } catch { /* best-effort */ } finally {
                setActivityLoading(false);
            }
        }, [accountId]);

        useEffect(() => {
            const key = `${accountId}|${activityDays}|${activityPlatform}|0`;
            fetchActivity(activityDays, activityPlatform, !!activityCache.get(key));
        }, [fetchActivity, activityDays, activityPlatform, accountId]);

        useImperativeHandle(ref, () => ({
            refresh() {
                activityCache.delete(`${accountId}|${activityDays}|${activityPlatform}|0`);
                fetchActivity(activityDays, activityPlatform, false);
            },
        }), [accountId, activityDays, activityPlatform, fetchActivity]);

        return (
            <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/60 overflow-hidden">
                <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-3 border-b border-[#3D3C36]">
                    <h2 className="text-sm font-semibold text-[#E8E4DD]">Activity</h2>
                    <div className="flex items-center gap-2">
                        <Picker
                            options={PLATFORM_OPTIONS}
                            value={activityPlatform}
                            onChange={(v) => {
                                setActivityPlatform(v);
                                activityCache.clear();
                                fetchActivity(activityDays, v);
                            }}
                        />
                        <RangePicker
                            options={DEV_RANGE_OPTIONS}
                            value={activityDays}
                            onChange={(v) => {
                                setActivityDays(v);
                                const key = `${accountId}|${v}|${activityPlatform}|0`;
                                fetchActivity(v, activityPlatform, !!activityCache.get(key));
                            }}
                        />
                    </div>
                </div>

                {activityLoading && !activityData ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="w-5 h-5 border-2 border-[#4CAF6E] border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : activityData ? (
                    <>
                        {/* Stat row */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-[#3D3C36] border-b border-[#3D3C36]">
                            {[
                                { label: 'Calls', value: activityData.stats.calls.toLocaleString() },
                                { label: 'Errors', value: activityData.stats.errors.toLocaleString(), color: activityData.stats.errors > 0 ? 'text-[#C45D4A]' : undefined },
                                { label: 'Error Rate', value: `${activityData.stats.errorRate.toFixed(1)}%`, color: activityData.stats.errorRate > 0 ? errorRateColor(activityData.stats.errorRate) : undefined },
                                { label: 'p50 Latency', value: activityData.stats.p50 > 0 ? `${activityData.stats.p50}ms` : '—' },
                            ].map((s) => (
                                <div key={s.label} className="px-4 py-3">
                                    <div className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest">{s.label}</div>
                                    <div className={`text-lg font-mono tabular-nums font-semibold mt-0.5 ${s.color ?? 'text-[#E8E4DD]'}`}>{s.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Recent calls (errors-first) */}
                        {activityData.recentCalls.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-[#5DBE82]">
                                No errors in this range.
                            </div>
                        ) : (
                            <div className="divide-y divide-[#3D3C36]/50 max-h-[480px] overflow-y-auto">
                                {activityData.recentCalls.map((call) => {
                                    const isExpanded = expandedCallId === call.id;
                                    return (
                                        <Fragment key={call.id}>
                                            <div
                                                className={`px-4 py-2.5 cursor-pointer hover:bg-[#2E2D28] transition-colors ${call.errorClass ? 'bg-[#C45D4A]/[0.03]' : ''}`}
                                                onClick={() => setExpandedCallId(isExpanded ? null : call.id)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 text-[13px]">
                                                            <span className="font-mono text-[#E8E4DD] truncate">
                                                                {call.toolName ?? '—'}
                                                            </span>
                                                            <span className={`text-[10px] font-medium uppercase px-1 py-0.5 rounded ${call.opType === 'write' ? 'bg-[#D4882A]/15 text-[#D4882A]' : 'bg-[#4CAF6E]/15 text-[#4CAF6E]'}`}>
                                                                {call.opType}
                                                            </span>
                                                            {call.errorClass && (
                                                                <span className="text-[11px] font-mono text-[#C45D4A] bg-[#C45D4A]/10 px-1.5 py-0.5 rounded">
                                                                    {call.errorClass}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-[11px] text-[#C4C0B6] font-mono mt-0.5">
                                                            {formatTime(call.createdAt)}
                                                            {call.latencyMs != null && <span className="ml-2">{call.latencyMs}ms</span>}
                                                            {call.bytesOut != null && <span className="ml-2">{formatBytes(call.bytesOut)}</span>}
                                                            {call.clientSource && <span className="ml-2 text-[#C4C0B6]/60">{call.clientSource}</span>}
                                                        </div>
                                                    </div>
                                                    {isExpanded
                                                        ? <ChevronDown className="w-3.5 h-3.5 text-[#C4C0B6] shrink-0" />
                                                        : <ChevronRight className="w-3.5 h-3.5 text-[#C4C0B6] shrink-0" />
                                                    }
                                                </div>
                                            </div>
                                            {isExpanded && (
                                                <div className="px-4 py-3 bg-[#1A1917] space-y-2 text-[12px] font-mono">
                                                    {call.errorMessage && (
                                                        <div>
                                                            <div className="text-[10px] uppercase tracking-wide text-[#C45D4A] mb-1">Error</div>
                                                            <pre className="overflow-x-auto rounded bg-[#C45D4A]/10 p-2 text-[11px] text-[#C45D4A] whitespace-pre-wrap">{call.errorMessage}</pre>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div className="text-[10px] uppercase tracking-wide text-[#C4C0B6] mb-1">Args</div>
                                                        <pre className="overflow-x-auto rounded bg-[#24231F] p-2 text-[11px] text-[#E8E4DD] whitespace-pre-wrap">{JSON.stringify(call.args ?? null, null, 2)}</pre>
                                                    </div>
                                                </div>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="px-4 py-8 text-center text-sm text-[#C4C0B6]">No activity data available.</div>
                )}
            </div>
        );
    },
);
