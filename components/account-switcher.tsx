'use client';

import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Plus } from 'lucide-react';

function GoogleAdsIcon({ size }: { size: number }) {
    return (
        <Image
            src="/google-ads-icon.svg"
            alt=""
            width={size}
            height={size}
            className="shrink-0"
            aria-hidden="true"
        />
    );
}

type Account = { id: string; name: string };

type AccountData = {
    customerId: string;
    customerIds: Account[];
    impersonating: boolean;
};

let cachedAccountData: AccountData | null = null;

export function AccountSwitcher({ collapsed }: { collapsed: boolean }) {
    const [data, setData] = useState<AccountData | null>(cachedAccountData);
    const [open, setOpen] = useState(false);
    const [switching, setSwitching] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
            .then((r) => r.json())
            .then((session) => {
                if (cancelled || !session.connected) return;
                const d: AccountData = {
                    customerId: session.customerId,
                    customerIds: session.customerIds ?? [],
                    impersonating: !!session.impersonating,
                };
                cachedAccountData = d;
                setData(d);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    if (!data || data.customerIds.length === 0) return null;

    const active = data.customerIds.find((a) => a.id === data.customerId);
    const displayName = active?.name || active?.id || 'Account';

    // Disable account switching during impersonation to prevent mutating the real user's session
    const canSwitch = !data.impersonating;

    async function switchTo(accountId: string) {
        if (accountId === data?.customerId || switching) return;
        setSwitching(true);
        try {
            const res = await fetch('/api/auth/switch-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerId: accountId }),
            });
            if (res.ok) {
                // Navigate to base path to clear thread-specific state on chat pages
                if (window.location.pathname.startsWith('/chat/')) {
                    window.location.assign('/chat');
                } else {
                    window.location.reload();
                }
            }
        } finally {
            setSwitching(false);
        }
    }

    if (collapsed) {
        return (
            <div ref={ref} className="relative px-2 pb-2">
                <button
                    type="button"
                    onClick={() => canSwitch && setOpen(!open)}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg text-[#C4C0B6] transition hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD] ${!canSwitch ? 'cursor-default opacity-60' : ''}`}
                    title={data.impersonating ? `Viewing as ${displayName}` : displayName}
                >
                    <GoogleAdsIcon size={20} />
                </button>
                {open && (
                    <div className="absolute left-[60px] top-0 z-50 min-w-[220px] rounded-lg border border-[#3D3C36] bg-[#24231F] py-1 shadow-xl">
                        <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-[#C4C0B6]">
                            Switch account
                        </div>
                        {data.customerIds.map((account) => (
                            <button
                                key={account.id}
                                type="button"
                                onClick={() => switchTo(account.id)}
                                disabled={switching}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition hover:bg-[#E8E4DD]/6 disabled:opacity-50"
                            >
                                <GoogleAdsIcon size={16} />
                                <span className={`flex-1 truncate ${account.id === data.customerId ? 'text-[#E8E4DD]' : 'text-[#C4C0B6]'}`}>
                                    {account.name || account.id}
                                </span>
                                {account.id === data.customerId && (
                                    <Check className="h-3.5 w-3.5 shrink-0 text-[#4CAF6E]" />
                                )}
                            </button>
                        ))}
                        <div className="mx-2 my-1 border-t border-[#3D3C36]" />
                        <button
                            type="button"
                            onClick={() => { setOpen(false); window.location.assign('/api/auth/add-account'); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#C4C0B6] transition hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD]"
                        >
                            <Plus className="h-4 w-4" />
                            <span>Add account</span>
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => canSwitch && setOpen(!open)}
                className={`flex h-9 items-center gap-2.5 rounded-md text-left transition hover:bg-[#E8E4DD]/6 ${!canSwitch ? 'cursor-default opacity-60' : ''}`}
            >
                <GoogleAdsIcon size={20} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[#E8E4DD]">
                    {displayName}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-[#C4C0B6] transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute left-0 top-10 z-50 min-w-[220px] rounded-lg border border-[#3D3C36] bg-[#24231F] py-1 shadow-xl">
                    {data.customerIds.map((account) => (
                        <button
                            key={account.id}
                            type="button"
                            onClick={() => switchTo(account.id)}
                            disabled={switching}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition hover:bg-[#E8E4DD]/6 disabled:opacity-50"
                        >
                            <GoogleAdsIcon size={16} />
                            <span className={`min-w-0 flex-1 truncate ${account.id === data.customerId ? 'text-[#E8E4DD]' : 'text-[#C4C0B6]'}`}>
                                {account.name || account.id}
                            </span>
                            {account.id === data.customerId && (
                                <Check className="h-3.5 w-3.5 shrink-0 text-[#4CAF6E]" />
                            )}
                        </button>
                    ))}
                    <div className="mx-2 my-1 border-t border-[#3D3C36]" />
                    <button
                        type="button"
                        onClick={() => { setOpen(false); window.location.assign('/api/auth/add-account'); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#C4C0B6] transition hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD]"
                    >
                        <Plus className="h-4 w-4" />
                        <span>Add account</span>
                    </button>
                </div>
            )}
        </div>
    );
}
