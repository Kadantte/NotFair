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
    const contacted = byStatus['contacted'] ?? 0;
    const sent = contacted + replied + bounced;

    // Domain breakdown for sent emails only
    const domainMap = new Map<string, { total: number; bounced: number }>();
    for (const c of contacts) {
        if (c.status !== 'contacted' && c.status !== 'replied' && c.status !== 'bounced') continue;
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
