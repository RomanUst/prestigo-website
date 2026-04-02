import { NextResponse } from 'next/server'
import { buildPriceMap, dateDiffDays } from '@/lib/pricing'
import { getPricingConfig } from '@/lib/pricing-config'
import { createSupabaseServiceClient } from '@/lib/supabase'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'
import type { TripType } from '@/types/booking'

function isOutsideAllZones(
  lat: number,
  lng: number,
  zones: Array<{ geojson: unknown }>
): boolean {
  if (zones.length === 0) return false
  // GeoJSON coordinate order: [longitude, latitude]
  const pt = point([lng, lat])
  return !zones.some(zone =>
    booleanPointInPolygon(pt, zone.geojson as Parameters<typeof booleanPointInPolygon>[1])
  )
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { origin, destination, tripType, hours, pickupDate, returnDate } = body as {
      origin: { lat: number; lng: number } | null
      destination: { lat: number; lng: number } | null
      tripType: TripType
      hours: number
      pickupDate: string | null
      returnDate: string | null
    }

    // Load rates from DB (cached with tag 'pricing-config')
    let rates
    try {
      rates = await getPricingConfig()
    } catch (err) {
      console.error('Failed to load pricing config from DB:', err)
      return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
    }

    // Hourly: no distance needed, no zone check
    if (tripType === 'hourly') {
      const prices = buildPriceMap('hourly', null, hours || 2, 0, rates)
      return NextResponse.json({ prices, distanceKm: null, quoteMode: false })
    }

    // Daily: no distance needed, no zone check
    if (tripType === 'daily') {
      if (!pickupDate || !returnDate) {
        return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
      }
      const days = dateDiffDays(pickupDate, returnDate)
      const prices = buildPriceMap('daily', null, 0, days, rates)
      return NextResponse.json({ prices, distanceKm: null, quoteMode: false })
    }

    // Transfer types: need origin + destination
    if (!origin || !destination) {
      return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
    }

    // ZONES-04 + ZONES-05: Zone check for transfer trips only
    const supabase = createSupabaseServiceClient()
    const { data: zones } = await supabase
      .from('coverage_zones')
      .select('id, geojson')
      .eq('active', true)

    if (zones && zones.length > 0) {
      const originOutside = isOutsideAllZones(origin.lat, origin.lng, zones)
      const destOutside = isOutsideAllZones(destination.lat, destination.lng, zones)
      if (originOutside || destOutside) {
        return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
      }
    }

    // Google Routes API for distance
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      console.error('GOOGLE_MAPS_API_KEY not configured')
      return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
    }

    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters',
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
      return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
    }

    const data = await res.json()
    const distanceMeters = data?.routes?.[0]?.distanceMeters
    if (!distanceMeters) {
      console.error('No distanceMeters in response, routes:', JSON.stringify(data?.routes))
      return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
    }

    const distanceKm = distanceMeters / 1000
    const prices = buildPriceMap('transfer', distanceKm, 0, 0, rates)
    return NextResponse.json({ prices, distanceKm, quoteMode: false })
  } catch (error) {
    console.error('calculate-price error:', error)
    return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
  }
}
