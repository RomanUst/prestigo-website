import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import { buildPriceMap, dateDiffDays } from '@/lib/pricing'
import { getPricingConfig } from '@/lib/pricing-config'
import { createSupabasePublicReadClient } from '@/lib/supabase'
import { isInAnyZone } from '@/lib/zones'
import { isNightTime, isHolidayDate, applyGlobals } from '@/lib/server-pricing'
// Re-export extracted helpers so legacy consumers (tests/pricing.test.ts)
// that imported them directly from this route continue to compile. The single
// source of truth is @/lib/server-pricing; this re-export is a compat shim.
export { isHolidayDate, applyGlobals }

const coordSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
}).nullable()

const calculatePriceSchema = z.object({
  origin: coordSchema,
  destination: coordSchema,
  tripType: z.enum(['transfer', 'hourly', 'daily']),
  hours: z.number().int().min(1).max(24).optional().default(2),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  pickupTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  returnTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  isAirport: z.boolean().optional().default(false),
})

// Prague Václav Havel Airport coordinates
const PRG_LAT = 50.1008
const PRG_LNG = 14.26
// ~3 km radius (degree tolerance)
const PRG_RADIUS_DEG = 0.027

function isNearAirport(pt: { lat: number; lng: number } | null | undefined): boolean {
  if (!pt) return false
  return (
    Math.abs(pt.lat - PRG_LAT) < PRG_RADIUS_DEG &&
    Math.abs(pt.lng - PRG_LNG) < PRG_RADIUS_DEG
  )
}

export async function POST(req: Request) {
  // 5 KB is generous for a price lookup (two coords + flags).
  const tooBig = enforceMaxBody(req, 5_000)
  if (tooBig) return tooBig

  const { allowed, remaining, limit } = await checkRateLimit('/api/calculate-price', getClientIp(req))
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  try {
    const rawBody = await req.json()
    const parsed = calculatePriceSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const { origin, destination, tripType, hours, pickupDate, returnDate, pickupTime, returnTime, isAirport } = parsed.data
    // Detect airport server-side by coordinates (not by client-provided placeId,
    // which can mismatch between Places API versions).
    const airportFlag = isNearAirport(origin) || isNearAirport(destination) || isAirport === true

    // Load rates from DB (cached with tag 'pricing-config')
    let rates
    try {
      rates = await getPricingConfig()
    } catch (err) {
      console.error('Failed to load pricing config from DB:', err)
      return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
    }

    const isHoliday = isHolidayDate(pickupDate ?? null, rates.globals.holidayDates)

    // Hourly: no distance needed, no zone check
    if (tripType === 'hourly') {
      const prices = buildPriceMap('hourly', null, hours || 2, 0, rates)
      const adjusted = applyGlobals(prices, rates.globals, airportFlag, isNightTime(pickupTime ?? null), isHoliday, rates.minFare)
      return NextResponse.json({ prices: adjusted, returnLegPrices: null, returnDiscountPercent: null, distanceKm: null, quoteMode: false })
    }

    // Daily: no distance needed, no zone check
    if (tripType === 'daily') {
      if (!pickupDate || !returnDate) {
        return NextResponse.json({ prices: null, returnLegPrices: null, returnDiscountPercent: null, distanceKm: null, quoteMode: true })
      }
      const days = dateDiffDays(pickupDate, returnDate)
      const prices = buildPriceMap('daily', null, 0, days, rates)
      const adjusted = applyGlobals(prices, rates.globals, airportFlag, isNightTime(pickupTime ?? null), isHoliday, rates.minFare)
      return NextResponse.json({ prices: adjusted, returnLegPrices: null, returnDiscountPercent: null, distanceKm: null, quoteMode: false })
    }

    // Transfer types: need origin + destination
    if (!origin || !destination) {
      return NextResponse.json({ prices: null, returnLegPrices: null, distanceKm: null, quoteMode: true })
    }

    // ZONES-04 + ZONES-05: Zone check for transfer trips only.
    // Uses the least-privilege public-read client (anon key) so an accidental
    // write to coverage_zones here would be silently no-op'd by RLS instead
    // of succeeding via service_role privilege escalation.
    const supabase = createSupabasePublicReadClient()
    const { data: zones } = await supabase
      .from('coverage_zones')
      .select('id, geojson')
      .eq('active', true)

    if (zones && zones.length > 0) {
      const originInZone = isInAnyZone(origin.lat, origin.lng, zones)
      const destInZone = isInAnyZone(destination.lat, destination.lng, zones)
      if (!originInZone && !destInZone) {
        return NextResponse.json({ prices: null, returnLegPrices: null, distanceKm: null, quoteMode: true })
      }
    }

    // Google Routes API for distance
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      console.error('GOOGLE_MAPS_API_KEY not configured')
      return NextResponse.json({ prices: null, returnLegPrices: null, distanceKm: null, quoteMode: true })
    }

    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters',
        'Referer': 'https://rideprestigo.com',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode: 'DRIVE',
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('Google Routes API error:', res.status, errBody)
      return NextResponse.json({ prices: null, returnLegPrices: null, distanceKm: null, quoteMode: true })
    }

    const data = await res.json()
    const distanceMeters = data?.routes?.[0]?.distanceMeters
    if (!distanceMeters) {
      console.error('No distanceMeters in response, routes:', JSON.stringify(data?.routes))
      return NextResponse.json({ prices: null, returnLegPrices: null, distanceKm: null, quoteMode: true })
    }

    const distanceKm = distanceMeters / 1000
    const prices = buildPriceMap('transfer', distanceKm, 0, 0, rates)
    const adjusted = applyGlobals(prices, rates.globals, airportFlag, isNightTime(pickupTime ?? null), isHoliday, rates.minFare)
    const discountPct = rates.globals.returnDiscountPercent

    // Compute return-leg price ONLY when returnDate + returnTime are both provided
    let returnLegPrices: Record<string, { base: number; extras: number; total: number; currency: string }> | null = null
    if (returnDate && returnTime) {
      const isReturnNight = isNightTime(returnTime ?? null)
      const isReturnHoliday = isHolidayDate(returnDate ?? null, rates.globals.holidayDates)
      // Reuse distanceKm from outbound — no second Google Routes call (RTPR-01)
      const returnBase = buildPriceMap('transfer', distanceKm, 0, 0, rates)
      const returnAdjusted = applyGlobals(returnBase, rates.globals, airportFlag, isReturnNight, isReturnHoliday, rates.minFare)
      returnLegPrices = Object.fromEntries(
        Object.entries(returnAdjusted).map(([vc, b]) => {
          const discountedTotal = Math.round(b.base * (1 - discountPct / 100))
          // No extras on return leg (RTPR-03)
          return [vc, { base: discountedTotal, extras: 0, total: discountedTotal, currency: b.currency }]
        })
      )
    }

    return NextResponse.json({ prices: adjusted, returnLegPrices, returnDiscountPercent: discountPct, distanceKm, quoteMode: false })
  } catch (error) {
    console.error('calculate-price error:', error)
    return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
  }
}
