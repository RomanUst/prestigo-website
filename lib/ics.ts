// prestigo/lib/ics.ts
//
// RFC 5545 ICS generator with Europe/Prague TZID support.
// Used by both the server email attachment (lib/email.ts) and the client
// confirmation page download button (app/book/confirmation/page.tsx).
// Single source of truth per Phase 27 D-13.
//
// Zero external dependencies, zero Node built-ins — safely importable in
// both the server webhook path and the browser confirmation page.

export interface IcsEvent {
  uid: string
  date: string             // 'YYYY-MM-DD' Europe/Prague wall-clock
  time: string             // 'HH:MM'     Europe/Prague wall-clock
  durationMinutes?: number // default 60
  summary: string
  description: string
  location: string
}

// RFC 5545 §3.3.11 TEXT escape: backslash, semicolon, comma, newline
// Applied to SUMMARY, DESCRIPTION, LOCATION — NOT to UID, TZID, DTSTART
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// 'YYYY-MM-DD' + 'HH:MM' → 'YYYYMMDDTHHMMSS' (wall-clock, no Z)
function formatLocal(date: string, time: string): string {
  const [y, m, d] = date.split('-')
  const [hh, mm] = time.split(':')
  return `${y}${m}${d}T${hh}${mm}00`
}

// Add minutes to a wall-clock YYYYMMDDTHHMMSS string without leaving Prague TZ.
// Uses UTC Date arithmetic to handle day/month/year rollover correctly.
// The wall-clock components are what matter for TZID-tagged output.
function addMinutesToLocal(local: string, minutes: number): string {
  const y = parseInt(local.slice(0, 4))
  const mo = parseInt(local.slice(4, 6))
  const d = parseInt(local.slice(6, 8))
  const h = parseInt(local.slice(9, 11))
  const mi = parseInt(local.slice(11, 13))
  const anchor = Date.UTC(y, mo - 1, d, h, mi + minutes)
  const end = new Date(anchor)
  const ey = end.getUTCFullYear()
  const emo = String(end.getUTCMonth() + 1).padStart(2, '0')
  const ed = String(end.getUTCDate()).padStart(2, '0')
  const eh = String(end.getUTCHours()).padStart(2, '0')
  const emi = String(end.getUTCMinutes()).padStart(2, '0')
  return `${ey}${emo}${ed}T${eh}${emi}00`
}

// DTSTAMP is CORRECT in UTC Z format per RFC 5545 §3.7.4
function dtstampUtcNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

// Europe/Prague VTIMEZONE boilerplate — verbatim per RFC 5545
// Handles both CET (UTC+1, winter) and CEST (UTC+2, summer/DST)
const VTIMEZONE_EUROPE_PRAGUE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Prague',
  'BEGIN:STANDARD',
  'DTSTART:19701025T030000',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19700329T020000',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
]

/**
 * Builds an RFC 5545 VCALENDAR string with Europe/Prague TZID pinning.
 *
 * - events.length === 0 → minimal VCALENDAR wrapper (still RFC 5545 valid)
 * - events.length === 1 → single VEVENT (one-way booking)
 * - events.length === 2 → two VEVENT blocks (round-trip booking, satisfies RTNF-03)
 *
 * DTSTART/DTEND use TZID=Europe/Prague format (no Z) — Prague wall-clock times
 * are preserved exactly, avoiding the UTC-Z drift bug in legacy generateICSContent
 * where a 14:00 Prague pickup would appear as 12:00 UTC in summer (CEST offset).
 */
export function buildIcs(events: IcsEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PRESTIGO//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...VTIMEZONE_EUROPE_PRAGUE,
  ]

  const stamp = dtstampUtcNow()

  for (const ev of events) {
    const start = formatLocal(ev.date, ev.time)
    const end = addMinutesToLocal(start, ev.durationMinutes ?? 60)
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Prague:${start}`,
      `DTEND;TZID=Europe/Prague:${end}`,
      `SUMMARY:${escapeIcsText(ev.summary)}`,
      `DESCRIPTION:${escapeIcsText(ev.description)}`,
      `LOCATION:${escapeIcsText(ev.location)}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
