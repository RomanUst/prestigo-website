// Guarded reader for the cancellation policy numbers in pricing_globals (Phase 89, plan 89-03).
//
// Server-only (it creates a service client). Pages that call this can be statically prerendered, and
// createSupabaseServiceClient() throws synchronously when SUPABASE_URL is absent, so the try/catch
// wraps client construction too: a build without Supabase env degrades to DEFAULT_POLICY, never throws.

import { createSupabaseServiceClient } from '@/lib/supabase'
import {
  CANCELLATION_POLICY_VERSION,
  DEFAULT_POLICY,
  POLICY_BOUNDS,
  type CancellationPolicy,
} from '@/lib/cancellation-policy'

const SELECT_COLS =
  'cancel_free_km_threshold, cancel_free_hours_short, cancel_free_hours_long, cancel_free_hours_hourly, cancel_fee_percent'

function pick(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback
}

export async function getCancellationPolicy(): Promise<CancellationPolicy> {
  try {
    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase.from('pricing_globals').select(SELECT_COLS).eq('id', 1).single()
    if (error || !data) return { ...DEFAULT_POLICY }
    const row = data as Record<string, unknown>
    const { km, hours, percent } = POLICY_BOUNDS
    return {
      version: CANCELLATION_POLICY_VERSION,
      kmThreshold: pick(row.cancel_free_km_threshold, km.min, km.max, DEFAULT_POLICY.kmThreshold),
      freeHoursShort: pick(row.cancel_free_hours_short, hours.min, hours.max, DEFAULT_POLICY.freeHoursShort),
      freeHoursLong: pick(row.cancel_free_hours_long, hours.min, hours.max, DEFAULT_POLICY.freeHoursLong),
      freeHoursHourly: pick(row.cancel_free_hours_hourly, hours.min, hours.max, DEFAULT_POLICY.freeHoursHourly),
      feePercent: pick(row.cancel_fee_percent, percent.min, percent.max, DEFAULT_POLICY.feePercent),
    }
  } catch {
    return { ...DEFAULT_POLICY }
  }
}

/** The values stored on a new booking: bookings.cancel_policy_version and bookings.cancel_policy. */
export function buildPolicySnapshot(policy: CancellationPolicy): { version: string; snapshot: Record<string, string | number> } {
  return {
    version: policy.version,
    snapshot: {
      version: policy.version,
      kmThreshold: policy.kmThreshold,
      freeHoursShort: policy.freeHoursShort,
      freeHoursLong: policy.freeHoursLong,
      freeHoursHourly: policy.freeHoursHourly,
      feePercent: policy.feePercent,
    },
  }
}
