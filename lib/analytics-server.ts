/**
 * Server-side GA4 Measurement Protocol.
 *
 * Why this exists: the client-side pushGA4Event('purchase', ...) in
 * app/book/confirmation/page.tsx fires at an unreliable moment — after a
 * Stripe redirect / hard page reload wipes Zustand state. If the
 * sessionStorage snapshot is lost (iOS Safari private mode, cross-origin
 * 3DS bounce, aggressive privacy extensions), the event fires with value=0
 * and GA4 silently drops it during aggregate processing. Google Ads then
 * never imports the conversion.
 *
 * This server-side path fires the same `purchase` event from the Stripe
 * webhook where we know the authoritative amount from the DB. Client + server
 * events share the same `transaction_id`, so GA4 dedupes automatically.
 *
 * Fire-and-forget: failures are logged but do not throw — analytics is
 * non-critical and must not block booking confirmation.
 */

const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect'

export interface Ga4PurchaseItem {
  item_id: string
  item_name: string
  item_category: string
  item_variant?: string
  price: number
  quantity: number
}

export interface Ga4PurchaseParams {
  transactionId: string
  valueEur: number
  currency?: string // defaults to 'EUR'
  items: Ga4PurchaseItem[]
  /** Optional GA4 client_id if we captured it at payment-intent time (not currently persisted). */
  clientId?: string
}

/**
 * Send a purchase event to GA4 via Measurement Protocol.
 * No-op if GA4_MEASUREMENT_ID or GA4_API_SECRET is not configured.
 * Returns true on 204 acceptance, false otherwise. Never throws.
 */
export async function sendGa4Purchase(params: Ga4PurchaseParams): Promise<boolean> {
  const measurementId = process.env.NEXT_PUBLIC_GA_ID
  const apiSecret = process.env.GA4_API_SECRET

  if (!measurementId || !apiSecret) {
    // Silent skip — envs not set yet (e.g. preview deploys without secret).
    return false
  }

  // Stable pseudo-client_id derived from transaction — keeps the server event
  // linked to the same "user" for GA4's modeling, and makes retries idempotent.
  const clientId =
    params.clientId ?? `srv-${hashString(params.transactionId)}.${Math.floor(Date.now() / 1000)}`

  const body = {
    client_id: clientId,
    non_personalized_ads: false,
    events: [
      {
        name: 'purchase',
        params: {
          transaction_id: params.transactionId,
          value: params.valueEur,
          currency: params.currency ?? 'EUR',
          affiliation: 'PRESTIGO',
          engagement_time_msec: 100,
          items: params.items,
        },
      },
    ],
  }

  try {
    const res = await fetch(
      `${GA4_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )
    if (!res.ok) {
      console.error('[ga4-mp] non-2xx:', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (err) {
    console.error('[ga4-mp] fetch failed:', err instanceof Error ? err.message : err)
    return false
  }
}

/** Simple FNV-1a 32-bit hash — sufficient for client_id derivation, not cryptographic. */
function hashString(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
