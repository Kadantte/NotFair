# Meta App Review — submission copy

Reference for the App Review submission at
<https://developers.facebook.com/apps/2032476734312233/app-review/>

Each permission section below contains:
1. **Description** — paste verbatim into Meta's "Describe how your app uses
   this permission or feature" textarea.
2. **Screencast script** — what to record (~30–60s each). One ~3-minute
   master screencast covering all flows can be re-uploaded across multiple
   permissions; Meta accepts that.

Save each section as you fill it in. **Do not click Submit** until every
section's checkbox is ticked and screencast is uploaded.

---

## Key facts (handy reference)

| | |
|---|---|
| App name | NotFair |
| App ID | 2032476734312233 |
| Public URL | https://www.notfair.co |
| Privacy policy | https://www.notfair.co/privacy |
| Terms of service | https://www.notfair.co/terms |
| Business | Bulkgpt (id 1211081106225236) |
| What it is | AI-agent MCP server that lets users manage their Meta Ads conversationally through Claude, Cursor, and other AI assistants |
| OAuth resource path | `/api/mcp/meta_ads` |
| Token prefix | `oat_meta_ads_` |
| Demo ad account | BulkgptAds (`act_820665925968376`) |
| Demo Page | Oncall247 (id `108561168972321`) |

---

## Scope decision (2026-05-03)

**Scope: campaign-level full life cycle management on the ad account.**
Most Page-level reads and writes (listPageAds, listLeadGenForms,
pausePromotedPost, resumePromotedPost) were cut to shrink the review
surface. Those four tools were deleted from
`lib/mcp/meta-tools/{read,write}-tools.ts` and from the agent prompt.

`pages_show_list` stays in scope: every Meta ad creative requires
`object_story_spec.page_id`, so the agent surfaces the user's Page list
via `listPages` when creating ads. That's a Page *identity* read, not
Page management.

