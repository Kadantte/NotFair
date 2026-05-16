/**
 * Compute the next business-hour send time in Pacific Time. Used by outreach
 * scheduling so emails land at 9am PT (12pm PT on Mondays to dodge inbox-zero
 * triage) regardless of where the user or server lives.
 *
 * Correctness: uses Intl with `America/Los_Angeles` so PDT/PST transitions are
 * handled automatically. The previous hand-rolled `7 * 60 * 60 * 1000` math
 * was wrong half the year (PST is -8, PDT is -7).
 */
export function nextBusinessSendTimePT(now = new Date()): Date {
  const tz = "America/Los_Angeles";

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const candidateUtc = addDays(now, dayOffset);
    const dow = formatInTz(candidateUtc, tz, { weekday: "short" });
    if (dow === "Sat" || dow === "Sun") continue;
    const targetHour = dow === "Mon" ? 12 : 9;
    const sendAt = ptDateAtHour(candidateUtc, targetHour);
    if (sendAt > now) return sendAt;
  }
  // 14 days of weekdays will always include at least one future slot
  throw new Error("nextBusinessSendTimePT: no slot found in 14-day window");
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatInTz(d: Date, timeZone: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).format(d);
}

/**
 * Given a UTC instant, return the UTC instant corresponding to `hour:00` PT
 * on the same PT calendar day. Round-trips through Intl to pick the right
 * offset (PDT vs PST) without hardcoding either.
 */
function ptDateAtHour(referenceUtc: Date, hour: number): Date {
  const tz = "America/Los_Angeles";
  // Get the PT calendar date for the reference instant
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(referenceUtc);
  const ptDate = `${part(dateParts, "year")}-${part(dateParts, "month")}-${part(dateParts, "day")}`;
  const hh = String(hour).padStart(2, "0");

  // Try PDT (-07:00) and PST (-08:00); the one whose UTC instant round-trips
  // back to (ptDate, hour) in PT is correct. This handles DST without a table.
  for (const offset of ["-07:00", "-08:00"] as const) {
    const guess = new Date(`${ptDate}T${hh}:00:00${offset}`);
    const checkParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", hour12: false,
    }).formatToParts(guess);
    const checkDate = `${part(checkParts, "year")}-${part(checkParts, "month")}-${part(checkParts, "day")}`;
    const checkHour = Number(part(checkParts, "hour"));
    if (checkDate === ptDate && checkHour === hour) return guess;
  }
  // DST-gap fallback (spring-forward 2am PT doesn't exist; PDT-style guess is
  // the conventional resolution).
  return new Date(`${ptDate}T${hh}:00:00-07:00`);
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}
