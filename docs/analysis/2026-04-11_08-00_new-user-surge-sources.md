---
question: "We got a lot of new users from yesterday to today — where are they coming from?"
date: 2026-04-11 08:00 PDT
data_sources: PostHog HogQL: $pageview, user_signed_up, account_connected (Apr 4-11, project 368485) | Supabase: auth.users (last 7d)
html: docs/analysis/2026-04-11_08-00_new-user-surge-sources.html
---

**Verdict:** GitHub traffic from the toprank repo README doubled (8→17 visitors) and is the primary driver of today's signup surge (9 signups vs 4 yesterday). 8 of 9 new users connected Google Ads — exceptionally high-quality traffic.

**Findings:**
- GitHub traffic doubled: 17 visitors today vs 8 yesterday — all from nowork-studio/toprank README. One fork (T3rm1n8or/toprank) also sending traffic. **(High)**
- Direct/dark social grew 43%: 33 visitors vs 23 — 7 of 9 signups show as "direct," likely shared links without UTM params **(Medium)**
- Reddit declined: 7 visitors vs 16 yesterday — Apr 10 spike was a one-day event **(High)**
- Google organic growing: 5 visitors vs 2 — small but steady **(Medium)**
- International spread: Germany (2), Israel (2), Greece (1) — suggests link shared in international PPC community **(Medium)**

**So what:**
1. Investigate what drove the toprank GitHub surge — check for HN feature, influencer star, or dev community share. Highest-ROI channel right now.
2. Add UTM params to toprank README link — 6 of 9 signups are unattributed "direct" traffic that would become attributable.
3. Find the international PPC community where adsagent was shared — the Germany/Israel cluster is unusual and worth engaging.
