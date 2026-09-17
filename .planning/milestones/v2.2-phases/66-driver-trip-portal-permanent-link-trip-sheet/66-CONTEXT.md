# Phase 66: Driver Trip Portal — Permanent Link & Trip Sheet - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Each driver assignment gets ONE permanent, unguessable link to a `noindex` trip
sheet page — presentable to police control — that coexists with (does not
replace) the existing single-use accept/decline assignment flow.

**In scope (DTRIP-01, DTRIP-02, DTRIP-07, DTRIP-08):**
- A permanent per-assignment trip-link token (non-single-use, no 48h expiry),
  valid until the booking reaches a terminal status or the assignment is
  superseded by reassignment.
- A `noindex` trip sheet page rendering full trip details for the assigned
  booking, built as an app-shell page (view-only in this phase).
- Delivery of the permanent link to the driver (assignment email + admin copy).
- Backfill of the token onto existing active (non-terminal) assignments.
- Token security: unguessable, scoped to the assigned booking only, invalidated
  on terminal status or reassignment; neutral placeholder on invalid access.

**Out of scope (Phase 67 / future):**
- Driver marking trip-progress statuses (en route → arrived → on board →
  completed / no-show) — DTRIP-03/04/05.
- Driver trip note/feedback — DTRIP-06.
- Admin live visibility of trip-progress — DTRIP-05.
- GPS/geolocation, push/SMS to driver (DTRIP-FUT-*, explicitly out for v2.2).

The trip sheet is deliberately built as a "mini-app that works by link" (app-shell
page under the permanent token) so Phase 67 can add interactivity in place; this
phase ships the view-only trip sheet.

</domain>

<decisions>
## Implementation Decisions

### Token Model
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

### Token Validity & Invalidation
- **D-03:** The trip link is valid when BOTH hold: (a) the booking's `status` is
  NOT terminal (`completed`, `cancelled` — the two statuses with empty transition
  arrays in `lib/booking-transitions.ts`), AND (b) the assignment is the current
  one for its driver, i.e. `driver_assignments.driver_id === bookings.driver_id`.
  Because reassignment inserts a NEW `driver_assignments` row and updates
  `bookings.driver_id`, condition (b) automatically invalidates the previous
  driver's old link with no explicit revoke step. — **Reversibility:** costly —
  this validity predicate is the security boundary; changing it later touches the
  trip-sheet loader and any admin surface that trusts the link.

### Trip Sheet Content & Presentation
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

### Link Delivery
- **D-10:** The permanent trip link is delivered via BOTH: (a) the driver
  assignment email, alongside the existing accept/decline buttons, and (b) a
  "copy link" control in the admin (so a dispatcher can send it manually). The
  accept/decline flow itself is unchanged (DTRIP-07).

### Invalid-Link Behavior
- **D-11:** When the token resolves but the link is invalid (terminal status or
  reassigned) OR the token is unknown, show a NEUTRAL placeholder
  ("This trip link is no longer active") with NO booking data and a uniform
  response that does not distinguish "unknown token" from "invalidated token"
  (prevents enumeration / data leakage). Mirrors the existing
  `/api/driver/respond` uniform `invalid_token` handling.

### Backfill
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing driver-assignment flow (the thing this phase extends)
- `app/api/admin/bookings/[id]/assign/route.ts` — creates the
  `driver_assignments` row (DB generates `token` + `token_expires_at`), updates
  `bookings.driver_id`/`status`, sends the assignment email with accept/decline
  URLs. This is where the trip link must be added to the email.
- `app/api/driver/respond/route.ts` — single-use accept/decline token handling;
  reference model for uniform `invalid_token` responses and race-safe updates.
- `app/driver/response/page.tsx` + `app/driver/response/DriverResponseClient.tsx`
  — existing driver-facing page pattern (query-param token, client component).
- `lib/email.ts` — `sendDriverAssignmentEmail` (accept/decline URLs are built
  here; the trip link goes alongside).
- `lib/booking-transitions.ts` — `VALID_TRANSITIONS`; terminal statuses are the
  ones with empty arrays: `completed`, `cancelled`.

### Schema
- `driver_assignments` table (applied directly via Supabase, NOT in
  `supabase/migrations/`). Current columns: `id, booking_id, driver_id,
  status('pending'→accepted/declined), token(uuid single-use),
  token_expires_at(now+48h), token_used_at, created_at`.
- Migration numbering: next file is **060** (last is
  `supabase/migrations/059_admin_search_bookings_sort.sql`).

### Constraints
- Google Maps: the embedded map uses the existing Google Maps API key (shared
  with booking). Do NOT hide the Google logo/attribution — hidden attribution is
  a ToS violation that risks key suspension. See project memory
  "Google Maps attribution hidden — ToS risk".
- API route conventions: admin-auth guard order, 400-vs-422 two-step parse,
  input sanitisation, CSRF — see project memory "API route patterns".

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `driver_assignments` insert in `assign/route.ts`: `trip_token` populates via DB
  default at the same insert — no new insert code needed.
- `sendDriverAssignmentEmail` (`lib/email.ts`): extend to include the trip link
  URL next to accept/decline.
- Uniform `invalid_token` pattern from `respond/route.ts` for the invalid-link
  page (D-11).
- Existing `/driver/response` page pattern for the driver-facing app-shell.

### Established Patterns
- Reassignment already inserts a new `driver_assignments` row and updates
  `bookings.driver_id` — the D-03 validity predicate leverages this directly, so
  no explicit token-revoke logic is required.
- Service-role Supabase client (`createSupabaseServiceClient`) for token lookups
  that bypass RLS on the public driver-facing route.

### Integration Points
- New trip-sheet route (path-based, D-09/Discretion) → reads `driver_assignments`
  by `trip_token`, joins `bookings` (+ vehicle fields) and `drivers`.
- Assignment email (`assign/route.ts` → `lib/email.ts`) → add trip link.
- Admin booking detail/assignment UI → add "copy link" control (D-10).
- Migration 060 → add `trip_token` column + backfill.

</code_context>

<specifics>
## Specific Ideas

- User's framing: the trip sheet "should be like a mini-app that works by link"
  — drives D-09 (app-shell page, not throwaway static render) and the path-based
  URL preference.
- Trip sheet must look official enough to show to Czech police control (D-05
  header/branding, D-06 vehicle + driver identity, D-07 embedded map).

</specifics>

<deferred>
## Deferred Ideas

- Driver status-marking (en route → arrived → on board → completed / no-show),
  trip note/feedback, and admin live visibility — **Phase 67** (DTRIP-03/04/05/06).
- Driver GPS/real-time location, push/SMS notifications, GNet push of
  trip-progress — future (DTRIP-FUT-01/02/03), explicitly out of scope for v2.2.

None of the above were pulled into Phase 66 scope.

</deferred>

---

*Phase: 66-driver-trip-portal-permanent-link-trip-sheet*
*Context gathered: 2026-08-31*
