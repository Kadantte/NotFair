---
name: user-outreach
description: "Draft personalized outreach emails to AdsAgent users who connected their Google Ads accounts. Uses real audit data from their accounts to write hyper-relevant emails. Invoke this skill whenever the user wants to email new signups, reach out to connected users, draft onboarding emails, write welcome emails based on account data, or says things like 'email new users', 'reach out to signups', 'draft outreach for connected accounts', 'onboard new users', or 'who haven't I emailed yet'. Also trigger when the user asks to check which users need outreach."
---

# User Outreach: Personalized Emails from Real Audit Data

This skill drafts outreach emails to AdsAgent users who have connected their Google Ads accounts. Unlike cold outreach to strangers, these emails are hyper-relevant because you have access to their actual account data via the adsagent MCP tools.

The goal: make the user feel like a senior Google Ads expert personally reviewed their account and found something worth sharing. Because that's exactly what's happening.

## Tong's Voice

Every email comes from Tong. Here's who he is — use this naturally, not as a template:

- Former Meta data scientist
- Quit to buy a dog daycare in Seattle, now runs 3 locations (pawsvip.com)
- Built AdsAgent because he needed it for his own business
- Manages his own Google Ads — speaks from experience, not theory
- Casual, direct, no fluff. Writes like a founder texting a friend, not a salesperson drafting a pitch.

## Step 1: Find Users Who Need Outreach

First, identify who to email. Two approaches depending on what's available:

**Option A — Check the dev customers list:**
Use the `/api/dev/customers` endpoint or query `mcp_sessions` directly to get all connected users with their `googleEmail` and account IDs.

**Option B — Use adsagent MCP tools:**
Call `listConnectedAccounts` to see available accounts, then `getAccountInfo` for each.

Then cross-reference against sent emails in Gmail:
```
Search Gmail: "in:sent from:tongchen92@gmail.com" 
```
Compare recipient emails against connected user emails. Anyone not in sent = needs outreach.

## Step 2: Pull Account Data

**Critical principle: never write a generic email. If you don't have audit data for an account, trigger an audit first — don't fall back to vague "first 30 days" boilerplate.**

A generic Tier 1 email ("you're just getting started, the first month leaks money on stuff that's easy to fix") is worse than no email. It reads as a mass-mail and burns the relationship. The whole edge of this skill is "senior expert who already looked at *your* account" — without real findings, you don't have that edge. So:

1. Query `audit_snapshots` for every target account (see Source 1 below).
2. If any account is missing a snapshot OR the latest snapshot has `total_spend = 0` and `campaign_count = 0` (meaning the audit ran on an empty account before they had data), **trigger a fresh audit** before drafting:
   ```bash
   bunx tsx scripts/trigger-audits.ts <account_id_1> <account_id_2> ...
   ```
   This script reads credentials from `mcp_sessions`, runs the full Google Ads audit pipeline, and writes a `audit_snapshots` row. Takes ~10-30 sec per account, runs them in series. Run it in the background while you draft the accounts that already have data, then re-query and draft the rest.
3. After the script finishes, re-query `audit_snapshots` for the freshly-audited accounts and draft from real findings.

The only legitimate case for a Tier 1 "raw/empty" email is when the audit itself shows the account is genuinely empty (no campaigns, no spend, no history) — that's a real finding, not an absence of data. Even then, mention something concrete from the audit (e.g., "your campaigns are paused" or "no conversion tracking is set up yet"), not generic "first month" boilerplate.

You have THREE data sources, in priority order:

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

Thanks for signing up for AdsAgent!

I'm Tong, founder — former Meta data scientist, now running a multi-location dog daycare in Seattle.

I took a look at your account and noticed all your campaigns are paused. It looks like you've run them before — were there any issues? Happy to answer any questions.

Let me know if you'd like to walk through it together.

Best,

