# Phase 67: Driver Trip Portal — Status Marking, Notes & Admin Visibility - Context

**Gathered:** 2026-09-02
**Status:** Ready for planning
**Note:** No `/gsd-discuss-phase` was run. These decisions were confirmed
directly with the operator during `/gsd-plan-phase` after `67-RESEARCH.md`
(committed `2edea60`) surfaced the open questions. Decisions D-02 and D-05 are
explicit operator confirmations; the rest accept the research recommendations.

<domain>
## Phase Boundary

From the permanent trip sheet page (built view-only in Phase 66), the driver can
mark real-time trip progress and leave an optional note. The admin can view that
progress and note in the bookings admin — **all without touching the
client-facing `booking.status` or pushing to GNet.**

**In scope (DTRIP-03, DTRIP-04, DTRIP-05, DTRIP-06):**
- Driver marks trip-progress: en route → arrived → on board → completed, or
  no-show, from the trip sheet.
- Driver submits an optional free-text trip note/feedback from the trip sheet.
- Trip-progress + note persist on `driver_assignments` only (structural
  isolation from `bookings`).
- Admin views current trip-progress + note in the bookings admin **detail view**
  (row expansion), alongside — never replacing — the existing booking status.

**Out of scope (future):**
- Trip-progress in the collapsed admin bookings LIST (requires `admin_search_bookings`
  RPC surgery — deferred; see D-05).
- True realtime/push (websocket/Supabase Realtime) — none exists in the codebase;
  "live" is satisfied by re-fetch-on-expand (D-05).
- Any write to `booking.status`, any GNet push, GPS/geolocation, SMS/push to driver.

</domain>

<decisions>
## Implementation Decisions

### Data Model
- **D-01:** Add NEW columns to `driver_assignments`, separate from `bookings`:
  `trip_progress` (text, nullable, constrained to `en_route | arrived | on_board
  | completed | no_show`), `trip_note` (text, nullable), and
  `trip_progress_updated_at` (timestamptz, nullable). Isolation from
  `booking.status` is **structural** (own columns on `driver_assignments`), not
  conventional — this matters because `en_route`/`completed` collide with existing
  `bookings.status` vocabulary. Next migration number per repo convention (planner
  verifies the actual latest migration file; memory notes 053 was "next" earlier —
  Phase 66 used 060, so confirm the current max). — **Reversibility:** one-way
  (new columns + constraint via migration; dropping later needs a down migration).

### Status Marking Behavior
- **D-02:** **Permissive transitions** (operator-confirmed). The driver may set
  any trip-progress value at any time, including `no_show`; no ordering is
  enforced (unlike `bookings.status` VALID_TRANSITIONS). Keeps the on-road UX
  forgiving and the code small.

### Isolation Constraint (DTRIP-04 — the hard rule)
- **D-03:** The driver-facing write path MUST only `.update()` `driver_assignments`
  and MUST NOT import `lib/gnet-client.ts` or `lib/booking-transitions.ts`, and
  MUST NOT write `bookings` at all. `bookings.status` is written in exactly one
  place (`app/api/admin/bookings/route.ts`, admin-gated) and GNet push fires from
  one site there — neither may be reachable from the trip-progress write. This is
  a plan `must_haves.prohibitions` item and gets an explicit test (assert GNet
  client not invoked, `bookings.status` unchanged).

### Driver Write Endpoint (token-gated, unauthenticated)
- **D-04:** Add a NEW token-gated mutation route for driver writes (status + note),
  authorized via the existing `isTripLinkValid()` seam from `lib/trip-token.ts`
  (NOT admin auth). Because `middleware.ts` `CSRF_PROTECTED_PREFIXES` lists the
  exact string `/api/driver/respond` (not a `/api/driver` wildcard), the new
  route's prefix MUST be added to that list explicitly. Validate + sanitise input
  (zod; note ≤ reasonable max length), and rate-limit the unauthenticated write
  using the existing `lib/rate-limit.ts` mechanism. Follow the 400-vs-422
  two-step parse convention.

### Admin Visibility
- **D-05:** **Detail-view only** (operator-confirmed). Surface trip-progress + note
  on booking row expansion via the existing re-fetch-on-expand behavior in
  `DriverAssignmentSection.tsx` — no new realtime infra and no
  `admin_search_bookings` RPC surgery. This is a deliberate, recorded scoping of
  ROADMAP Success Criterion 3 ("list/detail") down to **detail** for v1; LIST
  surfacing is explicitly deferred (out of scope above).

### UI
- **D-06:** Add the interactive controls as a client island **in place** on the
  existing `/driver/trip/[token]/page.tsx` server component (Phase 66 built it as
  an app-shell page specifically so Phase 67 adds interactivity here). Status
  controls are simple mobile tap targets (driver shows phone to police); the note
  field and controls match the trip sheet's existing dark-theme styling.

### Claude's Discretion
- Exact column type for `trip_progress` (text + CHECK constraint vs a Postgres
  enum) — planner picks per repo migration conventions.
- Whether the note and status share one endpoint/payload or two — planner decides.
- Whether trip-progress uses a SECURITY DEFINER RPC or a direct service-client
  `.update()` (mind the PUBLIC EXECUTE grant gotcha if an RPC is chosen).
</decisions>
