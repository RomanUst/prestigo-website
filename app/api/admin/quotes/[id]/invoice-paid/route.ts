import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { INVOICE_NUMBER_MAX, isValidInvoiceNumber, markInvoicePaid } from '@/lib/quotes/invoice'

// Mark the invoice of a quote paid (Phase 92, plan 92-24; QUOTE-04; D-17, D-22).
//
//   POST { invoice_number }   the invoice number the operator issued by hand: 1..60 characters, one line
//   -> 200 { changed }        true when this call recorded the payment, false when the same number was already recorded
//      | 400 invalid payload | 404 | 413
//      | 422 { error: 'action_not_allowed', reason }   reason: not_invoice (the remainder method is not invoice) |
//        not_paid (the quote is unpaid or cancelled) | number_conflict (another number is already recorded)
//      | 500
//
// It is a record, not a payment: no invoice document is generated and nothing moves through Stripe. The quote and its
// live quote-mode bookings get the number and the paid time, exactly once.
//
// Guard order: enforceMaxBody -> admin session (401 / 403) -> await params -> id is a uuid (400) -> JSON (400, 413) ->
// strict schema (400) -> engine (404, 422). Never cached; logs carry ids only: no invoice number, no address.

const MAX_BODY_BYTES = 1_000
const idSchema = z.string().uuid()
const bodySchema = z
  .object({
    invoice_number: z
      .string()
      .trim()
      .min(1)
      .max(INVOICE_NUMBER_MAX)
      .refine(isValidInvoiceNumber, 'invoice number must be one line of text'),
  })
  .strict()

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tooBig = enforceMaxBody(request, MAX_BODY_BYTES)
  if (tooBig) return tooBig

  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const { id } = await params
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid quote id' }, { status: 400, headers: NO_STORE })
  }

  const body = await readCappedJson(request, MAX_BODY_BYTES)
  if (!body.ok) return body.response
  const parsed = bodySchema.safeParse(body.json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400, headers: NO_STORE })
  }

  try {
    const result = await markInvoicePaid({ quoteId: id, invoiceNumber: parsed.data.invoice_number, actor: { id: user.id } })
    if (result.ok) return NextResponse.json({ changed: result.changed }, { headers: NO_STORE })
    if (result.code === 'not_found') return NextResponse.json({ error: 'Quote not found' }, { status: 404, headers: NO_STORE })
    return NextResponse.json({ error: 'action_not_allowed', reason: result.code }, { status: 422, headers: NO_STORE })
  } catch {
    console.error('[admin/quotes/[id]/invoice-paid] failed', { quoteId: id, adminId: user.id })
    return NextResponse.json({ error: 'Failed to mark the invoice paid' }, { status: 500, headers: NO_STORE })
  }
}
