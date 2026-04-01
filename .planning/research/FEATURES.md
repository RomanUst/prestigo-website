# Feature Research

**Domain:** Operator/Admin Dashboard — chauffeur service (rideprestigo.com)
**Researched:** 2026-04-01
**Confidence:** HIGH

---

## Context: What Is Already Built (v1.0 + v1.1)

The following exist and must NOT be rebuilt. The dashboard is additive.

- 6-step booking wizard (Zustand + sessionStorage, fully client-side)
- Server-side pricing engine at `lib/pricing.ts` — hardcoded rate tables for 3 vehicle classes (RATE_PER_KM, HOURLY_RATE, DAILY_RATE); rates are plain constants, not database-driven
- Supabase `bookings` table (33 columns: booking_reference, trip_type, vehicle_class, amount_czk, amount_eur, extras booleans, client info, coordinates, etc.)
- Stripe PaymentIntent + webhook as source of truth for saves
- Resend transactional emails (client confirmation + manager alert)
- `/api/health` per-service probe endpoint
- Extras pricing: child_seat, meet_greet, extra_luggage as boolean flags (prices currently hardcoded in wizard step 4)

**Critical coupling point:** The pricing engine reads rate tables from hardcoded constants in `lib/pricing.ts`. Making pricing admin-editable requires migrating these constants to a Supabase table and fetching them server-side. This is the single highest-complexity dependency in v1.2.

---

## Feature Landscape

### Table Stakes (Operator Expects These)

Features the operator assumes exist in any admin dashboard. Missing these = dashboard feels incomplete or unusable.

#### Pricing Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Edit base rates per vehicle class (per-km, hourly, daily) | Core pricing is currently hardcoded in `lib/pricing.ts` — operator cannot adjust without a code deploy | MEDIUM | Requires migrating RATE_PER_KM / HOURLY_RATE / DAILY_RATE from constants to a `pricing_config` Supabase table; `/api/calculate-price` must fetch from DB instead |
| Edit extras prices (child seat, meet & greet, extra luggage) | Extra prices are also hardcoded in wizard Step 4; operator needs to adjust without code changes | MEDIUM | Same pattern as base rates — store in `pricing_config` or separate `extras_config` table |
| Night/holiday surcharge coefficients | Industry standard for premium chauffeur; Prague market has measurable demand peaks (New Year, peak summer, pre-Christmas) | MEDIUM | Store as named multipliers (e.g. `night_multiplier: 1.3`, `holiday_multiplier: 1.5`); booking wizard applies multiplier at price calculation time |
| Airport fee (flat surcharge for PRG airport pickups/dropoffs) | Airport transfers are the most common trip type; a fixed airport fee is expected by operators | LOW | Single value in config; booking wizard already detects airport trip type |
| Preview: "what would this trip cost now?" | Operator needs to verify new rates produce sensible quotes before activating | MEDIUM | Call `/api/calculate-price` with a test origin/destination and show result inline |

#### Coverage Zone Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Draw polygon zones on Google Maps | Standard in all chauffeur platforms (QuanticaLabs, TaxiCaller, Yelowsoft); operators define service areas visually | HIGH | Google Maps JS API with `google.maps.drawing.DrawingManager`; store polygon vertices as GeoJSON in Supabase `coverage_zones` table |
| Name and save zones | Zones must be labeled (e.g. "Prague City", "Airport Ring", "Outside Service Area") | LOW | Simple form alongside the map canvas |
| Toggle zones active/inactive | Operator needs to temporarily disable a zone (e.g. during events) without deleting it | LOW | Boolean `active` flag on the `coverage_zones` row |
| Zone drives "Request a quote" fallback | The booking wizard already has a `quoteMode` path — zones determine when it triggers. If pickup/destination falls outside all active zones, wizard falls back to quote form | MEDIUM | Polygon point-in-polygon check in `/api/calculate-price`; already has quote fallback logic |

