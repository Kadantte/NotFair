// Currency utilities for the dev dashboard: ISO 4217 → country, plus
// USD-normalized rates fetched once a day with a hardcoded fallback.

export type CurrencyInfo = { country: string; flag: string };

type CurrencyEntry = CurrencyInfo & {
  // 1 unit of this currency in USD. Approximate (≈ early 2026); used only
  // when the live rate fetch fails. Powers a sortable "USD-equivalent budget"
  // column, not financial reporting.
  usdRate: number;
};

// One record per ISO 4217 code. Co-locating country/flag with the fallback
// rate prevents the two tables from drifting when a new currency is added.
// Multi-country currencies (EUR, USD) use a representative flag.
const CURRENCIES: Record<string, CurrencyEntry> = {
  USD: { country: "United States", flag: "🇺🇸", usdRate: 1 },
  CAD: { country: "Canada", flag: "🇨🇦", usdRate: 0.72 },
  GBP: { country: "United Kingdom", flag: "🇬🇧", usdRate: 1.27 },
  EUR: { country: "Eurozone", flag: "🇪🇺", usdRate: 1.08 },
  AUD: { country: "Australia", flag: "🇦🇺", usdRate: 0.66 },
  NZD: { country: "New Zealand", flag: "🇳🇿", usdRate: 0.60 },
  INR: { country: "India", flag: "🇮🇳", usdRate: 0.012 },
  JPY: { country: "Japan", flag: "🇯🇵", usdRate: 0.0066 },
  SGD: { country: "Singapore", flag: "🇸🇬", usdRate: 0.74 },
  HKD: { country: "Hong Kong", flag: "🇭🇰", usdRate: 0.128 },
  CHF: { country: "Switzerland", flag: "🇨🇭", usdRate: 1.13 },
  SEK: { country: "Sweden", flag: "🇸🇪", usdRate: 0.095 },
  NOK: { country: "Norway", flag: "🇳🇴", usdRate: 0.092 },
  DKK: { country: "Denmark", flag: "🇩🇰", usdRate: 0.145 },
  PLN: { country: "Poland", flag: "🇵🇱", usdRate: 0.25 },
  CZK: { country: "Czech Republic", flag: "🇨🇿", usdRate: 0.043 },
  HUF: { country: "Hungary", flag: "🇭🇺", usdRate: 0.0027 },
  RON: { country: "Romania", flag: "🇷🇴", usdRate: 0.22 },
  BGN: { country: "Bulgaria", flag: "🇧🇬", usdRate: 0.55 },
  ISK: { country: "Iceland", flag: "🇮🇸", usdRate: 0.0072 },
  TRY: { country: "Turkey", flag: "🇹🇷", usdRate: 0.029 },
  ILS: { country: "Israel", flag: "🇮🇱", usdRate: 0.27 },
  AED: { country: "United Arab Emirates", flag: "🇦🇪", usdRate: 0.272 },
  SAR: { country: "Saudi Arabia", flag: "🇸🇦", usdRate: 0.267 },
  QAR: { country: "Qatar", flag: "🇶🇦", usdRate: 0.275 },
  KWD: { country: "Kuwait", flag: "🇰🇼", usdRate: 3.25 },
  EGP: { country: "Egypt", flag: "🇪🇬", usdRate: 0.020 },
  ZAR: { country: "South Africa", flag: "🇿🇦", usdRate: 0.054 },
  NGN: { country: "Nigeria", flag: "🇳🇬", usdRate: 0.00065 },
  KES: { country: "Kenya", flag: "🇰🇪", usdRate: 0.0077 },
  MAD: { country: "Morocco", flag: "🇲🇦", usdRate: 0.10 },
  MXN: { country: "Mexico", flag: "🇲🇽", usdRate: 0.049 },
  BRL: { country: "Brazil", flag: "🇧🇷", usdRate: 0.18 },
  ARS: { country: "Argentina", flag: "🇦🇷", usdRate: 0.0010 },
  CLP: { country: "Chile", flag: "🇨🇱", usdRate: 0.0010 },
  COP: { country: "Colombia", flag: "🇨🇴", usdRate: 0.00024 },
  PEN: { country: "Peru", flag: "🇵🇪", usdRate: 0.27 },
  UYU: { country: "Uruguay", flag: "🇺🇾", usdRate: 0.024 },
  CNY: { country: "China", flag: "🇨🇳", usdRate: 0.138 },
  KRW: { country: "South Korea", flag: "🇰🇷", usdRate: 0.00071 },
  TWD: { country: "Taiwan", flag: "🇹🇼", usdRate: 0.031 },
  THB: { country: "Thailand", flag: "🇹🇭", usdRate: 0.029 },
  IDR: { country: "Indonesia", flag: "🇮🇩", usdRate: 0.000061 },
  MYR: { country: "Malaysia", flag: "🇲🇾", usdRate: 0.21 },
  PHP: { country: "Philippines", flag: "🇵🇭", usdRate: 0.017 },
  VND: { country: "Vietnam", flag: "🇻🇳", usdRate: 0.000040 },
  PKR: { country: "Pakistan", flag: "🇵🇰", usdRate: 0.0036 },
  BDT: { country: "Bangladesh", flag: "🇧🇩", usdRate: 0.0084 },
  LKR: { country: "Sri Lanka", flag: "🇱🇰", usdRate: 0.0033 },
  RUB: { country: "Russia", flag: "🇷🇺", usdRate: 0.011 },
  UAH: { country: "Ukraine", flag: "🇺🇦", usdRate: 0.024 },
};

const FALLBACK_USD_RATES: Record<string, number> = Object.fromEntries(
  Object.entries(CURRENCIES).map(([code, { usdRate }]) => [code, usdRate]),
);

export function getCurrencyInfo(code: string | null | undefined): CurrencyInfo | null {
  if (!code) return null;
  const entry = CURRENCIES[code.toUpperCase()];
  return entry ? { country: entry.country, flag: entry.flag } : null;
}

const RATES_TTL_MS = 24 * 60 * 60 * 1000;
let ratesCache: { rates: Record<string, number>; ts: number } | null = null;
let inflight: Promise<Record<string, number>> | null = null;

/** Returns a map of ISO 4217 code → USD value of 1 unit. Cached 24h. */
export async function getUsdRates(): Promise<Record<string, number>> {
  if (ratesCache && Date.now() - ratesCache.ts < RATES_TTL_MS) return ratesCache.rates;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD", {
        // We own the 24h in-process cache; bypass the platform fetch cache.
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { rates?: Record<string, number> };
        if (data.rates && typeof data.rates === "object") {
          // open.er-api returns rates as "1 USD = X target". Invert to "1 target = Y USD".
          const inverted: Record<string, number> = { USD: 1 };
          for (const [code, rate] of Object.entries(data.rates)) {
            if (typeof rate === "number" && rate > 0) inverted[code] = 1 / rate;
          }
          ratesCache = { rates: inverted, ts: Date.now() };
          return inverted;
        }
      }
    } catch { /* fall through to fallback */ }
    ratesCache = { rates: FALLBACK_USD_RATES, ts: Date.now() };
    return FALLBACK_USD_RATES;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Convert an amount in the given currency to USD. Returns null if the code is unknown. */
export function toUsd(
  amount: number,
  currencyCode: string | null | undefined,
  rates: Record<string, number>,
): number | null {
  if (!currencyCode) return null;
  const rate = rates[currencyCode.toUpperCase()];
  if (rate == null) return null;
  return amount * rate;
}
