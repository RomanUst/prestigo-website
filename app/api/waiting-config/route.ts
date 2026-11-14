import { NextResponse } from 'next/server'
import { getPricingConfig } from '@/lib/pricing-config'
import { VEHICLE_CLASSES } from '@/lib/pricing'
import { MAX_STOP_WAIT_MIN, STOP_FREE_WAIT_MIN, WAIT_BLOCK_MIN } from '@/lib/stops'

// Phase 91 (D-04/D-05): tells the booking wizard which vehicle classes offer paid waiting at a stop.
// Public and unauthenticated, so it states NO amount: prices come only from /api/calculate-price.
// Never blocks the wizard: any read error answers the same shape with no class offered.
export const dynamic = 'force-dynamic'

const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300'

export async function GET() {
  let offeredClasses: string[] = []
  let cacheControl = CACHE_CONTROL
  try {
    const { waitingRate } = await getPricingConfig()
    const offered = new Set(Object.keys(waitingRate ?? {}))
    offeredClasses = VEHICLE_CLASSES.filter((vc) => offered.has(vc))
  } catch {
    // A failed read must not be cached at the CDN: it would hide paid waiting for minutes.
    offeredClasses = []
    cacheControl = 'no-store'
  }

  return NextResponse.json(
    {
      freeMin: STOP_FREE_WAIT_MIN,
      blockMin: WAIT_BLOCK_MIN,
      maxMin: MAX_STOP_WAIT_MIN,
      offeredClasses,
    },
    { headers: { 'Cache-Control': cacheControl } },
  )
}
