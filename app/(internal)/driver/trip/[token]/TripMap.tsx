'use client'

import { useCallback, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import RouteMap from '@/components/booking/RouteMap'
import type { PlaceResult } from '@/types/booking'

// UI-SPEC E2: fluid height so map, collapsed sheet and the 64px control fit a 360x640 phone.
const MAP_HEIGHT = 'clamp(200px, 32dvh, 320px)'

export interface TripMapProps {
  origin: { lat: number; lng: number } | null
  destination: { lat: number; lng: number } | null
  originAddress: string
  destinationAddress: string
  /** bookings.distance_km, shown as "12.4 km (est.)" only when Directions fails. */
  distanceKm: number | null
  /** Phase 91 (STOP-04): the trip's stops in order; the route goes through those with coordinates. */
  stops?: ReadonlyArray<{ lat: number | null; lng: number | null }>
}

const wrapperStyle: CSSProperties = {
  position: 'relative',
  boxSizing: 'border-box',
  margin: '16px 24px 0',
  overflow: 'hidden',
  border: '1px solid var(--admin-border)',
  borderRadius: 'var(--admin-radius-md)',
  background: 'var(--admin-surface)',
}

const chipStyle: CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
  zIndex: 1,
  padding: '4px 8px',
  background: 'var(--admin-surface)',
  border: '1px solid var(--admin-border)',
  borderRadius: 'var(--admin-radius-sm)',
  color: 'var(--admin-text)',
  fontSize: 'var(--driver-fs-label)',
  fontWeight: 500,
  lineHeight: 1.4,
  fontVariantNumeric: 'tabular-nums',
  // A label, not a control: never swallow a map gesture.
  pointerEvents: 'none',
}

function formatKm(km: number): string {
  return km.toFixed(1)
}

/**
 * Route map for the driver trip screen (D-18, UI-SPEC "TripScreen" row 3).
 * The distance chip sits top-left; nothing is ever positioned over the bottom of the map so the
 * Google logo and attribution stay visible (Maps ToS). With a missing coordinate pair RouteMap is
 * not mounted and a placeholder explains the Navigate fallback.
 */
export default function TripMap({
  origin,
  destination,
  originAddress,
  destinationAddress,
  distanceKm,
  stops,
}: TripMapProps) {
  const [info, setInfo] = useState<{ km: number; min: number } | null>(null)
  const [failed, setFailed] = useState(false)

  // Stable identities: RouteMap rebuilds the map whenever origin / destination change by reference,
  // and router.refresh() hands this component fresh coordinate objects every 30 s. Key on primitives.
  const oLat = origin?.lat ?? null
  const oLng = origin?.lng ?? null
  const dLat = destination?.lat ?? null
  const dLng = destination?.lng ?? null
  const originPlace = useMemo<PlaceResult | null>(
    () => (oLat !== null && oLng !== null ? { address: originAddress, placeId: '', lat: oLat, lng: oLng } : null),
    [oLat, oLng, originAddress],
  )
  const destinationPlace = useMemo<PlaceResult | null>(
    () => (dLat !== null && dLng !== null ? { address: destinationAddress, placeId: '', lat: dLat, lng: dLng } : null),
    [dLat, dLng, destinationAddress],
  )

  // A stop without coordinates cannot be a waypoint; RouteMap keys on the coordinates, not on this array's identity.
  const stopPoints = useMemo(
    () =>
      (stops ?? []).flatMap((stop) =>
        stop.lat !== null && stop.lng !== null ? [{ lat: stop.lat, lng: stop.lng }] : [],
      ),
    [stops],
  )

  const onRouteInfo = useCallback((km: number, min: number) => setInfo({ km, min }), [])
  const onRouteError = useCallback(() => setFailed(true), [])

  if (!originPlace || !destinationPlace) {
    return (
      <div role="region" aria-label="Trip map" style={wrapperStyle}>
        <div
          style={{
            boxSizing: 'border-box',
            height: MAP_HEIGHT,
            padding: '0 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            textAlign: 'center',
            color: 'var(--admin-text-muted)',
            fontSize: 'var(--driver-fs-body)',
            fontWeight: 400,
            lineHeight: 1.5,
          }}
        >
          <span style={{ color: 'var(--admin-text)', fontWeight: 500 }}>Map unavailable</span>
          <span>Use the pickup and drop-off addresses below, or tap Navigate.</span>
        </div>
      </div>
    )
  }

  let chip: string | null = null
  if (info) chip = `${formatKm(info.km)} km · ${info.min} min (est.)`
  else if (failed && distanceKm !== null && Number.isFinite(distanceKm)) chip = `${formatKm(distanceKm)} km (est.)`

  return (
    <div role="region" aria-label="Trip map" className="driver-map" style={wrapperStyle}>
      <RouteMap
        origin={originPlace}
        destination={destinationPlace}
        height={MAP_HEIGHT}
        stops={stopPoints}
        onRouteInfo={onRouteInfo}
        onRouteError={onRouteError}
      />
      {chip ? <div style={chipStyle}>{chip}</div> : null}
    </div>
  )
}
