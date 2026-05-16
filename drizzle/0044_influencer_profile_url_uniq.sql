-- Belt-and-suspenders dedup for the influencer discovery cron. Email-based
-- ON CONFLICT misses the case where two runs find the same creator but generate
-- different placeholder slugs (e.g., 'aaronyoung' vs 'aaron-young'). Same
-- profile URL is a stronger fingerprint — case-insensitive, partial so it
-- doesn't conflict with lead/customer rows that lack profile_url.
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_influencer_profile_url_uniq"
  ON "contacts" (lower("profile_url"))
  WHERE kind = 'influencer' AND profile_url IS NOT NULL;
