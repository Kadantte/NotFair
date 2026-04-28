---
name: user-outreach
description: "Draft personalized outreach emails to NotFair users who connected their Google Ads accounts. Uses real audit data from their accounts to write hyper-relevant emails. Supports two modes: cold outreach with a cal.com CTA (for users who signed up but haven't engaged), and warm feedback/sharing outreach (for users already using NotFair — opens a feedback loop instead of pushing a call). Invoke this skill whenever the user wants to email new signups, reach out to connected users, draft onboarding emails, write welcome/thank-you emails, gather product feedback from active users, share account findings, or says things like 'email new users', 'reach out to signups', 'draft outreach for connected accounts', 'gather feedback from users', 'thank users', 'share what I found', 'onboard new users', or 'who haven't I emailed yet'. Also trigger when the user asks to check which users need outreach, or wants to write emails that feel like sharing/feedback rather than pitching."
---

# User Outreach: Personalized Emails from Real Audit Data

This skill drafts outreach emails to NotFair users who have connected their Google Ads accounts. Unlike cold outreach to strangers, these emails are hyper-relevant because you have access to their actual account data via the adsagent MCP tools.

The goal: make the user feel like a senior Google Ads expert personally reviewed their account and found something worth sharing. Because that's exactly what's happening.

## The One Rule That Overrides Everything

**Every email body must be under 100 words.** Subject and signature don't count; everything between "Hey X" and "Tong" does. Count before you ship. If you're at 101, cut a word. If you're at 90, don't pad, send it.

Why this is non-negotiable: the whole pitch of this outreach is "founder noticed something specific about your account and sent you a quick note." A 200-word email breaks that premise, it reads as a pitch deck, not a note. Short emails get read; long ones get archived. Every rule below serves this ceiling.

## Sound Human, Not AI

Two dead giveaways that an email was AI-drafted:

1. **Em dashes (—).** Humans typing fast don't reach for em dashes. They use commas, periods, or parentheses. Never write `—` in the body. Use a comma or a period break instead.
   - Bad: "Real volume — pages load fast"
   - Good: "Real volume, pages load fast" or "Real volume. Pages load fast."

2. **Hedged closes that aren't real questions.** "Curious if this matches what you're seeing" and "mostly sharing as feedback" sound polite but don't *ask* anything, so people don't reply. Every email must end with a single **literal question mark**. It makes replying feel like an answer, not a favor.
   - Bad: "Curious if this matches what you're seeing, or if there's anything I'm missing."
   - Good: "One thing that'd make NotFair more useful for you?"
   - Good: "Any suggestions to make NotFair better?"
   - Good: "What's the biggest thing missing for you?"

Other small things that read human: lowercase "adsagent" sometimes, contractions ("that'd", "thats" without the apostrophe occasionally), starting sentences with "Also" or "Two things.", the occasional comma splice. Don't over-polish.

## Tong's Voice

Every email comes from Tong. Here's who he is — use this naturally, not as a template:

- Former Meta data scientist
- Quit to buy a dog daycare in Seattle, now runs 3 locations (pawsvip.com)
- Built NotFair because he needed it for his own business
- Manages his own Google Ads — speaks from experience, not theory
- Casual, direct, no fluff. Writes like a founder texting a friend, not a salesperson drafting a pitch.

## Pick an Outreach Mode

Before drafting, decide which mode the email is in. Different user, different mode.

### Mode A — Cold Outreach (cal.com CTA)

**Use when:** user signed up, connected their account, but you have no signal they've actually used NotFair (no MCP tool calls, no engagement). The goal is to get them on a 20-min free setup call so Tong can show them Claude + NotFair.

**Close with:** a concrete, low-friction cal.com link inline.

**Existing CTAs below in "Good CTAs" apply here.**

### Mode B — Warm Feedback / Sharing (no hard CTA)

**Use when:** user is actively using the product (tool calls in `mcp_sessions`, you've already emailed them once and want to re-engage, or they're a sophisticated operator / agency that would feel condescended-to by a "free setup call" pitch).

**Differences from Mode A:**
- **Opener thanks them for using NotFair.** "Thanks for using NotFair, really appreciate it" before the finding. This reads as warmth, not flattery, and signals you know they're engaged, not cold.
- **Close asks for product feedback with a direct question.** "One thing that'd make NotFair more useful for you?" or "Any suggestions to make NotFair better?" Forward-framed, ends in a `?`. Do NOT use "rough or missing" style phrasing, it hedges and people skip it.
- **No cal.com link.** Including one in feedback mode breaks the tone, it reads as bait-and-switch.
- **Keep findings direct, not apologetic.** "Two things worth sharing" is fine. Avoid performative phrases like "mostly sharing as feedback" or "I'd guess your team's across this already", they pad word count and signal insecurity.

**Why two modes:** the cal.com CTA is high-leverage for cold users because you're trading a specific finding for a specific next step. For warm users, the same CTA reads as pushy and transactional — they've already raised their hand by using the product, and what you actually want from them is feedback that makes the product better. Asking for the call first skips the relationship.

### How to choose when unclear

