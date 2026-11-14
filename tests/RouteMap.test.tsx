import { describe, it, expect, beforeEach } from 'vitest'
import { vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithIntl as render } from './helpers/renderWithIntl'
import type { PlaceResult } from '@/types/booking'
import RouteMap from '@/components/booking/RouteMap'

// Wave 0 mock pattern: mock Google Maps JS API loader (never loaded in tests)
vi.mock('@googlemaps/js-api-loader', () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn().mockResolvedValue(undefined),
}))

// Stub window.google.maps so any render-time access does not throw
// Use class-based constructors for all mocks called with `new`
class MockMap { setCenter = vi.fn(); setZoom = vi.fn(); fitBounds = vi.fn() }
class MockDirService { route = vi.fn() }
class MockDirRenderer { setMap = vi.fn(); setDirections = vi.fn() }
class MockMarker { setMap = vi.fn(); setPosition = vi.fn() }
class MockPolyline { setMap = vi.fn() }
class MockLatLng {
  private _lat: number; private _lng: number
  constructor(lat: number, lng: number) { this._lat = lat; this._lng = lng }
  lat() { return this._lat }
  lng() { return this._lng }
}
class MockLatLngBounds { extend = vi.fn() }
class MockInfoWindow { open = vi.fn(); close = vi.fn() }

beforeEach(() => {
  Object.defineProperty(window, 'google', {
    value: {
      maps: {
        Map: MockMap,
        DirectionsService: MockDirService,
        DirectionsRenderer: MockDirRenderer,
        Marker: MockMarker,
        Polyline: MockPolyline,
        LatLng: MockLatLng,
        LatLngBounds: MockLatLngBounds,
        SymbolPath: { CIRCLE: 0, FORWARD_CLOSED_ARROW: 1 },
        MapTypeId: { ROADMAP: 'roadmap' },
        TravelMode: { DRIVING: 'DRIVING' },
        InfoWindow: MockInfoWindow,
        DirectionsStatus: { OK: 'OK' },
      },
    },
    writable: true,
    configurable: true,
  })
})

const pragueCentre: PlaceResult = {
  address: 'Wenceslas Square, Prague',
  placeId: 'ChIJXXXXXXXXXXXXXXXXXXXX',
  lat: 50.0802,
  lng: 14.4280,
}

const pragueStation: PlaceResult = {
  address: 'Prague Main Station',
  placeId: 'ChIJYYYYYYYYYYYYYYYYYYYY',
  lat: 50.0831,
  lng: 14.4357,
}

describe('RouteMap', () => {
  describe('BOOK-04: Map container accessibility', () => {
    it('renders a container with aria-label containing "Route map"', () => {
      render(<RouteMap origin={pragueCentre} destination={pragueStation} />)
      // The map container must have an aria-label that includes "Route map"
      const mapEl = screen.getByRole('img', { name: /route map/i })
        || screen.getByLabelText(/route map/i)
      expect(mapEl).toBeInTheDocument()
    })
  })

  describe('Empty / error state', () => {
    it('shows empty-state text when origin is null', () => {
      render(<RouteMap origin={null} destination={pragueStation} />)
      expect(
        screen.getByText('Route unavailable — you can still select a vehicle class.')
      ).toBeInTheDocument()
    })

    it('shows empty-state text when destination is null', () => {
      render(<RouteMap origin={pragueCentre} destination={null} />)
      expect(
        screen.getByText('Route unavailable — you can still select a vehicle class.')
      ).toBeInTheDocument()
    })

    it('shows empty-state text when both origin and destination are null', () => {
      render(<RouteMap origin={null} destination={null} />)
      expect(
        screen.getByText('Route unavailable — you can still select a vehicle class.')
      ).toBeInTheDocument()
    })
  })
})

