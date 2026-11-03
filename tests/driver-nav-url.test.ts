import { describe, it, expect } from 'vitest'
import { googleMapsDirectionsUrl } from '@/lib/driver-nav-url'

describe('googleMapsDirectionsUrl', () => {
  it('uses the coordinates as the destination', () => {
    expect(googleMapsDirectionsUrl({ lat: 50.1, lng: 14.26 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=50.1,14.26',
    )
  })

  it('keeps negative coordinates readable', () => {
    expect(googleMapsDirectionsUrl({ lat: -33.86, lng: -70.5 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-33.86,-70.5',
    )
  })

  it('url-encodes an address when coordinates are missing', () => {
    expect(googleMapsDirectionsUrl({ address: 'Wenceslas Square 1' })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Wenceslas%20Square%201',
    )
  })

  it('encodes reserved characters so the address cannot add query parameters', () => {
    const url = googleMapsDirectionsUrl({ address: 'A&B #5, Praha?x=1' })
    expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=A%26B%20%235%2C%20Praha%3Fx%3D1')
    expect(new URL(url).searchParams.get('destination')).toBe('A&B #5, Praha?x=1')
  })

  it('never includes anything but the destination (no token, no origin)', () => {
    const url = new URL(googleMapsDirectionsUrl({ lat: 50.1, lng: 14.26 }))
    expect([...url.searchParams.keys()]).toEqual(['api', 'destination'])
  })
})
