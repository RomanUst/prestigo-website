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
// animateDotAlongPath — RAF-based looping animation (D-11)
// Returns a cleanup function that cancels the RAF (Pitfall 6)
// ---------------------------------------------------------------------------
function animateDotAlongPath(
  marker: google.maps.Marker,
  path: google.maps.LatLng[],
  durationMs: number,
): () => void {
  if (path.length < 2) return () => undefined

  let rafId: number
  let startTime: number | null = null

  function step(now: number) {
    if (startTime === null) startTime = now
    // Modulo makes the animation loop continuously
    const elapsed = (now - startTime) % durationMs
    const t = elapsed / durationMs

    const totalSegments = path.length - 1
    const pathPosition = t * totalSegments
    const segmentIndex = Math.min(Math.floor(pathPosition), totalSegments - 1)
    const segmentT = pathPosition - segmentIndex

    const from = path[segmentIndex]
    const to = path[segmentIndex + 1]
    const lat = from.lat() + (to.lat() - from.lat()) * segmentT
    const lng = from.lng() + (to.lng() - from.lng()) * segmentT

    marker.setPosition(new google.maps.LatLng(lat, lng))
    rafId = requestAnimationFrame(step)
  }

  rafId = requestAnimationFrame(step)
  return () => cancelAnimationFrame(rafId)
}

// ---------------------------------------------------------------------------
// MapLabel — custom OverlayView for pickup/dropoff time labels
// Uses OverlayView so there is no InfoWindow chrome (no X close button)
// ---------------------------------------------------------------------------
function createMapLabel(
  map: google.maps.Map,
  position: google.maps.LatLng,
  heading: string,
  time: string,
  isPickup: boolean,
): google.maps.OverlayView {
  class MapLabel extends google.maps.OverlayView {
    private div: HTMLDivElement | null = null

    onAdd() {
      const div = document.createElement('div')
      div.style.cssText = 'position:absolute;pointer-events:none;'
      div.innerHTML = `
        <div style="
          background:${isPickup ? '#211F1C' : '#ffffff'};
          color:${isPickup ? '#F7F4EF' : '#211F1C'};
          border-radius:3px;
          padding:4px 8px;
          white-space:nowrap;
          box-shadow:0 1px 4px rgba(0,0,0,0.25);
          font-family:Montserrat,sans-serif;
          line-height:1.3;
        ">
          <div style="font-size:9px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.65;margin-bottom:1px">${heading}</div>
          <div style="font-size:12px;font-weight:600">${time}</div>
        </div>
      `
      this.div = div
      this.getPanes()?.floatPane.appendChild(div)
    }

    draw() {
      const point = this.getProjection().fromLatLngToDivPixel(position)
      if (this.div && point) {
        this.div.style.left = `${point.x + 12}px`
        this.div.style.top = `${point.y - 28}px`
      }
    }

    onRemove() {
      this.div?.parentNode?.removeChild(this.div)
      this.div = null
    }
  }

  const label = new MapLabel()
  label.setMap(map)
  return label
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

          // Time labels removed — shown in StickyBookingPanel instead

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
          height: 300,
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
      style={{ height: 300, background: 'var(--anthracite-mid)' }}
      aria-label={`Route map from ${origin.address} to ${destination.address}`}
      role="img"
    />
  )
}
