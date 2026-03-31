import { NextResponse } from 'next/server'
import { buildPriceMap, dateDiffDays } from '@/lib/pricing'
import type { TripType } from '@/types/booking'

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

    // Hourly: no distance needed
    if (tripType === 'hourly') {
      const prices = buildPriceMap('hourly', null, hours || 2, 0)
      return NextResponse.json({ prices, distanceKm: null, quoteMode: false })
    }

    // Daily: no distance needed, calculate from days
    if (tripType === 'daily') {
      if (!pickupDate || !returnDate) {
        return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
      }
      const days = dateDiffDays(pickupDate, returnDate)
      const prices = buildPriceMap('daily', null, 0, days)
      return NextResponse.json({ prices, distanceKm: null, quoteMode: false })
    }

    // Transfer types: need Google Routes API for distance
    if (!origin || !destination) {
      return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
    }

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
    console.log('Google Routes API response:', JSON.stringify(data))
    const distanceMeters = data?.routes?.[0]?.distanceMeters
    if (!distanceMeters) {
      console.error('No distanceMeters in response, routes:', JSON.stringify(data?.routes))
      return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
    }

    const distanceKm = distanceMeters / 1000
    const prices = buildPriceMap('transfer', distanceKm, 0, 0)
    return NextResponse.json({ prices, distanceKm, quoteMode: false })
  } catch (error) {
    console.error('calculate-price error:', error)
    return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
  }
}
