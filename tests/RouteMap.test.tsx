import { describe, it, expect, beforeEach } from 'vitest'
import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PlaceResult } from '@/types/booking'
import RouteMap from '@/components/booking/RouteMap'

// Wave 0 mock pattern: mock Google Maps JS API loader (never loaded in tests)
vi.mock('@googlemaps/js-api-loader', () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn().mockResolvedValue(undefined),
}))

// Stub window.google.maps so any render-time access does not throw
beforeEach(() => {
  Object.defineProperty(window, 'google', {
    value: {
      maps: {
        Map: vi.fn().mockReturnValue({
          setCenter: vi.fn(),
          setZoom: vi.fn(),
          fitBounds: vi.fn(),
        }),
        DirectionsService: vi.fn().mockReturnValue({
          route: vi.fn(),
        }),
        DirectionsRenderer: vi.fn().mockReturnValue({
          setMap: vi.fn(),
          setDirections: vi.fn(),
        }),
        Marker: vi.fn().mockReturnValue({
          setMap: vi.fn(),
          setPosition: vi.fn(),
        }),
        LatLng: vi.fn().mockImplementation((lat: number, lng: number) => ({ lat, lng })),
        LatLngBounds: vi.fn().mockReturnValue({
          extend: vi.fn(),
        }),
        SymbolPath: { CIRCLE: 0, FORWARD_CLOSED_ARROW: 1 },
        MapTypeId: { ROADMAP: 'roadmap' },
        InfoWindow: vi.fn().mockReturnValue({
          open: vi.fn(),
          close: vi.fn(),
        }),
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
