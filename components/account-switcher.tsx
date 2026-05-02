'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Plus } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';

type Platform = 'google_ads' | 'meta_ads';

function PlatformIcon({ platform, size }: { platform: Platform; size: number }) {
    return (
        <Image
            src={platform === 'google_ads' ? '/google-ads-icon.svg' : '/meta-icon.svg'}
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
    googleAccounts: Account[];
    activeGoogleId: string;
    metaAccounts: Account[];
    activeMetaId: string | null;
    activePlatform: Platform;
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
                    googleAccounts: session.customerIds ?? [],
                    activeGoogleId: session.customerId ?? '',
                    metaAccounts: session.metaAccounts ?? [],
                    activeMetaId: session.activeMetaAccountId ?? null,
                    activePlatform: session.activePlatform === 'meta_ads' ? 'meta_ads' : 'google_ads',
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

    if (!data || (data.googleAccounts.length === 0 && data.metaAccounts.length === 0)) return null;

    const activeAccount =
        data.activePlatform === 'meta_ads'
            ? data.metaAccounts.find((a) => a.id === data.activeMetaId)
            : data.googleAccounts.find((a) => a.id === data.activeGoogleId);
    const displayName = activeAccount?.name || activeAccount?.id || 'Account';

    // Disable account switching during impersonation to prevent mutating the real user's session
    const canSwitch = !data.impersonating;

    async function switchTo(platform: Platform, accountId: string) {
        if (!data || switching) return;
        const isSamePlatform = data.activePlatform === platform;
        const isSameAccount =
            isSamePlatform && (platform === 'meta_ads'
                ? accountId === data.activeMetaId
                : accountId === data.activeGoogleId);
        if (isSameAccount) return;

        setSwitching(true);
        try {
            const endpoint = platform === 'meta_ads'
                ? '/api/auth/select-meta-account'
                : '/api/auth/switch-account';
            const body = platform === 'meta_ads'
                ? { accountId }
                : { customerId: accountId };
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                trackEvent('platform_switched', {
                    to_platform: platform,
                    from_platform: data.activePlatform,
                    cross_platform: !isSamePlatform,
                    google_accounts_count: data.googleAccounts.length,
                    meta_accounts_count: data.metaAccounts.length,
                });
                cachedAccountData = null;
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

    function renderAccountRow(platform: Platform, account: Account, isActive: boolean) {
        return (
            <button
                key={`${platform}:${account.id}`}
                type="button"
                onClick={() => switchTo(platform, account.id)}
                disabled={switching}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition hover:bg-[#E8E4DD]/6 disabled:opacity-50"
            >
                <PlatformIcon platform={platform} size={16} />
                <span className={`min-w-0 flex-1 truncate ${isActive ? 'text-[#E8E4DD]' : 'text-[#C4C0B6]'}`}>
                    {account.name || account.id}
                </span>
                {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-[#4CAF6E]" />}
            </button>
        );
    }

    function renderGroup(label: string, platform: Platform, accounts: Account[], activeId: string | null) {
        if (accounts.length === 0) return null;
        return (
            <div>
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#C4C0B6]/70">
                    {label}
                </div>
                {accounts.map((a) =>
                    renderAccountRow(platform, a, data!.activePlatform === platform && a.id === activeId),
                )}
            </div>
        );
    }

    const dropdownContents = (
        <>
            {renderGroup('Google Ads', 'google_ads', data.googleAccounts, data.activeGoogleId)}
            {renderGroup('Meta Ads', 'meta_ads', data.metaAccounts, data.activeMetaId)}
            <div className="mx-2 my-1 border-t border-[#3D3C36]" />
            <Link
                href="/manage-ads-accounts"
                prefetch
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#C4C0B6] transition hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD]"
            >
                <Plus className="h-4 w-4" />
                <span>Add account</span>
            </Link>
        </>
    );

    if (collapsed) {
        return (
            <div ref={ref} className="relative px-2 pb-2">
                <button
                    type="button"
                    onClick={() => canSwitch && setOpen(!open)}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg text-[#C4C0B6] transition hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD] ${!canSwitch ? 'cursor-default opacity-60' : ''}`}
                    title={data.impersonating ? `Viewing as ${displayName}` : displayName}
                >
                    <PlatformIcon platform={data.activePlatform} size={20} />
                </button>
                {open && (
                    <div className="absolute left-[60px] top-0 z-50 min-w-[240px] rounded-lg border border-[#3D3C36] bg-[#24231F] py-1 shadow-xl">
                        {dropdownContents}
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
                <PlatformIcon platform={data.activePlatform} size={20} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[#E8E4DD]">
                    {displayName}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-[#C4C0B6] transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute left-0 top-10 z-50 min-w-[240px] rounded-lg border border-[#3D3C36] bg-[#24231F] py-1 shadow-xl">
                    {dropdownContents}
                </div>
            )}
        </div>
    );
}