describe('Phase 87 additive props (height, onRouteInfo, onRouteError)', () => {
  function installDirections(outcome: 'OK' | 'ZERO_RESULTS') {
    class RoutedDirService {
      route = (
        _req: unknown,
        cb: (result: unknown, status: string) => void,
      ) => {
        cb(
          outcome === 'OK'
            ? {
                routes: [
                  {
                    overview_path: [],
                    legs: [{ distance: { value: 12400 }, duration: { value: 1080 } }],
                  },
                ],
              }
            : null,
          outcome,
        )
      }
    }
    ;(window as unknown as { google: { maps: Record<string, unknown> } }).google.maps.DirectionsService =
      RoutedDirService
  }

  it('keeps the default height 300 for existing callers', () => {
    render(<RouteMap origin={pragueCentre} destination={pragueStation} />)
    const mapEl = screen.getByRole('img', { name: /route map/i })
    expect(mapEl).toHaveStyle({ height: '300px' })
  })

  it('keeps the default height 300 in the empty state too', () => {
    const { container } = render(<RouteMap origin={null} destination={pragueStation} />)
    expect((container.firstChild as HTMLElement).style.height).toBe('300px')
  })

  it('uses a custom height string (passed through unchanged; jsdom cannot parse clamp())', () => {
    render(<RouteMap origin={pragueCentre} destination={pragueStation} height="25rem" />)
    const mapEl = screen.getByRole('img', { name: /route map/i })
    expect(mapEl.style.height).toBe('25rem')
  })

  it('uses a custom numeric height', () => {
    render(<RouteMap origin={pragueCentre} destination={pragueStation} height={220} />)
    expect(screen.getByRole('img', { name: /route map/i })).toHaveStyle({ height: '220px' })
  })

  it('calls onRouteInfo(12.4, 18) once when Directions returns OK', async () => {
    installDirections('OK')
    const onRouteInfo = vi.fn()
    const onRouteError = vi.fn()
    render(
      <RouteMap
        origin={pragueCentre}
        destination={pragueStation}
        onRouteInfo={onRouteInfo}
        onRouteError={onRouteError}
      />,
    )
    await waitFor(() => expect(onRouteInfo).toHaveBeenCalledTimes(1))
    expect(onRouteInfo).toHaveBeenCalledWith(12.4, 18)
    expect(onRouteError).not.toHaveBeenCalled()
  })

  it('does not call onRouteInfo on a Directions failure and signals onRouteError instead', async () => {
    installDirections('ZERO_RESULTS')
    const onRouteInfo = vi.fn()
    const onRouteError = vi.fn()
    render(
      <RouteMap
        origin={pragueCentre}
        destination={pragueStation}
        onRouteInfo={onRouteInfo}
        onRouteError={onRouteError}
      />,
    )
    await waitFor(() => expect(onRouteError).toHaveBeenCalledTimes(1))
    expect(onRouteInfo).not.toHaveBeenCalled()
  })

  it('works without any callback (existing callers)', async () => {
    installDirections('OK')
    expect(() => render(<RouteMap origin={pragueCentre} destination={pragueStation} />)).not.toThrow()
    await Promise.resolve()
  })

  it('a new callback identity does not rebuild the map', async () => {
    installDirections('OK')
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(
      <RouteMap origin={pragueCentre} destination={pragueStation} onRouteInfo={first} />,
    )
    await waitFor(() => expect(first).toHaveBeenCalledTimes(1))
    rerender(<RouteMap origin={pragueCentre} destination={pragueStation} onRouteInfo={second} />)
    await Promise.resolve()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })
})

