import { unstable_cache } from 'next/cache'
import { createSupabaseServiceClient } from '@/lib/supabase'

export type PricingRates = {
  ratePerKm: Record<string, number>
  hourlyRate: Record<string, number>
  dailyRate: Record<string, number>
}

export const getPricingConfig = unstable_cache(
  async (): Promise<PricingRates> => {
    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('pricing_config')
      .select('vehicle_class, rate_per_km, hourly_rate, daily_rate')

    if (error || !data?.length) {
      throw new Error(`Failed to load pricing config: ${error?.message ?? 'no rows returned'}`)
    }

    // CRITICAL: Supabase returns NUMERIC columns as strings — must cast with Number()
    return {
      ratePerKm: Object.fromEntries(data.map(r => [r.vehicle_class, Number(r.rate_per_km)])),
      hourlyRate: Object.fromEntries(data.map(r => [r.vehicle_class, Number(r.hourly_rate)])),
      dailyRate:  Object.fromEntries(data.map(r => [r.vehicle_class, Number(r.daily_rate)])),
    }
  },
  ['pricing-config'],
  { tags: ['pricing-config'] }
)
