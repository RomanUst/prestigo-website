import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { enforceMaxBody } from '@/lib/request-guards'
import { buildPriceMap, dateDiffDays } from '@/lib/pricing'
import { getPricingConfig } from '@/lib/pricing-config'
import { createSupabasePublicReadClient } from '@/lib/supabase'
import { isInAnyZone } from '@/lib/zones'
import { isNightTime, isHolidayDate, applyGlobals } from '@/lib/server-pricing'
import { getRoutePrice, findRouteByPlaceIds, type RoutePrice } from '@/lib/route-prices'
import { CHILD_SEAT_PRICE, EXTRA_STOP_PRICE } from '@/lib/pricing-helpers'
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
  intermediates: z.array(
    z.object({
      lat: z.number().finite().min(-90).max(90),
      lng: z.number().finite().min(-180).max(180),
    })
  ).max(5).optional().default([]),
  // CALC-07: intercity auto-detect fields
  routeSlug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/).optional(),
  originPlaceId: z.string().min(1).max(200).optional(),
  destinationPlaceId: z.string().min(1).max(200).optional(),
  // CALC-05: calculator-specific extras
  childSeats: z.number().int().min(0).max(3).optional().default(0),
  extraStops: z.number().int().min(0).max(5).optional().default(0),
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

type VehiclePrice = { base: number; extras: number; total: number; currency: string }

/**
 * Add childSeats × CHILD_SEAT_PRICE + extraStops × EXTRA_STOP_PRICE to .extras,
 * then round .total UP to nearest €5 (CALC-05 + CALC-09).
 */
function applyExtrasAndRound(
  adjusted: Record<string, VehiclePrice>,
  childSeats: number,
  extraStops: number
): Record<string, VehiclePrice> {
  const extrasAdd = childSeats * CHILD_SEAT_PRICE + extraStops * EXTRA_STOP_PRICE
  const out: Record<string, VehiclePrice> = {}
  for (const [k, v] of Object.entries(adjusted)) {
    const newExtras = v.extras + extrasAdd
    const newTotal = v.base + newExtras
    out[k] = { base: v.base, extras: newExtras, total: newTotal, currency: v.currency }
  }
  return out
}

/**
 * Build a flat price map from a route_prices row (CALC-07).
 * e_class_eur → business, s_class_eur → first_class, v_class_eur → business_van
 */
function buildIntercityPrices(route: RoutePrice): Record<string, VehiclePrice> {
  return {
    business:     { base: route.eClassEur, extras: 0, total: route.eClassEur, currency: 'EUR' },
    first_class:  { base: route.sClassEur, extras: 0, total: route.sClassEur, currency: 'EUR' },
    business_van: { base: route.vClassEur, extras: 0, total: route.vClassEur, currency: 'EUR' },
  }
}

