"use client";

import { useState, useEffect, useCallback } from "react";
import { getDashboardOverview, getDashboardDetails } from "./actions";
import type { DashboardOverview, DashboardDetails } from "./actions";
import { DashboardContent } from "./dashboard-content";

// Module-level cache keyed by account ID
let cachedAccountId: string | null = null;
let cachedOverview: DashboardOverview | null = null;
let cachedDetails: DashboardDetails | null = null;

function getCacheForAccount(accountId: string) {
  if (cachedAccountId !== accountId) {
    cachedOverview = null;
    cachedDetails = null;
    cachedAccountId = accountId;
  }
  return { overview: cachedOverview, details: cachedDetails };
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<DashboardOverview | null>(cachedOverview);
  const [details, setDetails] = useState<DashboardDetails | null>(cachedDetails);
  const [loading, setLoading] = useState(!cachedOverview);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (background: boolean) => {
    if (!background) setLoading(true);
    try {
      const ov = await getDashboardOverview();

      // Invalidate cache if account changed
      const cache = getCacheForAccount(ov.accountId);
      setOverview(ov);
      cachedOverview = ov;
      if (!cache.overview) {
        // Account switched — clear stale details
        setDetails(null);
        cachedDetails = null;
      }
      setLoading(false);

      if (!ov.isEmpty) {
        try {
          const det = await getDashboardDetails();
          setDetails(det);
          cachedDetails = det;
        } catch {
          // Phase 2 failure — overview still shows, details stay null/stale
        }
      }
    } catch (err) {
      if (!background) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchData(!!cachedOverview);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1A1917]">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4CAF6E] border-t-transparent" />
          <span className="text-[13px] text-[#9B9689]">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1A1917]">
        <div className="text-center">
          <div className="text-[14px] text-[#C45D4A]">{error ?? "Unable to load dashboard"}</div>
          <button
            type="button"
            onClick={() => { setError(null); fetchData(false); }}
            className="mt-3 text-[13px] text-[#4CAF6E] hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return <DashboardContent overview={overview} details={details} />;
}
