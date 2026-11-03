/**
 * Canonical booking status transition map.
 * Used by the API route (assign/route.ts) and the UI (BookingsTable).
 *
 * API uses VALID_TRANSITIONS directly.
 * UI uses UI_TRANSITIONS which omits direct-to-completed shortcuts for
 * confirmed and assigned (those are intentionally hidden from the admin
 * dropdown — completion flows through en_route / on_location steps).
 *
 * The key set is parity-tested against BOOKING_STATUSES (lib/booking-status.ts) by
 * tests/booking-status.test.ts, and the keys with an empty array are the terminal statuses
 * (TERMINAL_BOOKING_STATUSES). Phase 87 (D-08/D-09): on_location can move on to on_board or
 * no_show, on_board completes or cancels, and no_show is terminal.
 */

export const VALID_TRANSITIONS: Record<string, string[]> = {
  unpaid:      ['confirmed', 'cancelled'],
  pending:     ['confirmed', 'cancelled'],
  confirmed:   ['assigned', 'completed', 'cancelled'],
  assigned:    ['en_route', 'cancelled', 'completed'],
  en_route:    ['on_location', 'cancelled', 'completed'],
  on_location: ['completed', 'cancelled', 'on_board', 'no_show'],
  on_board:    ['completed', 'cancelled'],
  completed:   [],
  cancelled:   [],
  no_show:     [],
}

// UI subset: omit direct-to-completed shortcuts for confirmed / assigned
// so the admin is guided through the natural flow (en_route → on_location → completed).
export const UI_TRANSITIONS: Record<string, string[]> = {
  ...VALID_TRANSITIONS,
  confirmed: ['assigned', 'cancelled'],
  assigned:  ['en_route', 'cancelled'],
}
