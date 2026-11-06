// Cancellation box and Manage booking button for the English legacy emails (Phase 89, plan 89-18; CANC-02, MAIL-01,
// D-01, UI-SPEC 8.1).
//
// The pay-now confirmation, round-trip, group, status-confirmed and reminder emails of lib/email.ts stay English; the
// block they embed is built here in the booking's own language by the Phase 88 renderer (same catalog, same escaping,
// same bdi isolation), so the pay-now majority of clients sees the same terms and the same link as card clients.
//
// Stored-terms gate (D-18): a booking without cancel_policy_version produces NO block and no database call, so an
// email for a booking made before go-live is byte-identical to today's. Any failure while building drops the block,
// never the email (the callers pass '' / undefined through and the legacy builders print nothing).
//
// Server-only by use (service client through the shared helpers of send.ts).

import { czkToEur } from '@/lib/currency'
import { proposedFeeMinor } from '@/lib/cancellation-policy'
import { renderPolicyBlock, type PolicyBlockItem } from '@/lib/payments/emails/render'
import { hasStoredPolicy, manageUrlFromRow, policyBoxFromRow } from '@/lib/payments/emails/send'
import type { PaymentCurrency } from '@/lib/payments/money'

type BookingRow = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const minor = (v: unknown): number | null => {
  const n = num(v)
  return n !== null && n > 0 ? Math.round(n) : null
}

/**
 * The fare a late-cancel fee is a share of, and its currency: the same base lib/payments/fee.ts feeBaseFor gives the
 * fee engine (kept as a local copy so that the confirmation emails do not load the Stripe engine; a test pins the
 * two together). Card and cash rows: payment_amount_minor in payment_currency. Pay-now: the leg's own CZK amount in
 * EUR cents when the row is a priced leg, else amount_eur in cents.
 */
export function policyFareOf(row: BookingRow): { baseMinor: number; currency: PaymentCurrency } | null {
  const mode = row.payment_mode
  if (mode === 'card_hold' || mode === 'cash_guarantee') {
    const baseMinor = minor(row.payment_amount_minor)
    const currency = row.payment_currency === 'czk' ? 'czk' : row.payment_currency === 'eur' ? 'eur' : null
    return baseMinor !== null && currency ? { baseMinor, currency } : null
  }
  const leg = row.leg === 'outbound' || row.leg === 'return' ? row.leg : null
  if (leg) {
    const czk = num(leg === 'outbound' ? row.outbound_amount_czk : row.return_amount_czk)
    if (czk !== null && czk > 0) {
      const baseMinor = Math.round(czkToEur(czk) * 100)
      if (baseMinor > 0) return { baseMinor, currency: 'eur' }
    }
  }
  const eur = num(row.amount_eur)
  if (eur === null || eur <= 0) return null
  const baseMinor = Math.round(eur * 100)
  return baseMinor > 0 ? { baseMinor, currency: 'eur' } : null
}

async function itemOf(row: BookingRow): Promise<PolicyBlockItem | null> {
  if (!hasStoredPolicy(row)) return null
  const fare = policyFareOf(row)
  const [policy, manageUrl] = await Promise.all([
    fare ? policyBoxFromRow(row, fare.baseMinor) : Promise.resolve(null),
    manageUrlFromRow(row),
  ])
  if (!policy && !manageUrl) return null
  const cash = row.payment_mode === 'cash_guarantee' ? minor(row.payment_amount_minor) : null
  return {
    reference: str(row.booking_reference) || undefined,
    policy,
    manageUrl: manageUrl ?? null,
    currency: fare?.currency ?? 'eur',
    cashAmountMinor: policy ? cash : null,
  }
}

export interface PolicyBlockOptions {
  /** 'each' (default): one box per booking; 'first': one box, then one link per booking (group payment). */
  boxes?: 'each' | 'first'
}

/**
 * The block for one booking row or several (round trip: both legs; group: every row). Returns '' when no row stored a
 * policy, when nothing could be built, or on any failure. The block is in the first row's language.
 */
export async function buildPolicyBlockHtml(
  input: BookingRow | BookingRow[],
  options: PolicyBlockOptions = {},
): Promise<string> {
  const rows = (Array.isArray(input) ? input : [input]).filter((r): r is BookingRow => Boolean(r) && typeof r === 'object')
  if (rows.length === 0 || !rows.some(hasStoredPolicy)) return ''
  try {
    const built = await Promise.all(rows.map(itemOf))
    const items = built.filter((i): i is PolicyBlockItem => i !== null)
    if (items.length === 0) return ''
    // The reference only names a booking when the email carries several of them.
    const single = items.length === 1 && rows.length === 1
    const prepared = single ? items.map((i) => ({ ...i, reference: undefined })) : items
    return await renderPolicyBlock(rows[0].locale, prepared, { boxes: options.boxes })
  } catch {
    console.error('[policy-block] dropped', { bookingId: str(rows[0]?.id) })
    return ''
  }
}
