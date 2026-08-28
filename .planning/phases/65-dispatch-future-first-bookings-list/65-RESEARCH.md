# Phase 65: Dispatch — Future-First Bookings List - Research

**Researched:** 2026-08-28
**Domain:** Next.js admin API route + Postgres RPC (Supabase) extension, brownfield
**Confidence:** HIGH (all findings are direct repo reads of the exact files this phase touches; no new external library is introduced)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (Future cutoff semantics, DISP-01):** "Future" is evaluated **by day**: a booking
  is future when `pickup_date >= today`. Today's trips stay visible until midnight
  (including in-progress / just-departed ones) — dispatcher must not lose an active trip.
  "Today" is **server-computed in Europe/Prague timezone**, not client-derived. Chosen
  over timestamp-precision (`pickup_date+pickup_time >= now`) for simplicity (the RPC
  already compares `pickup_date` only) and because a trip in progress is still
  operationally relevant. Reversibility: reversible.
- **D-02 (List sort order, DISP-01):** Sort is **adaptive by active horizon**: Future view
  → `pickup ASC` (soonest trip at the top); Past/All view → `pickup DESC` (most recent at
  top). The RPC currently hardcodes `ORDER BY created_at DESC`, so a sort/direction
  parameter is needed. Reversibility: costly — requires changing the `admin_search_bookings`
  RPC signature/body (a live DB migration) and the GET handler that calls it.
- **D-03 (Persistent default-horizon setting, DISP-02):** Shipped default (out of the box)
  is **`Future only`** so DISP-01 holds on first load. Horizon options are
  **`Future only` / `Last N days` / `All`**, where **N is admin-editable with a default of
  7**. Stored **globally** in `pricing_globals` (admin auth is a single shared session, so
  per-admin storage is unnecessary) — mirrors how `notification_flags` are persisted and
  read via `/api/admin/settings`. Exact storage shape (new column vs JSONB key) and
  migration number left to research/planning. Reversibility: costly.
- **D-04 (In-session filter control, DISP-03):** A **segmented control (Future / Past /
  All)** at the top of the bookings list. It is **ephemeral React state in
  `BookingsTable`** — resets to the saved default on reload and **never mutates the
  persisted setting**. Chosen over a URL query param. Reversibility: reversible.
- **D-05 (KPI accuracy guard-rail, DISP-04):** KPI counters ("TODAY" count, "THIS WEEK"
  revenue) keep their own independent date-scoped fetches (they already pass explicit
  `startDate`/`endDate` in `bookings/page.tsx`) and **must stay decoupled** from the
  list's active horizon/filter. Any refactor of the list filter must not route KPI totals
  through the list query. Reversibility: reversible.

### Claude's Discretion

- Storage mechanism for the persisted horizon (dedicated column vs JSONB key in
  `pricing_globals`), the RPC parameter names for future-cutoff and sort, and the exact
  Settings-page UI widget layout are implementation details for research/planning. →
  This research's recommendation: dedicated typed columns
  (`dispatch_default_horizon text CHECK`, `dispatch_horizon_days integer CHECK`); RPC gets
  one new `p_sort` param (no new cutoff param — the existing `p_start_date`/`p_end_date`
  do that job, computed server-side per horizon); Settings widget mirrors
  `NotificationToggles.tsx`'s layout/pattern.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. (Driver trip portal work lives in Phases
