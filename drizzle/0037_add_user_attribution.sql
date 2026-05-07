-- Canonical first-touch acquisition table. One row per NotFair user so
-- acquisition can be joined cleanly to mcp_sessions, operations, Stripe, and
-- outreach without scraping Supabase Auth metadata or PostHog event payloads.

CREATE TABLE IF NOT EXISTS "user_attribution" (
  "user_id" text PRIMARY KEY,
  "email" text,
  "signup_method" text,
  "source" text,
  "medium" text,
  "campaign" text,
  "term" text,
  "content" text,
  "gclid" text,
  "fbclid" text,
  "rdt_cid" text,
  "first_landing_url" text,
  "first_landing_path" text,
  "signup_referrer" text,
  "signup_referrer_domain" text,
  "attribution_captured_at" timestamp,
  "attribution_source" text NOT NULL DEFAULT 'unknown',
  "attribution_version" integer NOT NULL DEFAULT 1,
  "raw_attribution" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "user_attribution_source_idx"
  ON "user_attribution" ("source", "medium");
CREATE INDEX IF NOT EXISTS "user_attribution_referrer_idx"
  ON "user_attribution" ("signup_referrer_domain");
CREATE INDEX IF NOT EXISTS "user_attribution_captured_idx"
  ON "user_attribution" ("attribution_captured_at");
CREATE INDEX IF NOT EXISTS "user_attribution_created_idx"
  ON "user_attribution" ("created_at");

-- Defense in depth for Supabase exposed schemas. Server code writes via the
-- direct database connection; no anon/authenticated PostgREST access is needed.
ALTER TABLE "user_attribution" ENABLE ROW LEVEL SECURITY;

-- Backfill all existing users so dashboards have a clean denominator even when
-- attribution is unknown. Store only attribution fields, not full auth metadata.
INSERT INTO "user_attribution" (
  "user_id",
  "email",
  "signup_method",
  "source",
  "medium",
  "campaign",
  "term",
  "content",
  "gclid",
  "fbclid",
  "rdt_cid",
  "first_landing_url",
  "first_landing_path",
  "signup_referrer",
  "signup_referrer_domain",
  "attribution_captured_at",
  "attribution_source",
  "attribution_version",
  "raw_attribution",
  "created_at",
  "updated_at"
)
SELECT
  u.id::text,
  u.email,
  coalesce(nullif(u.raw_user_meta_data->>'signup_method', ''), 'backfill'),
  coalesce(
    nullif(u.raw_user_meta_data->>'utm_source', ''),
    nullif(
      CASE
        WHEN ref.referrer_domain IN ('accounts.google.com', 'checkout.stripe.com', 'billing.stripe.com') THEN NULL
        ELSE ref.referrer_domain
      END,
      ''
    )
  ),
  nullif(u.raw_user_meta_data->>'utm_medium', ''),
  nullif(u.raw_user_meta_data->>'utm_campaign', ''),
  nullif(u.raw_user_meta_data->>'utm_term', ''),
  nullif(u.raw_user_meta_data->>'utm_content', ''),
  nullif(u.raw_user_meta_data->>'gclid', ''),
  nullif(u.raw_user_meta_data->>'fbclid', ''),
  nullif(u.raw_user_meta_data->>'rdt_cid', ''),
  nullif(u.raw_user_meta_data->>'first_landing_url', ''),
  nullif(u.raw_user_meta_data->>'first_landing_path', ''),
  CASE
    WHEN ref.referrer_domain IN ('accounts.google.com', 'checkout.stripe.com', 'billing.stripe.com') THEN NULL
    ELSE nullif(u.raw_user_meta_data->>'signup_referrer', '')
  END,
  CASE
    WHEN ref.referrer_domain IN ('accounts.google.com', 'checkout.stripe.com', 'billing.stripe.com') THEN NULL
    ELSE nullif(ref.referrer_domain, '')
  END,
  CASE
    WHEN (u.raw_user_meta_data->>'attribution_captured_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN
      (u.raw_user_meta_data->>'attribution_captured_at')::timestamp
    ELSE NULL
  END,
  'backfill_auth_metadata',
  CASE
    WHEN (u.raw_user_meta_data->>'attribution_version') ~ '^[0-9]+$' THEN
      (u.raw_user_meta_data->>'attribution_version')::integer
    ELSE 1
  END,
  jsonb_strip_nulls(jsonb_build_object(
    'utm_source', nullif(u.raw_user_meta_data->>'utm_source', ''),
    'utm_medium', nullif(u.raw_user_meta_data->>'utm_medium', ''),
    'utm_campaign', nullif(u.raw_user_meta_data->>'utm_campaign', ''),
    'utm_term', nullif(u.raw_user_meta_data->>'utm_term', ''),
    'utm_content', nullif(u.raw_user_meta_data->>'utm_content', ''),
    'gclid', nullif(u.raw_user_meta_data->>'gclid', ''),
    'fbclid', nullif(u.raw_user_meta_data->>'fbclid', ''),
    'rdt_cid', nullif(u.raw_user_meta_data->>'rdt_cid', ''),
    'first_landing_url', nullif(u.raw_user_meta_data->>'first_landing_url', ''),
    'first_landing_path', nullif(u.raw_user_meta_data->>'first_landing_path', ''),
    'signup_referrer', CASE
      WHEN ref.referrer_domain IN ('accounts.google.com', 'checkout.stripe.com', 'billing.stripe.com') THEN NULL
      ELSE nullif(u.raw_user_meta_data->>'signup_referrer', '')
    END,
    'signup_referrer_domain', CASE
      WHEN ref.referrer_domain IN ('accounts.google.com', 'checkout.stripe.com', 'billing.stripe.com') THEN NULL
      ELSE nullif(ref.referrer_domain, '')
    END,
    'attribution_captured_at', nullif(u.raw_user_meta_data->>'attribution_captured_at', ''),
    'attribution_version', CASE
      WHEN (u.raw_user_meta_data->>'attribution_version') ~ '^[0-9]+$' THEN
        (u.raw_user_meta_data->>'attribution_version')::integer
      ELSE 1
    END
  )),
  u.created_at,
  now()
FROM auth.users u
CROSS JOIN LATERAL (
  SELECT coalesce(
    nullif(u.raw_user_meta_data->>'signup_referrer_domain', ''),
    nullif(regexp_replace(split_part(regexp_replace(coalesce(u.raw_user_meta_data->>'signup_referrer', ''), '^https?://(www\.)?', ''), '/', 1), '^www\.', ''), '')
  ) AS referrer_domain
) ref
ON CONFLICT ("user_id") DO NOTHING;