export async function POST(req: Request) {
  // 6 KB is generous for a price lookup (two coords + route fields + extras).
  const tooBig = enforceMaxBody(req, 6_000)
  if (tooBig) return tooBig

  const { allowed, limit } = await checkRateLimit('/api/calculate-price', getClientIp(req))
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
    const {
      origin, destination, tripType, hours, pickupDate, returnDate,
      pickupTime, returnTime, isAirport, intermediates,
      routeSlug, originPlaceId, destinationPlaceId, childSeats, extraStops,
    } = parsed.data

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
      return NextResponse.json({ prices: applyExtrasAndRound(adjusted, childSeats, extraStops), returnLegPrices: null, returnDiscountPercent: null, distanceKm: null, quoteMode: false, matchedRouteSlug: null })
    }

    // Daily: no distance needed, no zone check
    if (tripType === 'daily') {
      if (!pickupDate || !returnDate) {
        return NextResponse.json({ prices: null, returnLegPrices: null, returnDiscountPercent: null, distanceKm: null, quoteMode: true, matchedRouteSlug: null })
      }
      const days = dateDiffDays(pickupDate, returnDate)
      const prices = buildPriceMap('daily', null, 0, days, rates)
      const adjusted = applyGlobals(prices, rates.globals, airportFlag, isNightTime(pickupTime ?? null), isHoliday, rates.minFare)
      return NextResponse.json({ prices: applyExtrasAndRound(adjusted, childSeats, extraStops), returnLegPrices: null, returnDiscountPercent: null, distanceKm: null, quoteMode: false, matchedRouteSlug: null })
    }

    // Transfer types: need origin + destination
    if (!origin || !destination) {
      return NextResponse.json({ prices: null, returnLegPrices: null, distanceKm: null, quoteMode: true, matchedRouteSlug: null })
    }

    // CALC-07: intercity auto-detect — flat price from route_prices when the pair matches.
    // Must run BEFORE zone check and Google Routes call.
    if (tripType === 'transfer' && (routeSlug || (originPlaceId && destinationPlaceId))) {
      let route: RoutePrice | null = null
      if (routeSlug) {
        route = await getRoutePrice(routeSlug)
      }
      if (!route && originPlaceId && destinationPlaceId) {
        route = await findRouteByPlaceIds(originPlaceId, destinationPlaceId)
      }
      if (route) {
        const base = buildIntercityPrices(route)
        const adjusted = applyGlobals(base, rates.globals, airportFlag, isNightTime(pickupTime ?? null), isHoliday, rates.minFare)
        const withExtras = applyExtrasAndRound(adjusted, childSeats, extraStops)
        return NextResponse.json({
          prices: withExtras,
          returnLegPrices: null,
          returnDiscountPercent: null,
          distanceKm: route.distanceKm,
          quoteMode: false,
          matchedRouteSlug: route.slug,
        })
      }
      // fall through — no match, use Google Routes below
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
        return NextResponse.json({ prices: null, returnLegPrices: null, distanceKm: null, quoteMode: true, matchedRouteSlug: null })
      }
    }

    // Google Routes API for distance
    // .replace(/\\n$/, '').trim() defends against Vercel env values that
    // were saved with a trailing literal "\n" (backslash + n) suffix.
    const apiKey = process.env.GOOGLE_MAPS_API_KEY?.replace(/\\n$/, '').trim()
    if (!apiKey) {
      console.error('GOOGLE_MAPS_API_KEY not configured')
      return NextResponse.json({ prices: null, returnLegPrices: null, distanceKm: null, quoteMode: true, matchedRouteSlug: null })
    }

    const googleBody: Record<string, unknown> = {
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: 'DRIVE',
    }

    // STOP-01: attach waypoints when present. NEVER set optimizeWaypointOrder —
    // chauffeur routes must follow the client-specified stop order (STATE.md
    // architectural constraint).
    if (intermediates && intermediates.length > 0) {
      googleBody.intermediates = intermediates.map((stop) => ({
        location: { latLng: { latitude: stop.lat, longitude: stop.lng } },
      }))
    }

    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters',
        'Referer': 'https://rideprestigo.com',
      },
      body: JSON.stringify(googleBody),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('Google Routes API error:', res.status, errBody)
      return NextResponse.json({ prices: null, returnLegPrices: null, distanceKm: null, quoteMode: true, matchedRouteSlug: null })
    }

    const data = await res.json()
    const distanceMeters = data?.routes?.[0]?.distanceMeters
    if (!distanceMeters) {
      console.error('No distanceMeters in response, routes:', JSON.stringify(data?.routes))
      return NextResponse.json({ prices: null, returnLegPrices: null, distanceKm: null, quoteMode: true, matchedRouteSlug: null })
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

    return NextResponse.json({ prices: applyExtrasAndRound(adjusted, childSeats, extraStops), returnLegPrices, returnDiscountPercent: discountPct, distanceKm, quoteMode: false, matchedRouteSlug: null })
  } catch (error) {
    console.error('calculate-price error:', error)
    return NextResponse.json({
      prices: null,
      returnLegPrices: null,
      returnDiscountPercent: null,
      distanceKm: null,
      quoteMode: true,
      matchedRouteSlug: null,
    })
  }
}