describe('Phase 91 stops (STOP-01): waypoints, summed legs, numbered markers', () => {
  const stopA = { lat: 50.23, lng: 12.87 }
  const stopB = { lat: 49.74, lng: 13.37 }

  const requests: Array<Record<string, unknown>> = []
  const markerOptions: Array<Record<string, unknown>> = []

  function installRoutedMaps(legs: Array<{ distance: { value: number }; duration: { value: number } }>) {
    requests.length = 0
    markerOptions.length = 0
    class RecordingDirService {
      route = (req: Record<string, unknown>, cb: (result: unknown, status: string) => void) => {
        requests.push(req)
        cb({ routes: [{ overview_path: [], legs }] }, 'OK')
      }
    }
    class RecordingMarker {
      constructor(opts: Record<string, unknown>) {
        markerOptions.push(opts)
      }
      setMap = vi.fn()
      setPosition = vi.fn()
    }
    const maps = (window as unknown as { google: { maps: Record<string, unknown> } }).google.maps
    maps.DirectionsService = RecordingDirService
    maps.Marker = RecordingMarker
  }

  const oneLeg = [{ distance: { value: 12400 }, duration: { value: 1080 } }]

  it('sends the stops as stopover waypoints in the given order and never optimises them', async () => {
    installRoutedMaps(oneLeg)
    render(<RouteMap origin={pragueCentre} destination={pragueStation} stops={[stopA, stopB]} />)
    await waitFor(() => expect(requests).toHaveLength(1))
    const waypoints = requests[0].waypoints as Array<{ location: { lat(): number; lng(): number }; stopover: boolean }>
    expect(waypoints).toHaveLength(2)
    expect(waypoints.map((w) => w.stopover)).toEqual([true, true])
    expect(waypoints.map((w) => [w.location.lat(), w.location.lng()])).toEqual([
      [stopA.lat, stopA.lng],
      [stopB.lat, stopB.lng],
    ])
    expect(requests[0].optimizeWaypoints).toBeUndefined()
  })

  it('uses only the first 5 of 6 stops', async () => {
    installRoutedMaps(oneLeg)
    const six = Array.from({ length: 6 }, (_, i) => ({ lat: 50 + i / 10, lng: 14 + i / 10 }))
    render(<RouteMap origin={pragueCentre} destination={pragueStation} stops={six} />)
    await waitFor(() => expect(requests).toHaveLength(1))
    expect((requests[0].waypoints as unknown[]).length).toBe(5)
  })

  it('sums all legs for onRouteInfo (10 km / 15 min + 20 km / 25 min -> 30 km / 40 min)', async () => {
    installRoutedMaps([
      { distance: { value: 10000 }, duration: { value: 900 } },
      { distance: { value: 20000 }, duration: { value: 1500 } },
    ])
    const onRouteInfo = vi.fn()
    render(
      <RouteMap origin={pragueCentre} destination={pragueStation} stops={[stopA]} onRouteInfo={onRouteInfo} />,
    )
    await waitFor(() => expect(onRouteInfo).toHaveBeenCalledTimes(1))
    expect(onRouteInfo).toHaveBeenCalledWith(30, 40)
  })

  it('draws one numbered marker per stop', async () => {
    installRoutedMaps(oneLeg)
    render(<RouteMap origin={pragueCentre} destination={pragueStation} stops={[stopA, stopB]} />)
    await waitFor(() => expect(markerOptions.length).toBeGreaterThanOrEqual(2))
    const labels = markerOptions
      .map((m) => (m.label as { text?: string } | undefined)?.text)
      .filter((text): text is string => typeof text === 'string')
    expect(labels).toEqual(['1', '2'])
  })

  it('without stops the request has no waypoints and the callback is unchanged', async () => {
    installRoutedMaps(oneLeg)
    const onRouteInfo = vi.fn()
    render(<RouteMap origin={pragueCentre} destination={pragueStation} onRouteInfo={onRouteInfo} />)
    await waitFor(() => expect(onRouteInfo).toHaveBeenCalledWith(12.4, 18))
    expect('waypoints' in requests[0]).toBe(false)
    expect(markerOptions.some((m) => m.label !== undefined)).toBe(false)
  })

  it('a new stops array with the same points does not rebuild the map', async () => {
    installRoutedMaps(oneLeg)
    const { rerender } = render(<RouteMap origin={pragueCentre} destination={pragueStation} stops={[stopA]} />)
    await waitFor(() => expect(requests).toHaveLength(1))
    rerender(<RouteMap origin={pragueCentre} destination={pragueStation} stops={[{ ...stopA }]} />)
    await Promise.resolve()
    expect(requests).toHaveLength(1)
  })
})