- **No MCP tool calls + recent signup** → Mode A (cold).
- **Active MCP usage OR already emailed once** → Mode B (warm).
- **Agency managing multiple accounts** → default to Mode B. Agencies don't want setup calls; they want a peer to compare notes with.
- **Score 70+ account (exceptional)** → Mode B regardless — these people are operators, treat them as peers.

When in doubt, Mode B is the safer choice. You can always follow up with a call offer later; a too-salesy first email can't be undone.

## Step 1: Find Users Who Need Outreach

First, identify who to email. Two approaches depending on what's available:

**Option A — Check the dev customers list:**
Use the `/api/dev/customers` endpoint or query `mcp_sessions` directly to get all connected users with their `googleEmail` and account IDs.

**Option B — Use adsagent MCP tools:**
Call `listConnectedAccounts` to see available accounts, then `getAccountInfo` for each.

Then cross-reference against sent emails — use the `gws` CLI (Google Workspace CLI), not the Gmail MCP. See "Gmail tooling: use `gws`, not the MCP" below for why and the exact commands. Quick version:
```bash
gws gmail users messages list --params '{"userId":"me","maxResults":500,"q":"in:sent from:tongchen92@gmail.com newer_than:90d"}' --format json
```
Pull the `To` headers from each message and compare to the connected user list. Anyone not in sent = needs outreach.

## Step 2: Pull Account Data

**Critical principle: never write a generic email. If you don't have audit data for an account, trigger an audit first — don't fall back to vague "first 30 days" boilerplate.**

A generic Tier 1 email ("you're just getting started, the first month leaks money on stuff that's easy to fix") is worse than no email. It reads as a mass-mail and burns the relationship. The whole edge of this skill is "senior expert who already looked at *your* account" — without real findings, you don't have that edge. So:

1. Query `audit_snapshots` for every target account (see Source 1 below).
2. If any account is missing a snapshot OR the latest snapshot has `total_spend = 0` and `campaign_count = 0` (meaning the audit ran on an empty account before they had data), **trigger a fresh audit** before drafting:
   ```bash
   bunx tsx scripts/trigger-audits.ts <account_id_1> <account_id_2> ...
   ```
   This script reads credentials from `mcp_sessions`, runs the full Google Ads audit pipeline, and writes a `audit_snapshots` row. Takes ~10-30 sec per account, runs them in series.

   **Batch pattern that works well:** kick this off with `run_in_background: true` for all the accounts missing data, and immediately start drafting emails for the accounts that already have audit data. By the time you're done with the first batch, the background audits are usually finished. This parallelism is the difference between a session that takes 10 minutes and one that takes 40.
