import { createSupabaseServiceClient } from '@/lib/supabase'

/**
 * Deduplication helper for email sends.
 *
 * Checks if an email of the same type has already been sent for the given
 * booking within the last 10 minutes (D-16). If no duplicate exists, logs
 * the send to email_log and returns true (allow send). If a duplicate exists,
 * returns false (suppress send).
 *
 * Graceful degradation: if the INSERT fails after the dedup check passes,
 * returns true anyway — better to send a possibly-duplicate email than to
 * block all sends on a log failure.
 *
 * @param params.bookingId - UUID of the booking, or null for system emails
 * @param params.emailType - e.g. 'confirmed', 'cancelled', 'driver_assigned', 'reminder_24h', 'reminder_2h', 'review_request'
 * @param params.recipient - email address of the recipient
 * @returns true if the email should be sent (no duplicate), false if suppressed
 */
export async function logEmail(params: {
  bookingId: string | null
  emailType: string
  recipient: string
}): Promise<boolean> {
  const supabase = createSupabaseServiceClient()

  // D-16: Dedup check — same booking_id + email_type within last 10 minutes
  const { data: existing } = await supabase
    .from('email_log')
    .select('id')
    .eq('booking_id', params.bookingId)
    .eq('email_type', params.emailType)
    .gte('sent_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .limit(1)

  if (existing && existing.length > 0) return false

  // D-15: Write row BEFORE Resend call (caller checks return value)
  const { error } = await supabase
    .from('email_log')
    .insert({
      booking_id: params.bookingId,
      email_type: params.emailType,
      recipient: params.recipient,
    })

  if (error) {
    console.error('[email-log] insert failed:', error.message)
    // Still return true — allow the send even if logging fails
    // (better to send a possibly-duplicate email than block all sends on log failure)
  }

  return true
}
