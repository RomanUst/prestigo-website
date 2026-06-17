'use client'

import { useEffect, useRef } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import type { PlaceResult } from '@/types/booking'

// ---------------------------------------------------------------------------
// Module-level singleton — mirrors AddressInput.tsx ensureMapsLoaded()
// Must include 'places' so AddressInput autocomplete keeps working (Pitfall 2)
// ---------------------------------------------------------------------------
let mapsLoaderPromise: Promise<void> | null = null

function ensureMapsLibraryLoaded(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.maps?.Map) {
    return Promise.resolve()
  }
  if (mapsLoaderPromise) return mapsLoaderPromise
  // setOptions is idempotent — same key as AddressInput.tsx (D-13: no new credential)
  setOptions({
    key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
    libraries: ['maps', 'places', 'routes'],
    v: 'weekly',
  })
  mapsLoaderPromise = importLibrary('maps').then(() => undefined)
  return mapsLoaderPromise
}

// ---------------------------------------------------------------------------
// Greyscale map styles — minimal tile style, hide POI + transit labels
// ---------------------------------------------------------------------------
const GREYSCALE_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#F7F4EF' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6E6962' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F7F4EF' }] },
  { featureType: 'poi', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#DDD7CE' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#EFEAE2' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#DDD7CE' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#EFEAE2' }] },
]

// ---------------------------------------------------------------------------
// animateDotAlongPath — RAF-based one-shot animation (D-11)
// Returns a cleanup function that cancels the RAF (Pitfall 6)
// ---------------------------------------------------------------------------
function animateDotAlongPath(
  marker: google.maps.Marker,
  path: google.maps.LatLng[],
  durationMs: number,
): () => void {
  if (path.length < 2) return () => undefined

  let rafId: number
  const startTime = performance.now()

  function step(now: number) {
    const elapsed = now - startTime
    const t = Math.min(elapsed / durationMs, 1)

    // Interpolate position along the path
    const totalSegments = path.length - 1
    const pathPosition = t * totalSegments
    const segmentIndex = Math.min(Math.floor(pathPosition), totalSegments - 1)
    const segmentT = pathPosition - segmentIndex

    const from = path[segmentIndex]
    const to = path[segmentIndex + 1]
    const lat = from.lat() + (to.lat() - from.lat()) * segmentT
    const lng = from.lng() + (to.lng() - from.lng()) * segmentT

    marker.setPosition(new google.maps.LatLng(lat, lng))

    if (t < 1) {
      rafId = requestAnimationFrame(step)
    }
  }

  rafId = requestAnimationFrame(step)
  return () => cancelAnimationFrame(rafId)
}

