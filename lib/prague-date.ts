// Server-only Europe/Prague "today" helper.
//
// D-01 (Phase 65 CONTEXT.md): "today" for the future-first bookings list must be
// server-computed in Europe/Prague, never client-derived. This uses Node's
// built-in Intl (ICU) rather than a hand-rolled UTC-offset calculator or a new
// timezone dependency — Node's ICU data already handles Prague's CET/CEST DST
// transitions correctly.

/**
 * Returns `now`'s calendar date in Europe/Prague as a YYYY-MM-DD string.
 * `en-CA` formats as YYYY-MM-DD directly.
 */
export function getPragueTodayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(now)
}

/**
 * Shifts a YYYY-MM-DD calendar-date string by a whole number of days.
 * The input is already a Prague wall-clock date (from getPragueTodayISO or
 * bookings.pickup_date), so anchoring the arithmetic at UTC midnight is safe
 * calendar-date math — no further timezone conversion is needed.
 */
export function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}
