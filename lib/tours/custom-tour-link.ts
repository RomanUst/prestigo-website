// Phase 93 (plan 93-05; D-13, D-16): the link of every "request a custom tour" entry point.
// While CUSTOM_TOUR_REQUEST_LIVE is false (the tours PR is in production without the request page) the link
// opens /contact, which receives the request as a contact inquiry. Plan 93-34 sets the constant true and the
// links then open /book/custom-tour with the prefill query. Pure and client-safe; query values are validated
// so a tampered value is dropped instead of reaching the URL.

import { TOUR_SLUG_PATTERN, TOUR_SLUG_MAX_LENGTH } from '@/lib/tours/types'

export const CUSTOM_TOUR_REQUEST_LIVE = false

export interface CustomTourQuery {
  tour?: string | null
  date?: string | null
  pax?: number | null
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function validSlug(v: unknown): v is string {
  return typeof v === 'string' && v.length <= TOUR_SLUG_MAX_LENGTH && TOUR_SLUG_PATTERN.test(v)
}

function validDate(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const m = DATE_RE.exec(v)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

function validPax(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 50
}

/** The link for an explicit live state; customTourHref passes the constant. Exported so both states are testable. */
export function buildCustomTourHref(q: CustomTourQuery, live: boolean): string {
  if (!live) return '/contact'
  const params = new URLSearchParams()
  if (validSlug(q.tour)) params.set('tour', q.tour)
  if (validDate(q.date)) params.set('date', q.date)
  if (validPax(q.pax)) params.set('pax', String(q.pax))
  const qs = params.toString()
  return qs ? `/book/custom-tour?${qs}` : '/book/custom-tour'
}

export function customTourHref(q: CustomTourQuery = {}): string {
  return buildCustomTourHref(q, CUSTOM_TOUR_REQUEST_LIVE)
}
