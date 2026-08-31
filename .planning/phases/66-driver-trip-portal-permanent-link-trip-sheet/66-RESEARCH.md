# Phase 66: Driver Trip Portal — Permanent Link & Trip Sheet - Research

**Researched:** 2026-08-31
**Domain:** Next.js App Router token-gated read page + Supabase schema extension (no new packages)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Token Model**
- **D-01:** Add a NEW column `trip_token uuid NOT NULL DEFAULT gen_random_uuid()`
  to `driver_assignments`, separate from the existing single-use `token` column
  (accept/decline). The permanent trip token has NO expiry and NO `used_at`
  consumption. — **Reversibility:** one-way — new column + backfill on
  `driver_assignments` via migration 060; dropping it later needs a down
  migration and breaks any live driver links.
- **D-02:** Token is generated at assignment-insert time (the existing
  `POST /api/admin/bookings/[id]/assign` insert), reusing the DB default so new
  rows get a token automatically — no code change needed to populate it on
  insert.

**Token Validity & Invalidation**
- **D-03:** The trip link is valid when BOTH hold: (a) the booking's `status` is
  NOT terminal (`completed`, `cancelled` — the two statuses with empty transition
  arrays in `lib/booking-transitions.ts`), AND (b) the assignment is the current
  one for its driver, i.e. `driver_assignments.driver_id === bookings.driver_id`.
  Because reassignment inserts a NEW `driver_assignments` row and updates
  `bookings.driver_id`, condition (b) automatically invalidates the previous
  driver's old link with no explicit revoke step. — **Reversibility:** costly —
  this validity predicate is the security boundary; changing it later touches the
  trip-sheet loader and any admin surface that trusts the link.

**Trip Sheet Content & Presentation**
- **D-04:** Field labels are **English-only** (driver-facing; may be a foreign
  driver). No CZ localization in this phase.
- **D-05:** Header/branding: Prestigo logo + a "Trip Sheet" title + the booking
  reference shown prominently, so the page reads as an official document for
  police control.
- **D-06:** Trip sheet content = the DTRIP-02 fields (pickup/dropoff, date/time,
  passenger name, phone, flight info, special requests, booking reference) PLUS
  **vehicle details and driver details** (vehicle class/description and driver
  name/phone). Exact available field names to be confirmed by research against
  the `bookings` / `drivers` schema.
- **D-07:** Addresses are shown with an **embedded map** on the page (not
  text-only, not just a link-out).
- **D-08:** The page is `noindex` (robots meta / headers) — must never be indexed.
- **D-09:** Built as an app-shell page (client-capable) under the permanent
  token route, structured so Phase 67 can add status-marking + note UI in place
  rather than being a throwaway static server render.

**Link Delivery**
- **D-10:** The permanent trip link is delivered via BOTH: (a) the driver
  assignment email, alongside the existing accept/decline buttons, and (b) a
  "copy link" control in the admin (so a dispatcher can send it manually). The
  accept/decline flow itself is unchanged (DTRIP-07).

**Invalid-Link Behavior**
- **D-11:** When the token resolves but the link is invalid (terminal status or
  reassigned) OR the token is unknown, show a NEUTRAL placeholder
  ("This trip link is no longer active") with NO booking data and a uniform
  response that does not distinguish "unknown token" from "invalidated token"
  (prevents enumeration / data leakage). Mirrors the existing
  `/api/driver/respond` uniform `invalid_token` handling.

**Backfill**
- **D-12:** Migration 060 backfills `trip_token` for ALL existing
  `driver_assignments` rows (the `DEFAULT gen_random_uuid()` on a NOT NULL column
  populates existing rows on add); existing assignments of active (non-terminal)
  bookings therefore get a working permanent link too. — **Reversibility:**
  one-way — part of migration 060.

