// Phase 93 (plan 93-12; TRIP-04; T-93-33): the query string that carries a configured tour trip from the page's
// booking box to /book/tour. Everything in a URL is user-editable, so parseTourCheckoutQuery validates every value
// and drops unknown keys; the server (93-16 / 93-17) re-validates and re-prices. Pure and client-safe.

import { VEHICLE_CONFIG } from '@/types/booking'
import { MAX_EXTRA_HOURS, TOUR_CAR_KEYS, TOUR_SLUG_MAX_LENGTH, TOUR_SLUG_PATTERN, type TourCarKey } from '@/lib/tours/types'

export type TourCheckoutQuery = {
  tour: string
  date: string
  time: string
  pax: number
  car: TourCarKey
  xh: number
}

/** Largest party any car class holds (the van): the passenger ceiling of the box and the checkout. */
export const MAX_TOUR_PASSENGERS = Math.max(...VEHICLE_CONFIG.map((v) => v.maxPassengers))

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/
const INT_RE = /^\d{1,3}$/

function validDate(v: string): boolean {
  const m = DATE_RE.exec(v)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

/** sessionStorage key under which the box keeps its values for 'Change trip details' (93-13 restores them). */
export function tourBoxStorageKey(slug: string): string {
  return `tour-box:${slug}`
}

/** '/book/tour?tour=..&date=..&time=..&pax=..&car=..&xh=..' (locale prefix is added by the i18n router). */
export function buildTourCheckoutHref(q: TourCheckoutQuery): string {
  const params = new URLSearchParams()
  params.set('tour', q.tour)
  params.set('date', q.date)
  params.set('time', q.time)
  params.set('pax', String(q.pax))
  params.set('car', q.car)
  params.set('xh', String(q.xh))
  return `/book/tour?${params.toString()}`
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>

function pick(params: ParamSource, key: string): string | null {
  if (params instanceof URLSearchParams) return params.get(key)
  const v = params[key]
  if (Array.isArray(v)) return v[0] ?? null
  return typeof v === 'string' ? v : null
}

/** The six values validated, or null when any is missing or out of range. Extra keys are ignored. */
export function parseTourCheckoutQuery(params: ParamSource): TourCheckoutQuery | null {
  const tour = pick(params, 'tour')
  const date = pick(params, 'date')
  const time = pick(params, 'time')
  const pax = pick(params, 'pax')
  const car = pick(params, 'car')
  const xh = pick(params, 'xh')
  if (tour === null || date === null || time === null || pax === null || car === null || xh === null) return null

  if (tour.length > TOUR_SLUG_MAX_LENGTH || !TOUR_SLUG_PATTERN.test(tour)) return null
  if (!validDate(date)) return null
  if (!TIME_RE.test(time)) return null
  if (!INT_RE.test(pax) || !INT_RE.test(xh)) return null
  const paxN = Number(pax)
  const xhN = Number(xh)
  if (paxN < 1 || paxN > MAX_TOUR_PASSENGERS) return null
  if (xhN < 0 || xhN > MAX_EXTRA_HOURS) return null
  if (!(TOUR_CAR_KEYS as readonly string[]).includes(car)) return null

  return { tour, date, time, pax: paxN, car: car as TourCarKey, xh: xhN }
}
