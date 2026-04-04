import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { buildPriceMap, dateDiffDays } from '@/lib/pricing'
import { getPricingConfig } from '@/lib/pricing-config'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { isInAnyZone } from '@/lib/zones'
import type { TripType } from '@/types/booking'
import type { PricingGlobals } from '@/lib/pricing-config'

export function isHolidayDate(pickupDate: string | null, holidayDates: string[]): boolean {
  if (!pickupDate || holidayDates.length === 0) return false
  const dateSet = new Set(holidayDates)
  return dateSet.has(pickupDate)
}

function isNightTime(time: string | null): boolean {
  if (!time) return false
  const hour = parseInt(time.split(':')[0], 10)
  return hour >= 22 || hour < 6
}

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

export function applyGlobals(
  prices: Record<string, { base: number; extras: number; total: number; currency: string }>,
  globals: PricingGlobals,
  isAirport: boolean,
  isNight: boolean,
  isHoliday: boolean,
  minFare: Record<string, number>,
): Record<string, { base: number; extras: number; total: number; currency: string }> {
  // Night takes precedence over holiday — explicit business rule
  const coefficient = isNight ? globals.nightCoefficient : isHoliday ? globals.holidayCoefficient : 1.0
  return Object.fromEntries(
    Object.entries(prices).map(([vc, breakdown]) => {
      let adjustedBase = Math.round(breakdown.base * coefficient)
      if (isAirport) adjustedBase += globals.airportFee
      adjustedBase = Math.max(adjustedBase, minFare[vc] ?? 0)
      return [vc, { ...breakdown, base: adjustedBase, total: adjustedBase }]
    })
  )
}

export async function POST(req: Request) {
  const { allowed, remaining, limit } = checkRateLimit('/api/calculate-price', getClientIp(req))
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
    const body = await req.json()
    const { origin, destination, tripType, hours, pickupDate, returnDate, pickupTime, returnTime, isAirport } = body as {
      origin: { lat: number; lng: number } | null
      destination: { lat: number; lng: number } | null
      tripType: TripType
      hours: number
      pickupDate: string | null
      returnDate: string | null
      pickupTime: string | null
      returnTime: string | null
      isAirport: boolean
    }
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

    const isHoliday = isHolidayDate(pickupDate, rates.globals.holidayDates)

    // Hourly: no distance needed, no zone check
    if (tripType === 'hourly') {
      const prices = buildPriceMap('hourly', null, hours || 2, 0, rates)
      const adjusted = applyGlobals(prices, rates.globals, airportFlag, isNightTime(pickupTime), isHoliday, rates.minFare)
      return NextResponse.json({ prices: adjusted, returnLegPrices: null, returnDiscountPercent: null, distanceKm: null, quoteMode: false })
    }

    // Daily: no distance needed, no zone check
    if (tripType === 'daily') {
      if (!pickupDate || !returnDate) {
        return NextResponse.json({ prices: null, returnLegPrices: null, returnDiscountPercent: null, distanceKm: null, quoteMode: true })
      }
      const days = dateDiffDays(pickupDate, returnDate)
      const prices = buildPriceMap('daily', null, 0, days, rates)
      const adjusted = applyGlobals(prices, rates.globals, airportFlag, isNightTime(pickupTime), isHoliday, rates.minFare)
      return NextResponse.json({ prices: adjusted, returnLegPrices: null, returnDiscountPercent: null, distanceKm: null, quoteMode: false })
    }

    // Transfer types: need origin + destination
    if (!origin || !destination) {
      return NextResponse.json({ prices: null, returnLegPrices: null, distanceKm: null, quoteMode: true })
    }

    // ZONES-04 + ZONES-05: Zone check for transfer trips only
    const supabase = createSupabaseServiceClient()
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
    const adjusted = applyGlobals(prices, rates.globals, airportFlag, isNightTime(pickupTime), isHoliday, rates.minFare)
    const discountPct = rates.globals.returnDiscountPercent

    // Compute return-leg price ONLY when returnDate + returnTime are both provided
    let returnLegPrices: Record<string, { base: number; extras: number; total: number; currency: string }> | null = null
    if (returnDate && returnTime) {
      const isReturnNight = isNightTime(returnTime)
      const isReturnHoliday = isHolidayDate(returnDate, rates.globals.holidayDates)
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
