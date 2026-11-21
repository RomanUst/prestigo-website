// Phase 93 (plan 93-18; TRIP-04; T-93-51): what the tour checkout leaves for the confirmation page.
// /book/confirmation has no booking row to read, so the checkout writes a small snapshot to sessionStorage (tab scope)
// right before the navigation: the booking reference, the trip and the amount label the client has just seen.
// Display only, never trusted: readTourConfirmation validates every field, returns null for another reference or a
// tampered value, and the page falls back to its generic copy. No PII beyond what the confirmation page shows
// (the pickup address and the booking reference); the name, email and phone never go in here.

import { TOUR_CAR_KEYS, MAX_EXTRA_HOURS, type TourCarKey } from '@/lib/tours/types'

export interface TourConfirmationSnapshot {
  ref: string
  title: string
  /** YYYY-MM-DD, the pickup date. */
  date: string
  /** HH:MM, Prague time. */
  time: string
  pickupAddress: string
  carLabelKey: TourCarKey
  hoursIncluded: number
  extraHours: number
  /** Passengers of the booking (the checkout query); optional for snapshots written before 93-19. */
  passengers?: number
  /** Drive minutes one way (tour.drive_minutes_each_way): the calendar file covers 2 x this + the hours at the destination. */
  driveMinutes?: number
  payment: 'card' | 'cash'
  /** The amount as the client saw it (formatMinor), e.g. what the driver is paid for a cash booking. */
  amountLabel: string
}

const KEY_PREFIX = 'tour-confirmation:'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function storageKey(ref: string): string {
  return `${KEY_PREFIX}${ref}`
}

function str(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max
}

function int(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
}

/** The snapshot when every field is well-formed, else null. */
function validate(raw: unknown): TourConfirmationSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const s = raw as Record<string, unknown>
  if (!str(s.ref, 64) || !str(s.title, 200) || !str(s.pickupAddress, 500) || !str(s.amountLabel, 40)) return null
  if (typeof s.date !== 'string' || !DATE_RE.test(s.date)) return null
  if (typeof s.time !== 'string' || !TIME_RE.test(s.time)) return null
  if (typeof s.carLabelKey !== 'string' || !(TOUR_CAR_KEYS as readonly string[]).includes(s.carLabelKey)) return null
  if (!int(s.hoursIncluded, 1, 24) || !int(s.extraHours, 0, MAX_EXTRA_HOURS)) return null
  if (s.payment !== 'card' && s.payment !== 'cash') return null
  if (s.passengers !== undefined && !int(s.passengers, 1, 8)) return null
  if (s.driveMinutes !== undefined && !int(s.driveMinutes, 0, 600)) return null
  return {
    ref: s.ref,
    title: s.title,
    date: s.date,
    time: s.time,
    pickupAddress: s.pickupAddress,
    carLabelKey: s.carLabelKey as TourCarKey,
    hoursIncluded: s.hoursIncluded,
    extraHours: s.extraHours,
    ...(s.passengers !== undefined ? { passengers: s.passengers } : {}),
    ...(s.driveMinutes !== undefined ? { driveMinutes: s.driveMinutes } : {}),
    payment: s.payment,
    amountLabel: s.amountLabel,
  }
}

/** Stores the snapshot under 'tour-confirmation:<ref>'. Storage that throws (private mode, quota) is ignored. */
export function writeTourConfirmation(s: TourConfirmationSnapshot): void {
  if (typeof window === 'undefined') return
  const valid = validate(s)
  if (!valid) return
  try {
    window.sessionStorage.setItem(storageKey(valid.ref), JSON.stringify(valid))
  } catch {
    // The confirmation page then shows its generic copy.
  }
}

/** The snapshot of `ref`, validated; null when absent, for another reference, tampered or unreadable. */
export function readTourConfirmation(ref: string): TourConfirmationSnapshot | null {
  if (typeof window === 'undefined' || !ref) return null
  try {
    const raw = window.sessionStorage.getItem(storageKey(ref))
    if (!raw) return null
    const parsed = validate(JSON.parse(raw) as unknown)
    return parsed && parsed.ref === ref ? parsed : null
  } catch {
    return null
  }
}
