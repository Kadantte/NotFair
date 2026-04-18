-- Admin telemetry queries filter on `created_at >= now() - interval '…'` only.
-- The existing btree indexes all lead with accountId/userId/sessionId/toolName,
-- so none can seek by time range alone. BRIN is the right tool for an
-- append-only time series: ~1% the size of a btree, and a full-table scan
-- against `ops` at 10M+ rows otherwise times out the dashboard.

CREATE INDEX IF NOT EXISTS "ops_created_brin_idx" ON "operations" USING BRIN ("created_at");
