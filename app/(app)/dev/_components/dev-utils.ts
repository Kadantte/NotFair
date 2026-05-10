import type { Tab, Customer, CustomerAttribution } from './dev-types';

export const VALID_TABS: ReadonlySet<Tab> = new Set(['customers', 'usage', 'outreach', 'developer', 'waitlist']);
export const TAB_ORDER: readonly Tab[] = ['customers', 'usage', 'outreach', 'waitlist', 'developer'] as const;
export const DEFAULT_TAB: Tab = 'customers';

export const DAYS_PER_YEAR = 365;

export const CHART_MARGIN = { top: 4, right: 8, left: 0, bottom: 32 };
export const CHART_CURSOR = { fill: '#3D3C36', opacity: 0.4 };
export const LEGEND_STYLE = { color: '#C4C0B6', fontSize: 12, paddingTop: 8 };

export function tabFromPathname(pathname: string): Tab {
    const seg = pathname.split('/').filter(Boolean)[1];
    return seg && VALID_TABS.has(seg as Tab) ? (seg as Tab) : DEFAULT_TAB;
}

export function formatYTick(v: number): string {
    return v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v);
}

export function formatCurrency(amount: number, currencyCode?: string | null, opts: { compact?: boolean } = {}): string {
    const fractionDigits = opts.compact ? 0 : 2;
    if (currencyCode) {
        try {
            return new Intl.NumberFormat(undefined, {
                style: 'currency',
                currency: currencyCode,
                minimumFractionDigits: fractionDigits,
                maximumFractionDigits: fractionDigits,
            }).format(amount);
        } catch { /* invalid currency code fallback */ }
    }
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}`;
}

/** Parse a timestamp string (with or without trailing Z) into a Date */
export function parseTs(iso: string): Date {
    return new Date(iso.endsWith('Z') ? iso : iso + 'Z');
}

export function formatDateTime(iso: string): string {
    return parseTs(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });
}

export function formatDateShort(iso: string, year = false): string {
    return parseTs(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(year && { year: 'numeric' }) });
}

export function attributionTone(attribution?: CustomerAttribution): string {
    const source = attribution?.source?.toLowerCase() ?? '';
    if (source.includes('reddit')) return 'border-[#FF6B35]/30 bg-[#FF6B35]/10 text-[#FFB199]';
    if (source.includes('google')) return 'border-[#4CAF6E]/30 bg-[#4CAF6E]/10 text-[#7DDA9D]';
    if (source.includes('x') || source.includes('twitter')) return 'border-[#6AA9FF]/30 bg-[#6AA9FF]/10 text-[#9BC4FF]';
    if (attribution?.referrer) return 'border-[#D4882A]/30 bg-[#D4882A]/10 text-[#E1A95E]';
    return 'border-[#3D3C36] bg-[#1A1917]/70 text-[#C4C0B6]';
}

export function attributionDetailLabel(attribution: CustomerAttribution): string {
    if (attribution.campaign) return `campaign=${attribution.campaign}`;
    if (attribution.term) return `term=${attribution.term}`;
    if (attribution.content) return `content=${attribution.content}`;
    if (attribution.referrer) {
        try {
            return new URL(attribution.referrer).hostname.replace(/^www\./, '');
        } catch {
            return attribution.referrer.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || attribution.referrer;
        }
    }
    return '—';
}

export function attributionDisplayLabel(attribution: CustomerAttribution): string {
    return attribution.label === 'Unknown source' ? 'Unknown' : attribution.label;
}

export function deriveBudgetDisplay(c: Customer) {
    const acctWithCurrency = c.accounts.find((a) => a.currencyCode);
    const totalLocalDaily = c.accounts.reduce((s, a) => s + (a.dailyBudget ?? 0), 0);
    return {
        hasBudget: c.accounts.some((a) => a.dailyBudget != null),
        currency: acctWithCurrency?.currencyCode ?? null,
        flag: acctWithCurrency?.flag ?? null,
        country: acctWithCurrency?.country ?? null,
        annualLocal: totalLocalDaily * DAYS_PER_YEAR,
        annualUsd: c.dailyBudgetUsd != null ? c.dailyBudgetUsd * DAYS_PER_YEAR : null,
    };
}

export function normalizedSearchText(...values: Array<string | number | null | undefined>): string {
    return values
        .filter((value): value is string | number => value !== null && value !== undefined)
        .map((value) => String(value).toLowerCase())
        .join(' ');
}

export function customerMatchesSearch(customer: Customer, query: string): boolean {
    if (!query) return true;
    const attribution = customer.attribution;
    const haystack = normalizedSearchText(
        customer.googleEmail,
        customer.userId,
        customer.primaryAccountId,
        customer.accountCount,
        attribution?.label,
        attribution?.detail,
        attribution?.source,
        attribution?.medium,
        attribution?.campaign,
        attribution?.term,
        attribution?.content,
        attribution?.referrer,
        ...customer.accounts.flatMap((account) => [
            account.id,
            account.name,
            account.currencyCode,
            account.country,
        ]),
    );
    return query.split(/\s+/).every((token) => haystack.includes(token));
}
