/**
 * One-shot sessionStorage notice for the confirmation page (Phase 89, plan 89-18; CANC-02, UI-SPEC 2.5).
 *
 * The confirmation page has no booking row and must not show the manage link (a token on a page that the browser
 * history keeps would widen exposure). It gains two sentences only for a booking that stored its cancellation terms:
 * "We sent your confirmation and a link to manage your booking to your email." and, for a cash booking, "Pay {amount}
 * in cash to your driver.". The checkout step knows both facts at submit time (the init response carries a policy
 * exactly when the booking will store one, because the same isPolicyPublic decision drives both), so it writes this
 * notice right before the redirect, in the style of consumePurchaseSnapshot in lib/analytics-snapshot.ts.
 *
 * Keyed by booking reference, read once and cleared: a reload, a new tab, a stale entry of another booking or a
 * storage that throws all yield null, and the page then shows only its translated existing text.
 */

const STORAGE_KEY = 'prestigo-confirmation-notice'

export interface ConfirmationNotice {
  /** The booking reference this notice belongs to (outbound reference for a round trip). */
  ref: string
  /** Cash booking: the amount to pay the driver, already formatted (formatMinor). Absent for a card booking. */
  cash?: string
}

/** Write the notice. Called by the checkout steps immediately before the Stripe redirect, only for a stored policy. */
export function writeConfirmationNotice(notice: ConfirmationNotice): void {
  if (typeof window === 'undefined') return
  try {
    const entry: ConfirmationNotice = { ref: notice.ref }
    if (typeof notice.cash === 'string' && notice.cash.length > 0) entry.cash = notice.cash
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry))
  } catch {
    // Private mode or quota: the page simply shows no extra sentence.
  }
}

/** Read the notice for `ref` and clear it (one-shot). Null for no entry, another booking's entry or bad data. */
export function readConfirmationNotice(ref: string): ConfirmationNotice | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    window.sessionStorage.removeItem(STORAGE_KEY)
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const { ref: storedRef, cash } = parsed as { ref?: unknown; cash?: unknown }
    if (storedRef !== ref) return null
    return typeof cash === 'string' && cash.length > 0 ? { ref, cash } : { ref }
  } catch {
    return null
  }
}
