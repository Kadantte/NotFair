/** Shared formatting utilities for operations/changes display */

/** Convert snake_case action name to Title Case */
export function formatAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Format operation values — detects bid/budget micros and converts to dollars */
export function formatValue(action: string, value: string): string {
  if (action.includes('bid') || action.includes('budget')) {
    const micros = Number(value);
    if (!isNaN(micros) && micros >= 0 && value !== '') return `$${(micros / 1_000_000).toFixed(2)}`;
  }
  return value;
}

/** Entity type → badge color classes */
export const ENTITY_BADGE_COLORS: Record<string, string> = {
  keyword: 'bg-[#4CAF6E]/10 text-[#4CAF6E] border-[#4CAF6E]/20',
  campaign: 'bg-[#D4882A]/10 text-[#D4882A] border-[#D4882A]/20',
  unknown: 'bg-[#C4C0B6]/10 text-[#C4C0B6] border-[#C4C0B6]/20',
};
