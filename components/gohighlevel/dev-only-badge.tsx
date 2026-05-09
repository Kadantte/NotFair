/**
 * "Dev only · NotFair admins" badge for GHL surfaces.
 *
 * Surfaces that show it (all server-side-gated to DEV_EMAILS first; the
 * badge is just a visual reminder for the devs who CAN see them):
 *   - components/gohighlevel-connect-surface.tsx (the /connect/gohighlevel page)
 *   - components/marketing/gohighlevel-claude-connector-page.tsx
 *   - components/marketing/gohighlevel-mcp-page.tsx
 *
 * Wording lives in `lib/gohighlevel/dev-gate.ts:GHL_DEV_BADGE_LABEL` so the
 * gate policy and the visible label can never drift out of sync.
 */
import { AlertTriangle } from "lucide-react";

/**
 * Wording is inlined here rather than imported from `lib/gohighlevel/dev-gate`
 * because that module pulls in `lib/session` (which is `"server-only"`), and
 * this component is rendered inside `"use client"` marketing pages. The
 * Next.js webpack build rejects server-only modules in client bundles even
 * when only a string constant is imported.
 *
 * The badge IS the source of truth for the visible wording. The server-side
 * gate decides who SEES the badge; the badge decides what it SAYS.
 */
const LABEL = "DEV ONLY · NotFair admins";

type Props = {
  /** Apply margin-bottom utility — useful when the badge sits above a hero block. */
  className?: string;
};

export function DevOnlyBadge({ className }: Props) {
  return (
    <div
      className={`mx-auto inline-flex items-center gap-2 rounded-full border border-[#FFB74D]/40 bg-[#FFB74D]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#FFB74D] ${className ?? ""}`}
    >
      <AlertTriangle className="h-3.5 w-3.5" /> {LABEL}
    </div>
  );
}
