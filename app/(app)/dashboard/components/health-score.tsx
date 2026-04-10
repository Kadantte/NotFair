"use client";

import type { HealthResult } from "@/lib/dashboard/health-score";

const COLOR_MAP = {
  green: "#4CAF6E",
  yellow: "#D4882A",
  red: "#C45D4A",
} as const;

export function HealthScore({ data, preliminary }: { data: HealthResult | null; preliminary?: boolean }) {
  if (!data) {
    return (
      <div className="flex items-center justify-center rounded-md border border-[#3D3C36] bg-[#24231F] p-6">
        <div className="text-center">
          <div className="font-mono text-[48px] font-bold text-[#C4C0B6]">--</div>
          <div className="text-[12px] text-[#C4C0B6]">Collecting data...</div>
        </div>
      </div>
    );
  }

  const color = COLOR_MAP[data.color];
  const circumference = 2 * Math.PI * 45;
  const progress = (data.score / 100) * circumference;

  return (
    <div className="flex items-center gap-6 rounded-md border border-[#3D3C36] bg-[#24231F] p-6">
      {/* Score circle */}
      <div className="relative h-[120px] w-[120px] shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={`Account health score: ${data.score} out of 100, status ${data.color}`}>
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#3D3C36"
            strokeWidth="6"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[32px] font-bold" style={{ color }}>
            {data.score}
          </span>
        </div>
      </div>

      {/* Component breakdown */}
      <div className="flex-1 space-y-1.5">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[14px] font-medium text-[#E8E4DD]">Account Health</span>
          {preliminary && (
            <span className="rounded-sm bg-[#3D3C36] px-1.5 py-0.5 text-[10px] text-[#C4C0B6]">
              updating...
            </span>
          )}
        </div>
        <ComponentBar label="CPA Efficiency" value={data.components.cpaEfficiency} />
        <ComponentBar label="Quality Scores" value={data.components.qualityScores} />
        <ComponentBar label="Impression Share" value={data.components.impressionShare} />
        <ComponentBar label="Waste Ratio" value={data.components.wasteRatio} />
        <ComponentBar label="Momentum" value={data.components.changeMomentum} />
      </div>
    </div>
  );
}

function ComponentBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "#4CAF6E" : value >= 40 ? "#D4882A" : "#C45D4A";
  return (
    <div className="flex items-center gap-2">
      <span className="w-[110px] shrink-0 text-[11px] text-[#C4C0B6]">{label}</span>
      <div className="h-[4px] flex-1 rounded-full bg-[#3D3C36]">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-[28px] shrink-0 text-right font-mono text-[11px] text-[#C4C0B6]">
        {value}
      </span>
    </div>
  );
}
