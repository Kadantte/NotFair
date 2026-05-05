# Data Request Policy

This is the operational policy NotFair follows when responding to a
government, court, or third-party request for user data — including
national-security requests. It backs the "policies / processes for
handling such requests" attestations in the Meta App Review submission
(see `docs/meta-app-review.md`, "Data handling section → requests-4").

## Scope

Applies to any compulsory or voluntary request from a government,
law-enforcement, court, regulator, or other third party seeking access
to:

- Platform Data received from Meta (access tokens, ad-account
  metadata, ad-account performance metrics, Page identity, post-level
  insights, Meta user profile fields).
- NotFair-controlled data tied to a Meta-connected account (operations
  log rows, MCP session tokens, billing records).

Voluntary requests (e.g., from a journalist or private investigator)
are declined unless served with valid legal process.

## 1. Required review of legality

Every request is reviewed by the founder (Yuting Zhong, izhongyuting@gmail.com)
before any data is produced. The review verifies, at minimum:

- Jurisdiction and statutory authority cited.
- Identity of the requesting authority via independent channels (not
  the contact info on the request itself).
- Scope, particularity, and proportionality of the data demanded.
- Whether the request would compel us to violate another binding legal
  obligation (e.g., a customer's contractual or statutory rights, or a
  conflicting jurisdiction's privacy law).

External counsel is engaged for any request that is non-routine,
overbroad, or accompanied by a non-disclosure / gag order.

## 2. Provisions for challenging unlawful requests

If the legality review identifies any of the conditions below, we will
challenge the request — by motion to quash, motion to modify, or
written objection, as appropriate — before producing data:

- Lack of jurisdiction or statutory authority.
- Overbreadth or absence of particularity.
- Pretextual basis (the demand is a fishing expedition).
- Conflict with controlling privacy law or treaty.
- Defect in legal process (improper service, missing signature,
  expired warrant, etc.).

Where the demand is a national-security letter or accompanied by a
non-disclosure obligation, we will, where lawful, challenge any
indefinite or unlimited gag through the available transparency
channels.

## 3. Data minimization

We produce only the minimum data necessary to satisfy the request. In
practice this means:

- Narrowing by user, time window, and data type before any export.
- Redacting fields that fall outside the request's scope.
- Refusing bulk or pattern-matching production requests.
- Preferring metadata over content when the request can be satisfied
  with less.

For Meta Platform Data specifically: we never produce the *contents* of
a connected user's ad account (e.g., creative copy, audiences) when a
metadata-only response (existence of a connection, timestamps) is
sufficient.

## 4. Documentation

Every request — and our response — is documented and retained. The
log captures:

- Date received, requesting authority, statutory basis cited.
- Copy of the request (or redacted summary if production is sealed).
- Legality review notes and the identity of the reviewer.
- Whether external counsel was engaged.
- Decision (challenge / partial production / full production / refuse).
- Data produced (fields, time window, user(s) affected) and to whom.
- Date and method of production.
- Whether the affected user(s) were notified, or — when prohibited —
  the legal basis for non-notification.

The log is retained for at least seven years, in encrypted storage
separate from production user data. It is reviewed annually.

## User notification

When not legally prohibited, NotFair notifies the affected user before
producing their data, with enough advance notice to allow the user to
seek their own legal remedies. When notification is prohibited (e.g.,
sealed warrant, NSL gag), we record the legal basis for
non-notification in the request log and revisit it whenever the
underlying restriction expires or is lifted.

## Transparency

At least annually, NotFair publishes (or, if no requests have been
received, attests to) aggregate statistics on the requests received
and how they were handled, consistent with applicable legal
restrictions.

## Contact

Legal process and data requests should be addressed to:
**izhongyuting@gmail.com** (subject line beginning with `[Legal
Process]`). NotFair does not accept service of legal process by social
media, in-app message, or any other channel.

---

This policy is a living document. Material changes are tracked in
this file's git history and are reflected in any in-flight Meta App
Review attestation.
