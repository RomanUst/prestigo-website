// Pure link builders and URL validators for the Chatwoot Dashboard App (Phase 84).
// Bundled into the iframe client: no server imports, no node built-ins.

export const ADMIN_HOME_HREF = '/admin'
export const ADMIN_ALL_BOOKINGS_HREF = '/admin/bookings'

// readBookingDeepLink on the admin side accepts nothing else (RESEARCH Pitfall 10).
const REFERENCE_RE = /^[A-Za-z0-9-]{1,40}$/
const ESPO_ID_RE = /^[0-9a-f]{17}$/

/** Deep link into the admin bookings table, only for an allowlisted reference. */
export function adminBookingHref(reference: string | null): string | null {
  if (typeof reference !== 'string' || !REFERENCE_RE.test(reference)) return null
  return `${ADMIN_ALL_BOOKINGS_HREF}?search=${encodeURIComponent(reference)}`
}

/** A Stripe payment link: https, host exactly buy.stripe.com, no credentials, default port. */
export function isSafePaymentLinkUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url === '') return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === 'buy.stripe.com' &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.port === ''
  )
}

/** EspoCRM Lead detail URL; the base must be https and the id 17 lower-case hex characters. */
export function espoLeadUrl(base: string | null, id: string | null): string | null {
  if (typeof base !== 'string' || typeof id !== 'string' || !ESPO_ID_RE.test(id)) return null
  let parsed: URL
  try {
    parsed = new URL(base)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') return null
  return `${base.replace(/\/+$/, '')}/#Lead/view/${id}`
}
