/**
 * Workspace-browser guidance included in every goal agent's skill (see
 * src/server/goals/identity.ts). The workspace has ONE shared Chrome with
 * persistent cookies, so the rules here — labeled tabs, snapshot → act →
 * snapshot, honest blocker reporting — are what keep multiple agents from
 * stepping on each other.
 */
export const BROWSER_SKILL = `## Workspace browser tools

The workspace has a single shared Chrome instance with persistent cookies.
The user has signed in there during onboarding — so login state for Google,
Meta, Search Console, etc. is already available to you. Cookies persist
across restarts; you do not need to ask the user to sign in again.

### CRITICAL: which "browser" tool to use

The notfair-browser MCP exposes \`browser_open\`, \`browser_snapshot\`,
\`browser_click\`, etc. **These are the ONLY tools that touch the workspace
browser.** When the user says "launch the browser", "open a page", "go to
<URL>", "snapshot the page", or anything in that family, the answer is
ALWAYS one of the \`browser_*\` MCP tools below.

Do **not**:
- Use any bundled or third-party "browser-use" plugin your host runtime
  might ship (e.g. OpenAI's bundled \`browser-use\` plugin in Codex CLI).
  Those open a different Chrome with a different profile — your work
  won't persist for other agents in this project.
- Shell out to \`open -a "Google Chrome"\`, \`open <url>\`, AppleScript
  \`tell application "Google Chrome"\`, \`xdg-open\`, \`start chrome\`,
  or similar. Same problem: wrong profile, no shared cookies.
- "Initialize" or "launch" the browser as a separate step. \`browser_open\`
  starts the workspace Chrome on its first call automatically.

If you're unsure whether the workspace browser is running, call
\`browser_status\` first — it's cheap and tells you everything.

### One labeled tab per agent

Every agent shares the same Chrome, so coordinate via tab labels.
**Always pass \`label\` equal to your \`agent_id\` when calling
\`browser_open\`.** That reserves a stable tab for your work and prevents
you (or a retry) from racing other agents.

\`\`\`
browser_open({ project_slug, label: "<your agent_id>", url: "..." })
\`\`\`

If a labeled tab already exists, \`browser_open\` reuses it (navigates
that tab instead of duplicating). Subsequent calls target it as
\`target_id: "<your agent_id>"\`.

Before opening, call \`browser_tabs\` if you suspect a prior turn left
state you can reuse — it lists every tab in the workspace with handle,
URL, and title.

### Snapshot → act → snapshot

Refs in a snapshot (\`e1\`, \`e2\`, ...) are valid ONLY until the DOM
changes. Discipline:

1. \`browser_snapshot\` to learn what's on the page (returns elements
   with stable refs + a text excerpt).
2. \`browser_click\`/\`browser_type\`/\`browser_press\` using a ref from
   that snapshot.
3. After any navigation, form submit, or modal change, snapshot AGAIN
   before the next action. Stale refs fail loudly — recover with a
   fresh snapshot, never a blind retry.

\`browser_navigate\` triggers a navigation; \`browser_scroll\` does not
invalidate refs but may reveal new ones (re-snapshot if you need them).

### Reporting blockers honestly

If the page surfaces a login wall, captcha, 2FA prompt, permission
dialog, or any state that needs the human, STOP. Do not loop. Use
\`submit_task_status\` with \`status: "blocked"\` and a summary that
quotes the exact UI ("Google asks for SMS verification on
+1•••••5309"). Do not claim "not logged in" just because the current
page shows an onboarding splash — snapshot first and read the visible
UI.

Do not try to bypass interstitials by reloading or clicking around. The
user signed into this profile manually; if Google or Meta wants a
re-verification now, only the user can give it.

The full \`browser_*\` tool list with parameters arrives with the tool
definitions themselves — don't re-learn it here, read the descriptions.

You CANNOT stop the workspace browser. Browser lifecycle belongs to the
user (Settings → Workspace browser → Stop). This is deliberate: every
agent in this workspace shares one Chrome, so stopping it would interrupt
your teammates mid-task.

`;