66–67; empty-state polish and horizon×status-chip interaction were raised as optional
extra areas but the user opted not to expand scope.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| DISP-01 | Admin bookings list defaults to showing only future trips (pickup ≥ now) on load | Architectural Responsibility Map (today-computation + horizon-resolution rows); Pattern 1 (`getPragueTodayISO`); Pattern 2 (horizon resolution in `route.ts`); Pitfall 3 (`pickup_date` type caveat); Validation Architecture rows 1-2 |
| DISP-02 | Admin can set a persistent default horizon in admin settings (Future only / Last N days / All) that applies on every visit | Standard Stack "Alternatives Considered" (storage shape recommendation); Code Examples (settings schema, migration 058); Pitfall 4 (Last-N-days semantics, Open Question 1); Validation Architecture rows 3-4 |
| DISP-03 | In-session UI filters override the saved default (reveal past/all) without changing the persisted setting | Pattern 2 anti-pattern note (two distinct state slots); Anti-Patterns to Avoid (persisted-default vs override state collapse); Validation Architecture rows 5-6 |
| DISP-04 | KPI counters (today's bookings, week revenue) remain accurate regardless of the active default/filter | Architectural Responsibility Map (KPI row); System Architecture Diagram (KPI box, explicit "UNCHANGED, no `horizon` param ever" note); Validation Architecture row 7 (the concrete D-05 guard test) |
</phase_requirements>

## Summary

This phase is a pure brownfield extension of an existing, working admin surface — no new
package, no new page, no new auth model. Three files own the whole feature: the
`admin_search_bookings` Postgres RPC (`supabase/migrations/054_admin_search_bookings_status_filter.sql`,
last touched by `057_security_rls_hardening.sql`), the `GET /api/admin/bookings` route
(`app/api/admin/bookings/route.ts`), and `components/admin/BookingsTable.tsx`. The
persistence side reuses the exact `pricing_globals` (id=1) + `/api/admin/settings`
GET/PATCH pattern already shipped for `notification_flags`.

The critical discovery that simplifies this phase: `bookings.pickup_date` is **already
stored as an Europe/Prague wall-clock calendar string** (`lib/ics.ts:13` — "Europe/Prague
wall-clock"), not a UTC timestamp. This means no timezone conversion is needed when
comparing `pickup_date` to "today" — only computing "today in Europe/Prague" as a
`YYYY-MM-DD` string needs to happen once, server-side, using Node's built-in `Intl` (zero
new dependencies). The existing RPC already accepts generic `p_start_date`/`p_end_date`
text bounds compared directly against `pickup_date`, so the future-cutoff and
"Last N days" horizon do **not** require a new RPC parameter — only the **sort** does,
since `admin_search_bookings` currently hardcodes `ORDER BY created_at DESC` in **two**
places that must stay in sync (see Pitfall 1).

**Primary recommendation:** Compute "today" (Europe/Prague) in the Next.js server (`GET
/api/admin/bookings` route handler), never in `BookingsTable.tsx` or the RPC; persist the
horizon default as two dedicated typed columns on `pricing_globals` (not a JSONB key);
extend `admin_search_bookings` with a single new `p_sort` parameter using a `DROP
FUNCTION` + `CREATE OR REPLACE` + re-`GRANT EXECUTE TO service_role` migration (058 is the
next free number); keep the horizon param whitelisted server-side exactly like the
existing `KNOWN_STATUSES` pattern.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| "Today" (Europe/Prague) computation | API / Backend (`route.ts`) | — | D-01 requires server-computed, not client-derived; Node's `Intl` API does this without a new dependency; keeps it unit-testable without a live DB |
| Horizon → date-range + sort resolution | API / Backend (`route.ts`) | — | Single trusted place that turns an abstract `horizon` value into concrete `p_start_date`/`p_end_date`/`p_sort` RPC args; keeps the RPC's date semantics unchanged for the existing "Date Range" picker feature |
| Future-cutoff / adaptive-sort predicate | Database (`admin_search_bookings` RPC) | — | Already the single filtered/paged query behind the list (per CONTEXT.md); extending it (not building a parallel query) avoids drift |
| Persisted default horizon + N | Database (`pricing_globals` id=1) | API (`/api/admin/settings`) | Mirrors `notification_flags`; global (single shared admin session) per D-03 |
| In-session Future/Past/All override | Browser / Client (`BookingsTable.tsx`) | — | D-04: pure ephemeral React state, never written back |
| KPI counters (TODAY / THIS WEEK) | Browser / Client (`bookings/page.tsx`) → API | — | Independent date-scoped fetches already exist and must stay untouched by any horizon refactor (D-05) |

## Standard Stack

### Core

No new libraries. This phase extends existing, already-pinned dependencies:

| Library | Version (from `package.json`) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | `^4.3.6` `[VERIFIED: package.json]` | Extend `bookingPatchSchema`-style whitelisting for the new `horizon`/`horizonDays` GET params and the settings PATCH body | Already the project's sole validation library — no reason to introduce a second |
| `@supabase/supabase-js` | `^2.101.0` `[VERIFIED: package.json]` | `.rpc('admin_search_bookings', {...})` call, unchanged call shape (service-role client) | Existing DB access layer |
| `next` | `^16.2.3` `[VERIFIED: package.json]` | Route handlers, `Intl` runs fine in the Node route-handler runtime | Existing framework |
| `@tanstack/react-table` | `^8.21.3` `[VERIFIED: package.json]` | `BookingsTable` list rendering — unaffected by this phase except new segmented-control state | Existing |

### Supporting

None — no new supporting library is required. "Today in Europe/Prague" is computed with
`Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' })`, which is built into Node's
ICU-enabled runtime (Next.js ships full ICU by default) — see Code Examples.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Intl.DateTimeFormat` for Prague "today" | `date-fns-tz` or `luxon` | New dependency for a single-line problem the runtime already solves; violates "Don't Hand-Roll" in reverse — don't *add* a library to hand-roll what `Intl` already does natively. Only reconsider if the phase later needs full DST-aware arithmetic beyond simple day math. |
| SQL-side `timezone('Europe/Prague', now())::date` cutoff inside the RPC | Node-side `Intl` cutoff passed as `p_start_date`/`p_end_date` (recommended) | SQL-side is defensible (the DB already has a Prague-aware helper, `prestigo_text_to_utc`) but requires a **new RPC parameter for the cutoff itself**, not just the sort, widening the "costly" migration's blast radius. Node-side reuses the RPC's existing generic date-range params, so only `p_sort` is new. |
| Dedicated `pricing_globals` columns (recommended) | JSONB key, e.g. `dispatch_settings: {default_horizon, horizon_days}` | `notification_flags` (JSONB) models a flexible bag of *booleans*; this setting is a *fixed-shape* enum + integer pair, closer to `pricing_globals`'s other dedicated typed columns (`airport_fee`, `hourly_min_hours`, etc.) than to `notification_flags`. Also matches the project's documented precedent: **"TEXT + CHECK used for `customer_profiles.account_type` (not Postgres ENUM) — stays alterable"** `[VERIFIED: STATE.md decisions log, v2.0 57-01]`. |

**Installation:** none — no `npm install` needed for this phase.

**Version verification:** all versions above were read directly from `package.json` in this
repo — no registry lookup needed since nothing new is being added.

## Package Legitimacy Audit

**Not applicable — this phase installs no external packages.** All work is a Zod schema
extension, a Postgres migration, and React state in an existing component. No `npm view` /
`pip index` / `cargo search` check is required.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser (BookingsTable.tsx)                                              │
│                                                                           │
│  [Future | Past | All] segmented control ──┐  (D-04: ephemeral state,    │
│                                              │   initialized from prop,   │
│                                              │   never PATCHes settings)  │
│                                              ▼                            │
│  fetchBookings() builds ?horizon=<value>&horizonDays=<N>&page=...        │
└───────────────────────────┬───────────────────────────────────────────┬─┘
                             │ GET                                       │ on mount
                             ▼                                           │
┌────────────────────────────────────────────────┐   ┌───────────────────▼──────────────┐
│ app/api/admin/bookings/route.ts  GET             │   │ GET /api/admin/settings           │
│                                                   │   │ (extended: also returns           │
│ 1. auth guard (401/403)                          │   │  dispatch_default_horizon +       │
│ 2. whitelist `horizon` (KNOWN_HORIZONS pattern)  │   │  dispatch_horizon_days)            │
│ 3. today = getPragueTodayISO()  ← Intl, no client│   │                                    │
│ 4. resolve horizon → {startDate,endDate,sort}    │   │ read by bookings/page.tsx on load, │
│ 5. call RPC with p_start_date/p_end_date/p_sort  │   │ passed down as BookingsTable props │
└───────────────────────────┬───────────────────────┘   └────────────────────────────────────┘
                             │ .rpc('admin_search_bookings', {...})
                             ▼
┌───────────────────────────────────────────────────────────────────────┐
│ Postgres: admin_search_bookings(..., p_sort text DEFAULT 'created_desc')│
│                                                                          │
│  filtered AS (... existing predicates ...)                             │
│  paged AS (SELECT * FROM filtered ORDER BY <p_sort CASE> OFFSET/LIMIT) │
│  SELECT jsonb_agg(... ORDER BY <SAME p_sort CASE>), total_count        │
└───────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ app/admin/(dashboard)/bookings/page.tsx (KPIs)                           │
│                                                                           │
│  useEffect → fetch(/api/admin/bookings?startDate=todayISO&endDate=       │
│    todayISO&limit=1)               ← UNCHANGED, no `horizon` param ever  │
│  useEffect → fetch(...?startDate=mondayISO&endDate=sundayISO&limit=100) │
│                                                                           │
│  (D-05 guard: these two fetches must never gain a `horizon` param,       │
│   and BookingsTable's segmented-control state must never be lifted      │
│   into a value these two fetches read from)                             │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ Admin Settings page → NotificationToggles-sibling "Dispatch Horizon"     │
│ widget → PATCH /api/admin/settings { dispatch_default_horizon,           │
│ dispatch_horizon_days } → pricing_globals (id=1)                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

No new files/folders — every touch point already exists:

```
app/api/admin/bookings/route.ts        # GET: add horizon resolution + p_sort call
app/api/admin/settings/route.ts        # GET/PATCH: extend schema for horizon fields
app/admin/(dashboard)/bookings/page.tsx # fetch settings on mount, pass down as props
app/admin/(dashboard)/settings/page.tsx # mount the new horizon-setting widget
components/admin/BookingsTable.tsx     # segmented control + horizon-aware fetch params
components/admin/NotificationToggles.tsx # sibling pattern to copy for the horizon widget
                                        # (or a new small component next to it)
supabase/migrations/058_*.sql          # pricing_globals columns
supabase/migrations/059_*.sql          # admin_search_bookings p_sort param
```

### Pattern 1: Server-computed "today" (Europe/Prague), never client-derived

**What:** A pure, unit-testable helper that returns today's Prague calendar date as
`YYYY-MM-DD`, called only from server code (`route.ts`), never from `BookingsTable.tsx`.

**When to use:** Any time the future-cutoff or "Last N days" cutoff needs "today."

**Example:**
```typescript
// New: lib/prague-date.ts (or inline in route.ts — planner's call)
// Uses Node's built-in Intl (ICU) — zero new dependencies.
export function getPragueTodayISO(now: Date = new Date()): string {
  // en-CA locale formats as YYYY-MM-DD directly.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(now)
}

// Pure calendar-date arithmetic (no timezone re-conversion needed — the
// result of getPragueTodayISO() is already a Prague wall-clock date, so
// subtracting whole days is safe UTC-anchored string math):
export function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}
```
Testable with `getPragueTodayISO(new Date('2026-08-28T23:30:00Z'))` — no mocking of
`Intl`/timezone DB needed, matches this repo's existing Vitest unit-test conventions
(`tests/admin-settings.test.ts`, `vi.hoisted` pattern) `[VERIFIED: tests/admin-settings.test.ts:1-24]`.

### Pattern 2: Horizon resolution owned entirely by the API route

**What:** `route.ts` receives an abstract `horizon` value (`future` | `past` | `all` |
`last_n_days`) plus `horizonDays` (only meaningful for `last_n_days`), and is the **only**
place that turns it into concrete `p_start_date` / `p_end_date` / `p_sort` RPC arguments.

**When to use:** Every `GET /api/admin/bookings` call from `BookingsTable`.

**Example:**
```typescript
// app/api/admin/bookings/route.ts — inside GET, after auth guard
const KNOWN_HORIZONS = new Set(['future', 'past', 'all', 'last_n_days'])
const rawHorizon = searchParams.get('horizon')
const horizon = rawHorizon && KNOWN_HORIZONS.has(rawHorizon) ? rawHorizon : null

