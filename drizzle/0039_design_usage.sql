-- Design usage quota tracking. One row per (user_id, year_month); the
-- composite primary key provides a natural upsert target. Updated by
-- lib/design/quota.ts on each successful image generation.
CREATE TABLE IF NOT EXISTS design_usage_monthly (
  user_id    TEXT    NOT NULL,
  year_month TEXT    NOT NULL,   -- 'YYYY-MM', e.g. '2026-05'
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, year_month)
);
