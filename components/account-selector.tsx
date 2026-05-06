'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * One ad account the user can pick. The optional grouping fields
 * (loginCustomerId / loginCustomerName) come from Google Ads' MCC model
 * and identify which manager the account is reachable through. Other
 * platforms (Meta etc.) won't set them — accounts there render as flat
 * "Direct access".
 */
export type SelectableAccount = {
    id: string;
    name: string;
    loginCustomerId?: string;
    loginCustomerName?: string;
};

export type AccountSelectorProps = {
    /** Full set of accounts the user can pick from. */
    accounts: SelectableAccount[];
    /** Pending session token from the URL — passed back to the submit endpoint. */
    pendingToken?: string | null;
    /** "create" for first-time selection, "update" for editing an existing pick. */
    mode: 'create' | 'update';
    /** Account IDs that should be pre-checked. */
    preselectedIds?: string[];
    /** Where to send the user after a successful selection. */
    next: string;
    /** Server endpoint that commits the selection. POST { pendingToken?, accounts, next }. */
    submitEndpoint: string;
    /** Headline shown above the picker. Platform-specific. */
    headline?: string;
    /** Body text under the headline. */
    body?: string;
};

/**
 * Multi-account picker with a draft-then-save workflow: the user toggles
 * checkboxes to build their selection, then clicks Save to commit. Used by
 * the per-platform onboarding routes (/manage-ads-accounts/google-ads/select
 * today, /manage-ads-accounts/meta-ads/select later) and the in-app "manage
 * accounts" surface.
 *
 * The component is platform-agnostic: it groups accounts by loginCustomerId
 * if any are set (Google Ads MCC behavior) and otherwise renders a flat
 * "Direct access" list.
 */
