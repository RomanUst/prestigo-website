import { createClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'

function getStripe() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opts: Record<string, unknown> = { maxNetworkRetries: 0 }
  if (typeof (Stripe as unknown as { createFetchHttpClient?: () => unknown }).createFetchHttpClient === 'function') {
    opts.httpClient = Stripe.createFetchHttpClient()
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY!, opts)
}

async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { user: null, error: '401' as const }
  if (!user.app_metadata?.is_admin) return { user: null, error: '403' as const }
  return { user, error: null }
}

const cancelSchema = z.object({
  id: z.string().uuid(),
})

const NON_CANCELLABLE_STATUSES = ['cancelled', 'completed']

export async function POST(request: Request) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = cancelSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const supabase = createSupabaseServiceClient()

  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, status, payment_intent_id')
    .eq('id', parsed.data.id)
    .single()

  if (fetchError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  if (NON_CANCELLABLE_STATUSES.includes(booking.status)) {
    return NextResponse.json(
      { error: `Cannot cancel a booking with status '${booking.status}'` },
      { status: 422 }
    )
  }

  // If online booking with Stripe payment, issue refund first
  if (booking.payment_intent_id) {
    let refund
    try {
      const stripe = getStripe()
      refund = await stripe.refunds.create({ payment_intent: booking.payment_intent_id })
    } catch (stripeError) {
      const msg = stripeError instanceof Error ? stripeError.message : 'Stripe refund failed'
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const { error: dbError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', parsed.data.id)

    if (dbError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

    return NextResponse.json({ ok: true, refund_id: refund.id })
  }

  // Manual booking — no Stripe, just update status
  const { error: dbError } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', parsed.data.id)

  if (dbError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
