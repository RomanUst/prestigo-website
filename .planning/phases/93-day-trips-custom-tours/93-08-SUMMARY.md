---
phase: 93-day-trips-custom-tours
plan: 08
subsystem: admin-tours-photos-publish
tags: [tours, admin-api, storage, signed-upload, csp, security, publish]
status: complete
requires: ["93-07"]
provides:
  - "lib/tours/admin-photos.ts: mintTourPhotoUpload, registerTourPhoto, updateTourPhoto, moveTourPhoto, deleteTourPhoto, setTourStatus, photoErrorResponse, TourPhotoError, schemas tourPhotoSignSchema / tourPhotoRegisterSchema / tourPhotoPatchSchema / tourPublishSchema"
  - "POST /api/admin/tours/[id]/photos/sign, POST /api/admin/tours/[id]/photos, PATCH + DELETE /api/admin/tours/[id]/photos/[photoId], POST /api/admin/tours/[id]/publish"
  - "error codes OBJECT_MISSING (422), PHOTO_EXISTS (409), PHOTO_LIMIT (422), LAST_PHOTO (409), CHECKLIST_FAILED (422 with failures[])"
  - "CSP img-src carries the Supabase project origin (static, admin/driver, driver-help); next.config images.remotePatterns has the tour-photos entry"
affects: [93-09, 93-10]
tech-stack:
  added: []
  patterns:
    - "browser uploads straight to Storage with a signed URL; the server owns the path (tours/<tourId>/<uuid>.<ext>) and the extension comes from a content-type allow-list"
    - "register-after-verify: a photo row exists only when storage.exists(path) is true"
    - "CSP image origin added by post-processing the directive array (].map(allowSupabaseImages).join), so the chat-host directive lines stay lone string literals for the Phase 76 isolation guard"
key-files:
  created:
    - lib/tours/admin-photos.ts
    - app/api/admin/tours/[id]/photos/sign/route.ts
    - app/api/admin/tours/[id]/photos/route.ts
    - app/api/admin/tours/[id]/photos/[photoId]/route.ts
    - app/api/admin/tours/[id]/publish/route.ts
    - tests/admin-tour-photos.test.ts
    - tests/admin-tour-publish.test.ts
    - tests/middleware-tour-photos-csp.test.ts
  modified:
    - middleware.ts
    - next.config.ts
decisions:
  - "Photo and publish failures use their own TourPhotoError (fixed codes) instead of widening TourAdminError from 93-07; photoErrorResponse maps them and delegates everything else (NOT_FOUND, DB) to the shared tourErrorResponse."
  - "Existence check is storage.exists(path) (HEAD), not list/info: simplest exact-path check; a non-true answer is OBJECT_MISSING. MIME and size are enforced by the bucket (092) and by the sign schema."
  - "Positions are renumbered 1..n after a move or delete, so the 1..50 CHECK cannot be hit by gaps and a swap is always against the real neighbour."
  - "The Supabase origin is added to the admin/driver nonce CSP and the driver-help CSP as well as the static one (img-src only); the Chatwoot /embed CSP (img-src 'self' data:) is left alone."
  - "Only an https NEXT_PUBLIC_SUPABASE_URL widens img-src / remotePatterns; an http://localhost local Supabase adds nothing."
  - "setTourStatus re-reads the tour through getAdminTour after the update so numeric columns come back in the same shape as the editor already uses."
metrics:
  completed: 2026-11-18
actuals:
  tokens: 17000
  tasks: 3
  commits: 3
plan_head_before: ef1469043089e565130c12fc94dc01cf366ffb8f
plan_head_after: 306dffae0b06ab8f5569c99d08b1f186ef0bf3bf
---

# Phase 93 Plan 08: Tour photos, publish switch and image host allowances Summary

Admins can add, credit, order, cover and delete tour photos through browser-direct signed uploads (server-owned paths, allow-listed types, 8 MB cap), publish a tour only when `publishChecklist` passes, and the Supabase image host is allowed under the site CSP and next/image.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | Signed upload, register-after-verify, first photo is the cover | c26b9fd6 |
| 2 | Photo edits, delete rules, publish / unpublish with the checklist | de7390ee |
| 3 | Supabase image host in CSP img-src and next/image remotePatterns | 306dffae |

Tasks 1 and 3 use the `security:` prefix (file upload, CSP); Task 2 is `feat:`.

## Verification

