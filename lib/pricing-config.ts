import { createSupabaseServiceClient } from '@/lib/supabase'

export type PricingGlobals = {
  airportFee: number
  nightCoefficient: number
  holidayCoefficient: number
  extraChildSeat: number
  extraLuggage: number
  holidayDates: string[]
  returnDiscountPercent: number
  hourlyMinHours: number
  hourlyMaxHours: number
  notificationFlags: Record<string, boolean> | null
  airportPromoActive: boolean
  airportRegularPriceEur: number
  airportPromoPriceEur: number
}

export type PricingRates = {
  ratePerKm: Record<string, number>
  hourlyRate: Record<string, number>
  dailyRate: Record<string, number>
  globals: PricingGlobals
  minFare: Record<string, number>
}

// No caching — always fetch fresh from DB so admin pricing changes are
// reflected immediately without needing cache invalidation.
export async function getPricingConfig(): Promise<PricingRates> {
  const supabase = createSupabaseServiceClient()

  const [
    { data, error },
    { data: globals, error: globalsError },
  ] = await Promise.all([
    supabase
      .from('pricing_config')
      .select('vehicle_class, rate_per_km, hourly_rate, daily_rate, min_fare'),
    supabase
      .from('pricing_globals')
      .select('airport_fee, night_coefficient, holiday_coefficient, extra_child_seat, extra_luggage, holiday_dates, return_discount_percent, hourly_min_hours, hourly_max_hours, notification_flags, airport_promo_active, airport_regular_price_eur, airport_promo_price_eur')
      .eq('id', 1)
      .single(),
  ])

  if (error || !data?.length) {
    throw new Error(`Failed to load pricing config: ${error?.message ?? 'no rows returned'}`)
  }

  if (globalsError || !globals) {
    throw new Error(`Failed to load pricing globals: ${globalsError?.message ?? 'no row returned'}`)
  }

  // CRITICAL: Supabase returns NUMERIC columns as strings — must cast with Number()
  return {
    ratePerKm: Object.fromEntries(data.map(r => [r.vehicle_class, Number(r.rate_per_km)])),
    hourlyRate: Object.fromEntries(data.map(r => [r.vehicle_class, Number(r.hourly_rate)])),
    dailyRate:  Object.fromEntries(data.map(r => [r.vehicle_class, Number(r.daily_rate)])),
    // NUMERIC returned as string by Supabase — must Number() cast
    minFare: Object.fromEntries(data.map(r => [r.vehicle_class, Number(r.min_fare)])),
    globals: {
      airportFee:          Number(globals.airport_fee),
      nightCoefficient:    Number(globals.night_coefficient),
      holidayCoefficient:  Number(globals.holiday_coefficient),
      extraChildSeat:      Number(globals.extra_child_seat),
      extraLuggage:        Number(globals.extra_luggage),
      // JSONB auto-parsed by Supabase client — no JSON.parse needed
      holidayDates:           globals.holiday_dates as string[] ?? [],
      returnDiscountPercent:  Number(globals.return_discount_percent ?? 10),
      hourlyMinHours:         Number(globals.hourly_min_hours ?? 2),
      hourlyMaxHours:         Number(globals.hourly_max_hours ?? 8),
      // JSONB column — Supabase auto-parses, no Number() cast needed
      notificationFlags:      globals.notification_flags as Record<string, boolean> | null ?? null,
      airportPromoActive:     Boolean(globals.airport_promo_active ?? false),
      airportRegularPriceEur: Number(globals.airport_regular_price_eur ?? 69),
      airportPromoPriceEur:   Number(globals.airport_promo_price_eur ?? 59),
    },
  }
}
