// One Stripe Customer per booking (Phase 88, plan 88-08; HOLD-01, Research Pattern 11).
//
// Row-first and idempotent: the booking row exists before this runs, the create carries the deterministic
// key cus:<bookingId>, and the returned id is persisted by the caller's applyTransition patch
// (stripe_customer_id). A booking that already has a Customer reuses it and only updates the contact
// details that changed. The contact details live in the Customer's dedicated fields; the Customer
// metadata is the booking id only.

import { randomBytes } from 'node:crypto'
import { getPaymentsStripe, stripeKeys } from '@/lib/payments/stripe'

export interface CustomerBooking {
  id: string
  client_first_name?: string | null
  client_last_name?: string | null
  client_email?: string | null
  client_phone?: string | null
  stripe_customer_id?: string | null
}

function fullName(b: CustomerBooking): string {
  return [b.client_first_name, b.client_last_name]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ')
}

export async function ensureStripeCustomer(booking: CustomerBooking): Promise<string> {
  const stripe = getPaymentsStripe()
  const email = (booking.client_email ?? '').trim()
  const name = fullName(booking)
  const phone = (booking.client_phone ?? '').trim()

  if (booking.stripe_customer_id) {
    const current = (await stripe.customers.retrieve(booking.stripe_customer_id)) as unknown as {
      id: string
      deleted?: boolean
      email?: string | null
      name?: string | null
      phone?: string | null
    }
    if (current.deleted) throw new Error('stripe customer was deleted')

    const changes: { email?: string; name?: string; phone?: string } = {}
    if (email && email !== (current.email ?? '')) changes.email = email
    if (name && name !== (current.name ?? '')) changes.name = name
    if (phone && phone !== (current.phone ?? '')) changes.phone = phone
    // An update is naturally repeatable, so it carries no idempotency key.
    if (Object.keys(changes).length > 0) await stripe.customers.update(booking.stripe_customer_id, changes)
    return booking.stripe_customer_id
  }

  const params = {
    ...(email ? { email } : {}),
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    metadata: { prestigoBookingId: booking.id },
  }
  try {
    const created = await stripe.customers.create(params, { idempotencyKey: stripeKeys.customer(booking.id) })
    return created.id
  } catch (err) {
    // A first attempt created the Customer, the booking never saved its id, and the client then changed their
    // details: Stripe refuses the same key with different parameters. Recover with a fresh random-suffixed
    // key (no personal data in it); every normal path keeps the deterministic key above.
    if ((err as { type?: unknown } | null)?.type !== 'StripeIdempotencyError') throw err
    const created = await stripe.customers.create(params, {
      idempotencyKey: `${stripeKeys.customer(booking.id)}:r${randomBytes(4).toString('hex')}`,
    })
    return created.id
  }
}

export interface QuoteCustomerSource {
  id: string
  client_first_name: string
  client_last_name: string
  client_email: string
  client_phone: string | null
  stripe_customer_id: string | null
}

/**
 * The Stripe Customer of a quote (Phase 92, plan 92-16; QUOTE-03). Separate from ensureStripeCustomer, which is keyed
 * by a booking: a quote has no booking until its deposit is paid. The create carries the deterministic key
 * cus:quote:<quoteId>; the Customer metadata is the quote id only (no name, email or reference); the contact details
 * live in the Customer's own fields. A quote that already has a Customer reuses it and updates only what changed.
 * The caller persists the returned id on quotes.stripe_customer_id.
 */
export async function ensureQuoteStripeCustomer(quote: QuoteCustomerSource): Promise<string> {
  const stripe = getPaymentsStripe()
  const email = (quote.client_email ?? '').trim()
  const name = [quote.client_first_name, quote.client_last_name]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ')
  const phone = (quote.client_phone ?? '').trim()

  if (quote.stripe_customer_id) {
    const current = (await stripe.customers.retrieve(quote.stripe_customer_id)) as unknown as {
      id: string
      deleted?: boolean
      email?: string | null
      name?: string | null
      phone?: string | null
    }
    if (current.deleted) throw new Error('stripe customer was deleted')

    const changes: { email?: string; name?: string; phone?: string } = {}
    if (email && email !== (current.email ?? '')) changes.email = email
    if (name && name !== (current.name ?? '')) changes.name = name
    if (phone && phone !== (current.phone ?? '')) changes.phone = phone
    if (Object.keys(changes).length > 0) await stripe.customers.update(quote.stripe_customer_id, changes)
    return quote.stripe_customer_id
  }

  const params = {
    ...(email ? { email } : {}),
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    metadata: { quoteId: quote.id },
  }
  try {
    const created = await stripe.customers.create(params, { idempotencyKey: stripeKeys.quoteCustomer(quote.id) })
    return created.id
  } catch (err) {
    // The first attempt created the Customer, the quote never saved its id, and the client's details changed since:
    // Stripe refuses the same key with different parameters. Recover with a random-suffixed key (no personal data in it).
    if ((err as { type?: unknown } | null)?.type !== 'StripeIdempotencyError') throw err
    const created = await stripe.customers.create(params, {
      idempotencyKey: `${stripeKeys.quoteCustomer(quote.id)}:r${randomBytes(4).toString('hex')}`,
    })
    return created.id
  }
}
