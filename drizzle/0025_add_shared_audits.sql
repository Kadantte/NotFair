-- Shared audits — Phase 1: private auto-save of each audit run for signed-in
-- users. Phase 2 will add a public feed on top of the same row (visibility =
-- 'public', slug-based URL). All the columns Phase 2 needs are added now so
-- we don't need a second migration when that lands.
--
-- `payload` is the anonymized, render-ready `SharedAuditPayload` from
-- lib/audit/anonymize.ts — campaigns are already obfuscated and spend banded.
-- Phase 1 never writes visibility='public' and never serves unauthenticated
-- reads; the app-layer check `WHERE owner_user_id = session.userId` on the
-- detail page is the load-bearing guard. RLS below is defense-in-depth for
-- the day we expose a public-read path.

CREATE TABLE IF NOT EXISTS "shared_audits" (
  "id" text PRIMARY KEY,
  "slug" text NOT NULL UNIQUE,
  "owner_user_id" text NOT NULL,
  "source" text NOT NULL,
  "visibility" text NOT NULL DEFAULT 'private',
  "account_fingerprint" text NOT NULL,
  "payload" jsonb NOT NULL,
  "show_campaign_names" boolean NOT NULL DEFAULT false,
  "show_spend" boolean NOT NULL DEFAULT true,
  "show_exact_spend" boolean NOT NULL DEFAULT false,
  "industry" text,
  "takedown_reason" text,
  "taken_down_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp,
  "view_count" integer NOT NULL DEFAULT 0,
  "cta_click_count" integer NOT NULL DEFAULT 0
);

-- Primary query: a user's audit history, newest first.
CREATE INDEX IF NOT EXISTS "shared_audits_owner_created_idx"
  ON "shared_audits" ("owner_user_id", "created_at" DESC);

-- Phase 2 prep: public-feed query path. Partial index keeps it tiny while
-- all rows are private. Excluding rows with takedown_at keeps moderation
-- cheap too.
CREATE INDEX IF NOT EXISTS "shared_audits_public_created_idx"
  ON "shared_audits" ("visibility", "created_at" DESC)
  WHERE "visibility" = 'public' AND "taken_down_at" IS NULL;

-- RLS — defense in depth. The app connects as service role via DATABASE_URL
-- (postgres-js, not Supabase anon key), so these policies don't actually gate
-- Phase 1 traffic. They're here so that if we ever expose this table to a
-- user-scoped connection (e.g. PostgREST), the invariants are encoded in the
-- DB rather than spread across app code.
ALTER TABLE "shared_audits" ENABLE ROW LEVEL SECURITY;

-- Authed users can read their own rows. auth.uid() is text-cast to match
-- owner_user_id.
DROP POLICY IF EXISTS "shared_audits_owner_select" ON "shared_audits";
CREATE POLICY "shared_audits_owner_select" ON "shared_audits"
  FOR SELECT
  USING (owner_user_id = (auth.uid())::text);

-- Phase 2 scaffolding: public rows are readable by everyone. No-op in
-- Phase 1 because nothing writes visibility='public'.
DROP POLICY IF EXISTS "shared_audits_public_select" ON "shared_audits";
CREATE POLICY "shared_audits_public_select" ON "shared_audits"
  FOR SELECT
  USING (visibility = 'public' AND taken_down_at IS NULL);

-- Authed users can insert their own rows (client-side path, not used in
-- Phase 1 where saves go through the server action as service role).
DROP POLICY IF EXISTS "shared_audits_owner_insert" ON "shared_audits";
CREATE POLICY "shared_audits_owner_insert" ON "shared_audits"
  FOR INSERT
  WITH CHECK (owner_user_id = (auth.uid())::text);
