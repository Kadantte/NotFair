"use client";

import { ArrowRight } from "lucide-react";

type ChangeItem = {
  id: number;
  action: string;
  entityType: string;
  entityId: string;
  beforeValue: string;
  afterValue: string;
  reasoning: string | null;
  rolledBack: boolean;
  timestamp: Date;
};

export function RecentChanges({ changes }: { changes: ChangeItem[] }) {
  if (changes.length === 0) {
    return (
      <div className="rounded-md border border-[#3D3C36] bg-[#24231F] p-6">
        <div className="text-[14px] font-medium text-[#E8E4DD]">Recent Changes</div>
        <div className="mt-3 text-[13px] text-[#9B9689]">
          No changes yet. Actions taken from this dashboard or the AI chat will appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-medium text-[#E8E4DD]">Recent Changes</div>
        <a
          href="/operations"
          className="text-[11px] text-[#9B9689] hover:text-[#E8E4DD] transition-colors"
        >
          View all
        </a>
      </div>
      <div className="rounded-md border border-[#3D3C36] bg-[#24231F] divide-y divide-[#3D3C36]">
        {changes.slice(0, 5).map((change) => (
          <ChangeRow key={change.id} change={change} />
        ))}
      </div>
    </div>
  );
}

function ChangeRow({ change }: { change: ChangeItem }) {
  const actionLabel = change.action.replace(/_/g, " ");
  const timeAgo = getTimeAgo(change.timestamp);

  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${change.rolledBack ? "opacity-50" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium capitalize text-[#E8E4DD]">
            {actionLabel}
          </span>
          {change.rolledBack && (
            <span className="rounded-sm bg-[#9B9689]/20 px-1.5 py-0.5 text-[10px] text-[#9B9689]">
              Reverted
            </span>
          )}
        </div>
        {change.beforeValue && change.afterValue && (
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-[#9B9689]">
            <span className="truncate max-w-[120px]">{formatValue(change.beforeValue)}</span>
            <ArrowRight className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[120px]">{formatValue(change.afterValue)}</span>
          </div>
        )}
        {change.reasoning && (
          <div className="mt-0.5 truncate text-[11px] text-[#9B9689]/70">
            {change.reasoning}
          </div>
        )}
      </div>
      <span className="shrink-0 font-mono text-[10px] text-[#9B9689]">{timeAgo}</span>
    </div>
  );
}

function formatValue(value: string): string {
  // Try to format as currency if it looks like a number
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== "") {
    if (num >= 1000) return `$${(num / 1_000_000).toFixed(2)}`;
    return value;
  }
  return value;
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
