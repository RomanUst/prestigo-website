import { createSupabaseServiceClient } from '@/lib/supabase'
import { AIRPORT_FALLBACK, HOURLY_FALLBACK } from '@/lib/price-fallbacks'

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

// Build-time / env-less fallback. Returned only when the Supabase service
// env vars are absent (e.g. Vercel preview builds or local dev without a
// .env) so that statically-prerendered marketing pages still build instead
// of crashing the whole export. In production the env vars are present, so
// real DB pricing is always used. NOTE: this guard is intentionally limited
// to the missing-env case — a genuine DB error WITH env present still throws,
// keeping booking/price-critical paths strict.
const PRICING_FALLBACK: PricingRates = {
  ratePerKm: {},
  hourlyRate: HOURLY_FALLBACK as Record<string, number>,
  dailyRate: {},
  minFare: {},
  globals: {
    airportFee: 0,
    nightCoefficient: 1,
    holidayCoefficient: 1,
    extraChildSeat: 0,
    extraLuggage: 0,
    holidayDates: [],
    returnDiscountPercent: 10,
    hourlyMinHours: 2,
    hourlyMaxHours: 8,
    notificationFlags: null,
    airportPromoActive: false,
    airportRegularPriceEur: AIRPORT_FALLBACK.regular,
    airportPromoPriceEur: AIRPORT_FALLBACK.promo,
  },
}

// No caching — always fetch fresh from DB so admin pricing changes are
// reflected immediately without needing cache invalidation.
export async function getPricingConfig(): Promise<PricingRates> {
  // Missing Supabase env (preview build / local dev) → safe fallback so the
  // static export doesn't crash. createSupabaseServiceClient() would otherwise
  // throw "supabaseUrl is required" synchronously.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return PRICING_FALLBACK
  }

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
