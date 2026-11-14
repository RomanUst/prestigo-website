// Pure Europe/Prague date helpers. Imports nothing, so it is safe in client bundles
// (lib/prague-calendar.ts and lib/no-show.ts use it from both tiers).
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

// ── Pickup instant ─────────────────────────────────────────────────────────

const PRAGUE_TZ = 'Europe/Prague'
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^(\d{2}):(\d{2})/

const pragueParts = new Intl.DateTimeFormat('en-US', {
  timeZone: PRAGUE_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Offset of Europe/Prague from UTC at the given instant, in ms (positive east of Greenwich). */
function pragueOffsetMs(utcMs: number): number {
  const parts: Record<string, number> = {}
  for (const p of pragueParts.formatToParts(new Date(utcMs))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/**
 * The pickup instant: pickup_utc when present and valid, else the Europe/Prague wall clock of
 * pickup_date (YYYY-MM-DD) + pickup_time (HH:MM). Null when neither parses; never throws.
 */
export function pickupInstantMs(row: {
  pickup_utc: string | null
  pickup_date: string
  pickup_time: string
}): number | null {
  if (row.pickup_utc) {
    const ms = Date.parse(row.pickup_utc)
    if (Number.isFinite(ms)) return ms
  }
  const d = DATE_RE.exec(row.pickup_date ?? '')
  const t = TIME_RE.exec(row.pickup_time ?? '')
  if (!d || !t) return null
  const [year, month, day, hour, minute] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])]
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  // Reject impossible calendar dates (31 February): Date.UTC would roll them over.
  const check = new Date(wall)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  const first = pragueOffsetMs(wall)
  let instant = wall - first
  const second = pragueOffsetMs(instant)
  if (second !== first) instant = wall - second
  return instant
}
