---
phase: 65-dispatch-future-first-bookings-list
reviewed: 2026-08-28T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - app/admin/(dashboard)/bookings/page.tsx
  - app/admin/(dashboard)/settings/page.tsx
  - app/api/admin/bookings/route.ts
  - app/api/admin/settings/route.ts
  - components/admin/BookingsTable.tsx
  - components/admin/DispatchDefault.tsx
  - lib/prague-date.ts
  - supabase/migrations/058_pricing_globals_dispatch_horizon.sql
  - supabase/migrations/059_admin_search_bookings_sort.sql
  - tests/BookingsTable.test.tsx
  - tests/admin-bookings-kpi-decoupling.test.tsx
  - tests/admin-bookings.test.ts
  - tests/admin-settings.test.ts
  - tests/prague-date.test.ts
  - types/database.types.ts
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
status: issues_found
---

# Phase 65: Code Review Report

**Reviewed:** 2026-08-28T00:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed the Phase 65 "dispatch future-first bookings list" diff: the Prague-timezone `today` helper, the `admin_search_bookings` adaptive-sort migration, the horizon whitelist/resolution added to `GET /api/admin/bookings`, the new `dispatch_default_horizon`/`dispatch_horizon_days` persisted-settings plumbing (migration 058, `/api/admin/settings`, `DispatchDefault.tsx`), and the ephemeral Future/Past/All segmented control wired into `BookingsTable.tsx`.

The server-side pieces are solid: the horizon whitelist is closed (unknown values fall back to "no override," never forwarded raw), `getPragueTodayISO`/`shiftIsoDate` correctly handle CET/CEST boundaries and are well-tested, the two `ORDER BY` sites in migration 059 use byte-identical `CASE` expressions (no drift risk), the RPC's `EXECUTE` grants stay revoked from `anon`/`authenticated`, D-07 manual-date precedence over horizon is correctly implemented and tested, and the KPI-decoupling guard holds — the two KPI fetches in `bookings/page.tsx` never carry a `horizon` param and are unaffected by segmented-control toggles.

However, the actual headline feature this phase exists to deliver — **the admin's persisted dispatch-default horizon actually being applied when the Bookings page loads** — does not work. See CR-01. Two further robustness/consistency gaps are noted as warnings, and one test-coverage gap as info.

## Critical Issues

### CR-01: Persisted dispatch-default horizon/days never take effect on the Bookings page (DISP-02 is broken)

**File:** `app/admin/(dashboard)/bookings/page.tsx:26-34,72-80,140`, `components/admin/BookingsTable.tsx:1049,1070-1071`
**Issue:**
`BookingsPage` seeds `defaultHorizon`/`defaultHorizonDays` state with the hardcoded fallback `'future'`/`7`, then asynchronously fetches `/api/admin/settings` in a `useEffect` and calls `setDefaultHorizon`/`setDefaultHorizonDays` once it resolves. `<BookingsTable>` is rendered with `key={refreshKey}` — a key that has nothing to do with the settings values — so when the settings fetch resolves after the initial render and the new `defaultHorizon`/`horizonDays` props flow down, `BookingsTable` does **not** remount; it's the same component instance receiving new props.

Inside `BookingsTable`:
```ts
const [horizon, setHorizon] = useState<string>(defaultHorizon)
const [horizonDays] = useState<number>(horizonDaysProp)
```
`useState(initialValue)` only consumes `initialValue` on the component's very first render — React ignores it on every subsequent render, and there is no `useEffect` anywhere in the file that re-syncs `horizon`/`horizonDays` from the `defaultHorizon`/`horizonDaysProp` props after mount (confirmed by grep — no such effect exists).

Because `BookingsTable` always mounts synchronously during `BookingsPage`'s first render — before the async `/api/admin/settings` fetch in the parent can possibly resolve — `horizon` is permanently seeded from the hardcoded `'future'` fallback (or whatever stale value `defaultHorizon` happened to hold at that exact render). The real persisted value coming back from `/api/admin/settings` a moment later is silently dropped.

Net effect: an admin who sets the dispatch default to "Last N days" or "All" in Settings will *never* see it honored on `/admin/bookings` — the page always opens on "Future" (the shipped fallback), regardless of what's configured. This is true on every page load, not just a rare race — the settings fetch is inherently async and therefore always arrives after the initial mount. This defeats the entire DISP-02 feature that migration 058 / `/api/admin/settings` / `DispatchDefault.tsx` exist to deliver.

Existing tests do not catch this: `admin-bookings-kpi-decoupling.test.tsx`'s settings stub returns `dispatch_default_horizon: 'future'` — identical to the hardcoded fallback — so its assertion that the list fetch eventually carries `horizon=future` passes whether or not the settings value actually propagated. `BookingsTable.test.tsx` only exercises the props-driven default via direct `render(<BookingsTable defaultHorizon="..." />)` calls and an explicit `unmount()` + remount, never a live prop update on an already-mounted instance.

