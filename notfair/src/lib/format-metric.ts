/**
 * Human formatting for metric values everywhere the UI shows one: floats
 * from averaged measurements come in with full precision
 * (82065.85714285714) and must never reach the user raw.
 */
const FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function formatMetric(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return FMT.format(v);
}