#### Bookings List

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Paginated table of all bookings | The `bookings` table is already populated; operator needs to see orders | LOW | Simple Supabase query with pagination; all columns already exist |
| Filter by date range | Primary triage for day-of operations and invoice reconciliation | LOW | `pickup_date` column exists; date range filter on query |
| Filter by status / trip type | Operator wants to see only airport runs, or only pending confirmations | LOW | `trip_type` and `booking_type` columns exist |
| Search by client name or booking reference | Fast lookup for a specific client who calls in | LOW | `ilike` query on `client_first_name`, `client_last_name`, `booking_reference` |
| Click to expand booking detail | Full row data (extras, special requests, flight number, coordinates) in a readable view | LOW | Client-side expand; no new query needed |

#### Revenue Statistics

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Total revenue this month / last month (CZK) | Most basic financial KPI; every booking has `amount_czk` | LOW | `SUM(amount_czk)` grouped by month from existing `bookings` table |
| Booking count by period (today / this week / this month) | Operational pulse metric | LOW | `COUNT(*)` with `created_at` window |
| Revenue breakdown by vehicle class | Which class drives the most revenue | LOW | `GROUP BY vehicle_class` |
| Revenue breakdown by trip type | Airport vs transfer vs hourly vs daily | LOW | `GROUP BY trip_type` |
| Simple chart: revenue over last 12 months | Visual trend for business health | MEDIUM | Recharts or similar; bar chart is sufficient; no real-time needed |

---

### Differentiators (Competitive Advantage)

Features not universally expected but meaningful for a single-operator premium service.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Pricing preview before save | Operator can see "if I set business class to 3.20 CZK/km, a 30km airport run costs X" before committing | MEDIUM | Inline calculator calling `/api/calculate-price` with draft rates (not saved yet) |
| Zone-to-zone fixed price override | For high-frequency corridors (e.g. Airport to Prague City Centre), a flat price overrides distance calculation | HIGH | Requires a `zone_pricing_rules` table with origin_zone_id + destination_zone_id + flat price; significant schema and logic extension — defer to v1.3 |
| CSV export of bookings for a date range | Operator sends to accountant without giving DB access | MEDIUM | Server-side CSV generation from Supabase query; streaming download |
| Booking status workflow (Confirmed / In Progress / Completed) | Operator marks rides as done; gives ops visibility | MEDIUM | Adds a `status` column to `bookings` table (migration required); status changes via admin only |

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Layered pricing rule engine (stack of conditions: time-of-day + zone + vehicle + date range) | Seen in QuanticaLabs and Yelowsoft; gives maximum flexibility | Rule precedence bugs are the #1 reported complaint in chauffeur booking forums; rule conflicts silently produce wrong prices; debugging is painful | Flat structure: one config table with named multipliers (night, holiday, airport). No stacking. Operator tests rates with the preview tool before activating |
| Real-time driver tracking / dispatch board | Every limousine SaaS has it | Prestigo is a 1-person operator; no driver app, no GPS device integration. Zero value for this scale | Out of scope for v1.2. Revisit only if fleet grows |
| Multi-user roles (dispatcher, driver, finance) | Standard in enterprise platforms | Single operator. Adding roles adds auth complexity with no benefit | Single admin role with Supabase Auth email+password. No role matrix |
| Automated invoice PDF generation with branding | Accountant workflow automation | Requires PDF rendering (React PDF or Puppeteer), storage, email delivery — high complexity, low urgency | CSV export of bookings table is sufficient for accountant handoff in v1.2 |
| Availability calendar blocking | "Don't accept bookings on days I'm unavailable" | Booking wizard has no calendar availability check today. Adding this requires blocking integration with wizard — a significant scope expansion | Manual cancellation / refund flow for now. Availability calendar is v2 |
| Dynamic surge pricing (auto-adjust by demand) | Uber-style pricing | Single operator, pre-booked premium service model. Surge pricing would damage brand perception and surprise clients | Use manual holiday multiplier coefficients instead. Operator decides when to apply them |
| Analytics on quote requests (how many fell back to quote mode) | Marketing intelligence | Quote requests are currently not stored in Supabase — they are just email sends. Building quote analytics requires a new `quote_requests` table and instrumentation | Out of scope. Add a `quote_requests` table in v2 if quote conversion becomes a business concern |