**Fix:** Gate rendering of `<BookingsTable>` until the settings fetch has resolved (success or failure), so the component's `useState` initializer always sees the real value on its first (and only) render:
```tsx
const [settingsLoaded, setSettingsLoaded] = useState(false)

useEffect(() => {
  fetch('/api/admin/settings')
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      if (data?.dispatch_default_horizon) setDefaultHorizon(data.dispatch_default_horizon)
      if (data?.dispatch_horizon_days) setDefaultHorizonDays(data.dispatch_horizon_days)
    })
    .catch(() => {})
    .finally(() => setSettingsLoaded(true))
}, [])

...

{settingsLoaded && (
  <BookingsTable key={refreshKey} defaultHorizon={defaultHorizon} horizonDays={defaultHorizonDays} />
)}
```
(An alternative — folding `defaultHorizon`/`defaultHorizonDays` into the `key` so a real settings value forces a remount — also works, but causes a wasted extra fetch with the wrong horizon before the remount; the loading-gate approach avoids that.)

## Warnings

### WR-01: `horizonDays` query param has no upper bound — the "DoS mitigation" comment overclaims

**File:** `app/api/admin/bookings/route.ts:262-268`
**Issue:** The comment reads: `// V5: defensive clamp — parseInt failure or non-positive value falls back to the default 7 (DoS mitigation, T-65-03).` The actual clamp is:
```ts
const rawDays = parseInt(searchParams.get('horizonDays') ?? '7', 10)
const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 7
```
This only rejects non-finite or non-positive input — there is no upper bound, unlike the persisted-settings equivalent (`dispatch_horizon_days`) which is capped at 365 by both the Zod schema in `app/api/admin/settings/route.ts` and the `CHECK (dispatch_horizon_days > 0)` in migration 058 (no upper CHECK there either, but the API layer caps it at 365). A caller (this route requires an admin session, but any admin request can pass an arbitrary query string) supplying `horizonDays=200000000` or larger flows straight into `shiftIsoDate(today, -days)`, which does `d.setUTCDate(d.getUTCDate() - days)`. Once the resulting timestamp falls outside JS's representable `Date` range (~±100,000,000 days from the epoch), the `Date` becomes invalid and `d.toISOString()` throws an uncaught `RangeError: Invalid time value` — nothing in `GET` catches this, so the request fails with an unhandled 500 rather than the graceful clamp the comment promises.
**Fix:** Add an upper bound, mirroring (or exceeding) the persisted-settings max:
```ts
const days = Number.isFinite(rawDays) && rawDays > 0 && rawDays <= 3650 ? rawDays : 7
```

### WR-02: `types/database.types.ts` is out of sync with migration 058 — `pricing_globals` is missing the two new columns

**File:** `types/database.types.ts:795-851` (compare `supabase/migrations/058_pricing_globals_dispatch_horizon.sql:20-24`)
**Issue:** Migration 058 adds `dispatch_default_horizon` and `dispatch_horizon_days` to `pricing_globals`. This phase's diff *does* touch `types/database.types.ts` — it added `p_sort`/`p_status` to the `admin_search_bookings` RPC's `Args` type — but the regeneration was incomplete: `pricing_globals`'s `Row`/`Insert`/`Update` shapes were never updated to include the two new columns. Right now this "works" only because `createSupabaseServiceClient()` (`lib/supabase.ts:4`) calls `createClient(...)` without the `Database` generic, so there is no compile-time type-checking against this file for any `pricing_globals` read/write anywhere in the codebase (this was already true before Phase 65, but Phase 65 makes the drift concrete and immediate). The moment any future code does `createClient<Database>(...)` against these tables, `dispatch_default_horizon`/`dispatch_horizon_days` reads/writes will be silently untyped, and a column-name typo on either field won't be caught at compile time.
**Fix:** Regenerate `types/database.types.ts` (`supabase gen types typescript ...`) so `pricing_globals` reflects both new columns:
```ts
pricing_globals: {
  Row: {
    ...
    dispatch_default_horizon: string
    dispatch_horizon_days: number
    ...
  }
  Insert: {
    ...
    dispatch_default_horizon?: string
    dispatch_horizon_days?: number
    ...
  }
  Update: {
    ...
    dispatch_default_horizon?: string
    dispatch_horizon_days?: number
    ...
  }
}
```

## Info

### IN-01: No test exercises "settings resolve after BookingsTable has already mounted" — the scenario that hides CR-01

**File:** `tests/admin-bookings-kpi-decoupling.test.tsx`, `tests/BookingsTable.test.tsx`
**Issue:** `admin-bookings-kpi-decoupling.test.tsx`'s `stubFetch()` always returns `dispatch_default_horizon: 'future'` from `/api/admin/settings` — the same value as `BookingsTable`'s hardcoded prop default — so its assertion that the eventual list fetch carries `horizon=future` cannot distinguish "the settings value propagated correctly" from "the hardcoded fallback was used and the real settings fetch was silently ignored." `BookingsTable.test.tsx`'s D-04 remount test explicitly `unmount()`s before re-rendering with a new `defaultHorizon` prop, so it never exercises a *live* prop update on an already-mounted instance — which is exactly the code path `BookingsPage` actually uses.
**Fix:** Add a regression test that (1) stubs `/api/admin/settings` to resolve with a horizon that differs from the hardcoded fallback (e.g. `dispatch_default_horizon: 'all'`), (2) renders `BookingsPage` (not `BookingsTable` directly, so the real async-settings-then-prop-update path is exercised), and (3) asserts the *final* `/api/admin/bookings` list fetch carries `horizon=all`, not `horizon=future`. This test should currently fail against CR-01 and pass once it's fixed.

---

_Reviewed: 2026-08-28T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