Tong
```

### Tier 2: Exists But Needs Work
**Signals:** Active campaigns but problems — too many conversion events, no conversion tracking, poor keyword structure, high wasted spend, low quality scores, missing negatives, broad match bleeding money.

**Email approach:**
- Lead with the SPECIFIC finding — the one thing that would make the biggest impact
- Explain WHY it matters (not just what's wrong, but the consequence)
- Show you understand their business context
- Offer to share what you found or help fix it
- Medium length (5-8 sentences). Enough to be credible, not so much they tune out.
- Subject should reference the specific issue + their business name

**Example (Fix Fireplace — conversion tracking mess):**
```
Subject: Fix Fireplace conversion tracking for google ads

Hey there, I built AdsAgent. Saw you connected your account so I took a look.

The biggest thing I noticed: your conversion tracking has too many events firing at once (form submits, page views, button clicks all counted as conversions). Google's bidding algorithm picks one to optimize toward and ignores the rest — so your reported "cost per conversion" is misleading, and the algorithm is probably chasing the wrong action. The fix is picking ONE primary conversion (usually a qualified lead form submit), marking it as primary, and demoting the rest to secondary. That alone usually cleans up CPA reporting and lets Google bid against the action that actually matters to your business.

A bit about me — I was a data scientist at Meta, quit my job and bought a dog daycare in Seattle in 2025, and since then it's grown to 3 locations (pawsvip.com). Almost all my traffic comes from organic and Google Ads, so I've spent a lot of time figuring out what actually moves the needle.

Hope this is useful either way. If you want, I can show you how to fix it inside Claude with the AdsAgent plugin in a few minutes.

Tong
```

**Example (impression analysis — rank-limited account):**
```
Subject: quick thing on your google ads

Hey there,

I'm Tong — built AdsAgent, run a dog daycare in Seattle, manage my own google ads. Took a quick look at your account.

One thing jumped out: you're capturing about 10% of the searches you could show up for. Of the 90% you're missing, only 3% is budget — the other 87% is quality score. So it's not a money problem, it's a relevance problem. Tightening ad copy and landing pages to match your top keywords more directly is usually where the fix lives.

AdsAgent isn't an agency — it turns Claude into your ads manager, so you can ask it to find your weakest keywords and rewrite them on the spot.

Hope that's useful either way.

Tong
```

**Example (Plumbing Army — no conversion tracking):**
```
Subject: Conversion tracking for plumbingarmy

Hey there,

Thanks for signing up for AdsAgent! Quick intro — I'm Tong, the founder. I also run a multi-location dog daycare business here in Seattle, so I know firsthand how important it is to get real leads from Google Ads without overpaying for clicks that go nowhere.

I took a look at your account — your campaigns are still early, and Google Ads is definitely the right channel for plumbing services.

The biggest thing I'd recommend right now: set up conversion tracking. This tells Google which clicks actually turned into real leads, so it can find you more of them. It's the foundation everything else builds on.

Quick note on how AdsAgent works — we're not a traditional agency. We turn Claude into your Google Ads manager. With a Claude subscription, it can audit your account, set up conversions, manage campaigns, and more. AdsAgent itself is free for most users, and based on your current setup, the free tier should cover you easily.

Happy to help you get conversion tracking set up — just let me know.

Tong
```

### Tier 3: Strong Account
**Signals:** Good campaign structure, meaningful spend, reasonable conversion rates, decent impression share (20%+), active management. Audit score 60+.

**Email approach:**
- Compliment first — genuinely. "Top 10%" for 60+, "top 5%" for 70+. Don't be shy.
- Then mention the ONE thing you noticed — but **frame it as a positive opportunity, not a problem to fix**. "86% lost to budget" → "you can probably get more conversions at similar cost if you increase budget", not "you're losing 86% of impressions". Same data, opposite vibe. Congratulatory, not prescriptive.
- Position AdsAgent as "pull stuff like this on demand" — a power tool for someone already doing well, not a fix for someone who's broken.
- Always include cal.com link inline: https://cal.com/tong-chen-uuovdl/30min
- **Subject: keep it boring.** "{business} google ads" beats any clever hook. No em dashes, no "top 10% account", no "one easy unlock". Tong's actual sends use 3-word lowercase subjects like "batchy google ads".

**Example (Batchy — top 5% account, budget-bound — this is Tong's actual send, study it):**
```
Subject: batchy google ads

