---
question: "What are the distinct new user journeys, friction points, and opportunities to increase usage and retention?"
date: 2026-04-11 17:00 PDT
data_sources: PostHog HogQL (Apr 10-11 2026, project 368485). Excluded internal users izhongyuting@gmail.com, tongchen92@gmail.com.
html: docs/analysis/2026-04-11_17-00_new-user-journey-analysis.html
---

**Verdict:** Auth errors blocked nearly as many users as successfully signed up — 12 error encounters vs 13 signups in 2 days. Of 13 new signups, only 38% (5) reached core value (AI write). 31% became read-only Explorers, 23% stalled at setup.

**5 Distinct User Journeys (Apr 10-11, n=13 external users):**
- **Power Users (23%, 3):** 100+ AI actions, try multiple setup paths, heavy keyword management
- **Active Users (15%, 2):** 20-43 actions, mix of reads and writes
- **Explorers (31%, 4):** 13-30 reads, zero writes — proven intent, haven't hit activation moment
- **Stalled (23%, 3):** Connected, copied credentials, browsed site, never executed AI tools
- **Bounced (8%, 1):** Signed up, never returned

**Major Problems:**
- 8 external users hit 'permission not granted' error in 2 days — 62% of signup volume **(Critical)**
- 3 users hit 'missing_code' auth failure — likely OAuth callback race condition **(High)**
- 31% are read-only explorers who never cross the write threshold **(High)**
- 23% stalled at setup despite completing credential/install steps **(High)**

**So what:**
1. Fix 'permission not granted' error — pre-check Google Ads checkbox, add retry. Could increase activation 50%+.
2. Convert Explorers with contextual suggestions after 3+ reads.
3. Rescue Stalled users — triggered email 24h after last activity with auto-install command.
4. Fix 'missing_code' auth failure — investigate OAuth callback handler.
5. Catch Bouncers — welcome email within 1h with account audit summary.
