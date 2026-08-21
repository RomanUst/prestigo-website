import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

/**
 * GET /api/admin/bookings/[id]/audit-log — history read for the change-history
 * UI (D-11, FOLLOW-02). Lazy per-row fetch, admin-guarded, ordered newest-first.
 *
 * Deliberately does NOT extend the admin_search_bookings RPC (Pitfall 4 —
 * that SECURITY DEFINER RPC returns raw bookings.* only, no audit join); this
 * is a dedicated lightweight route the history block calls on row expand.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Auth guard — verbatim admin 401/403 pattern.
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 2. Booking id from the dynamic route params (Next.js 16 — await params).
  const { id: bookingId } = await params

  const supabase = createSupabaseServiceClient()

  // 3. Audit rows for this booking, newest-first.
  const { data, error: dbError } = await supabase
    .from('booking_edit_audit_log')
    .select('id, field, old_value, new_value, operator_id, changed_at, notified')
    .eq('booking_id', bookingId)
    .order('changed_at', { ascending: false })

  if (dbError) {
    console.error('[admin/bookings/audit-log.GET] DB read failed:', dbError.message)
    return NextResponse.json({ error: 'DB read failed' }, { status: 500 })
  }

  // 4. A booking with zero edits returns 200 with an empty array, not 404.
  return NextResponse.json({ rows: data ?? [] })
}
