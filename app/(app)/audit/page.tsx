"use client";

import { useState, useEffect, useCallback } from "react";
import { getAuditOverview, getAuditDetails } from "./actions";
import type { AuditOverview, AuditDetails } from "./actions";
import { AuditContent } from "./audit-content";

// Module-level cache keyed by account ID
let cachedAccountId: string | null = null;
let cachedOverview: AuditOverview | null = null;
let cachedDetails: AuditDetails | null = null;

function getCacheForAccount(accountId: string) {
  if (cachedAccountId !== accountId) {
    cachedOverview = null;
    cachedDetails = null;
    cachedAccountId = accountId;
  }
  return { overview: cachedOverview, details: cachedDetails };
}

export default function AuditPage() {
  const [overview, setOverview] = useState<AuditOverview | null>(cachedOverview);
  const [details, setDetails] = useState<AuditDetails | null>(cachedDetails);
  const [loading, setLoading] = useState(!cachedOverview);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (background: boolean) => {
    if (!background) setLoading(true);
    try {
      // Phase 1: Fast overview
      const ov = await getAuditOverview();

      const cache = getCacheForAccount(ov.accountId);
      setOverview(ov);
      cachedOverview = ov;
      if (!cache.overview) {
        setDetails(null);
        cachedDetails = null;
      }
      setLoading(false);

      // Phase 2: Detailed analysis
      if (!ov.isEmpty) {
        try {
          const det = await getAuditDetails();
          setDetails(det);
          cachedDetails = det;
        } catch {
          // Phase 2 failure — overview still shows
        }
      }
    } catch (err) {
      if (!background) {
        setError(err instanceof Error ? err.message : "Failed to load audit");
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
          <span className="text-[13px] text-[#9B9689]">Running audit...</span>
        </div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1A1917]">
        <div className="text-center">
          <div className="text-[14px] text-[#C45D4A]">{error ?? "Unable to load audit"}</div>
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

  return <AuditContent overview={overview} details={details} />;
}
