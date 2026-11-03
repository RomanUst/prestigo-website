import { describe, it, expect } from 'vitest'
import { googleMapsDirectionsUrl, wazeNavigationUrl } from '@/lib/driver-nav-url'

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

describe('wazeNavigationUrl', () => {
  it('uses the coordinates and starts navigation', () => {
    expect(wazeNavigationUrl({ lat: 50.1, lng: 14.26 })).toBe('https://waze.com/ul?ll=50.1,14.26&navigate=yes')
  })

  it('keeps negative coordinates readable', () => {
    expect(wazeNavigationUrl({ lat: -33.86, lng: -70.5 })).toBe('https://waze.com/ul?ll=-33.86,-70.5&navigate=yes')
  })

  it('url-encodes an address when coordinates are missing', () => {
    expect(wazeNavigationUrl({ address: 'Wenceslas Square 1' })).toBe(
      'https://waze.com/ul?q=Wenceslas%20Square%201&navigate=yes',
    )
  })

  it('encodes reserved characters so the address cannot add query parameters (T-87-52)', () => {
    const url = new URL(wazeNavigationUrl({ address: 'A&B #5, Praha?x=1' }))
    expect(url.searchParams.get('q')).toBe('A&B #5, Praha?x=1')
    expect([...url.searchParams.keys()]).toEqual(['q', 'navigate'])
    expect(url.hash).toBe('')
  })

  it('never includes anything but the destination for coordinates (T-87-51)', () => {
    const url = new URL(wazeNavigationUrl({ lat: 50.1, lng: 14.26 }))
    expect([...url.searchParams.keys()]).toEqual(['ll', 'navigate'])
  })
})
