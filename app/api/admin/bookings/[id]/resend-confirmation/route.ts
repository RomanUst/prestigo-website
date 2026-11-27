import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { enforceMaxBody } from '@/lib/request-guards'
import { logEmail } from '@/lib/email-log'
import { sendStatusConfirmedEmail } from '@/lib/email'
import { buildPolicyBlockHtml } from '@/lib/payments/emails/policy-block'

// The operator sends the "Booking confirmed" email again, with the booking as it is stored NOW — e.g. after the
// pickup date was moved at the client's request. A trip edit saved without "notify client" leaves the client with
// the old details; this is how they get the current ones.
//
//   POST (no body)
//   -> 200 { ok: true } | 400 bad id | 401 / 403 | 404 not_found | 422 not_confirmed
//      | 429 recently_sent (same email to the same address within 10 minutes) | 502 send_failed
//
// After a successful send the booking's change-history rows still marked "Not notified" are marked notified:
// the email the client just received carries every one of those changes.

const idSchema = z.string().uuid()

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const bodyCheck = enforceMaxBody(request, 256)
  if (bodyCheck) return bodyCheck

  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: bookingId } = await params
  if (!idSchema.safeParse(bookingId).success) {
    return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()
  const { data: booking, error: dbError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle()

  if (dbError) {
    console.error('[admin/bookings/resend-confirmation] read failed:', dbError.message)
    return NextResponse.json({ error: 'DB read failed' }, { status: 500 })
  }
  if (!booking) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (booking.status !== 'confirmed') {
    return NextResponse.json({ error: 'not_confirmed' }, { status: 422 })
  }

  // Dedup gate (D-15/D-16): the row is written before Resend; a second press within 10 minutes is refused.
  const shouldSend = await logEmail({
    bookingId: booking.id,
    emailType: 'booking_confirmed',
    recipient: booking.client_email,
  })
  if (!shouldSend) return NextResponse.json({ error: 'recently_sent' }, { status: 429 })

  const policyBlockHtml = await buildPolicyBlockHtml(booking).catch(() => '')
  const sent = await sendStatusConfirmedEmail(policyBlockHtml ? { ...booking, policyBlockHtml } : booking)
  if (!sent) {
    // Let the operator try again at once: the dedup row of a failed send must not block the retry.
    await supabase
      .from('email_log')
      .delete()
      .eq('booking_id', booking.id)
      .eq('email_type', 'booking_confirmed')
      .eq('recipient', booking.client_email)
      .gte('sent_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    return NextResponse.json({ error: 'send_failed' }, { status: 502 })
  }

  const { error: auditError } = await supabase
    .from('booking_edit_audit_log')
    .update({ notified: true })
    .eq('booking_id', booking.id)
    .eq('notified', false)
  if (auditError) {
    console.error('[admin/bookings/resend-confirmation] audit mark failed:', auditError.message)
  }

  return NextResponse.json({ ok: true })
}
