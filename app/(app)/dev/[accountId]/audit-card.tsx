'use client';

import { useState } from 'react';
import type { AuditSnapshot } from './types';

const CATEGORY_COLORS: Record<string, string> = {
    Critical: 'text-[#C45D4A]',
    'Needs Work': 'text-[#D4882A]',
    OK: 'text-[#C4C0B6]',
    Strong: 'text-[#4CAF6E]',
    Excellent: 'text-[#4CAF6E]',
};

function scoreColor(score: number) {
    if (score >= 80) return 'text-[#4CAF6E]';
    if (score >= 60) return 'text-[#C4C0B6]';
    if (score >= 40) return 'text-[#D4882A]';
    return 'text-[#C45D4A]';
}

export function LatestAuditCard({ audit }: { audit: AuditSnapshot }) {
    const created = new Date(audit.createdAt);
    return (
        <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/60 overflow-hidden">
            <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-[#3D3C36]/60 flex items-center gap-4 flex-wrap">
                <div className="flex items-baseline gap-2">
                    <span className={`text-3xl sm:text-4xl font-semibold font-mono tabular-nums ${scoreColor(audit.overallScore)}`}>
                        {audit.overallScore}
                    </span>
                    <span className="text-[10px] text-[#C4C0B6] uppercase tracking-widest">/ 100</span>
                </div>
                <span className={`text-sm font-medium ${CATEGORY_COLORS[audit.category] ?? 'text-[#C4C0B6]'}`}>
                    {audit.category}
                </span>
                <div className="ml-auto flex items-center gap-3 sm:gap-4 text-xs text-[#C4C0B6] flex-wrap">
                    <span>${audit.totalSpend.toFixed(0)} spend</span>
                    {audit.cpa !== null && <span>CPA ${audit.cpa.toFixed(2)}</span>}
                    {audit.demandCaptured !== null && <span>{audit.demandCaptured.toFixed(0)}% demand</span>}
                    <span>{audit.campaignCount} campaign{audit.campaignCount === 1 ? '' : 's'}</span>
                    <span className="font-mono tabular-nums text-[#C4C0B6]/70">
                        {created.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                </div>
            </div>
            {audit.topActions.length > 0 && (
                <div className="px-4 py-3 sm:px-5 sm:py-4 space-y-2">
                    <div className="text-[10px] text-[#C4C0B6] uppercase tracking-widest mb-1">Top actions</div>
                    {audit.topActions.map((item, i) => (
                        <div key={i} className="flex items-start gap-2 text-[13px]">
                            <span className="text-[#D4882A] shrink-0 mt-0.5">&#8226;</span>
                            <div className="min-w-0">
                                <span className="text-[#E8E4DD]">{item.action}</span>
                                {item.impact && (
                                    <span className="text-[#C4C0B6] ml-1.5">— {item.impact}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function AuditRow({ audit }: { audit: AuditSnapshot }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="border border-[#3D3C36] rounded-lg bg-[#24231F]/40">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full p-3 flex items-center gap-3 text-left hover:bg-[#E8E4DD]/5 transition-colors rounded-lg"
            >
                {/* Score */}
                <span className={`text-lg font-semibold font-mono tabular-nums w-10 shrink-0 ${scoreColor(audit.overallScore)}`}>
                    {audit.overallScore}
                </span>
                {/* Category badge */}
                <span className={`text-xs font-medium ${CATEGORY_COLORS[audit.category] ?? 'text-[#C4C0B6]'}`}>
                    {audit.category}
                </span>
                {/* Key metrics */}
                <span className="hidden sm:flex items-center gap-3 text-xs text-[#C4C0B6] ml-auto mr-2">
                    <span>Waste: {audit.wasteRate.toFixed(0)}%</span>
                    {audit.cpa !== null && <span>CPA: ${audit.cpa.toFixed(2)}</span>}
                    <span>${audit.totalSpend.toFixed(0)} spend</span>
                    <span>{audit.campaignCount} campaigns</span>
                </span>
                {/* Date */}
                <span className="text-[10px] text-[#C4C0B6] font-mono tabular-nums whitespace-nowrap shrink-0 ml-auto sm:ml-0">
                    {new Date(audit.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {' '}
                    {new Date(audit.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </span>
                {/* Expand indicator */}
                <span className={`text-[#C4C0B6] text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>
                    &#9654;
                </span>
            </button>
            {expanded && audit.topActions.length > 0 && (
                <div className="px-3 pb-3 pt-0 border-t border-[#3D3C36]">
                    <div className="pt-2 space-y-1.5">
                        {audit.topActions.map((item, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                                <span className="text-[#D4882A] shrink-0 mt-0.5">&#8226;</span>
                                <div>
                                    <span className="text-[#E8E4DD]">{item.action}</span>
                                    {item.impact && (
                                        <span className="text-[#C4C0B6] ml-1.5">— {item.impact}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