let resolvedStartDate = startDate ?? null   // preserve existing manual Date-Range picker
let resolvedEndDate = endDate ?? null
let sort: 'pickup_asc' | 'pickup_desc' | 'created_desc' = 'created_desc'

if (horizon) {
  const today = getPragueTodayISO()
  if (horizon === 'future') {
    resolvedStartDate = today
    sort = 'pickup_asc'
  } else if (horizon === 'past') {
    resolvedEndDate = shiftIsoDate(today, -1)
    sort = 'pickup_desc'
  } else if (horizon === 'last_n_days') {
    const rawDays = parseInt(searchParams.get('horizonDays') ?? '7', 10)
    const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 7
    resolvedStartDate = shiftIsoDate(today, -days)
    sort = 'pickup_desc'
  } else {
    // 'all' — no date bound, most-recent-first
    sort = 'pickup_desc'
  }
}
```

### Anti-Patterns to Avoid

- **Computing "today" in `BookingsTable.tsx` (client) and sending it as `startDate`:**
  violates D-01 directly ("Today is server-computed... not client-derived") and is
  trivially spoofable by a stale browser clock or DST edge case.
- **Building the adaptive `ORDER BY` via string-concatenated dynamic SQL (`EXECUTE
  'ORDER BY ' || p_sort)`:** a classic SQL-injection surface even though `p_sort` is
  server-whitelisted upstream — defense in depth still applies inside `SECURITY DEFINER`
  functions. Use a `CASE`-expression `ORDER BY` instead (see Code Examples / Pitfall 1).
- **Letting the persisted-default fetch and the in-session override write to the same
  React state variable:** collapses D-03/D-04 into one mutable value and makes "reset to
  saved default on reload" impossible to express cleanly. Keep two distinct state slots:
  one for the fetched default (read-only after mount), one for the ephemeral override.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Europe/Prague "today" as a date string | A manual UTC-offset calculator (`+1`/`+2` DST logic) | `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' })` | Node's ICU data already handles Prague's CET/CEST DST transitions correctly; a hand-rolled offset table will silently drift wrong across DST changes |
