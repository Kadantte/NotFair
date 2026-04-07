/**
 * Client-side outreach metrics derived from the contacts array.
 * No extra DB queries — computed from already-fetched contacts.
 */

export const BOUNCE_RATE_WARN = 0.05;

export const STATUS_CONFIG = [
    { key: 'new', label: 'New', color: '#9B9689' },
    { key: 'drafted', label: 'Drafted', color: '#6B8AED' },
    { key: 'scheduled', label: 'Scheduled', color: '#C084FC' },
    { key: 'contacted', label: 'Contacted', color: '#D4882A' },
    { key: 'delivered', label: 'Delivered', color: '#A78BFA' },
    { key: 'opened', label: 'Opened', color: '#60A5FA' },
    { key: 'clicked', label: 'Clicked', color: '#34D399' },
    { key: 'replied', label: 'Replied', color: '#4CAF6E' },
    { key: 'bounced', label: 'Bounced', color: '#C45D4A' },
];

type ContactLike = { email: string; status: string };

export type OutreachMetrics = {
    total: number;
    byStatus: Record<string, number>;
    sent: number;
    bounced: number;
    replied: number;
    bounceRate: number;
    replyRate: number;
    domainBreakdown: { domain: string; total: number; bounced: number; bounceRate: number }[];
};

export function deriveMetrics(contacts: ContactLike[]): OutreachMetrics {
    const byStatus: Record<string, number> = {};
    for (const c of contacts) {
        byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    }
    const bounced = byStatus['bounced'] ?? 0;
    const replied = byStatus['replied'] ?? 0;
    const contacted = (byStatus['contacted'] ?? 0) + (byStatus['delivered'] ?? 0) + (byStatus['opened'] ?? 0) + (byStatus['clicked'] ?? 0);
    const sent = contacted + replied + bounced;

    const SENT_STATUSES = new Set(['contacted', 'delivered', 'opened', 'clicked', 'replied', 'bounced']);

    // Domain breakdown for sent emails only
    const domainMap = new Map<string, { total: number; bounced: number }>();
    for (const c of contacts) {
        if (!SENT_STATUSES.has(c.status)) continue;
        const domain = c.email.split('@')[1] ?? '';
        const entry = domainMap.get(domain) ?? { total: 0, bounced: 0 };
        entry.total++;
        if (c.status === 'bounced') entry.bounced++;
        domainMap.set(domain, entry);
    }
    const domainBreakdown = [...domainMap.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 20)
        .map(([domain, d]) => ({ domain, ...d, bounceRate: d.total > 0 ? d.bounced / d.total : 0 }));

    return {
        total: contacts.length,
        byStatus,
        sent,
        bounced,
        replied,
        bounceRate: sent > 0 ? bounced / sent : 0,
        replyRate: sent > 0 ? replied / sent : 0,
        domainBreakdown,
    };
}
