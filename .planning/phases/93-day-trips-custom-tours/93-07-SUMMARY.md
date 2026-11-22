---
phase: 93-day-trips-custom-tours
plan: 07
subsystem: admin-tours-api
tags: [tours, admin-api, zod, security, opencc, completeness]
status: complete
requires: ["93-05"]
provides:
  - "lib/tours/admin-schemas.ts: tourCreateSchema, tourBasicsSchema, tourTranslationSchema, tourReorderSchema, tourSettingsSchema (all z.strictObject)"
  - "lib/tours/admin-store.ts: listAdminTours, getAdminTour, createTourDraft, updateTourBasics, saveTourTranslation, fillZhHantFromZh, reorderTours, updateTourSettings, readTourSettings, TourAdminError; types AdminTourListItem, AdminTourDetail"
  - "lib/tours/admin-http.ts: tourErrorResponse (fixed error-code to status map), UUID_RE, isAppLocale, invalidPayload, notFound"
  - "GET/POST /api/admin/tours, GET/PATCH /api/admin/tours/[id], PUT /api/admin/tours/[id]/translations/[locale], POST /api/admin/tours/[id]/fill-zh-hant, POST /api/admin/tours/reorder, GET/PATCH /api/admin/tour-settings"
  - "error codes SLUG_TAKEN (409), SLUG_LOCKED (409), ZH_INCOMPLETE (409), INVALID_WINDOW (422)"
affects: [93-08, 93-10, 93-21]
tech-stack:
  added: []
  patterns:
    - "admin guard order: shared getAdminUser (401/403) -> id/locale (404) -> enforceMaxBody (413) -> readCappedJson (400) -> z.strictObject (400) -> store (404/409/422) -> revalidatePath('/[locale]', 'layout')"
    - "store throws TourAdminError with a fixed code; the route maps it, a database message never reaches a response"
    - "in-memory PostgREST fake (tests/helpers/fake-tours-db.ts) so routes and store run for real in tests"
key-files:
  created:
    - lib/tours/admin-schemas.ts
    - lib/tours/admin-store.ts
    - lib/tours/admin-http.ts
    - app/api/admin/tours/route.ts
    - app/api/admin/tours/[id]/route.ts
    - app/api/admin/tours/[id]/translations/[locale]/route.ts
    - app/api/admin/tours/[id]/fill-zh-hant/route.ts
    - app/api/admin/tours/reorder/route.ts
    - app/api/admin/tour-settings/route.ts
    - types/opencc-js.d.ts
    - tests/admin-tours-route.test.ts
    - tests/admin-tour-settings-route.test.ts
    - tests/helpers/fake-tours-db.ts
  modified: []
decisions:
  - "Admin check is the shared getAdminUser from lib/supabase/server (app_metadata.is_admin), not a per-route copy; the acceptance grep for the literal `app_metadata?.is_admin` is satisfied through that helper."
  - "Guard order follows the plan (401/403 first, then body cap), unlike the quotes routes that cap first; the body is never read for an unauthenticated caller (tested with a text() spy)."
  - "Saving the English row re-checks the es / fr rows of the same tour against it, because the copy guard compares them with English; without this a stale is_complete=true could outlive an English edit."
  - "Blank list rows and edge whitespace from the editor are dropped / trimmed by the store before storing; the schema allows empty strings so the editor can send a half-filled row."
  - "reorder requires the exact set of existing tour ids (unknown, missing or duplicate id = 400); sort_order is written one UPDATE per tour (small N, no bulk update by id in PostgREST)."
  - "createTourDraft deletes the draft again when the English row cannot be inserted, so no tour exists without an English row."
metrics:
  completed: 2026-11-18
actuals:
  tokens: 18400
  tasks: 3
  commits: 3
plan_head_before: 36e0c261d15b2525161a34ef45ccdc45a3f4fc13
plan_head_after: fc7e557336a3ad1faf80fa48b6cc4fc7a26338e3
---

# Phase 93 Plan 07: Admin tour API Summary

The admin API that manages tours and the global tour settings: create a draft, edit basics within safe bounds, save content per locale with server-computed completeness, reorder, generate zh-Hant from zh with opencc-js, and edit extra-hour prices / free-cancellation hours / pickup radius once for all tours.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | Create a draft, save English content, read back is_complete from the server | f35af4f9 |
| 2 | Basics bounds, slug lock, reorder, zh-Hant fill | d0a3b775 |
| 3 | Tour settings API | fc7e5573 |

