// WR-03 (Phase 64 review): shared display/copy logic for the two payment-link
// UI surfaces — BookingsTable's row-level PaymentLinkSection and
// ManualBookingForm's create-with-payment result panel. Previously
// byte-for-byte duplicated in both files; any future fix (clipboard-permission
// edge case, truncation-length change) now applies in one place.

/**
 * E2 overflow rule: display-truncate with a middle ellipsis; the FULL url is
 * always what gets copied / used as the href — truncation is display-only.
 */
export function truncatePaymentLinkUrl(str: string, max = 46): string {
  if (str.length <= max) return str
  const keep = Math.floor((max - 3) / 2)
  return `${str.slice(0, keep)}...${str.slice(str.length - keep)}`
}

/**
 * Copy a payment link URL to the clipboard, with a DOM-selection fallback for
 * browsers/contexts where the Clipboard API is unavailable or denied (E2
 * error/overflow rule — never a silent no-op).
 *
 * Returns `true` when the clipboard write succeeded (caller should show a
 * "Copied" confirmation). Returns `false` when the fallback ran instead — the
 * matching text element (by `fallbackElementId`) is auto-selected so the
 * operator can copy manually, but the caller should NOT show "Copied" since
 * nothing was actually written to the clipboard yet.
 */
export async function copyPaymentLinkToClipboard(url: string, fallbackElementId: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url)
      return true
    } catch {
      // fall through to manual-select fallback
    }
  }
  const el = document.getElementById(fallbackElementId)
  if (el && typeof window !== 'undefined') {
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }
  return false
}