---

## Feature Dependencies

```
[Pricing config table in Supabase]
    └──required by──> [Pricing editor UI]
                          └──required by──> [Pricing preview tool]
    └──required by──> [/api/calculate-price reads from DB instead of constants]
                          └──affects──> [Booking wizard pricing accuracy]

[Coverage zones table in Supabase]
    └──required by──> [Zone drawing UI]
    └──required by──> [Point-in-polygon check in /api/calculate-price]
                          └──drives──> [quoteMode fallback in booking wizard]

[Supabase Auth (email+password)]
    └──required by──> [All /admin routes — protected]
    └──required by──> [Server actions that mutate pricing config]
    └──required by──> [Server actions that mutate coverage zones]

[Existing bookings table]
    └──already exists──> [Bookings list UI — zero new schema needed]
    └──already exists──> [Revenue statistics — zero new schema needed]
```

### Dependency Notes

- **Pricing config migration is the most load-bearing change.** The booking wizard calls `/api/calculate-price` which calls `lib/pricing.ts` which reads hardcoded constants. Making rates editable requires: (1) new `pricing_config` table, (2) migration script to seed current hardcoded values, (3) `lib/pricing.ts` refactored to accept config parameter, (4) `/api/calculate-price` to fetch config before calling `calculatePrice`. Failing to do all four atomically will break live pricing.
- **Coverage zones affect the booking wizard at runtime.** Zone changes are immediately live — operator must understand that saving a zone change affects the next booking attempt, not a future deploy.
- **Bookings list and statistics have zero schema dependencies.** All data already exists in `bookings` table. These can be built independently of pricing and zones, making them good "safe" early phases.
- **Auth must come first.** All admin mutations (pricing save, zone save) must be behind auth. Build auth gate before any editor UI.

---

## MVP Definition

### Launch With (v1.2)

- [ ] Supabase Auth email+password gate on all `/admin` routes — no admin is accessible without login
- [ ] Pricing editor: edit base rates (per-km, hourly, daily) per vehicle class, extras prices, airport fee, night/holiday multipliers; changes persist to Supabase `pricing_config` table
- [ ] `/api/calculate-price` reads from `pricing_config` table instead of hardcoded constants
- [ ] Coverage zone editor: draw polygons on Google Maps, name and save, toggle active/inactive; zones stored in `coverage_zones` table
- [ ] Point-in-polygon check in `/api/calculate-price` triggers quoteMode when pickup/destination is outside all active zones
- [ ] Bookings list: paginated table with date range, trip type, and name/reference search filters; click-to-expand detail
- [ ] Statistics page: total revenue (CZK) by month, booking count by period, breakdown by vehicle class and trip type, 12-month bar chart

### Add After Validation (v1.x)

- [ ] Pricing preview tool (inline "what would this cost?" calculator using draft rates before save) — add when operator reports uncertainty about rate changes
- [ ] CSV export of bookings — add when first accountant handoff is needed
- [ ] Booking status workflow (Confirmed/In Progress/Completed column) — add when operations complexity warrants tracking

### Future Consideration (v2+)

- [ ] Zone-to-zone fixed price overrides — only if airport corridor flat pricing becomes operationally needed
- [ ] Quote requests tracking (`quote_requests` table) — only if quote-to-booking conversion becomes a business metric
- [ ] Availability calendar with wizard integration — only if no-show / overbooking becomes a real problem
- [ ] Multi-user roles — only if a second dispatcher or driver is added

---

## Feature Prioritization Matrix

