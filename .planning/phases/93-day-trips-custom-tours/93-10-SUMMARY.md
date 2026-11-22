---
phase: 93-day-trips-custom-tours
plan: 10
subsystem: admin-tour-editor
tags: [tours, admin-ui, tabs, i18n-content, photo-upload, publish]
status: complete
requires: ["93-07", "93-08", "93-09"]
provides:
  - "/admin/tours/[id]: tour editor page"
  - "components/admin/tours/TourEditor.tsx: shell with header, publish checklist (A), basics (B), publish / unpublish dialogs (E), beforeunload warning"
  - "components/admin/tours/TourContentTabs.tsx: eight WAI-ARIA language tabs, per-language save, zh-Hant fill (C)"
  - "components/admin/tours/TourListEditor.tsx: list editor for one-line and two-field rows"
  - "components/admin/tours/TourPhotoManager.tsx: direct upload, credits, cover, order, delete (D)"
  - "components/admin/tours/tourEditorShared.tsx: shared styles, copy, language names, ConfirmDialog"
affects: [93-21]
requirements: [TRIP-05, TRIP-03]
tech-stack:
  added: []
  patterns:
    - "editor owns the server copy of the tour; child cards report dirty state upward and hand back saved rows, the editor re-reads GET /api/admin/tours/[id] quietly so the server checklist is always current"
    - "basics form = server values overlaid with an edits map, so a background reload never overwrites typing and dirty is a plain comparison"
    - "language tab status = the PUT answer when one exists, else the same pure isLocaleComplete rule over the stored row (client-safe module shared with the server)"
    - "upload: sign -> XHR PUT (for progress) -> register, one file at a time, row stays until the editor re-read shows the photo"
key-files:
  created:
    - app/(internal)/admin/(dashboard)/tours/[id]/page.tsx
    - components/admin/tours/TourEditor.tsx
    - components/admin/tours/TourContentTabs.tsx
    - components/admin/tours/TourListEditor.tsx
    - components/admin/tours/TourPhotoManager.tsx
    - components/admin/tours/tourEditorShared.tsx
    - tests/admin-tour-editor.test.tsx
    - tests/admin-tour-content-tabs.test.tsx
    - tests/admin-tour-photo-manager.test.tsx
  modified: []
decisions:
  - "Switch-tab dialog: Escape / X keep the current tab and the text (onDismiss); only the 'Discard changes' button discards."
  - "New uploads register as source 'own'; the operator changes the source afterwards. 'Own photo' needs no credit, so a photo of someone else's left as 'own' would pass the checklist - an operator-discipline risk, flagged below."
  - "Save photo details is allowed with blank credit / licence (the server stores them, the checklist blocks publishing); a non-https link, or a missing link for Wikimedia Commons / Other, blocks the save."
  - "Delete refused with 409 LAST_PHOTO closes the dialog and shows the refusal above the photo list; other failures keep the dialog open."
metrics:
  completed: 2026-11-18
actuals:
  tokens: 36000
  tasks: 3
  commits: 3
plan_head_before: 6ae92cbba366f9b7700fe7aceddf7dd6133d3622
plan_head_after: 9eb072bce2a3d90a0e11b529cd7a9c42482cda7b
---

# Phase 93 Plan 10: Admin tour editor Summary

An operator can open a draft at `/admin/tours/<id>`, set the basics and prices, write and save the content in all eight languages, upload and credit photos, watch the server checklist, and publish or unpublish, without a redeploy.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | Editor page: load, save basics, checklist, publish / unpublish | e82bf62f |
| 2 | Eight language tabs, list editors, server completeness, zh-Hant fill | feeb433a |
| 3 | Photo manager: upload with progress, credits, cover, order, delete | 9eb072bc |

## Verification

- `npx vitest run --exclude '.claude/**' tests/admin-tour-editor.test.tsx tests/admin-tour-content-tabs.test.tsx tests/admin-tour-photo-manager.test.tsx tests/admin-no-hardcoded-colors.test.ts`: 95 passed (19 editor, 23 content tabs, 27 photo manager, 26 colour guard). tests/admin-tours-list and admin-tour-settings-card (93-09) still pass.
- `npx tsc --noEmit`: 8 errors total = the tests/ baseline; none in the new files.
- `npx eslint --quiet components/admin/tours "app/(internal)/admin/(dashboard)/tours" tests/admin-tour-*.tsx`: clean.
- Acceptance greps: `beforeunload` in TourEditor, `role="tablist"` and `fill-zh-hant` in TourContentTabs, `photos/sign` and `LAST_PHOTO` in TourPhotoManager all present. No `€` and no colour literal in any new file.
- Tracer gate: the tracer task has no `gate` attribute and its `<verify>` is automated; it passed before Task 2 started.

