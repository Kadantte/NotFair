---
question: "What operations did users from Apr 10-11 perform, and did anyone come back? What customer types are more likely to return?"
date: 2026-04-11 23:00 PDT
data_sources: Supabase (operations, mcp_sessions, chat_threads, chat_messages). Apr 10-11 2026. 13 external active users, 18 total signups. Internal users excluded.
html: docs/analysis/2026-04-11_23-00_user-operations-retention.html
---

**Verdict:** 18 new signups produced 13 active users in 48 hours, with keyword management (add/pause/enable) accounting for 65% of all write operations. Only 2 of 7 pre-existing external users returned (29% D1 retention), and both were business-domain users who had performed writes on their first visit — suggesting that crossing the "write threshold" on day 1 is the strongest retention predictor.

**Key findings:**
- 556 total operations (299 reads, 257 writes) — 46% write ratio is unusually high **(High confidence)**
- add_negative_keyword is the #1 action: 94 ops by 5 users (37% of all writes) **(High)**
- run_gaql_query is the #1 read: 78 ops by 9 users (69% of active users) **(High)**
- 5 users (38%) remained read-only — exploring but never crossing the write threshold **(Medium)**
- Both returning users were business-domain + day-1 writers (n=2, directional) **(Low)**

**Retention profile (n=7 pre-existing users):**
- 2 returned (29%): tim@creativeweb360.com (agency, 50 prior writes), m.sanchez@schaefer-ag.ch (business, 2 prior writes)
- 2 churned after activating: eric@hdas.biz (11 writes), fixfireplace@gmail.com (113 writes — power user churn)
- 3 never activated at all

**Who comes back:**
- Business-domain emails (2/2 returners) over gmail (0/4)
- Users who performed writes on day 1
- Recency matters — both returners signed up Apr 9 (1 day before window)

**So what:**
1. Re-engage fixfireplace@gmail.com — 113-write power user who churned after Apr 4
2. Convert read-only explorers with contextual write suggestions after 3+ reads
3. Prioritize business-domain onboarding — higher return signal than personal email
4. Keyword management is the killer feature (65% of writes) — surface wasted spend proactively on first login
