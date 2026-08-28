# Phase 65: Dispatch — Future-First Bookings List - Context

**Gathered:** 2026-08-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the admin bookings list page dispatcher-focused: by default it shows only
upcoming trips, with a default horizon that persists across visits (settable in
admin Settings) and an in-session filter to reveal past/all without changing the
saved default. KPI counters stay accurate regardless of the active filter.

Requirements: **DISP-01, DISP-02, DISP-03, DISP-04** (see REQUIREMENTS.md).

**In scope:** default future-only list on load, persistent horizon setting,
in-session Future/Past/All override, list sort suited to dispatch, KPI accuracy.
**Out of scope:** anything driver-portal related (Phases 66–67), changes to
`booking.status` vocabulary, GNet behaviour, new admin auth.
</domain>

<decisions>
## Implementation Decisions

### Future cutoff semantics (DISP-01)
- **D-01:** "Future" is evaluated **by day**: a booking is future when
  `pickup_date >= today`. Today's trips stay visible until midnight (including
  in-progress / just-departed ones) — dispatcher must not lose an active trip.
  "Today" is **server-computed in Europe/Prague timezone**, not client-derived.
  Chosen over timestamp-precision (`pickup_date+pickup_time >= now`) for
  simplicity (the RPC already compares `pickup_date` only) and because a trip in
  progress is still operationally relevant. — **Reversibility:** reversible —
  filter-level predicate, cheap to tighten to time-precision later.

### List sort order (DISP-01)
- **D-02:** Sort is **adaptive by active horizon**: Future view → `pickup ASC`
  (soonest trip at the top — the "future-first" intent); Past/All view →
  `pickup DESC` (most recent at top). The RPC currently hardcodes
  `ORDER BY created_at DESC`, so a sort/direction parameter is needed.
  — **Reversibility:** costly — requires changing the `admin_search_bookings`
  RPC signature/body (a live DB migration) and the GET handler that calls it.

### Persistent default-horizon setting (DISP-02)
- **D-03:** Shipped default (out of the box) is **`Future only`** so DISP-01
  holds on first load. Horizon options are **`Future only` / `Last N days` / `All`**,
  where **N is admin-editable with a default of 7**. Stored **globally** in
  `pricing_globals` (admin auth is a single shared session, so per-admin storage
  is unnecessary) — mirrors how `notification_flags` are persisted and read via
  `/api/admin/settings`. Exact storage shape (new column vs JSONB key) and
  migration number left to research/planning. — **Reversibility:** costly —
  persisted setting lives in a DB row read by the list on every visit; changing
  its shape touches a migration + the settings API + the list loader.

### In-session filter control (DISP-03)
- **D-04:** A **segmented control (Future / Past / All)** at the top of the
  bookings list. It is **ephemeral React state in `BookingsTable`** — resets to
  the saved default on reload and **never mutates the persisted setting**.
  Chosen over a URL query param (simpler, and "in-session" is exactly the
  intended lifetime). — **Reversibility:** reversible — pure client state.

### KPI accuracy guard-rail (DISP-04)
- **D-05:** KPI counters ("TODAY" count, "THIS WEEK" revenue) keep their own
  independent date-scoped fetches (they already pass explicit `startDate`/
  `endDate` in `bookings/page.tsx`) and **must stay decoupled** from the list's
  active horizon/filter. Any refactor of the list filter must not route KPI
  totals through the list query. — **Reversibility:** reversible — a test/guard,
  not a schema change.

### Claude's Discretion
- Storage mechanism for the persisted horizon (dedicated column vs JSONB key in
  `pricing_globals`), the RPC parameter names for future-cutoff and sort, and
  the exact Settings-page UI widget layout are implementation details for
  research/planning.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone requirements & roadmap
- `.planning/REQUIREMENTS.md` §"Dispatch" (DISP-01..04) — the four locked requirements + traceability.
- `.planning/ROADMAP.md` §"Phase 65" — goal, success criteria (esp. criterion 4 = KPI accuracy guard-rail).

### Admin bookings surface (primary integration points)
- `app/admin/(dashboard)/bookings/page.tsx` — client page; renders KPIs (independent fetches) + `BookingsTable`.
- `components/admin/BookingsTable.tsx` — list UI; already holds `statusFilter/startDate/endDate/showDateFilter` state (where the segmented Future/Past/All control lands).
- `app/api/admin/bookings/route.ts` (GET handler ~L213) — parses `startDate/endDate/status/search/tripType`, calls the RPC.
- `supabase/migrations/054_admin_search_bookings_status_filter.sql` — canonical `admin_search_bookings` body: filters on `pickup_date` range, `ORDER BY created_at DESC` (the sort to change), `{ rows, total_count }` return shape, SECURITY DEFINER + GRANT pattern.
- `supabase/migrations/057_security_rls_hardening.sql` — later touch of the same RPC; check before re-issuing the function.

### Persistent settings pattern
- `app/api/admin/settings/route.ts` — GET/PATCH against `pricing_globals` (id=1) JSONB `notification_flags`; the pattern to extend for the horizon setting.
- `app/admin/(dashboard)/settings/page.tsx` — admin Settings UI to add the horizon control to.

### Project references
- `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/ARCHITECTURE.md` — admin API/auth conventions (400-vs-422 parse, admin auth guard order).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `admin_search_bookings` RPC — already the single filtered/paged query behind the list; extend with future-cutoff + sort params rather than building new queries.
- `pricing_globals` (id=1) + `/api/admin/settings` GET/PATCH — reusable persistence + settings-form pattern for the horizon default.
- `BookingsTable` filter state + `showDateFilter` toggle — existing home for the new segmented horizon control.
- `KPICard` + independent KPI fetches in `bookings/page.tsx` — already decoupled from the list; keep them that way (D-05).

### Established Patterns
- Admin GET routes: auth guard first (401/403), then whitelist query params (see the `KNOWN_STATUSES` whitelist for `status`) — apply the same for any new horizon/sort param.
- RPC changes require DROP + CREATE (signature change) and explicit re-GRANT EXECUTE to `service_role`; live apply is a `[BLOCKING]` operator step.
- Migrations applied live by the operator (user runs the SQL) — plan the migration as a blocking hand-off, not an MCP auto-apply.

### Integration Points
- New horizon param flows: Settings form → `/api/admin/settings` PATCH → `pricing_globals` → read on bookings page load → passed to GET `/api/admin/bookings` → RPC predicate + sort.
- In-session segmented control → `BookingsTable` local state → overrides the horizon param sent to GET, without writing back to settings.

</code_context>

<specifics>
## Specific Ideas

- "Future-first" specifically means soonest upcoming trip at the top for the
  dispatcher, not newest-created — hence the sort change (D-02).
- Timezone for the day boundary is Europe/Prague (operator locale), server-side.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Driver trip portal work lives in
Phases 66–67; empty-state polish and horizon×status-chip interaction were raised
as optional extra areas but the user opted not to expand scope.)

</deferred>

---

*Phase: 65-dispatch-future-first-bookings-list*
*Context gathered: 2026-08-28*
