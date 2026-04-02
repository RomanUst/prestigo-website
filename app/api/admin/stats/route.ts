import { createClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { user: null, error: '401' as const }
  if (!user.app_metadata?.is_admin) return { user: null, error: '403' as const }
  return { user, error: null }
}

// --- Date helpers ---

function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function getMonday(): string {
  const d = new Date()
  const day = d.getDay() // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function getSunday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? 0 : 7 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function getMonthStart(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function getMonthEnd(): string {
  const d = new Date()
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

function getPrevMonthStart(): string {
  const d = new Date()
  const prevMonth = d.getMonth() === 0 ? 12 : d.getMonth()
  const year = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear()
  return `${year}-${String(prevMonth).padStart(2, '0')}-01`
}

function getPrevMonthEnd(): string {
  const d = new Date()
  const lastDay = new Date(d.getFullYear(), d.getMonth(), 0).getDate()
  const prevMonth = d.getMonth() === 0 ? 12 : d.getMonth()
  const year = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear()
  return `${year}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

function getTwelveMonthsAgo(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 11)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// Build ordered array of last 12 months as "Mon YYYY" labels
function getLast12Months(): { label: string; key: string }[] {
  const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const months: { label: string; key: string }[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = 11; i >= 0; i--) {
    const cur = new Date(d.getFullYear(), d.getMonth() - i, 1)
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
    const label = `${MONTH_ABBR[cur.getMonth()]} ${cur.getFullYear()}`
    months.push({ label, key })
  }
  return months
}

export async function GET() {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createSupabaseServiceClient()

  const todayISO = getToday()
  const mondayISO = getMonday()
  const sundayISO = getSunday()
  const monthStartISO = getMonthStart()
  const monthEndISO = getMonthEnd()
  const prevMonthStartISO = getPrevMonthStart()
  const prevMonthEndISO = getPrevMonthEnd()
  const twelveMonthsAgoISO = getTwelveMonthsAgo()

  const [
    countTodayResult,
    countWeekResult,
    countMonthResult,
    revenueCurrentResult,
    revenuePrevResult,
    byVehicleClassResult,
    byTripTypeResult,
    monthlyRevenueResult,
  ] = await Promise.all([
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('pickup_date', todayISO),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).gte('pickup_date', mondayISO).lte('pickup_date', sundayISO),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).gte('pickup_date', monthStartISO).lte('pickup_date', monthEndISO),
    supabase.from('bookings').select('amount_czk').gte('pickup_date', monthStartISO).lte('pickup_date', monthEndISO),
    supabase.from('bookings').select('amount_czk').gte('pickup_date', prevMonthStartISO).lte('pickup_date', prevMonthEndISO),
    supabase.from('bookings').select('vehicle_class, amount_czk').gte('pickup_date', monthStartISO).lte('pickup_date', monthEndISO),
    supabase.from('bookings').select('trip_type, amount_czk').gte('pickup_date', monthStartISO).lte('pickup_date', monthEndISO),
    supabase.from('bookings').select('pickup_date, amount_czk').gte('pickup_date', twelveMonthsAgoISO),
  ])

  if (
    countTodayResult.error ||
    countWeekResult.error ||
    countMonthResult.error ||
    revenueCurrentResult.error ||
    revenuePrevResult.error ||
    byVehicleClassResult.error ||
    byTripTypeResult.error ||
    monthlyRevenueResult.error
  ) {
    return NextResponse.json({ error: 'DB read failed' }, { status: 500 })
  }

  // Booking counts
  const counts = {
    today: countTodayResult.count ?? 0,
    thisWeek: countWeekResult.count ?? 0,
    thisMonth: countMonthResult.count ?? 0,
  }

  // Revenue totals
  const currentMonthRevenue = (revenueCurrentResult.data ?? []).reduce(
    (sum, row) => sum + (row.amount_czk ?? 0),
    0
  )
  const previousMonthRevenue = (revenuePrevResult.data ?? []).reduce(
    (sum, row) => sum + (row.amount_czk ?? 0),
    0
  )
  const revenue = {
    currentMonth: currentMonthRevenue,
    previousMonth: previousMonthRevenue,
  }

  // Revenue by vehicle class
  const vehicleClassMap: Record<string, number> = {}
  for (const row of byVehicleClassResult.data ?? []) {
    if (row.vehicle_class) {
      vehicleClassMap[row.vehicle_class] = (vehicleClassMap[row.vehicle_class] ?? 0) + (row.amount_czk ?? 0)
    }
  }
  const byVehicleClass = Object.entries(vehicleClassMap).map(([vehicle_class, revenue]) => ({
    vehicle_class,
    revenue,
  }))

  // Revenue by trip type
  const tripTypeMap: Record<string, number> = {}
  for (const row of byTripTypeResult.data ?? []) {
    if (row.trip_type) {
      tripTypeMap[row.trip_type] = (tripTypeMap[row.trip_type] ?? 0) + (row.amount_czk ?? 0)
    }
  }
  const byTripType = Object.entries(tripTypeMap).map(([trip_type, revenue]) => ({
    trip_type,
    revenue,
  }))

  // 12-month revenue — group by month key, fill missing months with 0
  const monthlyMap: Record<string, number> = {}
  for (const row of monthlyRevenueResult.data ?? []) {
    if (row.pickup_date) {
      const monthKey = row.pickup_date.substring(0, 7) // YYYY-MM
      monthlyMap[monthKey] = (monthlyMap[monthKey] ?? 0) + (row.amount_czk ?? 0)
    }
  }

  const last12 = getLast12Months()
  const monthlyRevenue = last12.map(({ label, key }) => ({
    month: label,
    revenue: monthlyMap[key] ?? 0,
  }))

  return NextResponse.json({
    counts,
    revenue,
    byVehicleClass,
    byTripType,
    monthlyRevenue,
  })
}