I'm Tong — built AdsAgent, former Meta data scientist, now running a multi-location dog daycare in Seattle. I do quick reviews of accounts that connected to adsagent, and yours is definitely in the top 5% I've audited.

You seem to be operating in a interesting industry, Your $1.82 CPA is crazy low. Impression-wise, currently you lose out on 86% of impressions due to budget running out, which is not a bad thing at all, It means you can probably get more conversions at similar cost if you decide to increase your budget,

AdsAgent isn't an agency — it turns Claude into your ads manager so you can pull stuff like this on demand and execute fixes or spin up more campaigns with AI in the loop.

Happy to do a quick free 20-min walkthrough if you want to see more things you can do with adsagent or claude integrations: https://cal.com/tong-chen-uuovdl/30min

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

## Step 4: Draft the Email

For each user, compose the email with:

**Subject line rules:**
- Reference their business name or specific issue
- Lowercase is fine, casual
- NOT generic ("welcome to adsagent" is terrible)
- NOT self-referential about tool usage ("you've been busy on adsagent" sounds fake)
- Safe default when unsure: "AdsAgent + {company name}"
- Good: "Figuring out google ads?", "Conversion tracking for {business}", "{name} — your google ads"
- Great: references the specific finding like "Fix {company} conversion tracking for google ads"

**Body rules:**
- Open with something specific to THEIR account. Never generic.
- Include Tong's background naturally — it builds credibility
- Reference specific numbers from the audit (impression share %, number of conversion events, etc.)
- **Deliver the insight in the email itself. Never gate it behind a meeting or reply.** The reader should finish the email knowing what's wrong and roughly how to fix it, even if they never write back.
- Explain AdsAgent's value prop briefly — "not an agency, turns Claude into your ads manager"
- End with a low-friction, non-gated CTA.
- Plain text, no HTML formatting
- Sign off with just "Tong" or "Best,\n\nTong"

**Length and tone — this is the hardest part to get right:**

The email should feel like a friendly note from a fellow operator, not a consulting deliverable. Aim for **150-200 words total**. If you're over 250, you've gone too long — cut.

- **One insight, one sentence of "why it matters", one sentence of "the fix direction".** That's it. Do NOT pull specific keyword names, quality score numbers per keyword, lists of what Google is flagging, or paragraph-length explanations of how ad rank works. The reader does not need a tutorial — they need to feel that someone smart looked at their account and noticed something real.
- **Don't lecture.** If you find yourself explaining a concept ("Google's ad rank is mostly driven by three things..."), you're lecturing. Cut it. Trust the reader to know their own domain or to ask if they're curious.
- **Don't stack details to prove you looked.** One specific number (e.g., "you're capturing about 10% of available searches, and 87% of the misses are quality, not budget") is enough. More numbers = less personable, more sales-deck.
- **No bulleted lists, no sub-points, no headers.** Plain prose paragraphs only. Lists make it feel like a report.
- **2-4 short paragraphs max.** White space matters. A wall of text is the #1 reason people bounce.
- **Read it out loud.** If it sounds like something a friend would text you, ship it. If it sounds like a LinkedIn post or a sales email, rewrite.

**The mental test:** would *you* read this email if a stranger sent it to you? Or would you skim the first paragraph and archive? Optimize for "actually finishes reading."

**Anti-pattern (do not do this):**
> "Let me know if you'd like me to share what I found in your account."

This is bad because it implies the reader has to reply (or worse, book a call) to learn the finding. It feels pushy and salesy, even when written casually. The reader thinks: "if you already found something, why are you making me ask?"

