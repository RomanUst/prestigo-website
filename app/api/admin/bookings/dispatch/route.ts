import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

// Admin-only range read for the dispatch board and calendar (DISP-01).
// Reads through the existing admin_search_bookings RPC; no new SQL.
//
// The RPC filters the Prague pickup_date TEXT column, so the date strings are
// passed through as Prague calendar dates and never converted to UTC bounds.

const NO_STORE = { 'Cache-Control': 'no-store' }
const PAGE_SIZE = 100 // the RPC clamps p_limit to 100
const MAX_PAGES = 5 // hard ceiling: 500 rows per request
const MAX_RANGE_DAYS = 62 // same value as lib/prague-calendar.ts; the client validates first, the server is the authority
const DAY_MS = 86_400_000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const KNOWN_TRIP_TYPES = new Set(['transfer', 'hourly', 'daily', 'round_trip'])

/** Strict YYYY-MM-DD that is also a real calendar date; returns UTC-midnight ms or null. */
function parseIsoDate(value: string | null): number | null {
  if (!value || !DATE_RE.test(value)) return null
  const ms = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  // Round trip rejects impossible dates such as 2027-02-30 (Date.parse rolls them over).
  if (new Date(ms).toISOString().slice(0, 10) !== value) return null
  return ms
}

export async function GET(request: Request) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE })

  const searchParams = new URL(request.url).searchParams
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const rawSearch = searchParams.get('search')
  const rawTripType = searchParams.get('tripType')

  const startMs = parseIsoDate(startDate)
  const endMs = parseIsoDate(endDate)
  if (startMs === null || endMs === null || startMs > endMs) {
    return NextResponse.json({ error: 'invalid_range' }, { status: 400, headers: NO_STORE })
  }
  const spanDays = Math.round((endMs - startMs) / DAY_MS) + 1
  if (spanDays > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: 'invalid_range' }, { status: 400, headers: NO_STORE })
  }

  let tripType: string | null = null
  if (rawTripType) {
    if (!KNOWN_TRIP_TYPES.has(rawTripType)) {
      return NextResponse.json({ error: 'invalid_trip_type' }, { status: 400, headers: NO_STORE })
    }
    tripType = rawTripType
  }

  const trimmed = rawSearch ? rawSearch.trim().slice(0, 100) : ''
  const search = trimmed.length > 0 ? trimmed : null

  const supabase = createSupabaseServiceClient()

  const bookings: unknown[] = []
  let total = 0

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
    const { data, error: dbError } = await supabase.rpc('admin_search_bookings', {
      p_query: search,
      p_start_date: startDate,
      p_end_date: endDate,
      p_trip_type: tripType,
      p_status: null,
      p_sort: 'pickup_asc',
      p_offset: pageIndex * PAGE_SIZE,
      p_limit: PAGE_SIZE,
    })

    if (dbError) {
      // Log the error message only: never the search term or any client data.
      console.error('[admin/bookings/dispatch.GET] RPC failed:', dbError.message)
      return NextResponse.json({ error: 'DB read failed' }, { status: 500, headers: NO_STORE })
    }

    // admin_search_bookings returns a single row: { rows: JSONB[], total_count: bigint }
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null
    const pageRows: unknown[] = Array.isArray(row?.rows) ? row.rows : []
    if (pageIndex === 0) total = row?.total_count != null ? Number(row.total_count) : 0

    bookings.push(...pageRows)
    if (bookings.length >= total || pageRows.length < PAGE_SIZE) break
  }

  return NextResponse.json(
    { bookings, truncated: total > bookings.length },
    { headers: NO_STORE },
  )
}