| Adaptive SQL sort | Dynamic SQL string building (`EXECUTE`) | `CASE`-expression inside a single static `ORDER BY` | Dynamic SQL inside `SECURITY DEFINER` is an injection surface even with server-side whitelisting upstream; `CASE` keeps the query fully static and plannable |
| Global admin setting persistence | A new settings table/row | Extend `pricing_globals` (id=1) with new columns | Mirrors the exact `notification_flags` precedent already shipped and read via `/api/admin/settings`; a second settings table would fragment the "one global config row" pattern |

**Key insight:** Nothing in this phase needs a new abstraction — every problem it poses
already has an established, working answer somewhere else in this codebase (Prague
wall-clock dates in `lib/ics.ts`, the `pricing_globals` single-row settings pattern, the
`KNOWN_STATUSES` GET-param whitelist). The work is disciplined re-use, not invention.

## Common Pitfalls

### Pitfall 1: The RPC's `ORDER BY` exists in TWO places and both must change together

**What goes wrong:** `admin_search_bookings` currently has a `paged` CTE that does
`ORDER BY created_at DESC OFFSET p_offset LIMIT p_limit` (determines **which** rows are
selected for this page) and then a **separate** `jsonb_agg(to_jsonb(paged.*) ORDER BY
paged.created_at DESC)` in the final `SELECT` (determines the **display order** within the
JSON array) `[VERIFIED: supabase/migrations/054_admin_search_bookings_status_filter.sql:73-83]`
— quoted:
```sql
  paged AS (
    SELECT *
    FROM filtered
    ORDER BY created_at DESC
    OFFSET p_offset
    LIMIT  p_limit
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(paged.*) ORDER BY paged.created_at DESC), '[]'::jsonb) AS rows,
    (SELECT c FROM counted) AS total_count
  FROM paged;
```
If only the `paged` CTE's `ORDER BY` is changed to the adaptive sort but the
`jsonb_agg(... ORDER BY ...)` is left on `created_at DESC`, the correct **rows** will be
selected for the page but they will be **displayed** in the wrong order (or vice versa if
only the aggregate order is changed — the page's correctness for pagination, i.e. *which*
20 rows out of N, is decided solely by the `paged` CTE's `ORDER BY`/`OFFSET`/`LIMIT`).

**Why it happens:** Two independent `ORDER BY` clauses doing two independent jobs
(pagination cursor vs. JSON array order) look like one sort to a casual reader.

**How to avoid:** Write the adaptive `CASE`-based `ORDER BY` expression **once** as a
literal SQL fragment and paste it identically into both places (or, cleaner, order by a
single computed sort key column added to `filtered`/`paged` so both `ORDER BY` clauses
reference the same column name):
```sql
paged AS (
  SELECT *
  FROM filtered
  ORDER BY
    CASE WHEN p_sort = 'pickup_asc'  THEN pickup_date END ASC,
    CASE WHEN p_sort = 'pickup_desc' THEN pickup_date END DESC,
    created_at DESC   -- tiebreak / default ('created_desc')
  OFFSET p_offset
  LIMIT  p_limit
)
SELECT
  COALESCE(jsonb_agg(to_jsonb(paged.*) ORDER BY
    CASE WHEN p_sort = 'pickup_asc'  THEN paged.pickup_date END ASC,
    CASE WHEN p_sort = 'pickup_desc' THEN paged.pickup_date END DESC,
    paged.created_at DESC
  ), '[]'::jsonb) AS rows,
  (SELECT c FROM counted) AS total_count
FROM paged;
```

**Warning signs:** Pagination page 2 shows rows already seen on page 1, or the "soonest
first" Future view visually appears newest-created-first.

### Pitfall 2: `types/database.types.ts` is already stale relative to a shipped migration

**What goes wrong:** The generated types file's `admin_search_bookings` `Args` block only
lists `p_end_date`, `p_limit`, `p_offset`, `p_query`, `p_start_date`, `p_trip_type` —
**missing `p_status`**, even though migration 054 (already shipped, per STATE.md) added it
`[VERIFIED: types/database.types.ts:1133-1146]` — quoted:
```
      admin_search_bookings: {
        Args: {
          p_end_date?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_start_date?: string
          p_trip_type?: string
        }
```
This proves `supabase gen types` has not been re-run since 054 shipped, i.e. the generated
types are not being kept current with live migrations in this repo's workflow.

**Why it happens:** Type generation is a separate manual/CI step from applying a
migration; nothing enforces it runs together.

**How to avoid:** Do not trust `types/database.types.ts` as the source of truth for the
RPC's current live signature — the migration files (`054`, `057`) are canonical, as
CONTEXT.md already instructs. After the new migration (058/059) is applied live, either
regenerate the file or hand-patch it to add `p_sort` (and `p_status`, which is already
missing) so downstream `.rpc()` calls keep type-checking correctly.

**Warning signs:** TypeScript doesn't flag a typo'd RPC param name — because the generated
`Args` type is already incomplete, it silently accepts anything.

### Pitfall 3: `pickup_date`'s exact SQL column type is unverified in this session

**What goes wrong:** No `CREATE TABLE bookings` migration exists in
`supabase/migrations/` (the table predates migration tracking, same situation as
`pricing_globals`) `[ASSUMED]`. The existing RPC compares `b.pickup_date >= p_start_date`
where `p_start_date` is declared `text` — this only works cleanly in Postgres if
`pickup_date` is also `text` (a `date >= text` comparison requires an explicit cast in
strict Postgres, so the fact that 054's predicate already works in production is indirect
evidence `pickup_date` is `text`, matching the codebase's general "TEXT for flexible
fields" convention), but this has **not** been confirmed by reading a `CREATE TABLE`
statement in this session.

**Why it happens:** Legacy pre-GSD schema, no migration history for the base table.

**How to avoid:** Before writing the 058/059 migrations, the operator (who applies
migrations live per the established `[BLOCKING]` convention) should confirm the live
column type with `\d bookings` or a quick `information_schema.columns` query. If it turns
out to be a real `date` column, the horizon-resolution code in `route.ts` is unaffected
(it already sends plain `YYYY-MM-DD` strings either way) — only the migration's own SQL
casts, if any, would need adjusting.

**Warning signs:** A migration apply error like `operator does not exist: date >= text`
would immediately surface this — low risk, but flagged because it wasn't verifiable from
files in this repo.

### Pitfall 4: "Last N days" horizon semantics are ambiguous and not specified by CONTEXT.md

**What goes wrong:** D-03 names the option "Last N days" but doesn't define whether it (a)
shows only the past N days (bounded both ends: `today-N ≤ pickup_date ≤ today`, excluding
future trips) or (b) shows a lookback window **plus everything future**
(`pickup_date ≥ today-N`, unbounded end). Building the wrong one silently breaks the
"future-first" spirit of the phase for admins who pick this option.

**Why it happens:** The option name is ambiguous outside dispatch-tool context; CONTEXT.md
left the exact date-window shape as an implementation detail.

**How to avoid:** See Open Questions — recommend interpretation (b) (unbounded end,
includes future) since it keeps every non-"All" horizon future-inclusive, matching the
phase's stated intent, but this should be confirmed with the user/discuss-phase before
implementation, not silently assumed by the planner.

**Warning signs:** UAT reveals an admin picks "Last 7 days" expecting to also see next
week's trips and doesn't.

### Pitfall 5: Interaction between the new horizon control and the existing "Date Range" picker is unresolved

**What goes wrong:** `BookingsTable.tsx` already has a manual "Date Range" button/inputs
(`showDateFilter`, `startDate`, `endDate` state) that independently sets `startDate`/
`endDate` query params `[VERIFIED: components/admin/BookingsTable.tsx:1050-1052,1508-1526]`.
The new horizon control resolves to the *same* underlying `p_start_date`/`p_end_date` RPC
args (via `route.ts`). If both are active simultaneously with conflicting values, the
result is undefined/confusing (which one wins depends on the `route.ts` param-precedence
implementation the planner writes).

**Why it happens:** Two UI affordances converging on one server-side date-range mechanism;
CONTEXT.md's Deferred Ideas note flags a similar unresolved interaction ("horizon×status-chip
interaction... user opted not to expand scope") without resolving the Date-Range-button case.

**How to avoid:** See Open Questions — recommend the segmented control and the manual Date
Range picker be mutually exclusive in the UI (selecting one clears/disables the other), but
this is a product decision for the planner/discuss-phase, not something to silently invent.

## Code Examples

### Extending the settings schema (mirrors `notification_flags` exactly)

```typescript
// app/api/admin/settings/route.ts
const settingsPatchSchema = z.object({
  notification_flags: z.record(z.string(), z.boolean()).optional(),
  dispatch_default_horizon: z.enum(['future', 'last_n_days', 'all']).optional(),
  dispatch_horizon_days: z.number().int().min(1).max(365).optional(),
}).refine(
  d => d.notification_flags !== undefined
    || d.dispatch_default_horizon !== undefined
    || d.dispatch_horizon_days !== undefined,
  { message: 'At least one settings field must be provided' },
)
```
Source pattern: `app/api/admin/settings/route.ts:7-9` (current single-field schema)
`[VERIFIED: app/api/admin/settings/route.ts:1-54]`.

### Migration 058 — `pricing_globals` columns (recommended shape)

```sql
-- Migration 058: pricing_globals dispatch horizon default (DISP-02)
ALTER TABLE public.pricing_globals
  ADD COLUMN dispatch_default_horizon text NOT NULL DEFAULT 'future'
    CHECK (dispatch_default_horizon IN ('future', 'last_n_days', 'all')),
  ADD COLUMN dispatch_horizon_days integer NOT NULL DEFAULT 7
    CHECK (dispatch_horizon_days > 0);
```
Shipped default `'future'` matches D-03's explicit requirement: "Shipped default (out of
the box) is Future only so DISP-01 holds on first load" `[CITED: 65-CONTEXT.md D-03]`.
Column-per-value + `CHECK` (not a Postgres `ENUM`) follows the project's own documented
precedent `[VERIFIED: .planning/STATE.md decisions log — "TEXT + CHECK used for
customer_profiles.account_type (not Postgres ENUM) — stays alterable"]`.

### Migration 059 — `admin_search_bookings` adaptive sort

```sql
-- Migration 059: admin_search_bookings adaptive sort (DISP-01, D-02)
DROP FUNCTION IF EXISTS public.admin_search_bookings(text, text, text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_search_bookings(
  p_query      text    DEFAULT NULL::text,
  p_start_date text    DEFAULT NULL::text,
  p_end_date   text    DEFAULT NULL::text,
  p_trip_type  text    DEFAULT NULL::text,
  p_status     text    DEFAULT NULL::text,
  p_sort       text    DEFAULT 'created_desc'::text,
  p_offset     integer DEFAULT 0,
  p_limit      integer DEFAULT 20
)
 RETURNS TABLE(rows jsonb, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_like TEXT;
BEGIN
  IF p_limit  IS NULL OR p_limit  < 1   THEN p_limit  := 20;  END IF;
  IF p_limit  > 100                     THEN p_limit  := 100; END IF;
  IF p_offset IS NULL OR p_offset < 0   THEN p_offset := 0;   END IF;

  IF p_query IS NULL OR length(trim(p_query)) = 0 THEN
    v_like := NULL;
  ELSE
    v_like := '%' || trim(p_query) || '%';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT b.*
    FROM public.bookings b
    WHERE (p_start_date IS NULL OR b.pickup_date >= p_start_date)
      AND (p_end_date   IS NULL OR b.pickup_date <= p_end_date)
      AND (p_trip_type  IS NULL OR b.trip_type = p_trip_type)
      AND (p_status     IS NULL OR b.status = p_status)
      AND (
        v_like IS NULL
        OR b.client_first_name ILIKE v_like
        OR b.client_last_name  ILIKE v_like
        OR b.booking_reference ILIKE v_like
      )
  ),
  counted AS (
    SELECT count(*)::bigint AS c FROM filtered
  ),
  paged AS (
    SELECT *
    FROM filtered
    ORDER BY
      CASE WHEN p_sort = 'pickup_asc'  THEN pickup_date END ASC,
      CASE WHEN p_sort = 'pickup_desc' THEN pickup_date END DESC,
      created_at DESC
    OFFSET p_offset
    LIMIT  p_limit
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(paged.*) ORDER BY
      CASE WHEN p_sort = 'pickup_asc'  THEN paged.pickup_date END ASC,
      CASE WHEN p_sort = 'pickup_desc' THEN paged.pickup_date END DESC,
      paged.created_at DESC
    ), '[]'::jsonb) AS rows,
    (SELECT c FROM counted) AS total_count
  FROM paged;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_search_bookings(text, text, text, text, text, text, integer, integer) TO service_role;
```
Base body is the verbatim 054 function with only the `p_sort` param and the two `ORDER BY`
clauses added — preserves search/pagination/`{rows,total_count}`/`SECURITY DEFINER`/
`search_path` exactly, per the same discipline 054's own header comment documents
`[VERIFIED: supabase/migrations/054_admin_search_bookings_status_filter.sql:1-88]`. The
`DROP FUNCTION` targets the **current 7-arg signature** (054's signature, `p_status` included)
since that's the live shape after 054/057 — not the original pre-054 6-arg shape. Per
057, `PUBLIC`/`anon`/`authenticated` EXECUTE were already revoked from the old signature
`[VERIFIED: supabase/migrations/057_security_rls_hardening.sql:21]` — only `service_role`
needs re-granting on the new signature; do **not** re-grant to `PUBLIC`/`anon`/
`authenticated`.

### GET route.ts — adaptive whitelist pattern (mirrors `KNOWN_STATUSES`)

```typescript
// app/api/admin/bookings/route.ts — existing pattern to mirror, verbatim
const KNOWN_STATUSES = new Set([
  'unpaid', 'pending', 'confirmed', 'completed',
  'cancelled', 'assigned', 'en_route', 'on_location',
])
// ...
const rawStatusFilter = searchParams.get('status')
const statusFilter = rawStatusFilter && KNOWN_STATUSES.has(rawStatusFilter) ? rawStatusFilter : null
```
`[VERIFIED: app/api/admin/bookings/route.ts:29-38,228-232]` — the new `horizon` param must
follow this exact shape: `KNOWN_HORIZONS = new Set(['future','past','all','last_n_days'])`,
anything else treated as "no override" (falls back to whatever the caller passed as
plain `startDate`/`endDate`, or nothing).

## State of the Art

Not applicable — this is an internal brownfield extension, not a third-party library
integration. No "old approach → current approach" migration exists for this feature; it's
new functionality on an existing, actively-maintained internal API.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `bookings.pickup_date` is a `text` (not `date`) SQL column | Pitfall 3, Code Examples | Low — the `route.ts` code sends plain `YYYY-MM-DD` strings regardless of column type; only the migration author needs to confirm before writing `058`/`059` (operator can check live via `\d bookings` at migration-apply time) |
| A2 | "Last N days" horizon means `pickup_date >= today-N` with **no** end bound (includes future trips) | Pitfall 4, Pattern 2 code example | Medium — if the intended semantics were a bounded past-only window, admins choosing this option would unexpectedly stop seeing upcoming trips; needs explicit confirmation (see Open Questions) before the planner locks the RPC-call shape |
| A3 | The new segmented control (Future/Past/All) and the existing manual "Date Range" picker should be mutually exclusive in the UI | Pitfall 5 | Medium — UX ambiguity only; no data-integrity risk, but could ship a confusing filter-bar interaction if left unresolved |
| A4 | `p_sort` should default to `'created_desc'` (matching pre-phase behavior) when omitted, rather than requiring every caller to always pass it | Code Examples (migration 059) | Low — a defensive default; if wrong, only affects future/unrelated callers of this RPC that don't pass `p_sort` (none currently exist outside `route.ts`) |

## Open Questions

1. **"Last N days" horizon: bounded past-only window, or lookback + all future?**
   - What we know: D-03 names the three options and that N defaults to 7 and is
     admin-editable; D-01/D-02 only define semantics for "Future" and "Past/All", not for
     "Last N days" specifically.
   - What's unclear: whether selecting "Last N days" as the *default* should still surface
     upcoming trips (broader, future-inclusive) or strictly show only the trailing N-day
     window (narrower, could hide next week's confirmed pickups).
   - Recommendation: treat it as `pickup_date >= today - N` with no upper bound (future-
     inclusive) — keeps every non-"All" default option future-aware, consistent with the
     phase's core intent. Confirm with the user during planning/discuss if this reading is
     wrong before implementation.

2. **Should the segmented Future/Past/All control and the existing manual Date-Range
   picker be mutually exclusive?**
   - What we know: both ultimately drive the same `p_start_date`/`p_end_date` RPC args;
     the Date-Range picker (`showDateFilter`) already ships and is untouched by this
     phase's CONTEXT.md decisions.
   - What's unclear: precedence/interaction when both are set.
   - Recommendation: disable (or visually deactivate) the Date-Range picker while a
     horizon segment other than the persisted default is manually active, or vice versa —
     but this is a UI/UX call for the planner, not something research should silently
     decide.

3. **Exact live SQL type of `bookings.pickup_date`.**
   - What we know: no `CREATE TABLE bookings` migration exists in this repo; the RPC's
     working `>= p_start_date` (text param) comparison is strong indirect evidence it's
     `text`.
   - What's unclear: 100% confirmation without querying the live schema.
   - Recommendation: operator confirms via `\d bookings` (or an `information_schema.columns`
     query) at the point the `058`/`059` migrations are drafted/applied live — this is a
     `[BLOCKING]` operator step regardless (per the established migration-apply convention),
     so no extra round-trip is added.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.1` `[VERIFIED: package.json]` with `@testing-library/react` |
| Config file | `vitest.config.ts` (jsdom environment, `./tests/setup.ts`, path alias `@` → repo root) `[VERIFIED: vitest.config.ts:1-18]` |
| Quick run command | `npx vitest run tests/admin-bookings.test.ts tests/admin-settings.test.ts tests/BookingsTable.test.ts` |
| Full suite command | `npx vitest run` |

No `"test"` script is defined in `package.json`'s `scripts` block `[VERIFIED: package.json
scripts block — only dev/build/start/lint/prepare present]` — invoke `vitest` directly via
`npx`.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISP-01 | GET with no explicit horizon param but a fresh admin session defaults to `pickup_date >= <Prague today>`, sort ascending | unit (route handler, mocked Supabase RPC call args) | `npx vitest run tests/admin-bookings.test.ts` | ✅ extend existing file |
| DISP-01 | `getPragueTodayISO()` returns the correct Prague calendar date across a UTC-day boundary (e.g. `23:30 UTC` in summer = next day in Prague) | unit (pure function, no DB) | `npx vitest run tests/prague-date.test.ts` | ❌ Wave 0 — new file for the new `lib/prague-date.ts` helper |
| DISP-02 | PATCH `/api/admin/settings` persists `dispatch_default_horizon`/`dispatch_horizon_days`; GET returns them back | unit | `npx vitest run tests/admin-settings.test.ts` | ✅ extend existing file |
| DISP-02 | Invalid `dispatch_default_horizon` value (not in the 3-value enum) is rejected 400 | unit | `npx vitest run tests/admin-settings.test.ts` | ✅ extend existing file |
| DISP-03 | Segmented control click updates `BookingsTable`'s fetch params but never calls `PATCH /api/admin/settings` | unit (component, mock `fetch`) | `npx vitest run tests/BookingsTable.test.ts` | ✅ extend existing file |
| DISP-03 | Reloading `BookingsTable` (remount) resets the segmented control to the persisted default, not the last-used override | unit (component) | `npx vitest run tests/BookingsTable.test.ts` | ✅ extend existing file |
| DISP-04 | Toggling the segmented control does not trigger any additional `fetch` call to the KPI endpoints, and KPI values are unchanged | unit/integration (render `BookingsPage`, mock `fetch`, assert call count to the two KPI URL patterns stays exactly 2 across a horizon toggle) | `npx vitest run tests/admin-bookings-kpi-decoupling.test.tsx` | ❌ Wave 0 — new file, the concrete D-05 guard test named in this phase's additional_context |
| — | RPC pagination correctness: page 2 of a `pickup_asc` sort never repeats page-1 rows | integration (requires a seeded/mock Postgres or a Supabase test project) — mark **manual-only** if no local Postgres is available | manual (documented in UAT) or `npx vitest run tests/admin-search-bookings-rpc.test.ts` if a local Supabase stack exists | ❌ Wave 0 — flag as manual-only unless the repo has a local Supabase test harness (not found in this session) |

### Sampling Rate

- **Per task commit:** the touched file's quick command (e.g.
  `npx vitest run tests/admin-bookings.test.ts` after editing `route.ts`).
- **Per wave merge:** `npx vitest run` (full suite).
- **Phase gate:** full suite green before `/gsd-verify-work`; the RPC pagination/sort test
  (last row of the table above) is the one item likely to require a `[BLOCKING]` manual DB
  check alongside the operator's live migration-apply step, since this repo has no
  evidence of a local Supabase test-database harness `[ASSUMED — not found in this session;
  confirm with the operator during planning]`.

### Wave 0 Gaps

- [ ] `lib/prague-date.ts` (or equivalent) — new pure helper, no existing file covers it.
- [ ] `tests/prague-date.test.ts` — covers the DST/UTC-boundary edge case for DISP-01.
- [ ] `tests/admin-bookings-kpi-decoupling.test.tsx` — the concrete D-05/DISP-04 guard test.
- [ ] Decide whether the RPC-level pagination/sort correctness (Pitfall 1) gets an
      automated integration test (requires a Postgres test target) or is verified manually
      by the operator at migration-apply time — no local Supabase test harness was found in
      this session.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Untouched — reuses existing `getAdminUser()` session, no new auth surface |
| V3 Session Management | No | Untouched |
| V4 Access Control | Yes | `GET`/`PATCH` both already start with `getAdminUser()` → 401/403 before any param parsing `[VERIFIED: app/api/admin/bookings/route.ts:213-216, app/api/admin/settings/route.ts:11-14,32-34]`; the new `horizon`/`dispatch_default_horizon` fields must sit **behind** this existing guard, not add a new one |
| V5 Input Validation | Yes | New GET param (`horizon`) whitelisted server-side via a `Set`, exactly like `KNOWN_STATUSES` — reject/ignore anything not in the set rather than forwarding it. New settings PATCH fields validated via `z.enum(...)`/`z.number().int().min().max()` |
| V6 Cryptography | No | Not applicable — no new secret/token/crypto surface |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Dynamic-SQL `ORDER BY` injection via an unvalidated sort parameter | Tampering | Never build the `ORDER BY` clause via string concatenation/`EXECUTE`; use the static `CASE`-expression pattern shown in Code Examples. Even though `p_sort` is already whitelisted server-side in `route.ts` before it reaches the RPC, the RPC itself (`SECURITY DEFINER`, callable via `service_role`) should not rely solely on the caller's discipline — a static `CASE` is injection-proof by construction regardless of what string arrives. |
| Unbounded/arbitrary `horizonDays` causing an expensive full-table date-range scan | Denial of Service | Clamp `horizonDays` server-side (`z.number().int().min(1).max(365)` on the settings PATCH, and a defensive re-clamp when reading the GET query param, mirroring the existing `p_limit` clamp pattern already in the RPC: `IF p_limit > 100 THEN p_limit := 100`) `[VERIFIED: supabase/migrations/054_admin_search_bookings_status_filter.sql:45-47]` |
| A stale/forged `horizon` value smuggled into the persisted settings PATCH body bypassing the enum | Tampering | `z.enum(['future','last_n_days','all'])` on the PATCH schema — Zod rejects anything outside the three literal values with a 400, mirroring `bookingPatchSchema`'s existing `status: z.enum([...])` pattern `[VERIFIED: app/api/admin/bookings/route.ts:91-100]` |

## Sources

### Primary (HIGH confidence — direct file reads this session)

- `app/api/admin/bookings/route.ts` — full GET/PATCH/POST handlers, `KNOWN_STATUSES`
  whitelist pattern, auth-guard ordering
- `components/admin/BookingsTable.tsx` — filter-bar state (`tripType`, `statusFilter`,
  `startDate`/`endDate`/`showDateFilter`), `fetchBookings()`, filter-chip rendering
- `app/admin/(dashboard)/bookings/page.tsx` — KPI fetches (today count, week revenue),
  independent of the list's filter state
- `app/api/admin/settings/route.ts`, `components/admin/NotificationToggles.tsx`,
  `app/admin/(dashboard)/settings/page.tsx` — the settings persistence pattern to mirror
- `supabase/migrations/054_admin_search_bookings_status_filter.sql`,
  `supabase/migrations/057_security_rls_hardening.sql` — canonical current RPC body +
  the GRANT/REVOKE history
- `types/database.types.ts` (lines 795-851 `pricing_globals`, 1133-1146
  `admin_search_bookings`, 1163-1166 `prestigo_text_to_utc`)
- `lib/pricing-config.ts`, `lib/ics.ts` — confirms `pricing_globals` shape and that
  `pickup_date`/`pickup_time` are Europe/Prague wall-clock strings
- `.planning/STATE.md` — confirms next free migration number is 058 and the
  TEXT+CHECK-over-ENUM precedent
- `tests/admin-settings.test.ts`, `vitest.config.ts`, `package.json` — test-harness
  conventions and current dependency versions

### Secondary (MEDIUM confidence)

None — no external documentation lookup was needed for this phase (no new library).

### Tertiary (LOW confidence)

None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all versions read directly from `package.json`
- Architecture: HIGH — every integration point named in CONTEXT.md was opened and read in full this session
- Pitfalls: HIGH for Pitfalls 1/2/4/5 (directly observed in code/docs); MEDIUM for Pitfall 3 (`pickup_date` SQL type is inferred, not directly confirmed — flagged as A1/Open Question 3)

**Research date:** 2026-08-28
**Valid until:** 30 days (stable internal codebase; re-verify if `admin_search_bookings` or `pricing_globals` change again before this phase is planned/executed)
