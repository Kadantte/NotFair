# notfair-cmo Design System

**Direction.** Codex-flavored product UI: monochrome chrome, dark-first with a full light mode, depth from **elevation** (surface steps + soft shadows) instead of border lines, monospace for machine-flavored metadata. Color is reserved for **semantics** — green means live/connected, amber means attention, red means error. Primary actions are inverted monochrome (white-on-dark / black-on-light), the OpenAI/Codex signature.

If a design choice would feel at home in the OpenAI Codex app or ChatGPT's product chrome — it belongs. If it would feel at home in a magazine, a brutalist landing page, or macOS System Settings — it doesn't.

---

## Brand

The mark lives at `notfair-cmo/public/notfair-mark.svg` (green "!" + ink "F") with a dark-mode variant at `public/notfair-mark-dark.svg` (the F flips to light ink). Swap them with `dark:hidden` / `hidden dark:block` — never render the light mark on a dark surface.

The green `#4CAF6E` lifted from the mark is `--notfair-accent`. It is **status-only**: connected dots, live indicators, "ok" run outcomes, completed wizard pips, the recommended chip. It is never a CTA fill, never a link color, never chrome.

---

## Color

All tokens live in `src/app/globals.css` as HSL triples on `:root` (light) and `.dark`. Never hardcode hex/Tailwind palette colors in components — reach for `--notfair-*` or the mapped shadcn tokens.

### Dark (native mode)

| Token | Approx | Use |
|---|---|---|
| `--background` | `#161618` | Content background |
| `--notfair-sidebar` | `#0F0F10` | Sidebar rail (darker than content — the step *is* the separator) |
| `--card` | `#202024` | Raised surfaces — one step lighter than content so elevation reads without borders |
| `--notfair-surface-2` | `#26262A` | Inset fills: secondary buttons, chips, glyph wells, active pills |
| `--notfair-ink` | `#ECECEE` | Headings, primary text |
| `--notfair-ink-2/3/4` | `#D6D6DA` / `#A6A6AD` / `#77777E` | Strong body / body / labels+metadata |
| `--notfair-cta` / `--notfair-cta-text` | `#ECECEC` / `#101012` | Inverted primary button |

### Light

| Token | Approx | Use |
|---|---|---|
| `--background` | `#F7F7F8` | Content background |
| `--notfair-sidebar` | `#EFEFF0` | Sidebar rail |
| `--card` | `#FFFFFF` | Raised surfaces |
| `--notfair-surface-2` | `#F0F0F1` | Inset fills |
| `--notfair-ink` …`-4` | `#131316` → `#85858C` | Ink scale |
| `--notfair-cta` / `--notfair-cta-text` | `#131316` / `#FFFFFF` | Inverted primary button |

### Semantic

| Token | Use |
|---|---|
| `--notfair-accent` | Green — live/connected/ok only |
| `--notfair-accent-soft` | Green-tinted well (light wash in light mode, dark green well in dark) |
| `--notfair-warn` / `--notfair-warn-soft` | Amber text / amber wash (token expired, approval pending) |
| `--destructive` | Errors, danger zone |

Per-agent hues (`src/lib/agent-colors.ts`) survive only as small **dots and labels** — chip fills are neutral inset for every agent.

### What we don't have

No border-line chrome (see Elevation). No colored CTA fills. No purple/blue "tech" accents. No colored block chips — hue lives in dots.

---

## Theme switching

`next-themes` with `attribute="class"`, default **dark**, system honored. The `.dark` class on `<html>` flips every token; the toggle lives in the sidebar footer (`src/components/theme-toggle.tsx`). Components must work in both modes by construction — if you write a color that isn't a token (or a Tailwind token-mapped class), you've broken one of the modes.

---

## Typography

**Stack.** System sans (`-apple-system, …, Inter`) for UI. **Monospace** (`ui-monospace, SF Mono, JetBrains Mono, Menlo`) is a first-class citizen: hosts, counts, IDs, slugs, usage meters, tool-call verbs, timestamps, version strings. The mono metadata is what makes the chrome read "Codex". Use `.ns-mono` or `font-mono`.

**Tracking.** Near-neutral: body `-0.006em` (not Apple-tight). Titles land around `-0.02em`.

| Role | Size | Weight |
|---|---|---|
| Hero (wizard h1) | 30px | 600 |
| Page title | 28px | 600 |
| Section heading (`.ns-h2`) | 13px | 600 |
| Body / row title | 13.5–14.5px | 400–500 |
| Row description | 12–12.5px | 400 |
| Metadata (mono) | 10.5–11px | 400–500 |

Use color for hierarchy before weight. Sidebar group labels are small uppercase mono-ish (`10.5px / 500 / +0.07em`).

