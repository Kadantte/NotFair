-- Widen performance_snapshots.cost_micros from int (32-bit, max ~$2,147/day in
-- micros) to bigint. Signed int overflow was silently dropping snapshots for
-- high-spend campaigns: the daily cron INSERT would throw and the row was
-- simply skipped, leaving gaps in before/after windows for exactly the
-- accounts that matter most.
--
-- bigint is 8 bytes vs 4 for int — Postgres rewrites the column in place on
-- this ALTER. Safe on a ~1K-row snapshot table; run during low-traffic
-- window if the table has grown large.
ALTER TABLE "performance_snapshots"
  ALTER COLUMN "cost_micros" TYPE bigint;
