---
name: vercel-env-add
description: Add or update environment variables on Vercel via the CLI without trailing whitespace, trailing newlines, or other invisible characters that silently break runtime auth (refresh tokens, API keys, JWTs). Invoke whenever the user wants to set, add, update, rotate, or roll an env var on Vercel — phrases like "set vercel env", "add env var", "update env on vercel", "push secret to vercel", "set NOTFAIR_OWN_GADS_REFRESH_TOKEN", or any request to write to Vercel project env. Also use after generating a new secret/token that needs to land in Vercel.
---

# vercel-env-add

You are about to write a value to Vercel project environment variables. The #1 failure mode is **invisible trailing whitespace or newlines** in the stored value — a refresh token with a trailing `\n` parses fine in your editor, then 401s in production because Google/AWS/Anthropic compare bytes literally. This skill exists to make that class of bug impossible.

Refuse to skip the verification steps. The 10 seconds they cost is far less than the hours of debugging a trailing-newline secret produces.

## When to invoke

- User asks to set/add/update/rotate an env var on Vercel.
- User just generated a token (OAuth refresh token, API key, JWT, webhook secret) and needs it deployed.
- A code change introduces a new required env var.
- Skip this skill only when the user is reading existing env vars (`vercel env ls`, `vercel env pull`) without writing.

## The rules (non-negotiable)

1. **Never use `echo`** to pipe values. `echo "x"` appends a newline. Always `printf '%s' "$VALUE"`.
2. **Never paste secrets into the shell history.** Read from a file the user controls, an env var they exported, or have them paste during the `vercel env add` interactive prompt.
3. **Strip + reject whitespace before write.** If the value has leading/trailing whitespace OR contains `\r` / `\n`, do not write. Show the user the cleaned version, ask them to confirm.
4. **Vercel CLI has no `update` command.** To change an existing var you must `vercel env rm NAME env --yes` then `vercel env add NAME env`. Always check whether the var exists first with `vercel env ls <env>`.
5. **Verify the bytes that landed.** After every write, `vercel env pull` to a temp file (only with user consent — production envs contain other secrets) and confirm the variable's length matches the source value's length. Length mismatch = trailing junk.
6. **Multi-env writes are one CLI call per env.** Loop over `production`, `preview`, `development` as needed.

## Phase 0 — Clarify scope

Before writing anything, confirm with the user:

1. **Variable name** — exact identifier (case-sensitive).
2. **Environments** — `production`, `preview`, `development`, or any combination. Default: ask explicitly; do not assume.
3. **Where is the value coming from?** Three safe sources, in preference order:
   - Already in `.env.local` (read it; never echo to chat).
   - User will paste interactively into the `vercel env add` prompt.
   - User exports it to a shell env var first (`export FOO_SECRET='...'`) and tells you the name.
   - **Unsafe**: user pastes it into chat. If they do this, accept it but warn that the value is now in conversation history and they should rotate after.
4. **Is this an update or a fresh add?** Run `vercel env ls <env> 2>&1 | grep "^ <NAME> "` to find out. If it exists, surface that and confirm overwrite.

## Phase 1 — Validate the value

Run this validator on the source value before any write. Replace `<SOURCE_CMD>` with the read command (e.g., `grep '^NAME=' .env.local | cut -d= -f2-` or `printf '%s' "$EXPORTED_VAR"`).

```bash
VAL=$(<SOURCE_CMD>)
python3 - <<'PY'
import os, sys
v = os.environ.get("VAL", "")
problems = []
if not v:
    problems.append("EMPTY: value is empty")
if v != v.strip():
    problems.append(f"WHITESPACE: leading/trailing whitespace present (raw len {len(v)}, stripped len {len(v.strip())})")
if "\n" in v or "\r" in v:
    problems.append(f"NEWLINE: value contains \\n or \\r — would break literal byte comparison")
if v.startswith(("'", '"')) and v.endswith(("'", '"')) and len(v) >= 2:
    problems.append("QUOTES: value is wrapped in quotes — likely a .env quoting artifact, strip them")
# Common copy-paste artifacts
for ch, label in [("​", "ZWSP"), (" ", "NBSP"), ("﻿", "BOM")]:
    if ch in v:
        problems.append(f"INVISIBLE_CHAR: contains {label} (U+{ord(ch):04X})")
print(f"Length: {len(v)}")
print(f"First 4 chars (repr): {v[:4]!r}")
print(f"Last 4 chars (repr): {v[-4:]!r}")
if problems:
    print("PROBLEMS:")
    for p in problems:
        print(f"  - {p}")
    sys.exit(1)
print("OK")
PY
```