Behaviours covered by tests: header (All tours link, EN title or slug, Draft badge), Publish disabled with `aria-describedby` the checklist card, per-row pass / fail icons with text alternatives; PATCH sends only changed fields then re-reads the tour; client bounds (hours 1..12, drive 10..600, latest > earliest, price > 0) block the request; SLUG_TAKEN shown at the address; address read-only with the note once `first_published_at` is set; beforeunload fires only while dirty (basics, a language, or an upload / photo-detail edit); publish dialog and POST, 422 failures shown in the checklist; Unpublish dialog with 'Keep published' focused; tab roles, roving tabindex, Arrow / Home / End; `lang` / `dir` per panel (AR rtl, HI, zh-Hans, zh-Hant); list editor add / move / delete with row-numbered labels; PUT body keys equal the 93-07 schema; incomplete / script / english answers shown; save-and-switch / discard / Escape; fill zh-Hant disabled with 'Save the ZH tab first.', confirm, POST, converted text shown, ZH_INCOMPLETE handled; upload (two files sequential, per-file progress, 9 MB, GIF, failed PUT, failed sign, failed register), cover / move PATCH, credit fields and https link rules, delete with 'Keep photo' focused, 409 LAST_PHOTO.

## Deviations from Plan

### Auto-fixed / added

**1. [Rule 2 - Missing critical] Checklist shows a fifth row for MISSING_BASICS**
- The server checklist (93-05) can fail with `MISSING_BASICS` (drive minutes or destination name empty), which none of the four spec rows covers; Publish would stay disabled with every visible row green. The line "Destination name and drive time" appears only when the server reports that failure.

**2. [Rule 3 - Structure] extra file `components/admin/tours/tourEditorShared.tsx`**
- Shared styles, language names and a `ConfirmDialog` used by all three cards. The existing `Modal` has no initial-focus control, so the dialog focuses the safe button after mount (after the Modal records its trigger), which keeps focus return to the trigger intact. `Modal.tsx` itself is unchanged.

**3. [Note] Two-column basics grid uses `auto-fit minmax(min(100%, 360px), 1fr)`**
- Inline styles cannot carry the 768px media query of the spec; the grid reaches two columns at about the same width.

**4. [Note] Fill zh-Hant is also disabled while the ZH tab has unsaved edits**, not only while ZH is incomplete, because the server converts the saved ZH row, not the typed text.

**5. [Note] 'Save and switch' with a failed save** closes the dialog and stays on the tab with the text kept; the error shows under the card.

No Rule 1 or Rule 4 deviations.

## Deferred to the orchestrator (browser check, needs an admin login)

- **E21 backstop (human-check in the plan):** open `/admin/tours/<id>` in Chrome on macOS and on Windows, type in the AR, HI, ZH and ZH-HANT tabs: Arabic flows right to left, Devanagari and Chinese render with system fonts, no tofu. Not assertable in jsdom; no preview with an admin session was available to the executor.
- **Live upload proof:** one real photo upload against the `tour-photos` bucket (the component PUTs the raw file with its Content-Type to the signed URL; the 93-08 flow note says Supabase `uploadToSignedUrl` sends multipart, and Storage accepts both, but only a live run proves it with this bucket). Connect-src already allows `https://*.supabase.co` in the admin CSP, so the PUT is not blocked.
- **Live smoke of the whole flow** (create draft, save basics, save EN, add a photo, publish, unpublish) once 93-07 / 93-08 are on a Supabase-backed deployment.

## Known Stubs

None.

## Threat Flags

None. T-93-27 (client type / size checks are convenience only) and T-93-28 (Publish disabled until the server checklist passes; the publish route re-checks) are implemented as planned. The upload path goes through the 93-08 sign route; the client never chooses a path or extension.

## Self-Check: PASSED

- FOUND: app/(internal)/admin/(dashboard)/tours/[id]/page.tsx, components/admin/tours/TourEditor.tsx, TourContentTabs.tsx, TourListEditor.tsx, TourPhotoManager.tsx, tourEditorShared.tsx, tests/admin-tour-editor.test.tsx, admin-tour-content-tabs.test.tsx, admin-tour-photo-manager.test.tsx
- FOUND commits: e82bf62f, feeb433a, 9eb072bc
