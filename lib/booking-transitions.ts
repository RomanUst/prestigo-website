/**
 * Canonical booking status transition map.
 * Used by the API route (assign/route.ts) and the UI (BookingsTable).
 *
 * API uses VALID_TRANSITIONS directly.
 * UI uses UI_TRANSITIONS which omits direct-to-completed shortcuts for
 * confirmed and assigned (those are intentionally hidden from the admin
 * dropdown — completion flows through en_route / on_location steps).
 */

export const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:     ['confirmed', 'cancelled'],
  confirmed:   ['assigned', 'completed', 'cancelled'],
  assigned:    ['en_route', 'cancelled', 'completed'],
  en_route:    ['on_location', 'cancelled', 'completed'],
  on_location: ['completed', 'cancelled'],
  completed:   [],
  cancelled:   [],
}

// UI subset: omit direct-to-completed shortcuts for confirmed / assigned
// so the admin is guided through the natural flow (en_route → on_location → completed).
export const UI_TRANSITIONS: Record<string, string[]> = {
  ...VALID_TRANSITIONS,
  confirmed: ['assigned', 'cancelled'],
  assigned:  ['en_route', 'cancelled'],
}
