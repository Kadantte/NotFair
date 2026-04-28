# Design System — NotFair

## Product Context
- **What this is:** Open-core MCP server that connects Google Ads to AI tools (Claude Coworker, Cursor, etc.). Users connect their Google Ads account, then their AI agent reads campaigns, adjusts bids, and surfaces performance insights.
- **Who it's for:** Early-adopter SMB founders and entrepreneurs — self-doers spending their own money on ads, looking to grow and expand using AI tools
- **Space/industry:** AdTech, AI agent platforms. Peers: Google Ads UI, Optmyzr, WordStream, Claude Coworker
- **Project type:** Web app (marketing landing page + connect/auth flow + campaigns dashboard)

## Aesthetic Direction
- **Direction:** Industrial-Editorial — a precision instrument for people who manage real money. Bloomberg meets Linear meets the Financial Times.
- **Decoration level:** Minimal — typography and data do all the work. No decorative blobs, no gradient atmospherics, no sparkle icons.
- **Mood:** Trustworthy, growth-oriented, confident. The product should feel like it's built by builders for builders. Not a toy, not enterprise bloat, not another AI SaaS template. The user should feel: "this tool is on my side."
- **AI treatment:** AI-generated content gets a subtle green left border and a one-word label ("Agent"). No sparkle icons, no "AI-powered" badges, no glowing borders. AI is plumbing, not a feature to market inside the product.

## Typography
- **Display/Hero:** General Sans (700, 600) — geometric, modern, libre alternative to Sohne. Tight letterspacing at large sizes gives headlines a machined quality.
- **Body:** DM Sans (400, 500, 600) — clean, readable, good optical sizing. Pairs naturally with General Sans.
- **UI/Labels:** DM Sans (500) — same as body
- **Data/Tables:** JetBrains Mono (400, 500, 600) — ligatures for operators (>=, !=), designed for dense data. Use for all campaign metrics, costs, percentages, IDs.
- **Editorial accent:** Newsreader (italic 400, 600) — real italic forms, used sparingly for pull quotes, testimonials, and big stat callouts. Creates immediate hierarchy contrast.
- **Code:** JetBrains Mono
- **Loading:**
  - General Sans: `https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap`
  - DM Sans, JetBrains Mono, Newsreader: Google Fonts
- **Scale:**
  - 3xl: 64px (hero headline)
  - 2xl: 48px (page title)
  - xl: 32px (section heading)
  - lg: 22px (card heading)
  - md: 16px (body)
  - sm: 14px (UI labels, table text)
  - xs: 12px (captions, metadata)
  - 2xs: 11px (badges, micro labels)
  - mono-xs: 10px (status badges, timestamps)

## Color
- **Approach:** Restrained — one accent + warm neutrals. Color is rare and meaningful.
- **Dark-first.** Light mode deferred.

### Color Philosophy
Green = brand = growth = positive. The accent color IS the positive signal because NotFair's entire promise is growth. Differentiate interactive elements from metrics through shape and context, not color. Use a softer green (`#5DBE82`) for success alerts/toasts to distinguish feedback from interactive elements.

### Dark Mode (primary)
| Role | Hex | Usage |
|------|-----|-------|
| Background | `#1A1917` | Main canvas — warm black, not blue-black |
| Surface | `#24231F` | Cards, panels, sidebar |
| Surface elevated | `#2E2D28` | Modals, popovers, hover states |
| Border | `#3D3C36` | Dividers, table lines, card borders |
| Text primary | `#E8E4DD` | Body text — warm white, never pure #FFF |
| Text muted | `#C4C0B6` | Labels, captions, secondary text — AAA contrast (8.66:1 on surface, 9.67:1 on background) |
| Accent | `#4CAF6E` | CTAs, active states, selected items, links, positive metrics |
| Accent hover | `#3D9A5C` | Hover on accent elements |
| Success (alerts) | `#5DBE82` | Success toasts/alerts — softer than accent to distinguish from interactive |
| Danger | `#C45D4A` | Overspend alerts, errors, negative metrics, destructive actions |
| Warning | `#D4882A` | Budget warnings, approaching limits |
| Info | `#C4C0B6` | Informational alerts, neutral feedback |
| Chart 1 | `#4CAF6E` | Primary chart color (accent) |
| Chart 2 | `#D4882A` | Secondary chart color (warning/amber) |
| Chart 3 | `#C45D4A` | Tertiary chart color (danger) |
| Chart 4 | `#C4C0B6` | Quaternary chart color (muted) |

### Light Mode (future, for reference)
| Role | Hex |
|------|-----|
| Background | `#F5F0E8` |
| Surface | `#FFFCF5` |
| Surface elevated | `#FFFFFF` |
| Border | `#D6CBBA` |
| Text primary | `#1A1917` |
| Text muted | `#7A7267` |
| Accent | `#3D9A5C` |
| Danger | `#B54E3D` |
| Warning | `#C07A22` |

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — dashboard is dense but not cramped
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)

## Layout
- **Approach:** Hybrid — grid-disciplined dashboard, slightly editorial landing page
- **Landing page:** Asymmetric hero (left-aligned headline, product preview on right). No centered-everything. Navigation is low-profile, editorial.
- **Dashboard:** Sidebar navigation + main content area. Data-dense: 12+ table rows above the fold. Stats inline. Charts embedded in decision workflows, not decorative.
- **Grid:** 12 columns at desktop, 4 at mobile
- **Max content width:** 1200px (marketing), full-width (dashboard)
- **Border radius:** sm: 2px, md: 4px, lg: 8px, full: 9999px. Tighter than shadcn defaults.

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-400ms)
- **Rules:**
  - No animated gradient orbs or blobs
  - No decorative particle effects
  - Subtle entrance animations on page load are okay (opacity + small translate)
  - Table row hovers: instant (no transition delay)
  - Button state changes: 150ms

## Anti-Patterns (never use)
- Purple/violet/indigo gradient atmospherics
- 3-column icon feature grids
- Centered-everything landing page layout
- Animated decorative blobs, mesh gradients, glassmorphism
- Over-rounded corners (no border-radius > 8px except pills)
- "AI sparkle" iconography or "Powered by AI" badges
- Pure white (#FFFFFF) or pure black (#000000) — always use warm variants
- Blue/indigo as accent color (that's Google Ads, not us)

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-26 | Initial design system created | Created by /design-consultation. Three independent voices (Codex, Claude subagent, primary) converged on industrial-editorial direction with warm palette. |
| 2026-03-26 | General Sans over Sohne | Libre alternative with same geometric DNA. Avoids licensing cost while maintaining the precision feel. |
| 2026-03-26 | AI as plumbing, not feature | AI content uses subtle left border + "Agent" label. No sparkles or special treatment. Conveys confidence. |
| 2026-03-26 | Dark-first, light deferred | Dashboard tool, most competitors are dark. Light mode palette documented for future use. |
| 2026-03-26 | Bright Builder green (#4CAF6E) as accent | Target audience is early-adopter SMB entrepreneurs. Green communicates trust, growth, and belonging. Brand = growth = positive signal. Differentiates from blue-dominant adtech category. |
| 2026-03-26 | Green = brand = positive | Accent and positive metrics share the same color. Growth IS the brand promise. Softer green (#5DBE82) for success alerts to distinguish feedback from interactive elements. |
