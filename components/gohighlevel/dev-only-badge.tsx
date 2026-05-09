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
import { GHL_DEV_BADGE_LABEL } from "@/lib/gohighlevel/dev-gate";

type Props = {
  /** Apply margin-bottom utility — useful when the badge sits above a hero block. */
  className?: string;
};

export function DevOnlyBadge({ className }: Props) {
  return (
    <div
      className={`mx-auto inline-flex items-center gap-2 rounded-full border border-[#FFB74D]/40 bg-[#FFB74D]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#FFB74D] ${className ?? ""}`}
    >
      <AlertTriangle className="h-3.5 w-3.5" /> {GHL_DEV_BADGE_LABEL}
    </div>
  );
}
