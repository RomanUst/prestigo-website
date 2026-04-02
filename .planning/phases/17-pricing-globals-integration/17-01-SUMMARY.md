---
phase: 17
plan: 01
status: complete
completed: 2026-04-02
requirements: [PRICING-03, PRICING-04]
---

# Plan 17-01 Summary

## What was done
- Fixed `revalidateTag('pricing-config', 'max')` — was missing required 2nd arg in Next.js 16.1.7
- Exported `PricingGlobals` type with 6 fields (airportFee, nightCoefficient, holidayCoefficient, extraChildSeat, extraMeetGreet, extraLuggage)
- Extended `PricingRates` type with `globals: PricingGlobals` field
- Extended `getPricingConfig()` to fetch both `pricing_config` and `pricing_globals` in parallel via `Promise.all`
- All NUMERIC globals columns cast with `Number()` to prevent string type bugs

## Verification
- `tsc --noEmit --skipLibCheck` — zero errors in pricing files
- revalidateTag uses 2-argument signature ✅
- PricingRates.globals available to consumers ✅
