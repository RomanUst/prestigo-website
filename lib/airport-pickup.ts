// Phase 91 (STOP-05, D-07, D-18): an airport pickup is timed after the flight lands. The customer gives the landing
// date, time and how many minutes after landing the driver should be there; the pickup is derived from those.
//
// Pure and client-safe (imports only the Prague helpers, which import nothing server-side). All arithmetic is on
// instants from pickupInstantMs and the Intl-based Prague formatters, never on local Date getters or strings, so the
// result is the same in any server time zone, on the DST-change days and across midnight (23:50 + 30 -> 00:20 next day).

import { pickupInstantMs } from '@/lib/prague-date'
import { formatPragueTime, pragueDateOf } from '@/lib/prague-calendar'

/** Minutes after landing the driver can be at the arrivals hall (D-07). */
export const LANDING_OFFSETS = [0, 15, 30, 45, 60, 90] as const

/** The wizard preselects this offset. */
export const DEFAULT_LANDING_OFFSET = 30

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

export function isLandingOffset(n: number): boolean {
  return (LANDING_OFFSETS as readonly number[]).includes(n)
}

/**
 * The pickup that follows from a landing: landing (Prague wall clock) + offset minutes. Null for an offset outside
 * LANDING_OFFSETS or a landing date / time that does not parse (31 February, 25:00); never throws.
 *
 * On the spring DST day the missing hour is skipped by instant arithmetic (01:50 + 30 -> 03:20). For the ambiguous
 * autumn hour pickupInstantMs picks one instant (the second, CET occurrence) and the offset is added to that.
 */
export function pickupFromLanding(
  landingDate: string,
  landingTime: string,
  offsetMin: number,
): { pickupMs: number; pickupDate: string; pickupTime: string } | null {
  if (!isLandingOffset(offsetMin)) return null
  if (!DATE_RE.test(landingDate) || !TIME_RE.test(landingTime)) return null
  const landingMs = pickupInstantMs({ pickup_utc: null, pickup_date: landingDate, pickup_time: landingTime })
  if (landingMs === null) return null
  const pickupMs = landingMs + offsetMin * 60_000
  return { pickupMs, pickupDate: pragueDateOf(pickupMs), pickupTime: formatPragueTime(pickupMs) }
}

/**
 * The end of the free waiting at an airport pickup. It is measured from the PICKUP, never from the landing: the
 * driver is there from the pickup, so landing 14:00 + 30 with 60 free minutes gives 15:30.
 */
export function freeWaitUntilMs(pickupMs: number, freeMinutes: number): number {
  return pickupMs + freeMinutes * 60_000
}