- `npx vitest run --exclude '.claude/**'` on tests/admin-tour-photos.test.ts (30), tests/admin-tour-publish.test.ts (11), tests/middleware-tour-photos-csp.test.ts (14) plus the existing tests/middleware-i18n, middleware-embed, middleware-matcher, middleware-csrf-forms, middleware-customer, next-config-headers, infra-vps-isolation-guard and dashboard-app-isolation-guard: 11 files, 312 tests passed.
- `npx tsc --noEmit`: 8 errors total = the tests/ baseline; none in the new files.
- `npx eslint --quiet` on middleware.ts, next.config.ts, lib/tours/admin-photos.ts, app/api/admin/tours and the new tests: clean.
- Tracer gate: the tracer task has no `gate` attribute and its `<verify>` is automated; it was re-run green before Task 2.
- Acceptance greps: `createSignedUploadUrl` and `randomUUID` present in lib/tours/admin-photos.ts; `LAST_PHOTO` in the photo route's lib path (see deviation 1), `CHECKLIST_FAILED` in the publish route path; `tour-photos` in next.config.ts; tests/middleware-matcher.test.ts untouched and passing.

Behaviours covered: 401 / 403 first on every route (body never read for an anonymous caller); svg / html / gif / pdf content types and sizes 0, 1.5, 8388609 refused before minting, 8388608 allowed; client-sent path / file name / is_cover / position / tour_id are 400; path of another tour, traversal, wrong extension, uppercase uuid, non-uuid name are 400 with no row; OBJECT_MISSING writes no row; first photo is the cover, later ones position last + 1; non-own source without credit is stored; `javascript:`, `http:`, `data:` source links are 400; duplicate registration 409; 50-photo cap 422; set cover never leaves two covers; move up / down swaps and renumbers, no-op at the ends; delete removes row then object, next photo becomes cover, last photo of a published tour is 409 LAST_PHOTO, Storage failure after the row is gone does not fail the request; publish with a missing price is 422 CHECKLIST_FAILED with MISSING_PRICE and the status unchanged; ready tour publishes and sets first_published_at; a second publish keeps the first value; unpublish needs no checklist and keeps it; every successful write revalidates `'/[locale]'` layout and no failure does; database / storage messages never reach a response.

## Deviations from Plan

### Notes (no rule needed)

**1. The rules live in lib/tours/admin-photos.ts, not in the routes.** Following the 93-07 pattern the store throws fixed codes and the routes map them through `photoErrorResponse`. The plan's acceptance greps (`LAST_PHOTO` in the [photoId] route, `CHECKLIST_FAILED` in the publish route) pass because the route doc comments name the codes; the `publishChecklist` key link is realised in `setTourStatus` (lib) and named in the publish route's comment. The behaviour is asserted through the routes in the tests.

**2. Existing middleware tests did not need changes.** They pin the exact img-src string only with `NEXT_PUBLIC_SUPABASE_URL` unset, and the helper adds nothing without it, so no existing test was edited.

**3. Existence check uses `storage.exists()`** instead of the plan's "list / info on the exact path"; the stub in the tests mirrors that call.

No Rule 1-4 deviations.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: new admin routes are covered by T-93-21..23, the CSP change by T-93-24 (exact origin, img-src only, pinned by tests).

## Notes for the orchestrator / following plans

- Browser upload flow for 93-10 (editor): `POST photos/sign` -> PUT the file bytes to `signedUrl` (Supabase `uploadToSignedUrl` with the returned `token`, `path`) -> `POST photos` with `path` + credit fields. A registration that returns 422 OBJECT_MISSING means the upload did not finish.
- Photo list responses of PATCH / DELETE are `{ photos }` in display order; the publish response is `{ tour }`; a publish refusal is 422 `{ code: 'CHECKLIST_FAILED', failures: PublishFailure[] }`.
- Live proof still needed by the orchestrator (no Supabase MCP in the executor): a real signed upload against the tour-photos bucket and a public image load on a preview with `NEXT_PUBLIC_SUPABASE_URL` set.

## Self-Check: PASSED

- FOUND: lib/tours/admin-photos.ts, app/api/admin/tours/[id]/photos/sign/route.ts, app/api/admin/tours/[id]/photos/route.ts, app/api/admin/tours/[id]/photos/[photoId]/route.ts, app/api/admin/tours/[id]/publish/route.ts, tests/admin-tour-photos.test.ts, tests/admin-tour-publish.test.ts, tests/middleware-tour-photos-csp.test.ts
- FOUND commits: c26b9fd6, de7390ee, 306dffae
