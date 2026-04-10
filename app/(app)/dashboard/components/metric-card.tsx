"use client";

import { Sparkline } from "./sparkline";

export function MetricCard({
  label,
  value,
  change,
  sparklineData,
  sparklineColor,
  format = "number",
}: {
  label: string;
  value: number | null;
  change?: number | null;
  sparklineData?: number[];
  sparklineColor?: string;
  format?: "number" | "currency" | "percent";
}) {
  const formattedValue = formatValue(value, format);
  const changeColor = change === null || change === undefined
    ? "#C4C0B6"
    : change > 0
      ? "#4CAF6E"
      : change < 0
        ? "#C45D4A"
        : "#C4C0B6";

  return (
    <div className="rounded-md border border-[#3D3C36] bg-[#24231F] p-4">
      <div className="text-[12px] font-medium text-[#C4C0B6] uppercase tracking-wide">
        {label}
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div>
          <span className="font-mono text-[22px] font-semibold text-[#E8E4DD]">
            {formattedValue}
          </span>
          {change !== null && change !== undefined && (
            <span
              className="ml-2 font-mono text-[12px] font-medium"
              style={{ color: changeColor }}
            >
              {change > 0 ? "+" : ""}
              {format === "currency"
                ? `$${Math.abs(change).toFixed(0)}`
                : format === "percent"
                  ? `${change.toFixed(1)}%`
                  : change.toLocaleString()}
              {" vs last week"}
            </span>
          )}
        </div>
        {sparklineData && sparklineData.length >= 2 && (
          <Sparkline
            data={sparklineData}
            color={sparklineColor ?? (change && change < 0 ? "#C45D4A" : "#4CAF6E")}
          />
        )}
      </div>
    </div>
  );
}

function formatValue(value: number | null, format: string): string {
  if (value === null) return "--";
  switch (format) {
    case "currency":
      return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
    default:
      return value.toLocaleString();
  }
}