3. After the script finishes, re-query `audit_snapshots` for the freshly-audited accounts and draft from real findings.
4. **Skip signals from the audit script.** When the script reports any of the following for an account, skip that user — don't draft:
   - `Skipped — no refresh token` (OAuth expired or revoked — can't audit)
   - `ERROR: invalid_grant` (same root cause)
   - `empty account` / `0 campaigns` after a fresh audit (there's genuinely nothing to react to; emailing them would be the generic spam this skill exists to prevent)

   Log these in the final report so Tong knows who was skipped and why.

5. **Only cite numbers you can point at in the audit data.** The Gmail draft creation tool has a content-integrity guard that blocks drafts where specific metrics (quality scores, CTRs, conversion counts, keyword names) appear to be invented. Before writing `QS 3` or `$2.91 CPA` into a draft, make sure that exact value is visible in the `top_actions` / `impression_share_diagnosis` / `topKeywords` fields of the audit row you pulled. If you can't pin the number to real data, either broaden the language ("a very high CTR", "on broad-match generic terms") or drop the number and describe the pattern instead. Pattern-level observations read just as credible and don't trip the guard.

The only legitimate case for a Tier 1 "raw/empty" email is when the audit itself shows the account is genuinely empty (no campaigns, no spend, no history) — that's a real finding, not an absence of data. Even then, mention something concrete from the audit (e.g., "your campaigns are paused" or "no conversion tracking is set up yet"), not generic "first month" boilerplate.

You have THREE data sources, in priority order. Run the SQL queries below against the project Postgres directly — either via the `/api/dev/customers` endpoint (already wraps the DB), via `psql "$DATABASE_URL"`, or by spinning up a small `bunx tsx` script that uses the `postgres` package (see `scripts/trigger-audits.ts` for the existing pattern). Don't reach for a Supabase MCP — direct DB access from a script is faster, paginates correctly, and matches how the audit pipeline already runs.

### Source 1: `audit_snapshots` table (best — has actionable findings)
```sql
SELECT account_id, overall_score, category, waste_rate, demand_captured,
  cpa, wasted_spend, total_spend, campaign_count, top_actions, created_at
FROM audit_snapshots WHERE account_id = '{id}' ORDER BY created_at DESC LIMIT 1
```
Fields: `overall_score` (0-100), `category` (OK/Good/etc), `waste_rate`, `demand_captured` (impression share %), `cpa`, `wasted_spend`, `total_spend`, `campaign_count`, and critically `top_actions` — a JSON array of specific recommended actions with impact estimates. This is gold for personalization.

### Source 2: `performance_snapshots` table (good — has real metrics)
```sql
SELECT account_id, count(distinct campaign_id) as campaigns,
  sum(impressions) as impressions, sum(clicks) as clicks,
  sum(cost_micros)/1000000.0 as spend, sum(conversions) as conversions,
  CASE WHEN sum(conversions)>0 THEN sum(cost_micros)/1000000.0/sum(conversions) END as cpa,
  CASE WHEN sum(impressions)>0 THEN round(sum(clicks)::numeric/sum(impressions)*100,2) END as ctr
FROM performance_snapshots WHERE account_id = '{id}' GROUP BY account_id
```
This gives you real impressions, clicks, CTR, spend, conversions, and CPA.

### Source 3: `accounts` table (basic — just budget/campaign counts)
```sql
SELECT daily_budget, active_campaigns, currency_code FROM accounts WHERE account_id = '{id}'
```

### Source 4: adsagent MCP tools (only works for Tong's connected accounts)
Use `listCampaigns`, `getCampaignPerformance`, `getConversionActions`, `getImpressionShare`, `getKeywords` — but these only work for accounts in the current session. For other users' accounts, rely on the database tables above.

### What to look for
Pick the ONE finding that matters most. Don't stack multiple issues. Key signals:
- **0 conversions with real spend** → conversion tracking is the problem
- **Very low CTR (<1%)** → ad copy or keyword relevance issue
- **High CPA** → spend going to the wrong keywords
- **0 spend / 0 impressions** → account is dormant, offer setup help
- **High % lost to rank in impression analysis** → quality score / ad relevance is the bottleneck (see below)
- **High % lost to budget in impression analysis** → demand exists, budget is the cap
- **Good metrics** → compliment them genuinely, then suggest the next level

### Impression analysis is the killer angle

Most advertisers genuinely don't understand impression share. They see "10% captured, 87% lost to rank" and have no idea what it means or what to do about it. This is a perfect insight to lead with because:

- It's specific and quantitative ("you're capturing 10% of available demand")
- It diagnoses the actual root cause ("87% of the missed impressions are because Google doesn't think your ads are relevant enough, not because you ran out of budget")
- It points at a fix the user wouldn't have figured out on their own (improve quality score, not just raise bids)

**How to read the numbers** (from `impression_share_diagnosis` JSON or the dev page Impression Analysis card):
- **`captured` (search_impression_share)** — the % of available impressions you actually got
- **`lostToBudget` (search_budget_lost_is)** — % missed because budget ran out → fix = raise budget, but only if conversions are good
- **`lostToRank` (search_rank_lost_is)** — % missed because Google deprioritized your ad → fix = quality score (ad relevance, expected CTR, landing page experience)

**How to translate it for the user** (don't use jargon):
- Don't say: "Your search rank IS is 0.87"
- Do say: "You're capturing about 10% of the searches you could be showing up for, and 87% of those misses are because Google isn't ranking your ads high enough, not because you're out of budget. That points at quality score: ad relevance, landing page, and expected click-through rate."

**Why this is good outreach material**: it's a finding the user almost certainly hasn't seen, framed in plain English, with a concrete direction. That's the whole package.

### Quality Score is the other killer angle

Quality Score is the single most-underused lever in Google Ads. Advertisers either don't know it exists, assume it's a black box they can't influence, or conflate it with bid. In reality it's the direct output of three inputs that are all actionable:

- **Ad relevance** — does the keyword actually appear in the headline/description, and does the ad promise what the search implies? The fastest fix is grouping keywords by theme and writing ad copy that matches each theme literally.
- **Expected CTR** — Google's estimate of how often your ad gets clicked vs. others at the same position. Driven by historical CTR of the keyword in your account + ad strength. The fix is usually to prune low-CTR keywords (or add negatives to filter wrong-intent traffic that drags CTR down) and write more compelling copy for the winners.
- **Landing page experience** — mobile speed, HTTPS, content match, and crucially, whether the page has a form / CTA that matches the search intent. The audit pipeline flags "0 pages with forms" as a common offender — if someone searches "hmo consultant" and lands on a homepage without a contact form, LPX tanks.

**When to lead with QS over impression share**: if the audit shows QS 1–3 on the highest-spend keywords, or "Creative Quality: BELOW_AVERAGE" / "Post-Click Quality: BELOW_AVERAGE" on winning terms, QS is the tighter lead. Impression-share framing is about "how much demand you're capturing." Quality-score framing is about "why Google is ranking your ads below where they should be." Same underlying problem, but QS gives the reader concrete next steps (write better copy, add forms, add negatives) instead of the vaguer "improve ad relevance."

**Example QS framing** (from a real send):

> "Quality score is the main ceiling. Your key phrase terms are sitting at QS 2–3, which is what's driving the lost-to-rank number. The three QS levers are ad relevance, expected CTR, and landing page experience. Practically: tighten ad copy to match each keyword theme more literally, get lead-capture forms on the landing pages (the audit flagged 0/9 pages with forms), and add negatives for the wrong-intent traffic dragging CTR down."

Three concrete actions, one per lever. Not a tutorial — a punch list.

### Name the *consequence*, not the *metric*

Most people don't know what "QS 2" means. Saying "your keywords have quality score 2 to 3" sounds like a diagnostic number — they can't tell if that's good or bad, and won't bother looking it up. Always translate the metric into **what it's costing them** in plain English. That's what makes the finding land.

**Translation cheat sheet:**

| Metric | Don't say | Say instead |
|---|---|---|
| Quality score 1–3 | "QS is 2" | "Google charges you more per click and shows your ads less often" |
| Low impression share (budget-limited) | "IS at 14%, 86% lost to budget" | "you're only showing up for 14% of relevant searches, mostly because budget runs out" |
| Low impression share (rank-limited) | "87% lost to rank" | "Google isn't ranking your ads high enough to show them as often as they could" |
| No conversion tracking | "no conversions imported" | "Google has no idea which clicks turn into leads, so it can't find you more of them" |
| Multiple primary conversions | "3 primary conversion actions" | "your reported CPA mixes 3 different events, so the number is misleading and bidding chases the wrong one" |
| High CPC on brand | "brand CPC $4" | "you're paying $4/click for people already searching your name — that's usually free traffic" |

**Rule of thumb:** every number should be followed by "which means…" in plain English. If the reader has to know Google Ads jargon to understand why it matters, rewrite.

## Step 3: Classify the Account

Based on the audit, classify into one of three tiers:

### Tier 1: Raw / Empty
**Signals:** All campaigns paused, no active spend, no conversion tracking, brand new account, or only Smart Campaigns with no manual setup.

**Email approach:**
- Empathetic, not salesy. They might be overwhelmed or had a bad experience.
- Offer free setup help — "happy to walk through it together"
- Ask what happened — "were there any issues?"
- Keep it SHORT (3-5 sentences). Don't overwhelm someone who's already overwhelmed.
- Subject should reference their situation gently

**Example (Luke — all paused):**
```
Subject: Figuring out google ads?

Hey Luke,

Thanks for signing up for NotFair!

I'm Tong, founder — former Meta data scientist, now running a multi-location dog daycare in Seattle.

I took a look at your account and noticed all your campaigns are paused. It looks like you've run them before — were there any issues? Happy to answer any questions.

Let me know if you'd like to walk through it together.

Best,

Tong
```

### Tier 2: Exists But Needs Work
**Signals:** Active campaigns but problems — too many conversion events, no conversion tracking, poor keyword structure, high wasted spend, low quality scores, missing negatives, broad match bleeding money.

**Email approach:**
- **Open with what's working well first.** Every functional account has at least one thing done right: tight campaign structure, clear niche focus, low waste rate, strong brand QS, real conversion volume at reasonable CPA, disciplined budget control, a winning exact-match keyword. Find it and open with it — "the account's working" / "you've kept the account tight" / "real conversions coming through at reasonable CPAs". This is not flattery; it's accurate observation, and it makes the criticism that follows land as a peer's advice rather than a consultant's audit. Without it, the email reads as "here's what's broken," which makes the reader defensive.
- Then lead with the SPECIFIC finding — the one thing (or at most two) that would make the biggest impact. Explain WHY it matters (not just what's wrong, but the consequence).
- Show you understand their business context.
- Offer to share what you found or help fix it (Mode A) or invite feedback (Mode B).
- Medium length (5-8 sentences). Enough to be credible, not so much they tune out.
- Subject should reference the specific issue + their business name.

**Example (Fix Fireplace — conversion tracking mess):**
```
Subject: Fix Fireplace conversion tracking for google ads

Hey there, I built NotFair. Saw you connected your account so I took a look.

The biggest thing I noticed: your conversion tracking has too many events firing at once (form submits, page views, button clicks all counted as conversions). Google's bidding algorithm picks one to optimize toward and ignores the rest — so your reported "cost per conversion" is misleading, and the algorithm is probably chasing the wrong action. The fix is picking ONE primary conversion (usually a qualified lead form submit), marking it as primary, and demoting the rest to secondary. That alone usually cleans up CPA reporting and lets Google bid against the action that actually matters to your business.

A bit about me — I was a data scientist at Meta, quit my job and bought a dog daycare in Seattle in 2025, and since then it's grown to 3 locations (pawsvip.com). Almost all my traffic comes from organic and Google Ads, so I've spent a lot of time figuring out what actually moves the needle.

Hope this is useful either way. If you want, I can show you how to fix it inside Claude with the NotFair plugin in a few minutes.

Tong
```

**Example (impression analysis — rank-limited account):**
```
Subject: quick thing on your google ads

Hey there,

I'm Tong — built NotFair, run a dog daycare in Seattle, manage my own google ads. Took a quick look at your account.

One thing jumped out: you're capturing about 10% of the searches you could show up for. Of the 90% you're missing, only 3% is budget — the other 87% is quality score. So it's not a money problem, it's a relevance problem. Tightening ad copy and landing pages to match your top keywords more directly is usually where the fix lives.

NotFair isn't an agency — it turns Claude into your ads manager, so you can ask it to find your weakest keywords and rewrite them on the spot.

Hope that's useful either way.

Tong
```

**Example (Plumbing Army — no conversion tracking):**
```
Subject: Conversion tracking for plumbingarmy

Hey there,

Thanks for signing up for NotFair! Quick intro — I'm Tong, the founder. I also run a multi-location dog daycare business here in Seattle, so I know firsthand how important it is to get real leads from Google Ads without overpaying for clicks that go nowhere.

I took a look at your account — your campaigns are still early, and Google Ads is definitely the right channel for plumbing services.

The biggest thing I'd recommend right now: set up conversion tracking. This tells Google which clicks actually turned into real leads, so it can find you more of them. It's the foundation everything else builds on.

Quick note on how NotFair works — we're not a traditional agency. We turn Claude into your Google Ads manager. With a Claude subscription, it can audit your account, set up conversions, manage campaigns, and more. NotFair itself is free for most users, and based on your current setup, the free tier should cover you easily.

Happy to help you get conversion tracking set up — just let me know.

Tong
```

### Tier 3: Strong Account
**Signals:** Good campaign structure, meaningful spend, reasonable conversion rates, decent impression share (20%+), active management. Audit score 60+.

**Email approach:**
- Compliment first — genuinely. "Top 10%" for 60+, "top 5%" for 70+. Don't be shy.
- Then mention the ONE thing you noticed — but **frame it as a positive opportunity, not a problem to fix**. "86% lost to budget" → "you can probably get more conversions at similar cost if you increase budget", not "you're losing 86% of impressions". Same data, opposite vibe. Congratulatory, not prescriptive.
- Position NotFair as "pull stuff like this on demand" — a power tool for someone already doing well, not a fix for someone who's broken.
- Always include cal.com link inline: https://cal.com/tong-chen-uuovdl/30min
- **Subject: keep it boring.** "{business} google ads" beats any clever hook. No em dashes, no "top 10% account", no "one easy unlock". Tong's actual sends use 3-word lowercase subjects like "batchy google ads".

**Example (Batchy — top 5% account, budget-bound — 78 words, under the 100-word ceiling):**
```
Subject: batchy google ads

I'm Tong — built NotFair, run a dog daycare in Seattle. Yours is top 5% of accounts I've reviewed.

$1.82 CPA is crazy low. You're losing 86% of impressions to budget — not a bad thing. It means you can likely get a lot more conversions at similar CPA by raising the budget.

NotFair turns Claude into your ads manager, so you can pull stuff like this on demand.

Happy to do a quick free 20-min walkthrough: https://cal.com/tong-chen-uuovdl/30min

Tong
```

**What makes this work (and what I kept getting wrong):**
- **No greeting.** Just dive in with "I'm Tong". "Hey {name}" is fine but optional.
- **Curiosity beats authority.** "You seem to be operating in a interesting industry" lands better than "I noticed your campaigns are well-structured". Be a curious peer, not a consultant grading their work.
- **Reframe "problems" as good news.** The 86% budget-lost stat is *flattering* in this framing. Anywhere you'd say "you're losing X" or "X is bleeding", flip it to "you can capture more by Y". Tier 3 emails should never make the reader feel called out.
- **One real number, then stop.** "$1.82 CPA" and "86%" — that's it. Don't project "+160 conversions/month" or stack 4 keywords with their CPAs. Made-up precision kills trust; one real stat builds it.
- **Casual punctuation is a feature, not a bug.** "a interesting industry,", "$1.82 CPA is crazy low.  Impression-wise" — the slight roughness reads as a real human typing fast. Polished prose reads as ChatGPT.
- **Loose register.** "crazy low", "pull stuff like this on demand", "spin up more campaigns" — operator-speak, not deck-speak.
- **CTA is direct and singular.** "Happy to do a quick free 20-min walkthrough… {link}". Doesn't ask permission, doesn't soft-pedal, doesn't say "if you're interested". Just makes the offer.
- **Sign-off: "Tong". No "Best,". No "Cheers,".** Period.

### Agency Detection & Framing

Agencies need a different voice than business owners. They already know what ad rank is, what impression share means, how Smart Bidding works. Explaining those concepts reads as condescending and gets the email archived. Instead, talk to them as a peer comparing notes across portfolios.

**How to detect an agency:**

1. **Email domain looks like an agency.** Signals include: "marketing", "digital", "agency", "agencie", "media", "creative", "consult" in the domain. Known agency domains Tong has seen: `digital-mastermind.com`, `mintdigital.au`, `thankduck.au`, `localwebadvisors.com.au`, `sherpamarketing.ch`, `mbdigital.co.za`, `cheshirecatmarketing.co.uk`, `goyalmarketing.com`, `baldwinson.com`, `proconsult.rs`, `creativeweb360.com`, `alta-agentie.ro`. This list is not exhaustive — trust the pattern, not the enumeration.
2. **User has connected 3+ accounts with different brand names.** One person with Heylife + Allcook Kitchen + Fit 'n' Tasty + HEYLIFE.COM is almost certainly an agency or a holding-company marketer, not a single business owner with four brands.
3. **Account names look like managed portfolios.** "DP - GADS - SRCH - USA_CA - Brand" naming conventions, heavy use of brand/gen/market suffixes, consistent tagging across campaigns — these are agency-style operational habits.

**Agency framing differences:**
- **No explaining basics.** Don't define quality score, impression share, or match types. They know. Jump to the pattern.
- **Talk in portfolio terms.** "One pattern jumped out across all four accounts" / "curious if this matches what you're seeing client-side" / "agency-side feedback" — signal you understand they manage multiple brands.
- **Default to Mode B (warm/feedback).** Agencies never convert on a setup call pitch — they'd be insulted. The feedback/peer frame is much stronger.
- **Acknowledge their expertise.** "I'd guess your team's across this already, but…" is not hedging; it's respect. It positions the email as cross-pollination between operators, not an audit.

**Example (Nicole — agency managing 4 brands across CH/DE/FR):**

> "Saw you connected four accounts (Heylife, Allcook, Fit 'n' Tasty, HEYLIFE.COM) so I took a look across them. One pattern jumped out across all four: rank-limited losses everywhere — Allcook at 86% lost to rank, Fit 'n' Tasty at 77%… Mostly sharing this as agency-side feedback since I imagine you're already across it — curious if the pattern matches what you're seeing, or if there's something about the vertical I'm missing."

Notice: no QS explainer, no "here's how ad rank works", no cal.com. Just pattern + peer-to-peer ask.

### Multi-brand same person

Some people manage multiple agencies and have different domain emails for each (e.g. tanaka@mintdigital.au, tanaka@localwebadvisors.com.au, tanaka@thankduck.au — same human). Before drafting a new email to one of these addresses, search Gmail sent for any of the person's other addresses. If you've emailed them before at a different brand, acknowledge it in the new email:

> "I've pinged your other agency addresses before on different accounts — apologies for the dupes, same reviewer."

Without this acknowledgment, it reads as spammy coincidence. With it, it reads as "this person is paying attention." Same content, opposite impression.

How to detect: same first-name token in the email's local part + different domains all recognizable as agencies. When in doubt, err on the side of acknowledging — a false-positive acknowledgment is harmless; a false-negative dupe is irritating.

## Step 4: Draft the Email

For each user, compose the email with:

**Subject line rules:**
- Reference their business name or specific issue
- Lowercase is fine, casual
- NOT generic ("welcome to adsagent" is terrible)
- NOT self-referential about tool usage ("you've been busy on adsagent" sounds fake)
- Safe default when unsure: "NotFair + {company name}"
- Good: "Figuring out google ads?", "Conversion tracking for {business}", "{name} — your google ads"
- Great: references the specific finding like "Fix {company} conversion tracking for google ads"

**Body rules:**
- Open with something specific to THEIR account. Never generic.
- Include Tong's background naturally — it builds credibility
- Reference specific numbers from the audit (impression share %, number of conversion events, etc.)
- **Deliver the insight in the email itself. Never gate it behind a meeting or reply.** The reader should finish the email knowing what's wrong and roughly how to fix it, even if they never write back.
- Explain NotFair's value prop briefly — "not an agency, turns Claude into your ads manager"
- End with a low-friction, non-gated CTA.
- Plain text, no HTML formatting
- Sign off with just "Tong" or "Best,\n\nTong"

**Length and tone — this is the hardest part to get right:**

**STRICT WORD LIMIT: under 100 words total (body only, excluding subject and signature).** This is non-negotiable. Count the words before sending. If you're at 110, cut. If you're at 90, ship. The reason: founder-to-operator notes that get read are short. The moment an email looks like it'll take more than 20 seconds to read, people archive. Every sentence has to earn its place.

How to hit <100 words:
- **One insight. One number. One next step.** That's the whole email. No "why it matters" paragraph, no "here's how it works" explainer, no three-sentence intro about who Tong is (one short clause is enough — "I'm Tong, built NotFair").
- **Cut any sentence that doesn't contain a specific fact about their account or a concrete offer.** Filler like "hope this is useful either way" is fine as a closer but shouldn't appear mid-email.
- **Merge sentences.** "You're capturing 10% of searches. 87% of the misses are quality score, not budget." → "You're capturing ~10% of searches — 87% of the misses are quality score, not budget."
- **Delete the credentials paragraph if tight on budget.** "Former Meta data scientist, runs a dog daycare" is nice but optional. The finding is the credential.
- **No bulleted lists, no sub-points, no headers.** Plain prose paragraphs only.
- **2-3 short paragraphs max.** White space matters.
- **Read it out loud.** If it sounds like a friend texting you, ship it. If it sounds like a LinkedIn post or sales email, rewrite.

Examples of word counts that work: the trimmed Batchy example in this doc is 78 words. That's the target zone (70–95). Anything over 100 needs to justify every extra word — and almost always can't.

**How to check before shipping:** paste the body (no subject, no signature) into a word counter. If it's over 100, find the longest sentence and cut it or split it. Ask: "does this sentence contain a number from their account or a concrete offer?" If no, it's filler.

**The mental test:** would *you* read this email if a stranger sent it to you? Or would you skim the first paragraph and archive? Optimize for "actually finishes reading."

**Anti-pattern (do not do this):**
> "Let me know if you'd like me to share what I found in your account."

This is bad because it implies the reader has to reply (or worse, book a call) to learn the finding. It feels pushy and salesy, even when written casually. The reader thinks: "if you already found something, why are you making me ask?"

**Better pattern:**
> Share the finding in the email. Then end with something like "Worth a look?" or "If you want, I can walk through how I'd fix this in Claude — otherwise, hope this is useful either way."

The shift is: you've already given them the value. The CTA is optional follow-up, not a paywall.

**What NOT to do:**
- Don't stack 3+ findings. **At most two improvements — ideally one.** If you include two, at least one should be quality score when QS is clearly the bottleneck (QS 1–3 on high-spend keywords, "BELOW_AVERAGE" creative/post-click flags, high lost-to-rank %). The second finding, if included, should be a cleanly-separable pattern (not a variation of the first). Three findings stacked reads as an audit report; two reads as a curated observation; one reads as a friend pointing at the thing they noticed.
- Don't use marketing language ("revolutionary", "game-changing", "unlock")
- Don't use "wasted spend" or "waste" — it sounds negative and off-putting. Frame things positively (e.g. "room to capture more demand" not "you're wasting money").
- Don't send the same email template with names swapped
- Don't include screenshots unless the finding truly benefits from one
- Don't oversell — if their account is a mess, say so gently. If it's great, say so honestly.
- For strong accounts, use percentile language: "top 10%" or "top 25% of accounts we've audited" — this is more compelling than listing specific metrics. **Score calibration (real distribution from our audits):** 60+ is genuinely very healthy and should be treated as Tier 3 / top 10% — most accounts score in the 30s-50s. 70+ is exceptional / top 5%. 50-59 is Tier 2 (functional but real issues). Below 50 is Tier 2 with clear problems or Tier 1 if empty. Don't undersell a 60+ account by calling it "decent" or "OK" — it's actually strong, lead with that.
- Don't pitch NotFair features in a salesy way. The CTA should feel like a genuine offer to help, not a product demo. The formula: [specific value you already delivered] + [soft availability] + [single ask].

**The CTA depends on the mode you picked.** Mode A (cold) optimizes for the cal.com call; Mode B (warm feedback) optimizes for a product-feedback reply. Never stack both.

**The Mode A goal: book a free setup call.** For cold users, the point of outreach is to get them on a quick call where Tong shows them how to use Claude + NotFair so they can find issues and have AI fix them on their own. The audit finding in the email is the hook — the call is the conversion. Make the offer concrete, free, and low-commitment.

**The Mode B goal: get them talking.** For warm users (active MCP usage, agencies, sophisticated operators, Tier 3 exceptional accounts, or follow-up contacts), the point is to deepen the relationship and extract product feedback. The audit finding is the gift; the ask is "what's rough about NotFair?" Any response — positive, negative, or a random feature request — is the win.

**Good Mode A CTAs (pick one, don't stack). All assume the finding is already in the email:**
- "Happy to hop on a quick call and get you set up — I'll show you how to use Claude + NotFair to find stuff like this and have AI fix it for you. Free, takes about 20 min: https://cal.com/tong-chen-uuovdl/30min"
- "If you want, I can walk you through it on a quick free setup call — I'll show you how to use Claude to find issues like this and fix them with AI. https://cal.com/tong-chen-uuovdl/30min"
- "Want me to show you how? I do free 20-min setup calls — you'll leave knowing how to spot stuff like this and have Claude fix it for you. https://cal.com/tong-chen-uuovdl/30min"
- (Tier 3 only, when a finding is borderline) "Open to a 15-min call to walk through what else I noticed? https://cal.com/tong-chen-uuovdl/30min"

The Mode A CTA should feel like a friendly offer ("happy to show you how"), not a sales pitch ("book a demo"). Always include the cal.com link inline so it's one click to schedule.

**Good Mode B closes (pick one, don't stack). Every close ends with a literal `?`. No cal.com link in Mode B:**
- "One thing that'd make NotFair more useful for you?" (strongest default, single concrete ask, forward-framed)
- "Any suggestions to make NotFair better?"
- "What's the biggest thing missing for you?"
- "One thing you'd add or fix?"
- (Agency) "One thing NotFair could do to make managing multiple accounts easier?" (agency-flavored, still a product-feedback ask)
- (Agency) "What's the biggest pain in managing these accounts right now?" (surfaces a pain we could solve)

Avoid hedged non-questions: "rough or missing", "curious if this matches what you're seeing", "I'd guess your team's across this already", "does this pattern hold across your portfolio?" All of these are polite-but-skippable. The last one especially: it asks the reader to mentally review their portfolio and agree/disagree with an observation *I* made, which is real work and yields zero product signal. Stay focused on NotFair itself, that's what we actually want feedback on.

The Mode B close should leave the reader with a low-cost reply option: one specific improvement idea. Any answer is a win. The worst outcome is no response, and hedged non-questions are what make "no response" the default.

**Good-question test (apply before shipping):**
1. Can a busy reader answer it in 5-10 seconds with a single thought? If it requires recalling data or scanning their portfolio first, rewrite.
2. Does the answer give us product signal about NotFair? If the best possible answer is "yes" / "no" / "interesting observation", you're asking the wrong thing.
3. Is the subject of the question *them and their needs*, or *me and my observation*? The former gets replies. The latter flatters you and gets archived.

**Why no cal.com in Mode B:** when someone is already using the product, the biggest risk isn't that they don't schedule a call — it's that they churn silently because the product fell short somewhere and they never told you. A product-feedback ask opens that channel; a setup-call CTA closes it by signaling "I want something from you" rather than "I want to hear from you." Don't mix these signals.

**Bad CTAs (do not use — they gate the insight):**
- "Let me know if you'd like me to share what I found"
- "Happy to walk through what I found if useful"
- "Reply and I'll send over the details"
- Anything that implies the reader has to take an action to learn the thing

**Why this matters:** You've already delivered value (the audit finding) inside the email. That creates natural reciprocity — the reader wants to engage because you gave them something real, not because they're curious what you're hiding. A gated CTA destroys this by making the email feel like bait. The whole skill's edge is "senior expert who already did the work for free." Don't break that.

## Step 5: Create Gmail Draft

Create the draft via the `gws` CLI (Google Workspace CLI), not the Gmail MCP. The MCP has hit two bugs in real sends that wasted significant cleanup time:

- **Pagination silently drops drafts.** `list_drafts` returns ~17 per page; if you're working through a batch of 30 you'll think you covered everyone but miss half. `gws` reliably returns 100/page and supports follow-up paging.
- **MCP-created drafts get auto-merged into existing threads with the same recipient.** When you later delete the *original* draft in that thread, Gmail also drops the new one — so the recipient ends up with zero drafts and you don't notice until verification. With `gws` you control the request payload and can omit `threadId` to force a new thread.

Also, the MCP has no update or delete; `gws` has both, which is what you need when revising drafts in place instead of the create-new-then-delete-old dance.

### Create a draft

The Gmail API takes a base64-url-encoded RFC 2822 message in `message.raw`. Build it once and pipe through `base64`:

```bash
RAW=$(printf 'To: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s' \
  "user@example.com" "Subject line" "Body line 1.\r\n\r\nBody line 2." | base64)
gws gmail users drafts create \
  --params '{"userId":"me"}' \
  --json "{\"message\":{\"raw\":\"$RAW\"}}" \
  --format json
```

The response has `id` (the draft id, used for update/delete) and `message.threadId` (the thread it landed in).

For batches, write a small shell loop or python script that reads (recipient, subject, body) tuples from a file and calls `gws` for each. Don't hand-write 20 separate `gws` invocations.

### Update an existing draft (preferred over delete-then-recreate)

If you need to revise wording across many drafts, update them in place. This avoids the "new draft swept along when old draft deleted" footgun entirely:

```bash
gws gmail users drafts update \
  --params '{"userId":"me","id":"r5188422268195332473"}' \
  --json "{\"message\":{\"raw\":\"$NEW_RAW\"}}" \
  --format json
```

### List drafts (with full pagination)

```bash
gws gmail users drafts list \
  --params '{"userId":"me","maxResults":100,"q":"newer_than:7d"}' \
  --format json
```

Use the `q` parameter for Gmail-search-style filtering (e.g. `to:foo@bar.com`, `subject:"specific phrase"`, `newer_than:7d`). For more than 100 drafts, follow `nextPageToken`.

### Delete a draft (only when revising via update isn't possible)

```bash
gws gmail users drafts delete --params '{"userId":"me","id":"<draftId>"}'
```

Note Gmail-side behavior: when a draft is the only message in its thread, deleting it removes the thread. Any *other* drafts that Gmail merged into that same thread (e.g. a new draft to the same recipient created via the MCP) will disappear too. If you must delete originals, verify each replacement still exists by querying `to:<recipient> newer_than:1d` after the deletes.

### Why not the Gmail MCP

Concrete failure modes hit during a real outreach revision (Apr 2026):

1. MCP `list_drafts` returned 17/30 drafts in the same time window with `pageSize:50`. The other 13 only surfaced via `gws gmail users drafts list` with `maxResults:100`. If we'd shipped based on the MCP's view we would have rewritten 17 drafts and silently left 13 with the old phrasing.
2. MCP `create_draft` for recipients who already had a draft caused Gmail to auto-bundle the new draft into the same thread. Deleting the original later removed both.
3. MCP exposes no update/delete, forcing a create-new-then-delete-old pattern which is exactly what trips footgun #2.

`gws` doesn't fix #2 by itself (Gmail's threading is server-side), but combined with `update` instead of `delete+create`, the bug becomes unreachable.

### Report to the user

- How many drafts created (and verified by recipient lookup, not just creation-call count)
- For each: recipient, subject, tier classification, key finding
- Any accounts you couldn't audit (errors, access issues)
- Any drafts that needed re-creation after a thread-collision delete

## Batch Processing

When processing multiple users, work through them one at a time since each requires MCP tool calls to audit. For each user:
1. Audit (3-5 MCP calls)
2. Classify tier
3. Draft email
4. Create Gmail draft
5. Report and move to next

Show progress as you go so Tong can course-correct early.
