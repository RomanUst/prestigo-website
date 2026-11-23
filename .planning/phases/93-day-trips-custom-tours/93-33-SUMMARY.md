---
phase: 93-day-trips-custom-tours
plan: 33
subsystem: admin-ui
tags: [custom-tour, admin, quotes, quote-builder]
requires:
  - phase: 93-day-trips-custom-tours
    provides: admin custom-tours API and POST /api/admin/quotes with source_inquiry_id (93-31)
provides:
  - /admin/custom-tours request inbox and /admin/custom-tours/[id] detail with one-click Create quote
  - Custom-tour request card and first-trip prefill in the Phase 92 quote builder
  - Custom tours sidebar entry
affects: [93-35]
tech-stack:
  added: []
  patterns: [client pages over admin APIs, request text rendered as React text with pre-wrap, status via --status-* tokens]
key-files:
  created:
    - app/(internal)/admin/(dashboard)/custom-tours/page.tsx
    - app/(internal)/admin/(dashboard)/custom-tours/[id]/page.tsx
    - components/admin/custom-tours/CustomToursTable.tsx
    - components/admin/custom-tours/CustomTourDetail.tsx
    - components/admin/quotes/CustomTourRequestCard.tsx
    - tests/admin-custom-tours-pages.test.tsx
  modified:
    - components/admin/AdminSidebar.tsx
    - components/admin/quotes/QuoteBuilder.tsx
    - tests/quote-builder.test.tsx
key-decisions:
  - "The quote client is split from the request's single name field on the last space; a one-word name gets '-' as last name (the quote schema needs both)."
  - "The request locale is sent only when it is one of the 8 site locales; otherwise the server's own language rule applies."
  - "The first-trip prefill is done by the builder (card calls onLoaded once); a seeded line is an unsaved draft, so Send waits for Save, and a trip the operator removes is not re-seeded."
  - "Starting tour link: slug matched to a tour id via GET /api/admin/tours; without a match the slug shows as plain text."
  - "'Quote created {date}' reads quote.created_at from GET /api/admin/quotes/<id>; the line is omitted if that read fails (the 93-31 link has only id and reference)."
requirements-completed: [TRIP-07]
status: complete
completed: 2026-11-23
commits: 2
plan_head_before: c402fdb75709549a6b782d1234e84d4de7adb362
plan_head_after: 15b4281197a164578db7cb41fd15a91c24c33df2
actuals:
  tokens: 26000
  tasks: 3
  commits: 2
---

# Phase 93 Plan 33: custom-tour inbox and quote bridge Summary

**Operators list custom-tour requests (All / Open / Quoted, 50 per page), open one, press Create quote and land in the Phase 92 builder with the request card above the trips and the first trip started from the request's date, people and wishes.**

## Commits

- 55c36475 feat(93-33): custom-tour request inbox, detail with Create quote, sidebar entry (Tasks 1 and 2)
- 15b42811 feat(93-33): request card and first-trip prefill in the quote builder (Task 3)

## What was built

- Task 1 (tracer): detail page and `CustomTourDetail`. Request card (received in Prague time, language chip, starting tour link or "None", where pre-wrap, date or "Not given", people, wishes) and Contact card (mailto, tel, WhatsApp `https://wa.me/<digits>` in a new tab). Create quote posts `{client, lead_channel: 'other', currency: 'eur', source_inquiry_id, locale}`, shows "Creating…" and opens `/admin/quotes/<id>`; a second click sends nothing. 409 re-reads the request and shows "Open quote {reference}" with "Quote created {date}"; 404 shows the erased copy; other errors show the plan's sentence. Erased/missing request: "Erased request" and "This request was erased. A quote cannot be created." with no Create button.
- Task 2: list page and `CustomToursTable` (columns Received, Client, Where, Trip date, People, Language chip, Status, Open; stacked cards under 768px), radiogroup filter, Load more by cursor, both empty states, Retry on load failure; sidebar "Custom tours" (MessageCircle) right after Tours.
- Task 3: `CustomTourRequestCard` (info tokens; where clamped to 6 lines with Show all / Show less; Open request link that stays even if the request cannot be read) and the builder wiring. A quote without `source_inquiry_id` renders exactly as before.

## Tracer gate

Tracer verified end to end in tests: request detail, Create quote POST body, navigation to the builder, and the builder card plus prefill from a request all pass.

## Deviations from Plan

None in behaviour. Notes:

- **lib/quotes/store.ts not changed.** The plan allowed adding `source_inquiry_id` to the builder's quote select; `getQuote` already selects `*`, so the field is present in `detail.quote`.
- **Tasks 1 and 2 share one commit.** The list, the detail and the shared chips/badges live in the same test file and `CustomToursTable` is imported by the detail, so they were committed together (one commit for Tasks 1-2, one for Task 3).
- Tests were written first for Task 1 (RED: module not found), Tasks 2 and 3 tests were written together with the code.

## Verification

- `npx vitest run --exclude '.claude/**' tests/quote-builder.test.tsx tests/quote-line-editor.test.tsx tests/admin-custom-tours-pages.test.tsx tests/admin-no-hardcoded-colors.test.ts tests/admin-tours-list.test.tsx`: 5 files, 122 passed.
- `tests/quote-builder.test.tsx` alone: 40 passed. The test "a quote of 19 trips..." timed out once at 30 s while the machine was heavily loaded (load average 7-11, another executor running) and passed alone at 18 s when the load dropped; it is the known flaky test and renders no request card (no `source_inquiry_id`).
- eslint --quiet on all changed files: clean. `npx tsc --noEmit`: 8 errors, all in tests/ (baseline). No `€` and no colour literal in new files.

## Known Stubs

None.

## Human check left (plan Task 3)

UI Considerations E23 backstop: create a request with a 1000-character "where", open `/admin/custom-tours` (row stays one line with ellipsis, full text on hover) and its detail (text wraps). Covered in tests by styles only (`nowrap` + `ellipsis` + `title`, `pre-wrap` + `overflow-wrap: anywhere`); needs a real browser.

## Threat Flags

None. T-93-76: all request text is React text (tests assert `<img onerror>` and `<b>` do not become elements, in the detail and in the builder card); links built from the email and the digits of the phone only. T-93-77: pages sit under the (dashboard) layout gate and call the guarded 93-31 / Phase 92 APIs.

## Self-Check: PASSED

- All created files exist; commits 55c36475 and 15b42811 exist on branch worktree-agent-a303751005211c58c.