export function AccountSelector({
    accounts,
    pendingToken = null,
    mode,
    preselectedIds = [],
    next,
    submitEndpoint,
    headline,
    body,
}: AccountSelectorProps) {
    const t = useTranslations('AccountSelector');
    const displayHeadline = headline ?? t('headline');
    const displayBody = body ?? t('body');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => new Set(preselectedIds.filter((id) => accounts.some((a) => a.id === id))),
    );
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Once the first commit lands, the pending row is promoted (customerId
    // populated), so subsequent saves must use the cookie session — keep
    // sending the pendingToken would 404 against the empty-customerId
    // lookup at /api/auth/select-account.
    const [activePendingToken] = useState<string | null>(pendingToken);

    // Re-seed only when the candidate-id SET changes (e.g. nav between
    // platforms). Server re-renders pass new array references with the same
    // contents — guarding on a stable string key prevents wiping the user's
    // in-progress selection on every router.refresh().
    const accountsKey = useMemo(() => accounts.map((a) => a.id).sort().join(','), [accounts]);
    useEffect(() => {
        const ids = accountsKey ? accountsKey.split(',') : [];
        setSelectedIds(new Set(preselectedIds.filter((id) => ids.includes(id))));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountsKey]);

    // Track the persisted set so we can show "unsaved changes" / disable Save.
    const persistedKey = useMemo(() => [...preselectedIds].sort().join(','), [preselectedIds]);
    const draftKey = useMemo(() => [...selectedIds].sort().join(','), [selectedIds]);
    const isDirty = persistedKey !== draftKey;

    const accountGroups = useMemo(() => {
        const groups = new Map<
            string,
            { key: string; label: string; isManager: boolean; accounts: SelectableAccount[] }
        >();
        for (const a of accounts) {
            const key = a.loginCustomerId ?? '__direct__';
            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    label: a.loginCustomerId
                        ? a.loginCustomerName || `Manager ${a.loginCustomerId}`
                        : t('directAccess'),
                    isManager: !!a.loginCustomerId,
                    accounts: [],
                });
            }
            groups.get(key)!.accounts.push(a);
        }
        return Array.from(groups.values());
    }, [accounts, t]);

    function toggleAccount(id: string) {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    const allSelected = selectedIds.size === accounts.length && accounts.length > 0;
    const noneSelected = selectedIds.size === 0;

    function selectAll() {
        setSelectedIds(new Set(accounts.map((a) => a.id)));
    }
    function clearAll() {
        setSelectedIds(new Set());
    }

    async function save() {
        if (noneSelected || submitting || !isDirty) return;
        setSubmitting(true);
        setError(null);
        const payloadAccounts = accounts
            .filter((a) => selectedIds.has(a.id))
            .map((a) => ({
                id: a.id,
                name: a.name,
                ...(a.loginCustomerId ? { loginCustomerId: a.loginCustomerId } : {}),
            }));
        try {
            const res = await fetch(submitEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...(activePendingToken ? { pendingToken: activePendingToken } : {}),
                    accounts: payloadAccounts,
                    next,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                setError(typeof data.error === 'string' ? data.error : t('saveFailed'));
                setSubmitting(false);
                return;
            }
            // Save succeeded → land the user on the Google MCP setup page
            // for MCP setup (with the success toast firing on arrival). The
            // server may also have included a redirectUrl (post-signup); use
            // that when present, otherwise fall back to /connect/google-ads.
            window.location.assign(data.redirectUrl ?? '/connect/google-ads?connected=1');
        } catch (err) {
            setError(err instanceof Error ? err.message : t('saveFailed'));
            setSubmitting(false);
        }
    }

    const saveLabel = submitting
        ? mode === 'update' ? t('saving') : t('connecting')
        : mode === 'update'
            ? t('save', { count: selectedIds.size })
            : t('connect', { count: selectedIds.size });

    return (
        <div className="mx-auto max-w-2xl">
            <header className="mb-6 flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold text-[#E8E4DD]">{displayHeadline}</h1>
                    <p className="mt-1.5 text-sm text-[#C4C0B6]">{displayBody}</p>
                </div>
            </header>

            <div className="rounded-2xl border border-[#3D3C36] bg-[#24231F]">
                {/* Toolbar */}
                <div className="flex items-center justify-between gap-3 border-b border-[#3D3C36] px-5 py-3">
                    <div className="flex items-center gap-2 text-xs">
                        <button
                            type="button"
                            onClick={selectAll}
                            disabled={submitting || allSelected}
                            className="rounded-md border border-[#3D3C36] bg-[#1A1917] px-2.5 py-1 text-[#C4C0B6] transition hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD] disabled:opacity-40"
                        >
                            {t('selectAll')}
                        </button>
                        <button
                            type="button"
                            onClick={clearAll}
                            disabled={submitting || noneSelected}
                            className="rounded-md border border-[#3D3C36] bg-[#1A1917] px-2.5 py-1 text-[#C4C0B6] transition hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD] disabled:opacity-40"
                        >
                            {t('clear')}
                        </button>
                    </div>
                    <span className="text-xs text-[#C4C0B6] tabular-nums">
                        {t('selectedCount', { selected: selectedIds.size, total: accounts.length })}
                    </span>
                </div>

                {/* List */}
                <div className="divide-y divide-[#3D3C36]">
                    {accountGroups.map((group) => (
                        <div key={group.key}>
                            {(group.isManager || accountGroups.length > 1) && (
                                <div className="flex items-center gap-2 bg-[#1A1917]/40 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#C4C0B6]/80">
                                    {group.isManager ? (
                                        <>
                                            <span>{t('viaManager')}</span>
                                            <span className="rounded border border-[#3D3C36] bg-[#1A1917] px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-[#E8E4DD]">
                                                {group.label}
                                            </span>
                                        </>
                                    ) : (
                                        <span>{t('directAccess')}</span>
                                    )}
                                </div>
                            )}
                            <ul className="divide-y divide-[#3D3C36]">
                                {group.accounts.map((account) => {
                                    const isSelected = selectedIds.has(account.id);
                                    return (
                                        <li key={account.id}>
                                            <button
                                                type="button"
                                                onClick={() => toggleAccount(account.id)}
                                                disabled={submitting}
                                                className={`flex w-full items-center gap-4 px-5 py-3.5 text-left transition disabled:opacity-50 ${
                                                    isSelected ? 'bg-[#4CAF6E]/8 hover:bg-[#4CAF6E]/12' : 'hover:bg-[#2E2D28]'
                                                }`}
                                            >
                                                <div
                                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                                                        isSelected
                                                            ? 'border-[#4CAF6E] bg-[#4CAF6E]'
                                                            : 'border-[#C4C0B6]/40 bg-[#1A1917]'
                                                    }`}
                                                >
                                                    {isSelected && <Check className="h-3.5 w-3.5 text-[#1A1917]" strokeWidth={3} />}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-base font-medium text-[#E8E4DD]">{account.name}</p>
                                                    <p className="mt-0.5 text-xs text-[#C4C0B6]">
                                                        <code className="font-mono-jb">{account.id}</code>
                                                        {account.loginCustomerName && (
                                                            <span> · {t('viaManagerLower', { manager: account.loginCustomerName })}</span>
                                                        )}
                                                    </p>
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>

            {error && <p className="mt-3 text-sm text-[#D4882A]">{error}</p>}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
                {isDirty && !submitting && (
                    <span className="mr-auto text-xs text-[#D4882A]">{t('unsavedChanges')}</span>
                )}
                <Button
                    onClick={save}
                    disabled={noneSelected || !isDirty || submitting}
                    className="h-11 rounded-lg bg-[#4CAF6E] px-5 text-sm font-semibold text-[#1A1917] hover:bg-[#3D9A5C] disabled:opacity-50"
                >
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {saveLabel}
                </Button>
            </div>
        </div>
    );
}
