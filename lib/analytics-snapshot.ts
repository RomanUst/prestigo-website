/**
 * One-shot sessionStorage snapshot for GA4 purchase events.
 *
 * Why this exists: Step6Payment triggers `window.location.href = ...` (or a
 * Stripe 3DS redirect via `return_url`) to reach /book/confirmation. Both
 * routes wipe in-memory state, and the Zustand persist middleware
 * intentionally does NOT persist `priceBreakdown` / `promoDiscount` (so that
 * admin price changes never serve stale values). Without this snapshot, the
 * confirmation page has no way to know the transaction amount and GA4
 * purchase events would fire with value=0, breaking revenue attribution.
 *
 * The snapshot is keyed by booking reference so a stale snapshot from a prior
 * purchase cannot leak into a different booking's event. It is read once and
 * cleared immediately to prevent double-counting on refresh or back-nav.
 */

const STORAGE_KEY = 'prestigo-purchase-snapshot'

export interface PurchaseSnapshotItem {
  item_id: string
  item_name: string
  item_category: string
  item_variant: string
  price: number
  quantity: number
}

export interface PurchaseSnapshot {
  ref: string
  value: number
  currency: string
  items: PurchaseSnapshotItem[]
}

/**
 * Write the purchase snapshot. Called from Step6Payment immediately before
 * the Stripe redirect so the data survives the cross-origin 3DS bounce.
 */
export function writePurchaseSnapshot(snapshot: PurchaseSnapshot): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // sessionStorage can throw in private mode or when quota is exceeded.
    // Analytics is non-critical — silently swallow.
  }
}

/**
 * Read the purchase snapshot, returning it only if the stored `ref` matches
 * the booking reference on the confirmation page. Always clears the snapshot
 * after reading (one-shot semantics).
 */
export function consumePurchaseSnapshot(ref: string): PurchaseSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    window.sessionStorage.removeItem(STORAGE_KEY)
    const parsed = JSON.parse(raw) as PurchaseSnapshot
    // Reject mismatched refs — prevents a stale snapshot from an earlier
    // booking leaking into a different confirmation page view.
    if (parsed.ref !== ref) return null
    return parsed
  } catch {
    return null
  }
}