| Feature | Operator Value | Implementation Cost | Priority |
|---------|----------------|---------------------|----------|
| Auth gate on /admin | HIGH — security; without it all data is exposed | LOW — Supabase Auth + Next.js middleware | P1 |
| Pricing editor (base rates + multipliers) | HIGH — rates are hardcoded; operator cannot change without code deploy | MEDIUM — schema migration + refactor pricing.ts | P1 |
| Coverage zone editor (draw + save polygons) | HIGH — drives quoteMode fallback in live booking wizard | HIGH — DrawingManager + GeoJSON storage + point-in-polygon | P1 |
| Bookings list (filterable table) | HIGH — operator has no visibility into orders today | LOW — query existing table | P1 |
| Revenue statistics (totals + chart) | MEDIUM — useful but not blocking operations | LOW — aggregate queries on existing table | P1 |
| Pricing preview tool | MEDIUM — reduces operator risk when changing rates | MEDIUM — draft state management + live calc call | P2 |
| CSV export | LOW — useful for accountant, not daily ops | MEDIUM — streaming CSV endpoint | P2 |
| Booking status workflow | LOW — nice for ops clarity | MEDIUM — schema migration + status column | P3 |

**Priority key:**
- P1: Must have for v1.2 launch
- P2: Should have; add when v1.2 core is validated
- P3: Nice to have; future consideration

---

## Competitor Feature Analysis

| Feature | QuanticaLabs / WordPress plugin | LimoAnywhere / LimoCaptain SaaS | Prestigo v1.2 Approach |
|---------|---------------------------------|--------------------------------|------------------------|
| Pricing editor | Complex rule engine with unlimited conditions | Per-vehicle rates + surcharges | Flat config table: named rates + named multipliers (no stacking) |
| Coverage zones | Polygon drawing, unlimited zones, zone-to-zone pricing rules | City/zone selection, fixed fares | Polygon drawing; active/inactive toggle; drives quoteMode only in v1.2 |
| Bookings table | Full management: status workflow, manual booking creation, driver assignment | Same, plus driver dispatch | Read-only filterable table in v1.2; status workflow in v1.3 |
| Statistics | Revenue charts, booking volume, fleet utilization | Per-vehicle revenue, regional breakdown | Revenue totals + breakdown by class/type + 12-month chart |
| Auth | WordPress user roles | Multi-user with roles | Single admin, email+password via Supabase Auth |
| Anti-pattern present | Rule stacking causes precedence bugs (reported in Envato forums) | Enterprise feature bloat for small operators | Avoided: flat multipliers, no rule stacking |

---

## Sources

- [QuanticaLabs Pricing Rules Overview](https://quanticalabs.com/docs/chauffeur-booking-system/knowledge-base/pricing-rules-overview/) — MEDIUM confidence (industry reference)
- [QuanticaLabs Geofence Zones](https://quanticalabs.com/docs/chauffeur-booking-system/knowledge-base/working-with-geofence-zones/) — MEDIUM confidence (industry reference)
- [Yelowsoft Zone-Based Pricing Automation](https://www.yelowsoft.com/blog/automated-zone-pricing-for-taxi-chauffeur-fleets/) — MEDIUM confidence
- [Chauffeur Drive Systems Dispatch Software](https://www.chauffeurdrivesystems.com/dispatch-software-for-chauffeur-companies/) — MEDIUM confidence (industry overview)
- [LimoCaptain Features](https://limocaptain.com/software/) — MEDIUM confidence (competitor reference)
- [Envato Forums — pricing rule bugs](https://forums.envato.com/t/pricing-rules-chauffeur-booking-system/446096) — MEDIUM confidence (real-world problem reports)
- [InetSoft: Shared Rider System Dashboard KPIs](https://www.inetsch.com/info/shared-rider-system-dashboards/) — MEDIUM confidence
- Codebase analysis: `lib/pricing.ts`, `supabase/migrations/0001_create_bookings.sql`, `app/api/calculate-price/route.ts` — HIGH confidence (source of truth)

---

*Feature research for: PRESTIGO v1.2 Operator Dashboard*
*Researched: 2026-04-01*
