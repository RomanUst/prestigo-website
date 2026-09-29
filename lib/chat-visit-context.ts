/**
 * Visit context sent to Chatwoot as conversation custom attributes (Phase 77,
 * plan 10, D-06) — captured ONLY after the visitor clicks "Chat on site".
 *
 * Pure module: no browser globals at import time, no network, no cookies, no
 * web storage. The first-touch landing URL lives in module memory only.
 *
 * VISIT_CONTEXT_KEYS must equal the conversation attribute keys in
 * infra/chatwoot/custom-attributes.json (test-enforced), so every key we send
 * is a defined attribute in Chatwoot.
 *
 * Privacy (T-77-26): URLs keep only origin, path and utm_* params — email,
 * tokens and every other query param are dropped, as is the hash. The referrer
 * is reduced to origin + path. Hygiene (T-77-25): control characters removed,
 * values trimmed and capped at 200 characters, empty values omitted.
 */

export const VISIT_CONTEXT_KEYS = [
  'page_url',
  'landing_url',
  'site_locale',
  'referrer',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'book_trip_type',
  'book_origin',
  'book_destination',
  'book_vehicle',
  'chat_opened_at',
  'chat_consent',
] as const

export type VisitContextKey = (typeof VISIT_CONTEXT_KEYS)[number]
export type VisitContext = Partial<Record<VisitContextKey, string>>

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
const MAX_VALUE_LENGTH = 200
// C0 controls, DEL and C1 controls.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g

export interface BookingVisitData {
  tripType?: string | null
  origin?: string | null
  destination?: string | null
  vehicle?: string | null
}

export interface BuildVisitContextInput {
  /** window.location.href at click time. */
  pageHref: string
  /** First page of the visit (in-memory first touch). */
  landingHref?: string | null
  /** document.referrer. */
  referrer?: string | null
  siteLocale: string
  /** ISO timestamp of the click. */
  openedAt: string
  /** Only supplied while the visitor is inside /book. */
  booking?: BookingVisitData | null
}

function clean(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(CONTROL_CHARS, '').trim().slice(0, MAX_VALUE_LENGTH)
}

function parseHttpUrl(href: string | null | undefined): URL | null {
  if (!href) return null
  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** Sanitised utm_* params of a URL (control chars stripped, empties dropped). */
function utmParams(url: URL | null): Partial<Record<(typeof UTM_KEYS)[number], string>> {
  const out: Partial<Record<(typeof UTM_KEYS)[number], string>> = {}
  if (!url) return out
  for (const key of UTM_KEYS) {
    const value = clean(url.searchParams.get(key))
    if (value) out[key] = value
  }
  return out
}

/** origin + pathname + utm_* only. */
function sanitizeUrl(url: URL | null): string {
  if (!url) return ''
  const out = new URL(url.origin + url.pathname)
  for (const [key, value] of Object.entries(utmParams(url))) {
    out.searchParams.set(key, value)
  }
  return clean(out.toString())
}

export function buildVisitContext(input: BuildVisitContextInput): VisitContext {
  const page = parseHttpUrl(input.pageHref)
  const landing = parseHttpUrl(input.landingHref)
  const referrer = parseHttpUrl(input.referrer)

  const utm = { ...utmParams(page), ...utmParams(landing) }

  const candidates: Array<[VisitContextKey, string]> = [
    ['page_url', sanitizeUrl(page)],
    ['landing_url', sanitizeUrl(landing)],
    ['site_locale', clean(input.siteLocale)],
    ['referrer', referrer ? clean(referrer.origin + referrer.pathname) : ''],
    ['utm_source', utm.utm_source ?? ''],
    ['utm_medium', utm.utm_medium ?? ''],
    ['utm_campaign', utm.utm_campaign ?? ''],
    ['utm_term', utm.utm_term ?? ''],
    ['utm_content', utm.utm_content ?? ''],
    ['chat_opened_at', clean(input.openedAt)],
    // The click is the consent (D-02): an audit trail inside Chatwoot, no new site storage.
    ['chat_consent', 'click-to-open'],
  ]

  if (input.booking) {
    candidates.push(
      ['book_trip_type', clean(input.booking.tripType)],
      ['book_origin', clean(input.booking.origin)],
      ['book_destination', clean(input.booking.destination)],
      ['book_vehicle', clean(input.booking.vehicle)],
    )
  }

  const context: VisitContext = {}
  for (const [key, value] of candidates) {
    if (value) context[key] = value
  }
  return context
}

// ── First-touch landing URL: in memory only (no cookie, no storage, no network) ──

let landingHref: string | null = null

/** Records the first href seen; later calls are ignored. */
export function rememberLandingHref(href: string): void {
  if (landingHref === null) landingHref = href
}

export function getLandingHref(): string | null {
  return landingHref
}

/** Test seam — resets the in-memory first touch. */
export function resetLandingHrefForTests(): void {
  landingHref = null
}