`pages_read_engagement` is **kept** because Meta App Review enforces it
as a mandatory sibling of `ads_management` ("Your submission must
include pages_read_engagement to use ads_management"). The single tool
that exercises it — `getPagePostInsights` — was restored in the second
revision so the permission has a real, narrow use case (paid-vs-organic
comparison on boosted-post ads). It is read-only and returns aggregate
metrics only, never individual user data.

## Current MCP tool surface

After the 2026-05-03 scope cut + the life cycle expansion + the
pages_read_engagement re-add, the Meta Ads MCP exposes 26 tools:

**Read (9) — `ads_read` + `business_management` + `pages_show_list` +
`pages_read_engagement`:**
- `listAdAccounts`, `getAdAccount`
- `listCampaigns`, `listAdSets`, `listAds`
- `getInsights` (performance metrics at any level)
- `runScript` (sandboxed JS with `ads.graph` / `ads.graphParallel` for
  ad-hoc joins and audits)
- `listPages` (Page identity for ad creatives — `pages_show_list`)
- `getPagePostInsights` (aggregate post engagement for boosted-post ads
  — `pages_read_engagement`)

**Write — status (6) — `ads_management`:**
- `pauseCampaign` / `enableCampaign`
- `pauseAdSet` / `enableAdSet`
- `pauseAd` / `enableAd`

**Write — focused edits (4) — `ads_management`:**
- `updateCampaignBudget`, `updateAdSetBudget`
- `renameCampaign`, `renameAd`

**Write — creation (4) — `ads_management`:**
- `createCampaign` (POST /act_{id}/campaigns)
- `createAdSet` (POST /act_{id}/adsets, with full targeting spec)
- `createAdCreative` (POST /act_{id}/adcreatives, requires `page_id`
  surfaced from `listPages`)
- `createAd` (POST /act_{id}/ads, links existing ad set + creative)

**Write — comprehensive updates (3) — `ads_management`:**
- `updateCampaign` (bid_strategy, schedule, special_ad_categories,
  budget, name, status — anything not on the focused tools)
- `updateAdSet` (targeting, optimization_goal, billing_event, bid,
  schedule, budget, promoted_object — anything not on the focused tools)
- `updateAdCreative` (swap creative on an existing ad)

All writes default new entities to `status=PAUSED` and return a
`{ before, after }` snapshot envelope so the agent can confirm the
change before exiting the turn.

## Permissions to keep / drop

**Keep (8 items):**
- ads_management
- Ads Management Standard Access (paired with ads_management)
- ads_read
- business_management
- Business Asset User Profile Access (paired with business_management)
- pages_show_list (Page identity for `object_story_spec.page_id` on new
  ad creatives — *not* Page management)
- pages_read_engagement (**Meta-required** sibling of `ads_management`;
  used by `getPagePostInsights` for paid-vs-organic comparison on
  boosted-post ads)
- public_profile + email (auto-granted, no description needed)

**Drop:**
- catalog_management — only needed for Commerce / Dynamic Product Ads
- pages_manage_ads — Page-level ad-asset management is out of scope;
  the tools that justified it (`listPageAds`, `listLeadGenForms`) have
  been removed

---

## OAuth scope string

When configuring Login for Business (or building any standalone OAuth
URL), request these and only these:

```
ads_management,ads_read,business_management,pages_show_list,pages_read_engagement,public_profile,email
```

Standard Access and Business Asset User Profile Access are *features*
attached to permissions in the App Review UI, not separate OAuth scopes.

---

## Login Configuration

At <https://developers.facebook.com/apps/2032476734312233/create-login-configuration/>:

```
✅ ads_management
✅ ads_read
✅ business_management
✅ pages_show_list
✅ pages_read_engagement   (Meta-required sibling of ads_management)
✅ public_profile          (auto)
✅ email
☐ pages_manage_ads         (drop)
```

If pages_manage_ads is currently ticked, untick it before submitting.
Meta may auto-tick dependencies — let it for the *kept* permissions only.

---

## ads_management

**Description:**

```
NotFair is a Model Context Protocol (MCP) server that lets users manage their
Meta Ads accounts conversationally through AI agents like Claude and Cursor.
After the user OAuths into their Meta account, they ask the agent natural-
language questions like "pause my underperforming campaigns," "increase my
CPC ad set's daily budget by 20%," or "create a new traffic campaign with a
$10/day budget targeting US 25–45." The agent calls our MCP tools, which
then call the Meta Marketing API on the user's behalf.

We use ads_management for the full campaign / ad set / ad life cycle:

  1. Status changes — pauseCampaign, enableCampaign, pauseAdSet, enableAdSet,
     pauseAd, enableAd. POST /{id} with status=PAUSED|ACTIVE.

  2. Budget edits — updateCampaignBudget, updateAdSetBudget. POST /{id}
     with daily_budget or lifetime_budget. (Ad-set budget under CBO is
     handled by falling back to the campaign budget.)

  3. Rename — renameCampaign, renameAd. POST /{id} with name.

  4. Creation — createCampaign (POST /act_{id}/campaigns),
     createAdSet (POST /act_{id}/adsets), createAdCreative
     (POST /act_{id}/adcreatives), createAd (POST /act_{id}/ads). All
     newly created entities default to status=PAUSED so the user reviews
     the change in chat (and in Ads Manager) before launching.

  5. Comprehensive updates — updateCampaign covers bid_strategy,
     start_time/stop_time, special_ad_categories. updateAdSet covers
     targeting (geo / age / gender / interest / placement spec),
     optimization_goal, billing_event, bid_amount/bid_strategy, schedule,
     and Advantage+ promoted_object. updateAdCreative swaps the creative
     on an existing ad to support A/B testing and creative refresh.

We need Advanced Access because our users are managing their own Meta Ads
accounts, not accounts owned by NotFair's developers. Standard Access
blocks campaign creation and most mutations on user-owned accounts (Meta
returns code 100), so the core "create me a new traffic campaign" and
"pause my underperformers" use cases cannot be served without it.

Adds value: lets users run the entire Meta Ads life cycle from a chat
interface instead of clicking through Ads Manager UI. Each write tool
returns a before / after snapshot so the agent can confirm the change
landed, and the user can approve in chat before the next action is taken.

Necessary because: every write tool listed above hits Meta's Marketing
API mutation endpoints (POST against campaigns / adsets / adcreatives /
ads), which require ads_management.
```

**Screencast (90-120s):**

1. (5s) Open Claude with the NotFair MCP server connected
2. (10s) Type: *"List my Meta ad campaigns"* → show `listCampaigns` calling, results
3. (10s) Type: *"Pause the campaign called 'Promoting bulkgpt.ai'"* → show `pauseCampaign` running, response confirming `status: PAUSED`; refresh Ads Manager to verify
4. (10s) Type: *"Re-enable that campaign"* → show `enableCampaign`, response confirming
5. (10s) Type: *"Update its daily budget to $10"* → show `updateCampaignBudget`, response confirming new budget
6. (15s) Type: *"Create a new paused traffic campaign called 'Demo'"* → show `createCampaign` returning a new id; refresh Ads Manager to verify the campaign exists and is paused
7. (15s) Type: *"Add an ad set targeting US 25–45 with a $5/day budget"* → show `createAdSet` running with a targeting spec, returning a new ad-set id
8. (15s) Type: *"Now create the ad creative with my Oncall247 page and link it as a new ad"* → show `listPages` resolving the page id, `createAdCreative` minting a creative, and `createAd` linking creative to ad set; refresh Ads Manager to verify the new ad
9. (10s) Type: *"Change the ad set's optimization goal to LANDING_PAGE_VIEWS"* → show `updateAdSet` mutating optimization_goal, response confirming

---

## Ads Management Standard Access

**Description:** Same use case as `ads_management` — this is the *feature*
that pairs with the permission to upgrade it from Standard → Advanced.
Paste the same description as `ads_management` above.

**Screencast:** Same screencast as `ads_management`. You can upload the
same file.

---

## ads_read

**Description:**

```
NotFair powers the read side of the same conversational Meta Ads management
flow. When a user asks the agent "how is my Black Friday campaign
performing?" or "what's my ROAS this month?" or "audit my account for
wasted spend," the agent calls our read tools (listAdAccounts,
listCampaigns, listAdSets, listAds, getInsights, getAdAccount, runScript)
and returns the answer.

We use ads_read to:
  1. Enumerate the user's connected ad accounts (listAdAccounts).
  2. Read campaign / ad set / ad metadata: name, status, objective, budgets,
     bid strategy, schedule.
  3. Pull performance insights at any aggregation level (account, campaign,
     ad set, ad) over any date range — spend, impressions, clicks, CTR,
     CPM, reach, frequency, actions, ROAS, etc.
  4. Run user-authored JavaScript audits (runScript) that fan out 5-20
     parallel Graph API queries to correlate insights with delivery info,
     creatives, and recent edits in a single pass.

We need Advanced Access so we can pull insights at production scale across
user accounts — Standard Access rate-limits and restricts access to the
developer's own accounts.

Adds value: lets users get instant, structured answers to performance
questions ("which 3 ad sets are wasting the most money?") without manually
building Ads Manager reports.

Necessary because every analytical question the agent fields requires
reading Meta's Ads Insights / Marketing API.
```

**Screencast (~45s):**

1. (5s) Open Claude with the NotFair MCP server connected
2. (15s) Type: *"What's my spend and CTR over the last 30 days?"* → show
   `getInsights` running with `level: account, date_preset: last_30d`, results displayed
3. (15s) Type: *"List my campaigns and their objectives"* → show `listCampaigns`, results
4. (10s) Type: *"Run a quick audit comparing campaign spend to conversions"* → show `runScript` fanning out parallel queries, summary returned

---

## business_management

**Description:**

```
Many of our users have their Meta Ads accounts under a Business Manager
(Meta Business Suite). NotFair uses business_management to enumerate the
user's Business-Manager-owned ad accounts and Pages so the AI agent can
switch between them on request.

We use business_management to:
  1. List ad accounts owned by the user's Business Manager(s) so they
     appear in listAdAccounts (without it, only directly-owned accounts
     are visible — missing every business-managed account).
  2. List Pages owned by the user's Business Manager(s) so they appear in
     listPages alongside directly-managed Pages, giving the agent the full
     set of Pages that can be used as ad creative identity.
  3. Resolve the parent business of an ad account when the user asks
     "which business does this account belong to?".

We do not modify any business settings, billing info, user roles, asset
ownership, or any other business-level configuration. Read access only.

Adds value: lets users manage every account they have access to (not just
directly-owned ones) through one MCP connection. A small agency or in-house
marketer with several business-managed clients sees all of them.

Necessary because Meta routes most professional ad accounts through
Business Manager, so without this permission the agent has visibility into
only a small fraction of the user's actual ad accounts.
```

**Screencast (~30s):**

1. (5s) Open Claude with the NotFair MCP server connected
2. (10s) Type: *"What ad accounts can I manage?"* → show `listAdAccounts` returning multiple accounts, including business-managed ones
3. (15s) Type: *"Switch to the Bulkgpt account and show its campaigns"* → show the agent switching context, then calling `listCampaigns` against the business-managed account

---

## Business Asset User Profile Access

**Description:**

```
NotFair is an AI-agent platform (MCP server) that lets users manage their
Meta Ads conversationally through Claude, Cursor, and other AI assistants.
After a user OAuths into Meta and grants business_management, we need to
read minimal User Fields on the connected identity so we can:

  1. Associate the Meta connection with the correct NotFair account.
     We read `id` (the user's stable Meta user id) at OAuth callback time
     so we can persist the connection in our database keyed to the right
     user. Without this, two users connecting from the same browser
     session would collide.

  2. Confirm the connected identity to the user inside our app. We read
     `name` so the connect-status UI and the AI agent's responses can say
     "Connected as <Name>" — letting the user verify they connected the
     right Meta account before they trust the agent to mutate it.

  3. Map a user across multiple connected Business Managers. When a user
     manages multiple businesses, we use `ids_for_business` (the user's
     business-scoped id) to keep their identity coherent across each
     business's ad accounts and Pages.

What we read (User Fields, all read once at OAuth callback and on
periodic re-validation): `id`, `name`, `ids_for_business`.

What we do NOT read:
  - `picture` (we don't display profile photos anywhere)
  - email or contact info beyond what `email` permission separately covers
  - any per-user Page or post engagement
  - friends / followers / connections lists

Adds value: lets the user verify the connected identity at a glance and
keeps the connection mapping stable across re-auths. Without it, our
"Connected as <name>" affordance disappears and users can't tell which
of their Meta identities is wired up — a dangerous state for a tool that
mutates ad accounts.

Necessary because business_management on its own returns asset metadata
(accounts, businesses, Pages) but does not include the user-side User
Fields. The Business Asset User Profile Access feature is what authorizes
reading `name` and `id` in the business context.
```

**Screencast (~25s):**

1. (5s) Open NotFair connect screen, click "Connect Meta Ads"
2. (10s) Show the OAuth flow with permissions visible — user grants and is
   redirected back
3. (10s) Show the post-OAuth "Connected as Yuting Zhong" confirmation in
   the NotFair UI, then a Claude session where the agent says something
   like "Hi Yuting, your Meta Ads connection is ready" — demonstrating
   `name` is read and surfaced

---

## pages_show_list

**Description:**

```
NotFair is an AI-agent platform that lets users manage their Meta Ads
conversationally through Claude, Cursor, and other AI assistants. When a
user asks the agent to create a new ad — for example, "create a traffic
ad promoting my product page" — the agent must attach a Page identity to
the ad creative, because Meta requires a `page_id` in `object_story_spec`
on every `/act_<id>/adcreatives` POST.

We use pages_show_list for two purposes that match Meta's allowed usage:

  1. Show the user the list of Pages they manage so they can pick which
     Page identity to use when creating an ad. The agent surfaces names +
     IDs so the user can confirm "use my Oncall247 Page" before the ad is
     built.

  2. Verify that the user manages a specific Page before attaching it to
     a new ad creative — preventing the agent from sending a `page_id` the
     user doesn't have rights to, which would cause Meta to reject the
     creative.

We do not read Page content, posts, comments, reactions, insights, or any
engagement data. The only fields we read are `id` and `name` from the
user's Page list.

Adds value: lets users create ads end-to-end via natural-language requests
instead of switching to Ads Manager UI to find their Page ID.

Necessary because `object_story_spec.page_id` is a required field on every
Meta ad creative — without surfacing the user's Page options, the agent
cannot complete a "create an ad" request end-to-end. Without this
permission, users have to manually find their Page ID in Ads Manager and
paste it into the chat, defeating the purpose of conversational ad
management.
```

**Screencast (~30s):**

1. (5s) Open Claude with the NotFair MCP server connected
2. (10s) Type: *"What Facebook Pages can I use for Meta Ads?"*
3. (15s) Show the agent calling `listPages` — display the result with id + name (e.g., Oncall247)

---

## pages_manage_ads — DROPPED (out of scope)

Page-level ad-asset management is out of scope for this submission. The
tools that would have justified this scope (`listPageAds` via
`/{pageId}/ads_posts`, `listLeadGenForms` via `/{pageId}/leadgen_forms`)
have been removed from `lib/mcp/meta-tools/read-tools.ts`. Do not
request `pages_manage_ads` in the App Review form or the Login
Configuration.

---

## pages_read_engagement

> **Why this scope is in scope despite the Page-management cut:** Meta
> App Review enforces `pages_read_engagement` as a mandatory sibling of
> `ads_management` ("Your submission must include pages_read_engagement
> to use ads_management"). The dependency is hardcoded on Meta's side —
> there is no path to ship `ads_management` without it. To satisfy both
> Meta's static dependency check and the App Review usage requirement,
> we re-added a single read-only tool (`getPagePostInsights`) that
> exercises this scope for a narrow, ads-adjacent purpose: comparing a
> boosted post's paid metrics (Ads Insights) against the underlying Page
> post's organic engagement.

**Description:**

```
NotFair is an AI-agent platform (MCP server) that lets advertisers
manage their Meta advertising conversationally through Claude, Cursor,
and other AI assistants. When a user is reviewing a boosted Page post
ad and asks the agent "is this boost amplifying real interest, or am I
just buying impressions on a flat post?", the agent needs to read the
underlying Page post's organic engagement metrics. The standard Ads
Insights API only returns ad-level performance (CPM, CPC, ROAS); the
Page post's organic reach, impressions, and aggregate reaction / like /
comment / share counts require pages_read_engagement.

How we use it. One tool, getPagePostInsights(postId):

  1. Calls /{post_id}/insights for aggregate post_impressions_unique,
     post_impressions_paid_unique, post_impressions_organic_unique,
     post_clicks, and post_reactions_by_type_total.
  2. Calls /{post_id}?fields=likes.summary,comments.summary,shares for
     aggregate like / comment / share counts (never the underlying
     records).
  3. Surfaces those numbers back to the user via the AI agent so they
     can decide whether to keep, pause, or refresh the boost.

What we do NOT read. Individual comment text, individual reactor
identities (PSIDs, names, profile pictures), follower lists, message
threads, or any other per-user data. The tool returns aggregate counts
and Meta's standard insight metrics — exactly the "aggregated and
de-identified or anonymized information" allowed under Meta's stated
policy. We do not write to Page posts; this is read-only.

Why it's necessary. Two reasons:
  1. Meta's review system enforces pages_read_engagement as a
     mandatory sibling of ads_management. Without it, our submission
     cannot be accepted.
  2. The standard Ads Insights API does not expose Page-side organic
     metrics. Without pages_read_engagement, the agent cannot answer
     the most common follow-up question after viewing a boosted post's
     ad performance — "what did the underlying post actually do
     organically?" — and the user has to leave the chat to find that
     data manually.
```

**Screencast (~30s):**

1. (5s) Open Claude with the NotFair MCP server connected
2. (10s) Type: *"How is my boosted post about [topic] performing
   organically vs paid?"*
3. (15s) Show the agent calling `getPagePostInsights` with the
   `<page_id>_<post_id>` id (resolved from the boosted-post ad's
   `creative.effective_object_story_id`), then surfacing aggregate
   impressions / reach / likes / comments / shares alongside the paid
   metrics from `getInsights`.

---

## public_profile / email

No description required (auto-granted). Just tick the compliance checkbox.

---

## Data handling section

Five fields total. Fill them in this order — copy/paste verbatim from the
boxes below where they say "paste this".

### processor-0 — Do you have data processors / service providers?

**Tick: Yes**

Paste this list when prompted (verify each row matches what NotFair actually
uses; replace `Neon` if your Postgres host is different):

```
NotFair uses the following data processors that may receive Platform Data
from Meta:

  • Vercel Inc. — application hosting (Meta API responses are processed in
    serverless functions)
  • Neon, Inc. — Postgres database (stores Meta access tokens, user-account
    mappings, per-tool operation logs)
  • Anthropic, PBC — LLM inference (the AI agent forwards Meta API responses
    into Claude's context to answer the user's questions)
  • PostHog Inc. — product analytics (event metadata; no Meta access tokens
    or PII fields)
  • Stripe Inc. — billing only (does not receive Platform Data)
```

### responsible-1 — Legal entity controlling the data

**Type:** the registered name of the legal entity behind NotFair.

- If incorporated → exact entity name on incorporation paperwork (e.g.
  `NotFair, Inc.`).
- If sole proprietor → personal name (`Yuting Zhong`).

The Meta App is registered under the **NotFair.co business** (id
`1391075768301297`), so use whatever entity name matches that business
record on Meta's side.

### responsible-2 — Country

**Select: United States**

### requests-3 — National security requests in the past 12 months?

**Tick: No**

NotFair has not received or complied with any national-security data
request — true for any pre-launch / early-stage SaaS that hasn't been
served an NSL.

### requests-4 — Policies / processes for handling such requests

**Tick all four of the substantive boxes:**

```
☑ Required review of the legality of these requests.
☑ Provisions for challenging these requests if they are considered unlawful.
☑ Data minimization policy — the ability to disclose the minimum information necessary.
☑ Documentation of these requests, including your responses to the requests
  and the legal reasoning and actors involved.
☐ None of the above.
☐ We are prohibited by law or company policy from answering this question.
```

These are default operating principles for any privacy-conscious SaaS,
even a small one — they're attestations of how NotFair would handle a
request if one came in, not claims of having dealt with one. Ticking
"None of the above" is a major red flag to Meta and will likely cost
the review approval. Don't pick that.

To make these attestations defensible, NotFair maintains a one-page
data-request policy at `docs/data-request-policy.md` covering all four
points (legality review, challenge provisions, minimization, documentation).

---

## Reviewer instructions section

When you reach that part of the submission, paste:

```
Test app: https://www.notfair.co

To test the Meta integration:
  1. Go to https://www.notfair.co and click "Connect Meta Ads"
  2. Sign in with the test user credentials below; complete the OAuth flow
  3. Open Claude Desktop or claude.ai with the NotFair MCP server connected
     (instructions: https://www.notfair.co/setup-meta-ads)
  4. Ask: "list my Meta ad accounts" — verify accounts return (ads_read,
     business_management)
  5. Ask: "list my Meta ad campaigns" — verify results return (ads_read)
  6. Ask: "pause the campaign named [X]" — verify pause in Ads Manager
     (ads_management)
  7. Ask: "re-enable that campaign" — verify enable (ads_management)
  8. Ask: "update its daily budget to $10" — verify new budget
     (ads_management)
  9. Ask: "what Pages can I use for ads?" — verify Page list returns
     (pages_show_list — needed to attach a Page identity to ad creatives)
 10. Ask: "create a paused traffic campaign with $5/day budget" — verify
     the new campaign appears in Ads Manager (paused) (ads_management)
 11. Ask: "add a paused ad set targeting US 25–45 under that campaign" —
     verify a new ad set is created (ads_management)
 12. Ask: "create an ad creative using my [Page name] page linking to
     https://www.example.com" — verify a new creative id is returned
     (ads_management + pages_show_list)
 13. Ask: "create a paused ad in that ad set using the new creative" —
     verify the ad appears in Ads Manager paused (ads_management)
 14. Ask: "change the ad set's optimization goal to LANDING_PAGE_VIEWS"
     — verify the change in Ads Manager (ads_management)
 15. Ask: "how is my boosted post about [topic] performing organically?"
     — verify aggregate impressions / reach / reactions / like-comment-
     share counts return (pages_read_engagement)

Test user credentials:
  Email: <CREATE A META TEST USER VIA APP DASHBOARD → ROLES → TEST USERS>
  Password: <SET WHEN CREATING THE TEST USER>

Notes:
- The test user's account has been pre-attached to at least one Page (for
  ad-creative identity) and one Ad account they can manage.
- All write operations are reversible via the inverse tool (pause↔enable),
  and creates default to status=PAUSED so nothing spends without explicit
  user approval.
- Page-level management (boosted-post pause/resume, Page post insights,
  Page lead-gen forms) is intentionally out of scope for this submission.
```

You'll need to actually create the test user in App Dashboard → Roles → Test
Users and provide working credentials, including an attached test Page +
test Ad account they can manage.

---

## Order of operations

1. **Update Login configuration** at `/create-login-configuration/...` —
   tick the seven in-scope permissions (`ads_management`, `ads_read`,
   `business_management`, `pages_show_list`, `pages_read_engagement`,
   `public_profile`, `email`). Untick `pages_manage_ads` if currently
   ticked.
2. **Edit submission** to drop `catalog_management` and
   `pages_manage_ads` from the requested permissions list. Keep
   `pages_read_engagement` — Meta forces it as a sibling of
   `ads_management`.
3. **Record one master screencast** (~3 min) covering: connect Meta →
   list accounts → list campaigns → pause/enable → budget update →
   list Pages → create new paused campaign → boosted-post organic
   insights via `getPagePostInsights`. Re-upload across permissions
   where possible.
4. For each in-scope permission, click **Get started**, paste the
   description from this doc, upload the screencast, tick the agreement
   checkbox, and click **Save**:
   - ads_management
   - Ads Management Standard Access
   - ads_read
   - business_management
   - Business Asset User Profile Access
   - pages_show_list
   - pages_read_engagement
   - (`public_profile` and `email` are auto-granted; just tick the
     compliance checkbox)
5. Complete the **Data handling** and **Reviewer instructions** sections.
6. Verify all in-scope permissions show the green check.
7. Click **Submit for review**.

Expected Meta turnaround: 5–14 days, often with a back-and-forth round.
