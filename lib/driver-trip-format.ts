/**
 * Driver trip screen formatting (Phase 87 D-14, UI-SPEC "SlideToAdvance" / "Time row").
 * Pure helpers: every instant is rendered as Europe/Prague wall-clock time, so the result does not
 * depend on the phone's or the server's time zone and is correct across the DST changes.
 */

const PRAGUE_TZ = 'Europe/Prague'

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: PRAGUE_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: PRAGUE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const dayNameFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: PRAGUE_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

const calendarDateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? ''
}

function validDate(iso: string): Date | null {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 'HH:MM' in Europe/Prague. An unparseable instant gives '--:--' (never throws). */
export function formatPragueTime(iso: string): string {
  const d = validDate(iso)
  if (!d) return '--:--'
  const parts = timeFormat.formatToParts(d)
  return `${part(parts, 'hour')}:${part(parts, 'minute')}`
}

/**
 * 'Unlocks at 12:30' when the unlock falls on the same Prague calendar day as `nowMs`, otherwise
 * 'Unlocks on Tue 4 Nov at 06:15'.
 */
export function formatPragueUnlock(iso: string, nowMs: number): string {
  const d = validDate(iso)
  if (!d) return 'Unlocks later'
  const time = formatPragueTime(iso)
  if (dayFormat.format(d) === dayFormat.format(new Date(nowMs))) return `Unlocks at ${time}`
  const parts = dayNameFormat.formatToParts(d)
  const day = `${part(parts, 'weekday')} ${part(parts, 'day')} ${part(parts, 'month')}`
  return `Unlocks on ${day} at ${time}`
}

/** 'Wed 4 Nov 2026' from a bookings.pickup_date value (YYYY-MM-DD, already a Prague calendar date). */
export function formatPickupDate(pickupDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(pickupDate)
  if (!m) return pickupDate
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  const parts = calendarDateFormat.formatToParts(d)
  return `${part(parts, 'weekday')} ${part(parts, 'day')} ${part(parts, 'month')} ${part(parts, 'year')}`
}

/** 'HH:MM' from a bookings.pickup_time value ('10:00' or '10:00:00'). */
export function formatPickupTime(pickupTime: string): string {
  return pickupTime.slice(0, 5)
}

/** Status chip labels shown to the driver (the current status only, never the list of steps). */
export const DRIVER_STATUS_LABEL: Record<string, string> = {
  assigned: 'Assigned',
  en_route: 'En route',
  on_location: 'On site',
  on_board: 'On board',
  confirmed: 'Confirmed',
  pending: 'Pending',
  unpaid: 'Unpaid',
}
