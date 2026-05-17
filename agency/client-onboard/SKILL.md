---
name: toprank-client-onboard
description: >
  Register a new client (or update an existing one) in Toprank's agency client
  registry at ~/.toprank/clients/. Captures client name, website URL, Google
  Search Console property, Google Ads account ID, Meta Ads account ID, brand
  terms, and primary goal with KPI. Run this before any other Toprank skill when
  managing work for a specific client. Trigger on: "add a client", "onboard a
  client", "set up a client", "new client", "manage clients", "agency setup",
  "client list", "which clients do I have", "register a client".
argument-hint: "<client name or URL, e.g. 'Acme Corp' or 'https://acme.com'>"
---

# Toprank Client Onboard

You are setting up or updating a client record in the Toprank agency registry.
The registry lives at `~/.toprank/clients/` and is host-agnostic — it works on
Claude Code, Codex, Hermes, OpenClaw, and any other AI coding agent.

Each client gets a folder: `~/.toprank/clients/<slug>/`. Skills load this
automatically when the client is active. No re-entering brand voice, account
IDs, or goals across sessions.

---

## Step 1 — Show existing clients

```bash
ls ~/.toprank/clients/ 2>/dev/null && echo "---" || echo "(no clients yet)"
```

If clients exist, show the list and ask:
> "Found [N] registered client(s): [list]. Are you adding a new client, or
> updating one of these?"

If no clients exist, say:
> "No clients registered yet. Let's add your first one."

---

## Step 2 — Gather client information

Ask the user for the following. Gather all at once or in conversation:

1. **Client name** — display name (e.g. "Acme Corp")
2. **Website URL** — primary domain (e.g. `https://acme.com`)
3. **GSC property** — exact Google Search Console property string
   (e.g. `sc-domain:acme.com` or `https://acme.com/`). Enter "none" if unknown.
4. **Google Ads CID** — 10-digit customer ID (e.g. `123-456-7890`).
   Enter "none" if not running Google Ads.
5. **Meta Ads account ID** — numeric account ID (e.g. `act_12345678`).
   Enter "none" if not running Meta Ads.
6. **Brand terms** — comma-separated name variations
   (e.g. `Acme, AcmeCorp, acme.com`).
7. **Primary goal** — what the client wants to achieve in plain language
   (e.g. "grow organic traffic 30% in 90 days", "hit $5 ROAS on Google Ads").
8. **Primary KPI** — the single metric that defines success.
   Common values: `non_brand_clicks_28d`, `roas`, `cpa_usd`, `leads_per_month`.
9. **Goal deadline** — target date in YYYY-MM-DD format (e.g. `2026-09-01`).

For updates, show current values and only ask what has changed.

---

## Step 3 — Derive the client slug

Create a URL-safe slug from the client name: lowercase, spaces → hyphens, strip
special characters. Example: "Acme Corp" → `acme-corp`.

If a client with this slug already exists and this is an update, say:
> "Client **acme-corp** already exists. I'll update their record."

---

## Step 4 — Write the client files

```bash
mkdir -p ~/.toprank/clients/<slug>/history
```

Write `~/.toprank/clients/<slug>/client.md` with the following content (fill in
the values gathered above):

```
# <Client Name>

## Identity
- **Website:** <URL>
- **GSC Property:** <gsc_property>
- **Google Ads CID:** <cid or "none">
- **Meta Ads Account:** <account_id or "none">
- **Brand Terms:** <comma-separated list>
- **Registered:** <today's date>

## Notes

_Add agency notes here — key contacts, billing cycle, special constraints._
```

Write `~/.toprank/clients/<slug>/goal.md` with the following content:

```
# Current Goal — <Client Name>

**Objective:** <primary goal statement>
**Primary KPI:** <kpi>
**Deadline:** <deadline>
**Set on:** <today's date>

## Progress

_Run `/toprank-advisor` to get a recommendation. Log outcomes here after each
action is taken._
```

---

## Step 5 — Confirm and next step

Show a brief summary:
> "Client **<Name>** registered under `~/.toprank/clients/<slug>/`."
> - Website: <URL>
> - Active channels: [list which of GSC / Google Ads / Meta are configured]
> - Goal: <objective> by <deadline>
>
> "Run `/toprank-advisor <slug>` to get a prioritized recommendation of what to
> work on first."
