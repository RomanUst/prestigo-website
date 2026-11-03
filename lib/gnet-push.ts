import { createSupabaseServiceClient } from '@/lib/supabase'
import { pushGnetStatus, prestigoToGnetStatus } from '@/lib/gnet-client'

/**
 * Single GNet status push (Phase 87 D-04). Before this helper the same block
 * existed twice: the admin PATCH status branch and the driver-assign route.
 *
 * Fire-and-forget by contract: the caller schedules it inside after(), and it
 * never throws into the request — a failed push is logged and recorded on
 * gnet_bookings (last_push_status / last_push_error / last_pushed_at), never
 * surfaced to the admin (STATUS-02).
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

  // D-05: use the service client inside after() — the session client may be gone
  const svcSupabase = createSupabaseServiceClient()

  // D-02: separate query (not a JOIN) — surgical, isolated
  const { data: gnetRow } = await svcSupabase
    .from('gnet_bookings')
    .select('id, gnet_res_no')
    .eq('booking_id', bookingId)
    .single()

  if (!gnetRow) {
    // booking_source === 'gnet' but no gnet_bookings row — log and exit
    console.error(`${logTag} no gnet_bookings row for`, bookingId)
    return
  }

  // STATUS-01: push the mapped status
  let pushError: string | null = null
  try {
    const totalAmount = Number(amountEur).toFixed(2)
    await pushGnetStatus(gnetRow.gnet_res_no, gnetStatus, totalAmount)
  } catch (err) {
    // STATUS-02: never block admin — swallow and log
    pushError = err instanceof Error ? err.message : String(err)
    console.error(`${logTag} failed`, {
      bookingId,
      gnetResNo: gnetRow.gnet_res_no,
      gnetStatus,
      error: pushError,
    })
  }

  // STATUS-03 + D-05: log outcome regardless of success/failure
  const { error: auditErr } = await svcSupabase
    .from('gnet_bookings')
    .update({
      last_push_status: gnetStatus,
      last_push_error: pushError,
      last_pushed_at: new Date().toISOString(),
    })
    .eq('id', gnetRow.id)

  if (auditErr) {
    console.error(`${logTag} audit update failed`, {
      bookingId,
      gnetResNo: gnetRow.gnet_res_no,
      error: auditErr.message,
    })
  }
}
