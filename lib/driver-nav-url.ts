/**
 * Outbound navigation link for the driver trip screen (Phase 87 D-18, UI-SPEC "Address timeline").
 * Only the destination leaves the page: coordinates, or the address when the booking has none.
 * No trip token, booking reference or passenger data is ever put into the URL (T-87-37).
 */

export type NavigationTarget = { lat: number; lng: number } | { address: string }

const DIRECTIONS_BASE = 'https://www.google.com/maps/dir/?api=1&destination='

export function googleMapsDirectionsUrl(target: NavigationTarget): string {
  if ('address' in target) return `${DIRECTIONS_BASE}${encodeURIComponent(target.address)}`
  return `${DIRECTIONS_BASE}${target.lat},${target.lng}`
}