---

## Elevation (replaces borders)

**No border lines in chrome.** Cards separate from the page by being a lighter surface (dark) or by shadow (light); lists separate rows with **gaps between elevated cards**, not dividers; the sidebar separates from content by surface step alone.

```css
--notfair-shadow-sm  /* resting chips, kanban cards, tool-call cards */
--notfair-shadow     /* primary cards, list rows, day-well "today" */
--notfair-shadow-lg  /* floating panels: dropdowns, dialogs */
```

Dark-mode shadows are stronger (soft black) and the lighter card surface does half the work. Borders are still fine *inside content*: markdown tables, blockquote rules, focus rings.

---

## Spacing & radii

8px grid. Grouped lists use `9px` gaps between row-cards. Card padding `14–18px`.

| Radius | Use |
|---|---|
| `8px` | Buttons |
| `7px` | Tab pills, small chips, cron event chips |
| `9px` | Glyph wells (38px) |
| `10–12px` | Cards, list rows, kanban cards |
| `14px` | Large containers (kanban columns, KPI cards) |
| `999px` | Status pills, role badges only |

---

## Components

### Buttons (`.ns-btn`)

- **Primary** — inverted fill: `--notfair-cta` bg, `--notfair-cta-text` text. Hover dims opacity.
- **Secondary / "outline"** — borderless inset fill (`--notfair-surface-2`). There is no true outlined button; `.ns-btn-outline` is an alias kept for call sites.
- **Ghost** — transparent, ink text, inset hover.
- Radius 8px, `13.5px / 500`.

### Grouped list (`.ns-list` / `.ns-group`)

Separated elevated cards with 9px gaps — each direct child (usually `<li>`) gets `bg-card + radius 12px + --notfair-shadow`. No dividers. Rows keep the 38px glyph + title/desc + right status/action shape.

### Tabs (`.ns-tabs`)

Pill pattern: no underline, no bottom border. Active tab = inset filled pill (`--notfair-surface-2`) with ink text.

### Status

- **Connected** — 6–7px green dot + lowercase word in `--notfair-accent`.
- **Attention** — `ns-tag-amber` (warn tokens). **Error** — `ns-tag-red`.
- Neutral machine states ("scheduled", "past") — `ns-tag-mono` inset chips.

### Chat surface

User messages: inset bubbles (`bg-muted`, `rounded-2xl` with a tucked corner). Tool calls: elevated cards with mono verb + target + step counts and a green status dot. Composer: elevated borderless field with inverted send button. Agent tab bar: pill tabs over a translucent background wash.

### Cron calendar

Seven borderless day wells (`--notfair-ink` at 3.5% alpha); **today** is an elevated card. Events are neutral inset mono chips with a small agent-colored dot before the time.

### Kanban (tasks)

Columns are tinted wells (no ring, no header divider); task cards are elevated (`shadow-sm`), mono task IDs and dates, neutral assignee pill. Status dots on column headers: amber working / red blocked / green done.

### Forms

Inputs and textareas are borderless inset fields (`--notfair-surface-2` fill, transparent border, focus ring only). Form cards are elevated. Disabled buttons drop to 45% opacity.

### Progress pips

Inset dots; **done** = green-soft well with accent glyph, **active** = inverted CTA fill, pending = inset neutral. Connectors are 1px inset-colored (not border-strong).

---

## Motion

`0.15s ease` for color/background/opacity. `0.18s cubic-bezier(.2,.7,.3,1)` for elevation/position. No bounce, no springs. The WorkingIndicator's aurora/heartbeat animations are the one deliberately alive surface.

---

## DO / DON'T

**DO**
- Separate with **surface steps and shadows**, never hairlines.
- Put machine-flavored text (hosts, IDs, counts, times) in **mono**.
- Keep green sacred: if it isn't live/connected/ok, it isn't green.
- Check every change in **both** modes — dark is native, light is first-class.

**DON'T**
- Don't add border lines to chrome (cards, lists, sidebars, headers, buttons).
- Don't fill chips/badges with hue — agent identity lives in dots.
- Don't use colored CTA fills — primary is inverted monochrome.
- Don't hardcode Tailwind palette colors (`emerald-500`, `amber-600`, `zinc-*`) — use tokens; palette classes break one of the two modes.
- Don't reach for emoji as glyphs — use letterform glyph wells or SVG icons.

---

## Open questions (parked)

- **Density mode.** A compact table density for large accounts — revisit when a customer hits it.
- **Charts.** When data viz arrives, derive a mono-axis, semantic-color chart spec; don't extrapolate from chips.

Treat this `DESIGN.md` as the source of truth for the Codex-theme system; the approved mockups from the 2026-07-07 session are disposable.