### Claude's Discretion
- URL/route shape for the trip sheet (leaning toward a clean path-based route
  such as `/driver/trip/[token]` rather than the query-param style used by
  `/driver/response`, since it is a permanent link "shown to police / used like a
  mini-app"). Planner decides final shape.
- Whether the trip-sheet data load is a server component read vs a lightweight
  API endpoint behind the app-shell — planner decides, keeping D-09 in mind.
- Exact embedded-map implementation (static vs interactive) subject to the
  Google Maps constraint in canonical refs.

### Deferred Ideas (OUT OF SCOPE)
- Driver status-marking (en route → arrived → on board → completed / no-show),
  trip note/feedback, and admin live visibility — **Phase 67** (DTRIP-03/04/05/06).
- Driver GPS/real-time location, push/SMS notifications, GNet push of
  trip-progress — future (DTRIP-FUT-01/02/03), explicitly out of scope for v2.2.

None of the above were pulled into Phase 66 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DTRIP-01 | On assignment, a permanent per-assignment driver link is generated with a token valid until the order reaches a terminal status (no immediate expiry). | `trip_token uuid NOT NULL DEFAULT gen_random_uuid()` column (migration 060) generated at insert via DB default — no app code change at the insert site; see Code Examples "Migration 060 shape" and Pattern 1/2 |
| DTRIP-02 | The driver link opens a `noindex` trip sheet with full trip details (pickup/dropoff, date/time, passenger, phone, flight, special requests, booking reference) — presentable to police control. | All fields confirmed present on `bookings` Row type (`types/database.types.ts:18-63`); `robots: { index: false, follow: false }` metadata pattern confirmed via `app/driver/response/page.tsx:6-8`; embedded map via `components/booking/RouteMap.tsx` (Pattern 2) |
| DTRIP-07 | The existing accept/decline assignment flow remains available; the permanent trip link coexists with it. | Confirmed `token`/`token_expires_at`/`token_used_at` columns and `/api/driver/respond` logic are untouched — `trip_token` is an additive column, not a replacement (see Anti-Patterns to Avoid) |
| DTRIP-08 | The trip link token is unguessable and only exposes the assigned booking's data; it becomes invalid on terminal status or reassignment. | `gen_random_uuid()` token generation (Don't Hand-Roll); D-03 validity predicate expressed as a single service-role join query (Pattern 1); uniform invalid-token response (D-11, Security Domain) |

</phase_requirements>

## Summary

Phase 66 adds a second, non-expiring token to the existing `driver_assignments` table
and a new `noindex` app-shell page that reads trip data through it. Every piece of
infrastructure this phase needs already exists in the codebase in a directly
analogous form: the single-use accept/decline token on the same table
(`token`/`token_expires_at`/`token_used_at`), a driver-facing token-gated page
(`app/driver/response/`), a uniform invalid-token response pattern
(`/api/driver/respond`), an assignment email builder (`lib/email.ts`), a terminal-status
map (`lib/booking-transitions.ts`), and a Google-Maps-JS-loader route component
(`components/booking/RouteMap.tsx`) that draws exactly the pickup→dropoff line this
phase needs, sourced from `bookings.origin_lat/lng` and `destination_lat/lng` (both
present and nullable on the table). No new npm package is required anywhere in this
phase.