// ---------------------------------------------------------------------------
// Time label helpers
// ---------------------------------------------------------------------------
function formatTime24To12(time24: string): string {
  const [hStr, mStr] = time24.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  const isPM = h >= 12
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`
}

function estimateDropoffTime(pickupTime: string, distanceKm: number | null): string {
  if (!distanceKm) return '+ est. duration'
  // Rough estimate: 45 km/h average urban + 5 min buffer
  const durationMin = Math.round((distanceKm / 45) * 60) + 5
  const [hStr, mStr] = pickupTime.split(':')
  const totalMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + durationMin
  const h = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  return formatTime24To12(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------
interface RouteMapProps {
  origin: PlaceResult | null
  destination: PlaceResult | null
  pickupTime?: string | null    // 24h HH:MM
  distanceKm?: number | null
}

// ---------------------------------------------------------------------------
// RouteMap component
// ---------------------------------------------------------------------------
export default function RouteMap({
  origin,
  destination,
  pickupTime = null,
  distanceKm = null,
}: RouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Show empty state when origin or destination is missing — no map to draw
    if (!origin || !destination || !mapRef.current) return

    let cancelled = false
    let cancelAnimation: (() => void) | null = null

    ensureMapsLibraryLoaded().then(() => {
      if (cancelled || !mapRef.current) return

      // Create the map
      const map = new google.maps.Map(mapRef.current, {
        disableDefaultUI: true,
        styles: GREYSCALE_STYLES,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        zoom: 12,
        center: { lat: origin.lat, lng: origin.lng },
      })

      const originLatLng = new google.maps.LatLng(origin.lat, origin.lng)
      const destLatLng = new google.maps.LatLng(destination.lat, destination.lng)

      // Fit bounds to show both points
      const bounds = new google.maps.LatLngBounds()
      bounds.extend(originLatLng)
      bounds.extend(destLatLng)
      map.fitBounds(bounds)

      // Attempt Directions, fallback to straight-line polyline
      const directionsService = new google.maps.DirectionsService()
      directionsService.route(
        {
          origin: originLatLng,
          destination: destLatLng,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (cancelled) return

          let path: google.maps.LatLng[]

          if (status === google.maps.DirectionsStatus.OK && result) {
            // Render route via DirectionsRenderer
            const renderer = new google.maps.DirectionsRenderer({
              suppressMarkers: true,
              polylineOptions: {
                strokeColor: '#6E6962',
                strokeWeight: 2,
                strokeOpacity: 0.7,
              },
            })
            renderer.setMap(map)
            renderer.setDirections(result)

            // Extract decoded path
            path = result.routes[0].overview_path
          } else {
            // Fallback: straight-line polyline
            path = [originLatLng, destLatLng]
            new google.maps.Polyline({
              path,
              strokeColor: '#6E6962',
              strokeWeight: 2,
              strokeOpacity: 0.7,
              map,
            })
          }

          // --- Origin marker (pickup) ---
          new google.maps.Marker({
            position: originLatLng,
            map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: '#8A5A2E',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              scale: 6,
            },
          })

          // --- Destination marker (drop-off) ---
          new google.maps.Marker({
            position: destLatLng,
            map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: '#211F1C',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              scale: 6,
            },
          })

          // --- Time labels ---
          if (pickupTime) {
            const pickupLabel = formatTime24To12(pickupTime)
            const dropoffLabel = estimateDropoffTime(pickupTime, distanceKm)

            const pickupInfoWindow = new google.maps.InfoWindow({
              content: `<span style="font-family:Montserrat,sans-serif;font-size:11px;color:#6E6962;padding:4px 6px;display:inline-block">${pickupLabel}</span>`,
            })
            pickupInfoWindow.open(map, new google.maps.Marker({ position: originLatLng, map: null }))
            // Position at origin — use a dummy anchor marker (invisible)
            const pickupAnchor = new google.maps.Marker({
              position: originLatLng,
              map,
              visible: false,
            })
            pickupInfoWindow.open(map, pickupAnchor)

            const dropoffInfoWindow = new google.maps.InfoWindow({
              content: `<span style="font-family:Montserrat,sans-serif;font-size:11px;color:#6E6962;padding:4px 6px;display:inline-block">${dropoffLabel}</span>`,
            })
            const dropoffAnchor = new google.maps.Marker({
              position: destLatLng,
              map,
              visible: false,
            })
            dropoffInfoWindow.open(map, dropoffAnchor)
          }

          // --- Animated dot ---
          const reducedMotion =
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches

          // Moving copper dot marker
          const midIndex = Math.floor(path.length / 2)
          const midPoint = path[midIndex] ?? originLatLng

          const dotMarker = new google.maps.Marker({
            position: reducedMotion ? midPoint : originLatLng,
            map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: '#8A5A2E',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              scale: 6,
            },
            zIndex: 10,
          })

          if (!reducedMotion) {
            cancelAnimation = animateDotAlongPath(dotMarker, path, 3000)
          }
        }
      )
    })

    return () => {
      cancelled = true
      if (cancelAnimation) cancelAnimation()
    }
  }, [origin, destination, pickupTime, distanceKm])

  // Empty state when no route info available
  if (!origin || !destination) {
    return (
      <div
        style={{
          height: 220,
          background: 'var(--anthracite-mid)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 16px',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            fontWeight: 400,
            color: 'var(--warmgrey)',
            lineHeight: 1.5,
          }}
        >
          Route unavailable — you can still select a vehicle class.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={mapRef}
      style={{ height: 220, background: 'var(--anthracite-mid)' }}
      aria-label={`Route map from ${origin.address} to ${destination.address}`}
      role="img"
    />
  )
}