**Better pattern:**
> Share the finding in the email. Then end with something like "Worth a look?" or "If you want, I can walk through how I'd fix this in Claude — otherwise, hope this is useful either way."

The shift is: you've already given them the value. The CTA is optional follow-up, not a paywall.

**What NOT to do:**
- Don't stack multiple findings. Pick the ONE biggest opportunity.
- Don't use marketing language ("revolutionary", "game-changing", "unlock")
- Don't use "wasted spend" or "waste" — it sounds negative and off-putting. Frame things positively (e.g. "room to capture more demand" not "you're wasting money").
- Don't send the same email template with names swapped
- Don't include screenshots unless the finding truly benefits from one
- Don't oversell — if their account is a mess, say so gently. If it's great, say so honestly.
- For strong accounts, use percentile language: "top 10%" or "top 25% of accounts we've audited" — this is more compelling than listing specific metrics. **Score calibration (real distribution from our audits):** 60+ is genuinely very healthy and should be treated as Tier 3 / top 10% — most accounts score in the 30s-50s. 70+ is exceptional / top 5%. 50-59 is Tier 2 (functional but real issues). Below 50 is Tier 2 with clear problems or Tier 1 if empty. Don't undersell a 60+ account by calling it "decent" or "OK" — it's actually strong, lead with that.
- Don't pitch AdsAgent features in a salesy way. The CTA should feel like a genuine offer to help, not a product demo. The formula: [specific value you already delivered] + [soft availability] + [single ask].

**The CTA goal: book a free setup call.** The whole point of outreach is to get them on a quick call where Tong shows them how to use Claude + AdsAgent so they can find issues and have AI fix them on their own. The audit finding in the email is the hook — the call is the conversion. Make the offer concrete, free, and low-commitment, but always offer it.

**Good CTAs (pick one, don't stack). All assume the finding is already in the email:**
- "Happy to hop on a quick call and get you set up — I'll show you how to use Claude + AdsAgent to find stuff like this and have AI fix it for you. Free, takes about 20 min: https://cal.com/tong-chen-uuovdl/30min"
- "If you want, I can walk you through it on a quick free setup call — I'll show you how to use Claude to find issues like this and fix them with AI. https://cal.com/tong-chen-uuovdl/30min"
- "Want me to show you how? I do free 20-min setup calls — you'll leave knowing how to spot stuff like this and have Claude fix it for you. https://cal.com/tong-chen-uuovdl/30min"
- (Tier 3 only, when a finding is borderline) "Open to a 15-min call to walk through what else I noticed? https://cal.com/tong-chen-uuovdl/30min"

The CTA should feel like a friendly offer ("happy to show you how"), not a sales pitch ("book a demo"). Always include the cal.com link inline so it's one click to schedule.

**Bad CTAs (do not use — they gate the insight):**
- "Let me know if you'd like me to share what I found"
- "Happy to walk through what I found if useful"
- "Reply and I'll send over the details"
- Anything that implies the reader has to take an action to learn the thing

**Why this matters:** You've already delivered value (the audit finding) inside the email. That creates natural reciprocity — the reader wants to engage because you gave them something real, not because they're curious what you're hiding. A gated CTA destroys this by making the email feel like bait. The whole skill's edge is "senior expert who already did the work for free." Don't break that.

## Step 5: Create Gmail Draft

Use `gmail_create_draft` to save each email as a draft. This lets Tong review and send from Gmail.

```
to: {user's google email}
subject: {personalized subject}
body: {plain text body}
```

Report to the user:
- How many drafts created
- For each: recipient, subject, tier classification, key finding
- Any accounts you couldn't audit (errors, access issues)

## Batch Processing

When processing multiple users, work through them one at a time since each requires MCP tool calls to audit. For each user:
1. Audit (3-5 MCP calls)
2. Classify tier
3. Draft email
4. Create Gmail draft
5. Report and move to next

Show progress as you go so Tong can course-correct early.