Export `VAL` first (`export VAL="$VAL"`) so Python can see it. The script must exit 0 before you proceed.

If it exits non-zero, do NOT proceed. Show the user the problems. Offer to strip-and-confirm:

> "Detected trailing whitespace. I'll write the cleaned value, length will go from 42 → 41 bytes. The first 4 chars are 'eyJ0' and the last 4 cleaned chars are 'XyZ9'. Confirm?"

Only proceed on explicit confirmation.

## Phase 2 — Write (one env at a time)

For each target environment:

```bash
# 1. If the variable already exists, remove first (Vercel has no update).
vercel env ls <env> 2>&1 | grep -q "^ <NAME> " && \
  vercel env rm <NAME> <env> --yes

# 2. Pipe the exact bytes — printf, never echo.
printf '%s' "$VAL" | vercel env add <NAME> <env>
```

`printf '%s' "$VAL"` writes exactly `len("$VAL")` bytes — no trailing newline, no shell quoting drift. This is the only safe pipe pattern.

Substitute `<env>` with one of `production`, `preview`, `development`. Loop for multi-env writes — do not try to pass multiple environments in one command.

## Phase 3 — Verify the bytes

Pulling production env to a temp file requires the user to authorize it (the file will contain ALL their production secrets, not just the one you wrote). Ask first:

> "I'd like to `vercel env pull` to `/tmp` so I can verify the byte length of what was just written. The file will contain all your production env vars — confirm you're OK with that, or I can skip verification."

If denied: skip Phase 3 and tell the user you couldn't byte-verify. Recommend they pull manually and check.

If allowed:

```bash
TMPDIR=$(mktemp -d)
vercel env pull "$TMPDIR/verify.env" --environment=<env> --yes
# Compare lengths only — never print the value
WRITTEN_LEN=$(grep "^<NAME>=" "$TMPDIR/verify.env" | sed 's/^<NAME>=//' | awk '{print length}')
SOURCE_LEN=$(printf '%s' "$VAL" | wc -c | tr -d ' ')
echo "Source: $SOURCE_LEN bytes / Vercel: $WRITTEN_LEN bytes"
rm -rf "$TMPDIR"
```

Lengths must match. If they differ by 1, that's almost always a trailing newline — remove the var and retry with `printf '%s'`.

When comparing, be aware that `vercel env pull` may wrap the value in quotes for `.env` parsing safety. Strip surrounding double quotes before length-counting if present.

## Phase 4 — Report

Tell the user, in this order:
1. What was written (variable name, environments, byte length).
2. Whether verification passed.
3. Whether a redeploy is needed for the change to take effect (env changes apply to new deployments, not running ones).

Example:
> ✅ `NOTFAIR_OWN_GADS_REFRESH_TOKEN` written to **production** (256 bytes). Byte-verified against source. Trigger a redeploy or push a commit for it to apply.

## Common failure modes — refuse to ship these

- **Heredoc-piped values** (`vercel env add NAME prod <<< "$VAL"`) — `<<<` herestring **appends a trailing newline**. Don't use it.
- **`cat file | vercel env add`** — works only if the file has no trailing newline. Most files do. Use `printf '%s' "$(cat file)"` or read the file with Python and pipe.
- **Quoted assignment in `.env`** (`FOO="value"`) — when read via `grep | cut`, the quotes are preserved. Strip them in Phase 1.
- **Setting `production` when the user said "preview"** — confirm environments explicitly.
- **Skipping verification because "the write succeeded"** — Vercel's CLI reports success even when storing trailing garbage. Byte-verify or you don't know.

## Quick reference — minimal correct call

```bash
# One-shot, single env, value already in $VAL with no whitespace:
vercel env ls production 2>&1 | grep -q '^ NAME ' && vercel env rm NAME production --yes
printf '%s' "$VAL" | vercel env add NAME production
```

Everything else (Phase 1 validation, Phase 3 verification) is non-optional safety on top of this.