The one piece of net-new work is genuinely new: a `trip_token uuid NOT NULL DEFAULT
gen_random_uuid()` column on `driver_assignments` (migration 060), a new route
`/driver/trip/[token]` (already covered by the existing `/driver` prefix in
`middleware.ts`'s nonce-CSP branch — zero middleware changes needed), and the D-03
validity predicate expressed as a single Supabase `.select('*, bookings!inner(*)')`
join query, checked in application code (`assignment.driver_id ===
assignment.bookings.driver_id && !TERMINAL.includes(assignment.bookings.status)`).

**Primary recommendation:** Extend `driver_assignments` with `trip_token` in migration
060 (DB default handles backfill + all future inserts, per D-01/D-02/D-12), build
`/driver/trip/[token]/page.tsx` as a server component modeled directly on
`app/driver/response/page.tsx` (same `InvalidTokenView` pattern, same
`createSupabaseServiceClient()` lookup, same wordmark header), reuse
`components/booking/RouteMap.tsx` for the embedded map (it does NOT hide Google
attribution — confirmed by reading its render tree), and add the trip link next to
the existing accept/decline URLs in `sendDriverAssignmentEmail` plus a "copy link"
control fed by a `trip_token` field added to `GET
/api/admin/bookings/[id]/assignment`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Trip token generation | Database / Storage | API / Backend | `DEFAULT gen_random_uuid()` on the column — DB is the source of truth, no app code generates it (D-02) |
| Trip token validity check (D-03) | API / Backend | Database / Storage | Predicate combines a DB join (assignment↔booking) with app-level terminal-status logic from `lib/booking-transitions.ts` |
| Trip sheet rendering | Frontend Server (SSR) | Browser / Client | Server component reads Supabase directly (mirrors `app/driver/response/page.tsx`); D-09 keeps a client island seam open for Phase 67 |
| Embedded map | Browser / Client | — | `RouteMap.tsx` is a `'use client'` component that loads the Google Maps JS SDK in-browser |
| Link delivery (email) | API / Backend | — | Built server-side in `assign/route.ts` alongside existing accept/decline URLs, sent via `lib/email.ts` |
| Link delivery (admin copy) | Frontend Server (SSR) → Browser / Client | API / Backend | `DriverAssignmentSection.tsx` (client component) reads `trip_token` from the existing `GET .../assignment` endpoint and copies via `navigator.clipboard` |
| noindex enforcement | Frontend Server (SSR) | — | Next.js `export const metadata = { robots: ... }` — same mechanism as `/driver/response` |

## Standard Stack

This phase introduces **no new dependencies**. All work uses packages already in
`package.json`:

### Core (already installed — no version change)
| Library | Version (installed) | Purpose | Why Standard (for this phase) |
|---------|---------|---------|--------------|
| `next` | ^16.2.3 | App Router page/route for `/driver/trip/[token]` | Existing framework — `[VERIFIED: package.json]` |
| `zod` | ^4.3.6 | Any new API-route body validation (if the D-10 copy-link surfaces a dedicated endpoint) | Existing project-wide validation library — `[VERIFIED: package.json]` |
| `@googlemaps/js-api-loader` | ^2.0.2 | Embedded map (D-07) | Already used by `RouteMap.tsx`/`AddressInput.tsx`/`RoutesMap.tsx` — `[VERIFIED: package.json + components/booking/RouteMap.tsx:4]` |
| `resend` | ^6.9.4 | Extending `sendDriverAssignmentEmail` with the trip link | Already used by `lib/email.ts` — `[VERIFIED: package.json]` |

### Supporting
None — no supporting libraries needed beyond the above.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reuse `RouteMap.tsx` client component | Static Google Static Maps API `<img>` | Static image is simpler and avoids loading the JS SDK, but the existing pattern already handles attribution correctly, is battle-tested, and D-09 wants an app-shell "mini-app" feel, not a static image — reuse wins |
| DB-default UUID token | Application-generated `crypto.randomUUID()` on insert | DB default requires zero code change at the insert site (matches D-02 exactly) and guarantees existing rows get backfilled automatically when the column is added as `NOT NULL DEFAULT` |

**Installation:** None required — no `npm install` step for this phase.

**Version verification:** All four packages above were verified present via
`package.json` (read directly), not via registry lookup — this phase adds no new
package so no `npm view` verification is needed.

## Package Legitimacy Audit

**Not applicable — this phase installs no new external packages.** All functionality
is built from libraries already present in the repo (see Standard Stack above).

**Packages removed due to [SLOP] verdict:** none — no packages evaluated (no installs).
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────┐
                    │  POST /api/admin/bookings/[id]/assign    │
                    │  (existing route — extend, don't replace)│
                    └───────────────┬───────────────────────────┘
                                    │ INSERT driver_assignments
                                    │ (token + trip_token both DB-defaulted)
                                    ▼
                    ┌───────────────────────────────┐
                    │ driver_assignments row created │
                    │  token           (single-use)  │
                    │  trip_token      (permanent)   │──────────┐
                    └───────────────┬───────────────┘          │
                                    │                           │
                    ┌───────────────▼────────────────┐          │
                    │ sendDriverAssignmentEmail()     │          │
                    │ acceptUrl / declineUrl (existing)│          │
                    │ + tripUrl (NEW, uses trip_token) │          │
                    └───────────────┬────────────────┘          │
                                    │ email                      │
                                    ▼                            │
                    ┌────────────────────────────────┐          │
                    │ Driver clicks trip link          │◄─────────┘ (or admin
                    │ GET /driver/trip/[trip_token]     │             "copy link")
                    └───────────────┬────────────────┘
                                    │
                    ┌───────────────▼─────────────────────────────┐
                    │ Server component (mirrors app/driver/response)│
                    │  1. createSupabaseServiceClient()             │
                    │  2. SELECT driver_assignments                 │
                    │       JOIN bookings (inner)                   │
                    │       WHERE trip_token = :token                │
                    │  3. Validity check (D-03), in app code:        │
                    │     assignment.driver_id === booking.driver_id │
                    │     && !TERMINAL.includes(booking.status)      │
                    └───────────┬───────────────────┬───────────────┘
                                │ invalid                │ valid
                                ▼                        ▼
                ┌───────────────────────┐   ┌────────────────────────────┐
                │ Neutral placeholder    │   │ Trip Sheet page (D-05/06/07)│
                │ "no longer active"     │   │  - header/wordmark/ref      │
                │ (mirrors InvalidToken  │   │  - pickup/dropoff + map     │
                │  View in response/     │   │    (RouteMap.tsx, reused)   │
                │  page.tsx)             │   │  - passenger/flight/notes   │
                │                        │   │  - vehicle_class + driver   │
                └───────────────────────┘   │    name/phone/vehicle_info  │
                                              │  - noindex metadata         │
                                              └────────────────────────────┘
```

### Recommended Project Structure
```
app/
├── driver/
│   ├── response/                     # existing — unchanged (DTRIP-07)
│   │   ├── page.tsx
│   │   └── DriverResponseClient.tsx
│   └── trip/
│       └── [token]/
│           └── page.tsx              # NEW — server component, D-09 app-shell page
supabase/migrations/
└── 060_driver_assignments_trip_token.sql   # NEW — add + backfill trip_token
app/api/admin/bookings/[id]/
├── assign/route.ts                   # EXTEND — build tripUrl, pass to email
└── assignment/route.ts               # EXTEND — select trip_token for admin copy-link UI
lib/
├── email.ts                          # EXTEND — DriverAssignmentEmailData.tripUrl
└── booking-transitions.ts            # READ ONLY — import terminal-status logic, do not edit
components/admin/
└── DriverAssignmentSection.tsx       # EXTEND — "Copy link" control (D-10)
```

### Pattern 1: Server-component token lookup with uniform invalid response

**What:** A single service-role Supabase query resolves the token to an assignment +
booking, and a boolean validity check decides between the real page and a neutral
placeholder — no separate "not found" vs "expired" vs "reassigned" branches exposed
to the client (D-11).

**When to use:** Any driver-facing or otherwise unauthenticated token-gated page in
this codebase (this is the established pattern from `app/driver/response/page.tsx`).

**Example (adapted from the existing file, confirmed pattern):**
```typescript
// Source: app/driver/response/page.tsx:64-91 (existing pattern, read this session)
export default async function TripSheetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createSupabaseServiceClient()

  const { data: assignment, error } = await supabase
    .from('driver_assignments')
    .select('id, driver_id, bookings!inner(*), drivers(name, phone, vehicle_info)')
    .eq('trip_token', token)
    .single()

  const TERMINAL = new Set(['completed', 'cancelled']) // from lib/booking-transitions.ts VALID_TRANSITIONS empty-array keys

  const isValid =
    !error &&
    assignment &&
    assignment.driver_id === assignment.bookings.driver_id &&
    !TERMINAL.has(assignment.bookings.status)

  if (!isValid) return <InvalidTripLinkView /> // D-11: neutral, no data leakage

  return <TripSheet assignment={assignment} />
}
```

### Pattern 2: Embedded route map reused as-is

**What:** `components/booking/RouteMap.tsx` accepts `{ origin: PlaceResult | null,
destination: PlaceResult | null, pickupTime?: string | null }` where `PlaceResult =
{ address, placeId, lat, lng }`. It draws directions (with a straight-line polyline
fallback), origin/destination markers, and does **not** call `disableDefaultUI` in a
way that removes the Google logo/copyright (that flag only suppresses zoom/street-view/
map-type controls per the Maps JS API — the logo and "Terms"/report-a-problem links
render regardless and are not touched by this component).

**When to use:** For the D-07 embedded map. `bookings.origin_lat`, `origin_lng`,
`destination_lat`, `destination_lng` are all present as nullable columns
`[VERIFIED: types/database.types.ts:18-63]`, so a `PlaceResult`-shaped object can be
built directly from the booking row (use `placeId: ''` — the component never reads
`placeId`, only `address`/`lat`/`lng`).

```typescript
// Source: components/booking/RouteMap.tsx:139-153 (existing, read this session)
interface RouteMapProps {
  origin: PlaceResult | null
  destination: PlaceResult | null
  pickupTime?: string | null    // 24h HH:MM
}
```

**Do NOT reuse** `components/RoutesMap.tsx` (the homepage map) for this purpose — it
is a stylized outline map with `[&_*]:outline-none` styling and is the component
flagged in project memory as the one with an attribution-hiding ToS risk. `RouteMap.tsx`
(booking flow) is the safe, unmodified pattern to copy.

### Anti-Patterns to Avoid
- **Do not touch the existing `token`/`token_expires_at`/`token_used_at` columns or
  `/api/driver/respond` logic.** DTRIP-07 requires the accept/decline flow to work
  completely unchanged — `trip_token` must be a wholly separate column added by
  migration 060, never a repurposing of `token`.
- **Do not add an explicit revoke/invalidate column or step.** D-03's predicate
  (`driver_id` match + non-terminal status) already self-invalidates on reassignment
  because `assign/route.ts` inserts a NEW `driver_assignments` row and updates
  `bookings.driver_id` on every (re)assignment — confirmed by reading
  `app/api/admin/bookings/[id]/assign/route.ts:70-112`. Adding a separate revoke
  mechanism would duplicate this and risk drift.
- **Do not distinguish error reasons in the trip-sheet response.** Mirror
  `/api/driver/respond`'s uniform `invalid_token` string for both "token doesn't
  exist" and "token exists but invalid" (D-11) — returning different messages is
  the enumeration vector the existing code was written to avoid.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unguessable token generation | Custom random-string generator | `gen_random_uuid()` DB default (same mechanism as the existing `token` column) | 122-bit random UUIDv4 is already the project's proven pattern for this exact table; no reason to diverge |
| Google Maps route rendering | New map component from scratch | `components/booking/RouteMap.tsx` (props-compatible reuse) | Already handles Directions API + straight-line fallback, marker styling, and ToS-safe attribution — rebuilding risks reintroducing the attribution-hiding mistake flagged elsewhere in this codebase |
| Vehicle-class label formatting | New label map in the trip sheet | `formatVehicleLabel()` in `lib/email.ts:67-71` (currently private — export it) | Already covers `business`/`first_class`/`business_van` → "Business"/"First Class"/"Business Van"; duplicating risks drift if a 4th class is added later |
| CSRF/nonce CSP for the new route | New middleware matcher entry | Existing `/driver` prefix in `middleware.ts:101-111` | `/driver/trip/[token]` automatically inherits the nonce-based CSP already applied to all `/driver/*` paths — zero middleware change needed |

**Key insight:** Every mechanism this phase needs (token column, token-gated page,
invalid-token UX, map component, email template extension point) already has exactly
one established implementation elsewhere in this codebase. The work is almost purely
"copy the pattern to a second column/route," not "design a new mechanism."

## Runtime State Inventory

> Rename/refactor/migration trigger check: this phase adds a column and a route; it
> does not rename or move any existing identifier, table, or file. The
> Runtime-State-Inventory trigger (rename/rebrand/refactor/migration) does not apply.
> Skipped — this is additive schema/feature work, not a rename.

## Common Pitfalls

### Pitfall 1: Re-granting PUBLIC EXECUTE after a signature-changing migration
**What goes wrong:** If migration 060 needs to touch any SECURITY DEFINER RPC (it
should not — this phase only adds a column, no RPC signature changes), a DROP+CREATE
of that function silently re-grants default PUBLIC EXECUTE.
**Why it happens:** Documented precedent in this exact codebase —
`[VERIFIED: migration 059 commit 472e132, per STATE.md Phase 65 log]` "059's DROP+CREATE
produces a new function object receiving a default PUBLIC EXECUTE grant."
**How to avoid:** Migration 060 should be a plain `ALTER TABLE driver_assignments ADD
COLUMN trip_token uuid NOT NULL DEFAULT gen_random_uuid();` — no RPC touched, so this
pitfall does not apply, but flag it for the planner in case scope grows to include an
RPC for the admin copy-link surface.
**Warning signs:** Any RPC that appears in this phase's plan should get an explicit
`REVOKE ... FROM PUBLIC, anon, authenticated` step immediately after `CREATE`.

### Pitfall 2: Adding `NOT NULL` without a default on an existing table with live rows
**What goes wrong:** `ALTER TABLE ... ADD COLUMN trip_token uuid NOT NULL` (without
`DEFAULT`) fails immediately on a table that already has rows, because Postgres has
no value to backfill.
**Why it happens:** Easy to drop the `DEFAULT gen_random_uuid()` clause when writing
migration SQL by hand.
**How to avoid:** The column MUST be declared exactly as
`trip_token uuid NOT NULL DEFAULT gen_random_uuid()` in one statement — Postgres
evaluates the default for every existing row when the column is added this way,
satisfying D-12's backfill requirement with zero explicit UPDATE statement.
**Warning signs:** Migration fails with `column "trip_token" contains null values` if
the default is omitted or added as a separate `ALTER COLUMN SET DEFAULT` after an
`ADD COLUMN ... NOT NULL` with no default.

### Pitfall 3: `bookings.origin_lat`/`destination_lat` are nullable — map must have a null path
**What goes wrong:** A trip sheet built assuming lat/lng are always present will crash
or render a blank map for bookings created before Google Places geocoding was
mandatory, or for manually-entered bookings without a resolved coordinate.
**Why it happens:** `origin_lat`, `origin_lng`, `destination_lat`, `destination_lng`
are all `number | null` on the `bookings` table
`[VERIFIED: types/database.types.ts:18-63 — "origin_lat: number | null", "destination_lat: number | null"]`.
**How to avoid:** `RouteMap.tsx` already has a null-safe empty state ("Route
unavailable — you can still select a vehicle class.") triggered when `origin` or
`destination` is `null` — pass `null` through rather than `{ lat: 0, lng: 0 }` when a
coordinate is missing, and reuse that existing empty state (adjust its copy for the
trip-sheet context if needed).
**Warning signs:** A map rendered at `(0, 0)` (Gulf of Guinea) instead of showing the
empty state.

### Pitfall 4: `drivers.vehicle_info` vs `bookings.vehicle_class` are two different fields
**What goes wrong:** D-06 asks for "vehicle class/description" — conflating the two
source columns produces either a missing class or a missing description.
**Why it happens:** `bookings.vehicle_class` is the booked service tier (`'business' |
'first_class' | 'business_van'`), while `drivers.vehicle_info` is a free-text
description of the driver's actual vehicle (nullable)
`[VERIFIED: types/database.types.ts:437-444 — "vehicle_info: string | null"; types/booking.ts:16 — "export type VehicleClass = 'business' | 'first_class' | 'business_van'"]`.
**How to avoid:** Show both on the trip sheet: the booked class (formatted via
`formatVehicleLabel()`, exported from `lib/email.ts`) AND the driver's
`vehicle_info` string, labeled distinctly (e.g. "Vehicle Class" vs "Vehicle").
**Warning signs:** Trip sheet shows only one of the two, or shows `vehicle_info` in
the "class" slot (a free-text string won't match the class enum).

### Pitfall 5: `drivers` table has no `active` column, but the admin drivers UI filters on `.active`
**What goes wrong:** Assuming `drivers.active` exists as a DB column and querying by
it in a new driver-lookup path (e.g. for the copy-link admin UI) will silently return
`undefined`/no filtering rather than erroring, because Supabase-js doesn't type-error
on a nonexistent column filter at the JS level the way a raw SQL query would.
**Why it happens:** `[VERIFIED: types/database.types.ts:437-463]` — the `drivers`
table Row type is exactly `{ created_at, email, id, name, phone, vehicle_info }`, no
`active` field. `components/admin/DriverAssignmentSection.tsx:72` filters
`d.active !== false` client-side against the `GET /api/admin/drivers` response,
meaning `active` (if present at all) is added by that API route, not the table
itself, or is always `undefined` (which passes the `!== false` check regardless).
**How to avoid:** This phase does not need to touch driver-active filtering, but if
the planner adds any new driver lookup, do not assume `active` is a queryable DB
column — confirm against `/api/admin/drivers/route.ts` if it becomes relevant.
**Warning signs:** A `.eq('active', true)` filter added directly against the
`drivers` table in a new query.

## Code Examples

### Extending the assignment email with the trip link
```typescript
// Source: lib/email.ts:1403-1418 (existing interface, read this session) — add tripUrl
export interface DriverAssignmentEmailData {
  driverName: string
  driverEmail: string
  bookingReference: string
  pickupDate: string
  pickupTime: string
  originAddress: string
  destinationAddress: string
  passengerFirstName: string
  passengerLastName: string
  passengerPhone: string
  driverPriceCzk: number | null
  specialRequests?: string | null
  acceptUrl: string
  declineUrl: string
  tripUrl: string   // NEW — D-10, permanent trip-sheet link
}
```

```typescript
// Source: app/api/admin/bookings/[id]/assign/route.ts:172-193 (existing site, read this session)
if (allowed) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rideprestigo.com'
  const acceptUrl = `${siteUrl}/driver/response?token=${assignment.token}&action=accepted`
  const declineUrl = `${siteUrl}/driver/response?token=${assignment.token}&action=declined`
  const tripUrl = `${siteUrl}/driver/trip/${assignment.trip_token}`   // NEW

  after(() => sendDriverAssignmentEmail({
    // ...existing fields...
    acceptUrl,
    declineUrl,
    tripUrl,
  }).catch(err => console.error('[driver-assign]:', err)))
}
```
Note: the insert's `.select('id, driver_id, status, token')` at line 73 must be
extended to `.select('id, driver_id, status, token, trip_token')` to make
`assignment.trip_token` available at this call site.

### Migration 060 shape
```sql
-- Source: pattern verified against migrations/048_saved_passengers.sql:11 and
-- migrations/055_booking_edit_audit_log.sql:25 (gen_random_uuid() DEFAULT usage,
-- read this session) — adapted for an ADD COLUMN on an existing table with rows.
ALTER TABLE driver_assignments
  ADD COLUMN trip_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS driver_assignments_trip_token_idx
  ON driver_assignments (trip_token);
```
The unique index is a recommendation (not required by CONTEXT.md decisions) for
lookup performance and to guarantee no collision — `gen_random_uuid()` collisions are
cryptographically negligible but an index also speeds up the `.eq('trip_token',
token)` lookup on every trip-sheet page load.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A | N/A | — | This is new functionality, not a migration from an old pattern within this codebase |

**Deprecated/outdated:** None identified — this phase does not touch any deprecated pattern.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A `CREATE UNIQUE INDEX` on `trip_token` is recommended but not explicitly required by CONTEXT.md's D-01/D-12 | Code Examples | Low — lookup still works via `.eq()` without an index, just slower at scale; adding it is safe and reversible (index-only, not a data change) |
| A2 | `formatVehicleLabel()` in `lib/email.ts` should be exported for reuse rather than duplicated | Don't Hand-Roll | Low — if not exported, the planner may instead write a duplicate mapping function in the trip-sheet page; functionally equivalent but a minor DRY violation, not a correctness risk |
| A3 | The admin "copy link" control (D-10) is best placed inside `DriverAssignmentSection.tsx`'s existing "assigned" render branch rather than a new component | Architecture Patterns / Project Structure | Low — purely an organizational choice; CONTEXT.md leaves exact placement to Claude's discretion implicitly (not explicitly listed, but D-10 only specifies "a copy link control in the admin," not where) |

**If this table is empty:** N/A — see entries above; all three are low-risk implementation-detail assumptions, not open questions about scope or security.

## Open Questions

1. **Should the trip-sheet page live behind the `getAdminUser()` guard for the admin's own preview, or is it purely public-by-token like `/driver/response`?**
   - What we know: CONTEXT.md D-11 explicitly models it on `/api/driver/respond`'s
     uniform invalid-token handling, which is a fully public (unauthenticated) route.
   - What's unclear: Whether an admin viewing the same URL while logged in should get
     any different treatment (e.g., an "as admin" banner). CONTEXT.md does not mention
     this.
   - Recommendation: Treat the route as fully public/token-gated only (matching
     `/driver/response` exactly) — the admin's "copy link" control just gives them
     the same URL a driver would use, no special admin-session branch needed. This
     keeps the trust boundary identical to the existing accept/decline page.

2. **Does the trip-sheet page need rate limiting on the GET request?**
   - What we know: `/api/driver/respond` (a POST/mutation) uses `checkRateLimit`.
     `/driver/response` (a GET server component render) does NOT use rate limiting —
     confirmed by reading the full file, no `rate-limit` import present.
   - What's unclear: Whether DTRIP-08's "unguessable" requirement implies rate
     limiting is unnecessary (a 122-bit token is not brute-forceable at any
     realistic request rate) or whether defense-in-depth suggests adding it anyway.
   - Recommendation: Follow the existing precedent (`/driver/response` has no rate
     limit on its GET) — do not add rate limiting to the new GET page; the token
     entropy makes it unnecessary and matches the established pattern for
     equivalent-risk pages in this codebase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase (project database) | Migration 060, all token lookups | ✓ (used throughout existing codebase) | — | — |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | D-07 embedded map | ✓ (used by 4 existing components) | — | — |
| `RESEND_API_KEY` | Extending the assignment email | ✓ (per project memory — env var present in `.env.local`, read by `lib/email.ts` at call time) | — | — |
| `NEXT_PUBLIC_SITE_URL` | Building `tripUrl` | ✓ (already used for `acceptUrl`/`declineUrl` in `assign/route.ts`) | — | Falls back to `'https://rideprestigo.com'` per existing code at `assign/route.ts:173` |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — all required env vars are already
consumed by existing, working code paths in this exact repo.

## Validation Architecture

`.planning/config.json` has no `workflow.nyquist_validation` key — treated as enabled
per the default rule.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.1 + @testing-library/react + user-event `[VERIFIED: package.json, vitest.config.ts]` |
| Config file | `vitest.config.ts` (jsdom environment, `tests/setup.ts`, `@/` alias to repo root) |
| Quick run command | `npx vitest run tests/driver-trip.test.ts tests/DriverAssignmentSection.test.tsx tests/admin-bookings-assign.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DTRIP-01 | `trip_token` is populated on a new `driver_assignments` insert (DB default, no app code) | unit (mock Supabase insert response includes `trip_token`) | `npx vitest run tests/admin-bookings-assign.test.ts` | ❌ Wave 0 — extend or create; no existing assign-route test file found in this session's search |
| DTRIP-01 | Trip token stays valid while booking status is non-terminal | unit (route/page logic, mocked Supabase join response) | `npx vitest run tests/driver-trip.test.ts` | ❌ Wave 0 — new file |
| DTRIP-02 | Trip sheet renders all required fields (pickup/dropoff, date/time, passenger, phone, flight, notes, reference) for a valid token | unit (component/page render test with mocked Supabase data) | `npx vitest run tests/driver-trip.test.ts` | ❌ Wave 0 — new file |
| DTRIP-02 | Page sets `robots: { index: false }` | unit (import `metadata` export, assert shape) — mirrors how `app/driver/response/page.tsx` declares it | `npx vitest run tests/driver-trip.test.ts` | ❌ Wave 0 |
| DTRIP-07 | `/api/driver/respond` and `app/driver/response` behavior is unchanged (regression guard) | unit (existing test, re-run) | `npx vitest run tests/driver-respond.test.ts` (confirm exact filename during planning) | ✅ if a test file for this route already exists — verify filename at plan time |
| DTRIP-08 | Terminal-status booking (`completed`/`cancelled`) makes the trip link invalid | unit | `npx vitest run tests/driver-trip.test.ts` | ❌ Wave 0 |
| DTRIP-08 | Reassignment (new `driver_assignments` row + updated `bookings.driver_id`) invalidates the OLD assignment's trip link, not the new one | unit | `npx vitest run tests/driver-trip.test.ts` | ❌ Wave 0 |
| DTRIP-08 | Unknown token and invalidated token both return the identical neutral placeholder (no enumeration) | unit (snapshot/text-equality assertion on both code paths) | `npx vitest run tests/driver-trip.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the quick run command above.
- **Per wave merge:** `npx vitest run` (full suite).
- **Phase gate:** Full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/driver-trip.test.ts` — covers DTRIP-01, DTRIP-02, DTRIP-08 (new file; no existing test targets `/driver/trip/*`)
- [ ] Confirm/extend an assign-route test to assert `trip_token` is selected and threaded into `tripUrl` — search for an existing `tests/admin-bookings-assign*.test.ts` at plan time; none was found by filename pattern in this research session
- [ ] `tests/DriverAssignmentSection.test.tsx` — extend existing file (confirmed present) with a case for the new "copy link" control (D-10)
- Framework install: none — Vitest is already configured project-wide.

## Security Domain

`security_enforcement` is not set to `false` anywhere found in `.planning/config.json` — treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | The trip-sheet route is intentionally unauthenticated-by-design (token-as-credential), matching the existing `/driver/response` pattern — this is a deliberate, already-established trust model in this codebase, not a gap |
| V3 Session Management | No | No session is created or consumed by this route |
| V4 Access Control | Yes | Enforced via the D-03 predicate (token → assignment → booking driver_id match + non-terminal status), checked server-side on every request, not client-side |
| V5 Input Validation | Yes | Token param validated as a UUID shape before the Supabase query (mirrors `respondSchema = z.object({ token: z.string().uuid(), ... })` in `app/api/driver/respond/route.ts:7-10`) |
| V6 Cryptography | Yes | Token unguessability relies on Postgres `gen_random_uuid()` (cryptographically random UUIDv4) — never hand-roll a token generator |
| V7 Error Handling / Info Leakage | Yes | D-11's uniform invalid-token response is the standard control against enumeration — must not differentiate "not found" vs "expired" vs "reassigned" in the response |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token enumeration (guess a valid UUID by observing response differences) | Information Disclosure | Uniform neutral response for all invalid states (D-11) — already the established mitigation for `/api/driver/respond`; apply identically here |
| Stale-link data exposure after reassignment | Elevation of Privilege (wrong driver sees a booking no longer theirs) | The D-03 predicate re-checks `driver_id` match on every request (not just at link-creation time) — since it's evaluated live against current `bookings.driver_id`, a reassigned booking's old link fails immediately, no caching/staleness window |
| Terminal-status data exposure after trip completion (police-control link shown weeks later) | Information Disclosure | D-03's non-terminal-status check ensures the link stops resolving once `status` becomes `completed`/`cancelled` — no manual expiry cron needed since it's a live status check, not a stored expiry timestamp |
| CSRF on any new mutation endpoint this phase might add | Tampering | If the D-10 "copy link" surfaces via a new API route, it must be a **GET** (read-only) — `middleware.ts`'s `CSRF_PROTECTED_PREFIXES` list only guards `MUTATION_METHODS` (POST/PATCH/PUT/DELETE); a GET-only endpoint needs no CSRF entry, but if any POST is introduced it MUST be added to that list |

## Sources

### Primary (HIGH confidence — read directly this session)
- `app/api/admin/bookings/[id]/assign/route.ts` — full file read, insert/email/GNet flow
- `app/api/driver/respond/route.ts` — full file read, uniform invalid_token pattern
- `app/driver/response/page.tsx` — full file read, InvalidTokenView + valid-render pattern
- `app/driver/response/DriverResponseClient.tsx` — full file read, client-island pattern
- `app/api/admin/bookings/[id]/assignment/route.ts` — full file read, admin assignment GET
- `lib/email.ts` (lines 1401-1600+, `sendDriverAssignmentEmail`, `DriverAssignmentEmailData`, `formatVehicleLabel`, `emailLogoImg`)
- `lib/email-log.ts` — `logEmail()` dedup mechanism
- `lib/booking-transitions.ts` — full file read, `VALID_TRANSITIONS` terminal-status source
- `lib/supabase.ts`, `lib/supabase/server.ts` — `createSupabaseServiceClient`, `getAdminUser`
- `middleware.ts` — full file read, CSP/nonce/CSRF logic and `isDynamicPath` `/driver` coverage
- `components/booking/RouteMap.tsx` — full file read, embedded-map pattern (attribution-safe)
- `components/RoutesMap.tsx` — full file read, contrast case (the attribution-risk map, NOT to be reused)
- `components/admin/DriverAssignmentSection.tsx` — full file read, admin assign UI + copy-link insertion point
- `types/database.types.ts` — `bookings`, `drivers`, `driver_assignments` Row types (lines 18-63, 437-463, and the driver_assignments block)
- `types/booking.ts` — `PlaceResult`, `VehicleClass` type definitions
- `supabase/migrations/059_admin_search_bookings_sort.sql`, `058`, `055`, `048` — migration numbering + `gen_random_uuid()` DEFAULT precedent
- `package.json`, `vitest.config.ts` — dependency versions, test framework config
- `tests/DriverAssignmentSection.test.tsx` — existing test conventions

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — Phase 65 PUBLIC EXECUTE re-grant pitfall (cited for awareness, not directly re-verified against the 059 migration diff in this session)

### Tertiary (LOW confidence)
- None — no WebSearch/Context7 lookups were needed; every claim was answerable from the codebase itself.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all four existing libraries confirmed present in `package.json`
- Architecture: HIGH — every pattern cited was read directly this session, not inferred
- Pitfalls: HIGH — all five pitfalls are grounded in files read this session (schema types, migration precedent, existing component behavior), not general framework knowledge

**Research date:** 2026-08-31
**Valid until:** 2026-09-30 (30 days — stable internal codebase patterns, no external API version drift risk since no new packages are introduced)
