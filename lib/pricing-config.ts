import { createSupabaseServiceClient } from '@/lib/supabase'

export type PricingGlobals = {
  airportFee: number
  nightCoefficient: number
  holidayCoefficient: number
  extraChildSeat: number
  extraMeetGreet: number
  extraLuggage: number
}

export type PricingRates = {
  ratePerKm: Record<string, number>
  hourlyRate: Record<string, number>
  dailyRate: Record<string, number>
  globals: PricingGlobals
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
      .select('vehicle_class, rate_per_km, hourly_rate, daily_rate'),
    supabase
      .from('pricing_globals')
      .select('airport_fee, night_coefficient, holiday_coefficient, extra_child_seat, extra_meet_greet, extra_luggage')
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
    globals: {
      airportFee:          Number(globals.airport_fee),
      nightCoefficient:    Number(globals.night_coefficient),
      holidayCoefficient:  Number(globals.holiday_coefficient),
      extraChildSeat:      Number(globals.extra_child_seat),
      extraMeetGreet:      Number(globals.extra_meet_greet),
      extraLuggage:        Number(globals.extra_luggage),
    },
  }
}