All three commits use the `security:` prefix (admin auth, validation).

## Verification

- `npx vitest run --exclude '.claude/**' tests/admin-tours-route.test.ts tests/admin-tour-settings-route.test.ts`: 87 passed (67 + 20). Tests that mock `@/lib/supabase/server` and `next/cache` load fine inside the worktree; no next-intl server module is involved.
- `npx tsc --noEmit`: 8 errors total = the tests/ baseline; none in lib/tours, app/api/admin/tour*, tests/admin-tour*.
- `npx eslint --quiet` on the new lib, route, type and test files: clean.
- Tracer gate: the tracer task has no `gate` attribute and its `<verify>` is automated; it was re-run green (28 tests) before Task 2.

Coverage of the plan's behaviours: 401 (no body read) and 403 on every route; slug without `-day-trip` / uppercase / duplicate; client-sent `is_complete` (and `status`, `first_published_at`) is 400; unknown locale segment is 404; ru Latin title gives leak `script`; GET detail has all 8 locales (null where absent) plus the checklist; every success calls `revalidatePath('/[locale]', 'layout')` once and every failure does not; hours 0/13, start `10:15`, max <= min, price 0 / -5 / 12.345 are 400; SLUG_LOCKED after `first_published_at`; reorder sets sort_order 0..n-1 and rejects unknown / duplicate ids; zh-Hant equals the opencc `cn -> twp` conversion and is 409 ZH_INCOMPLETE while zh is missing or incomplete; settings 73 h, radius 0.5 / 51, extra hour 0 are 400.

## Deviations from Plan

### Auto-fixed / added

**1. [Rule 3 - Blocking] opencc-js has no type declarations**
- **Found during:** Task 2 (`import('opencc-js')` fails strict tsc with TS7016)
- **Fix:** added `types/opencc-js.d.ts` declaring only `Converter`; the store uses a lazy dynamic `import('opencc-js')` so the dictionary loads on first use. No package was installed.
- **Files:** types/opencc-js.d.ts (not in the plan's `files_modified`)

**2. [Rule 2 - Missing critical] es / fr completeness goes stale when English changes**
- **Issue:** the es / fr copy guard compares with the English row, so editing English could leave a stored `is_complete=true` that is no longer true.
- **Fix:** `saveTourTranslation` for `en` re-evaluates existing es / fr rows and updates the flag. Covered by a test.

**3. [Rule 3 - Structure] extra files**
- `lib/tours/admin-http.ts` (shared status mapping for six routes, instead of six copies) and `tests/helpers/fake-tours-db.ts` (in-memory PostgREST used by both test files), plus `readTourSettings` in the store for the settings GET (the existing `getTourSettings` swallows errors, which is right for public readers but not for the admin).

## Notes for the orchestrator

- **`opencc-js` is in `devDependencies`** (package.json line 78). The fill-zh-hant route imports it at runtime on the server. Next traces imported node_modules into the function bundle and Vercel installs dev dependencies for the build, so it should work in production, but moving it to `dependencies` is the safe fix; I did not touch package.json (npm / package changes are outside this plan). Worth a deliberate decision before 93-08 or at ship.
- Routes were not exercised against live Supabase (executors have no Supabase MCP); the store was exercised against an in-memory PostgREST fake that mirrors the 092 unique constraints (tours.slug, (tour_id, locale)). Column lists match 092_tours.sql and lib/tours/store.ts. Worth one live smoke after merge: POST create, PUT en content, GET detail.
- The `reorder` write is one UPDATE per tour, not transactional; a failure mid-way leaves a partial order and answers 500 (the admin retries).

## Threat model

T-93-17 (401/403 before any body read, tested per route), T-93-18 (strict schemas with length caps, no HTML path), T-93-19 (strictObject rejects `is_complete` / `status`; completeness computed server-side), T-93-20 (per-route `enforceMaxBody` and `readCappedJson` caps, list caps in the schema) are mitigated as planned. No new threat surface beyond the plan.

## Known Stubs

None.

## Self-Check: PASSED

All 13 created files exist; commits f35af4f9, d0a3b775, fc7e5573 exist on the branch.
