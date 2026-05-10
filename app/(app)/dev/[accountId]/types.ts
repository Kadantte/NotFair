// Types local to the [accountId] detail page.
// ActivityCall / ActivityStats / ActivityPayload live in @/lib/dev-types (already shared).

export type Operation = {
    id: number;
    opType: 'read' | 'write';
    action: string;
    entityType: string;
    entityId: string;
    campaignId: string | null;
    beforeValue: string;
    afterValue: string;
    reasoning: string | null;
    rolledBack: boolean;
    source: string | null;
    timestamp: string;
};

export type CampaignStat = {
    campaignId: string | null;
    totalOps: number;
    writes: number;
    lastOp: string;
};

export type DailyUsage = {
    date: string;
    reads: number;
    writes: number;
    total: number;
};

export type CampaignISBreakdown = {
    campaignName: string;
    impressionShare: number | null;
    budgetLostIS: number | null;
    rankLostIS: number | null;
    totalImpressions: number;
    totalCost: number;
    diagnosis: 'budget' | 'rank' | 'structural' | 'healthy';
};

export type ImpressionShareDiagnosis = {
    avgIS: number | null;
    budgetLost: number | null;
    rankLost: number | null;
    diagnosis: string;
    campaignBreakdown: CampaignISBreakdown[];
};

export type AuditSnapshot = {
    id: number;
    overallScore: number;
    category: string;
    wasteRate: number;
    demandCaptured: number | null;
    cpa: number | null;
    wastedSpend: number;
    totalSpend: number;
    campaignCount: number;
    topActions: Array<{ action: string; impact: string }>;
    impressionShareDiagnosis: ImpressionShareDiagnosis | null;
    createdAt: string;
};

export type AccountDetail = {
    accountId: string;
    email: string | null;
    connectedAccounts: { id: string; name: string }[];
    lastLogin: string | null;
    recentOperations: Operation[];
    dailyUsage: DailyUsage[];
    campaigns: CampaignStat[];
    auditHistory: AuditSnapshot[];
};
