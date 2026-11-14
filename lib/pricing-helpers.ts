// Phase 47 CALC-05 + CALC-09: calculator-specific pricing helpers
// Hardcoded per CALC-05 (may move to DB in Phase 48 or later per STATE.md).
// Phase 91 (D-02): the flat per-stop add-on is gone; stops are priced per km plus paid waiting (lib/stops.ts).

export const CHILD_SEAT_PRICE = 15  // EUR per child seat (CALC-05)

/** Round a price UP to the nearest multiple of 5 (CALC-09). */
export function roundUpToFive(price: number): number {
  if (price <= 0) return 0
  return Math.ceil(price / 5) * 5
}
