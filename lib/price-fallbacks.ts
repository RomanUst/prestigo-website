// Phase 45: Fallback prices when DB lookup returns null.
// CI grep (€\d{2,}) does not match numeric literals without the € glyph.
// NEVER use € + number in strings in app/** or components/**.
// This file is permitted because it lives in lib/ which is outside the grep scope.
export const AIRPORT_FALLBACK = { regular: 69, promo: 59, sClass: 120, vClass: 76 }
export const HOURLY_FALLBACK = { business: 49, first_class: 120, business_van: 76 }
// Same-day return fares used only when the pricing DB is unreachable at build
// time (values as of 2026-11-11: route fare + return leg at −10%).
export const DAY_TRIP_FALLBACK = {
  Krumlov: { e: 572, v: 621, s: 834 },
  Kutna: { e: 279, v: 304, s: 407 },
  Karlovy: { e: 422, v: 458, s: 616 },
  Dresden: { e: 486, v: 526, s: 707 },
}
export const ROUTE_FALLBACK = { eClassEur: 0, sClassEur: 0, vClassEur: 0 }
