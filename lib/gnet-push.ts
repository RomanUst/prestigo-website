import { createSupabaseServiceClient } from '@/lib/supabase'
import { pushGnetStatus, prestigoToGnetStatus } from '@/lib/gnet-client'

/**
 * Single GNet status push (Phase 87 D-04). Before this helper the same block
 * existed twice: the admin PATCH status branch and the driver-assign route.
 *
 * Fire-and-forget by contract: the caller schedules it inside after(), and it
 * never throws into the request — a failed push is logged and recorded on
 * gnet_bookings (last_push_error), never surfaced to the admin (STATUS-02).
 *
 * Idempotent per status (D-04, DRV-05): claim-then-push. One conditional
 * update of gnet_bookings sets last_push_status = X, last_push_error = null,
 * last_pushed_at = now WHERE booking_id = id AND (last_push_status IS NULL OR
 * last_push_status <> X OR last_push_error IS NOT NULL), and GNet is called
 * only when that update claimed a row. A repeat of the same status after a
 * success claims nothing and sends nothing; after a failure (error set,
 * status kept at X) the next call claims again and retries.
 *
 * Delivery semantics: at-most-once per status across a crash. The claim
 * commits before the GNet call, so a process that dies between the claim and
 * the recorded outcome leaves last_push_status = X with last_push_error null
 * and that status is never retried (the booking's next status still reaches
 * GNet). The reverse order (push, then record) would duplicate on retry,
 * which D-04 forbids.
 *
 * X comes only from the fixed prestigoToGnetStatus map, so the or-filter
 * string never contains user input.
 *
 * Returns without any query when the booking is not a GNet booking or the
 * Prestigo status has no GNet equivalent (prestigoToGnetStatus returns null).
 *
 * logTag keeps today's two console prefixes: '[gnet-status-push]' for the
 * status service, '[assign:gnet-push]' for the assign route.
 */
export async function pushGnetForTransition(input: {
  bookingId: string
  bookingSource: string | null
  status: string
  amountEur: unknown
  logTag: string
}): Promise<void> {
  const { bookingId, bookingSource, status, amountEur, logTag } = input

  if (bookingSource !== 'gnet') return
  const gnetStatus = prestigoToGnetStatus(status)
  if (!gnetStatus) return

  try {
    // D-05: use the service client inside after() — the session client may be gone
    const svcSupabase = createSupabaseServiceClient()

    const nowIso = new Date().toISOString()
    const { data: claimed, error: claimErr } = await svcSupabase
      .from('gnet_bookings')
      .update({ last_push_status: gnetStatus, last_push_error: null, last_pushed_at: nowIso })
      .eq('booking_id', bookingId)
      .or(`last_push_status.is.null,last_push_status.neq.${gnetStatus},last_push_error.not.is.null`)
      .select('id, gnet_res_no')

    if (claimErr) {
      console.error(`${logTag} claim failed`, { bookingId, gnetStatus, error: claimErr.message })
      return
    }

    const gnetRow = claimed?.[0]
    if (!gnetRow) {
      // Nothing claimed: either already pushed (silent) or no row at all (log).
      const { data: existing } = await svcSupabase
        .from('gnet_bookings')
        .select('id')
        .eq('booking_id', bookingId)
        .maybeSingle()
      if (!existing) {
        // booking_source === 'gnet' but no gnet_bookings row — log and exit
        console.error(`${logTag} no gnet_bookings row for`, bookingId)
      }
      return
    }

    // STATUS-01: push the mapped status
    try {
      const totalAmount = Number(amountEur).toFixed(2)
      await pushGnetStatus(gnetRow.gnet_res_no, gnetStatus, totalAmount)
    } catch (err) {
      // STATUS-02: never block admin — swallow, log and record the error.
      // last_push_status stays X (STATUS-03) so the next call retries.
      const pushError = err instanceof Error ? err.message : String(err)
      console.error(`${logTag} failed`, {
        bookingId,
        gnetResNo: gnetRow.gnet_res_no,
        gnetStatus,
        error: pushError,
      })
      const { error: auditErr } = await svcSupabase
        .from('gnet_bookings')
        .update({ last_push_error: pushError })
        .eq('id', gnetRow.id)
      if (auditErr) {
        console.error(`${logTag} audit update failed`, {
          bookingId,
          gnetResNo: gnetRow.gnet_res_no,
          error: auditErr.message,
        })
      }
    }
  } catch (err) {
    // Never block the caller
    console.error(`${logTag} unexpected error`, {
      bookingId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
