'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Minus, Activity } from 'lucide-react';

type Change = {
  id: number;
  action: string;
  entityType: string;
  entityId: string;
  beforeValue: string;
  afterValue: string;
  reasoning: string | null;
  timestamp: string;
};

function formatAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(action: string, value: string): string {
  if (action.includes('bid') || action.includes('budget')) {
    const micros = Number(value);
    if (!Number.isNaN(micros) && micros > 0) {
      return `$${(micros / 1_000_000).toFixed(2)}`;
    }
  }
  return value;
}

function DeltaIndicator({ before, after }: { before: string; after: string }) {
  if (before === after) return <Minus className="h-4 w-4 text-zinc-500" />;
  if (after === 'PAUSED') return <ArrowDown className="h-4 w-4 text-amber-400" />;
  if (after === 'ENABLED') return <ArrowUp className="h-4 w-4 text-green-400" />;

  const beforeNum = Number(before);
  const afterNum = Number(after);
  if (!Number.isNaN(beforeNum) && !Number.isNaN(afterNum)) {
    if (afterNum < beforeNum) {
      return <ArrowDown className="h-4 w-4 text-green-400" />;
    }
    if (afterNum > beforeNum) {
      return <ArrowUp className="h-4 w-4 text-amber-400" />;
    }
  }

  return <Minus className="h-4 w-4 text-zinc-500" />;
}

export function ImpactPage() {
  const [changes, setChanges] = useState<Change[]>([]);
  void setChanges;
  const loading = false;

  return (
    <div className="px-4 pb-16 pt-24">
      <div className="container mx-auto max-w-5xl">
        <div className="mb-12">
          <h1 className="mb-4 text-3xl font-bold text-white md:text-5xl">
            Impact Tracker
          </h1>
          <p className="text-lg text-zinc-400">
            Every change AdsAgent makes is logged here with before and after
            context so you can review what moved and what did not.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-400" />
          </div>
        ) : changes.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 py-20 text-center">
            <Activity className="mx-auto mb-4 h-12 w-12 text-zinc-700" />
            <h2 className="mb-2 text-xl font-semibold text-zinc-300">
              No changes yet
            </h2>
            <p className="mx-auto max-w-md text-zinc-500">
              Connect AdsAgent to your Google Ads account via MCP and start making
              changes. Every action will appear here with its recorded impact.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="pb-3 text-sm font-medium text-zinc-400">Date</th>
                  <th className="pb-3 text-sm font-medium text-zinc-400">Action</th>
                  <th className="pb-3 text-sm font-medium text-zinc-400">Target</th>
                  <th className="pb-3 text-sm font-medium text-zinc-400">Before</th>
                  <th className="pb-3 text-sm font-medium text-zinc-400" />
                  <th className="pb-3 text-sm font-medium text-zinc-400">After</th>
                  <th className="pb-3 text-sm font-medium text-zinc-400">
                    Reasoning
                  </th>
                </tr>
              </thead>
              <tbody>
                {changes.map((change) => (
                  <tr
                    key={change.id}
                    className="border-b border-zinc-800/50 hover:bg-zinc-900/30"
                  >
                    <td className="whitespace-nowrap py-4 text-sm text-zinc-400">
                      {new Date(change.timestamp).toLocaleDateString()}
                    </td>
                    <td className="py-4">
                      <span className="text-sm font-medium text-white">
                        {formatAction(change.action)}
                      </span>
                    </td>
                    <td className="py-4 font-mono text-sm text-zinc-300">
                      {change.entityId}
                    </td>
                    <td className="py-4 text-sm text-zinc-400">
                      {formatValue(change.action, change.beforeValue)}
                    </td>
                    <td className="px-2 py-4">
                      <DeltaIndicator
                        before={change.beforeValue}
                        after={change.afterValue}
                      />
                    </td>
                    <td className="py-4 text-sm text-zinc-300">
                      {formatValue(change.action, change.afterValue)}
                    </td>
                    <td className="max-w-xs truncate py-4 text-sm text-zinc-500">
                      {change.reasoning ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-12 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6">
          <h2 className="mb-2 text-sm font-medium text-zinc-400">
            About impact attribution
          </h2>
          <p className="text-sm leading-relaxed text-zinc-500">
            Impact estimates are correlated, not causal. Google Ads performance is
            affected by seasonality, competitor activity, and Google&apos;s own
            auction changes. We show what changed after each action so you can judge
            whether it helped.
          </p>
        </div>
      </div>
    </div>
  );
}
