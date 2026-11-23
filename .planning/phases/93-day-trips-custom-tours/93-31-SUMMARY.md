---
phase: 93-day-trips-custom-tours
plan: 31
subsystem: api
tags: [custom-tour, quotes, admin-api, inquiries, security]
requires:
  - phase: 93-day-trips-custom-tours
    provides: migration 093 live (inquiries.kind custom_tour, quotes_source_inquiry_id_key) from 93-29
provides:
  - POST /api/admin/quotes with source_inquiry_id and locale (quote linked to a custom-tour request)
  - lib/custom-tours/admin-store.ts listCustomTourRequests / getCustomTourRequest
  - GET /api/admin/custom-tours and GET /api/admin/custom-tours/[id]
affects: [93-33, 93-34, 93-35]
tech-stack:
  added: []
  patterns: [keyset cursor over (created_at, id) with strict validation before the PostgREST or() string, derived request status from quotes.source_inquiry_id]
key-files:
  created:
    - lib/custom-tours/admin-store.ts
    - app/api/admin/custom-tours/route.ts
    - app/api/admin/custom-tours/[id]/route.ts
    - tests/admin-custom-tours-route.test.ts
  modified:
    - lib/quotes/schemas.ts
    - lib/quotes/store.ts
    - app/api/admin/quotes/route.ts
    - tests/admin-quotes-route.test.ts
key-decisions:
  - "A refusal is a QuoteCreateRefusal(code) thrown by createQuoteDraft; the route maps INQUIRY_NOT_FOUND 404, INQUIRY_NOT_CUSTOM_TOUR 422, INQUIRY_ALREADY_QUOTED 409. The unique violation is told apart from a reference collision by the constraint name quotes_source_inquiry_id_key (checked, never logged)."
  - "List pagination is a keyset cursor (base64url of created_at|id, both validated by strict regex before use in the or() filter), so identical timestamps are not skipped. The status filter reads the set of quoted inquiry ids first (bounded 5000) then applies in / not-in."
  - "lead_channel is stored as sent (the admin UI will send 'other'); no server-side forcing."
requirements-completed: [TRIP-07]
status: complete
completed: 2026-11-23
commits: 2
plan_head_before: 6a345351921fa9f0f0b04702c21cb37c1b3cbd8f
plan_head_after: 46dc66751b3e5e5559c9d66304e00bf5d0a2cec6
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
---

# Phase 93 Plan 31: custom-tour request to quote, server side Summary

**An operator can create exactly one Phase 92 quote per custom-tour request (verified, linked, in the client's language), and list or open requests with a derived open / quoted status.**

## Commits

- 996e2535 security(93-31): quote created from a custom-tour request, verified and one per request
- 46dc6675 security(93-31): admin list and detail API for custom-tour requests with derived quote status

## What was built

- Task 1 (tracer): `quoteCreateSchema` gains optional `source_inquiry_id` (uuid) and `locale`. `createQuoteDraft` loads the inquiry first (404 INQUIRY_NOT_FOUND when missing or erased, 422 INQUIRY_NOT_CUSTOM_TOUR for any other kind), uses `input.locale` over the latest-booking rule, writes `source_inquiry_id`, and maps the unique violation of 093 to 409 INQUIRY_ALREADY_QUOTED with nothing new stored. A create without the new fields is unchanged.
- Task 2: `lib/custom-tours/admin-store.ts` (service client per call; one inquiries query plus one `quotes ... source_inquiry_id IN (...)` query per page) and two GET routes. List: custom_tour only, newest first, 50 per page, cursor, `status=all|open|quoted`, each item with received time, name, email, first line of where (120 chars), trip date, people, locale, status and the linked quote `{id, reference}`. Detail: full payload, contact and the linked quote, 404 for unknown id or other-kind inquiry. Every route answers 401 / 403 first, is `no-store`, and logs codes only.

## Tracer gate

Tracer verified end to end: the quote create with a request id and the follow-up list showing the request as quoted both pass (list status test seeds a quote with `source_inquiry_id`; the create test checks the stored link).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test] Existing test asserted locale on create was a 400 unknown key**
- **Found during:** Task 1
- **Issue:** tests/admin-quotes-route.test.ts expected `locale: 'ru'` on POST to be rejected; the plan makes `locale` a valid optional field.
- **Fix:** the assertion now uses an unknown key (`language`) to keep the strict-object coverage; `locale` is covered by the new TRIP-07 tests (valid ru, invalid de is 400).
- **Files modified:** tests/admin-quotes-route.test.ts
- **Commit:** 996e2535

**2. [Plan wording] Test doubles live in the test files**
- The shared tests/helpers/fake-payments-db.ts has no inquiries table and does not model the 093 unique index, and is not in this plan's file list. tests/admin-quotes-route.test.ts wraps the fake (an inquiries double plus the unique source_inquiry_id rule on quote inserts); tests/admin-custom-tours-route.test.ts has its own small in-memory query double. No shared helper was changed.

### Notes

- Task 2 tests were written together with the implementation rather than strictly before it (RED was shown for Task 1 only: 5 failing tests before the code).

## Verification

- `npx vitest run --exclude '.claude/**' tests/admin-quotes-route.test.ts tests/admin-custom-tours-route.test.ts tests/admin-quotes-lifecycle.test.ts tests/quotes-status.test.ts`: 4 files, 145 passed.
- eslint --quiet on all changed files: clean.
- `npx tsc --noEmit`: 8 errors, all in tests/ (baseline), none in changed files.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-93-70 mitigated (admin-only route, inquiry existence and kind verified server side, one quote per request by the unique index); T-93-71 mitigated (401 / 403 on every route, no PII in logs, ids not on public routes).

## ORCHESTRATOR_REQUIRED

Nothing needing Supabase or live access: migration 093 is already live and these changes use it as is. After merging, the orchestrator updates STATE.md / ROADMAP.md as agreed. Not live-smoked: a real POST with a real inquiry id (needs the 93-32 route or a hand-inserted custom_tour inquiry); the store logic is proven against in-memory doubles only. The real Postgres unique-violation message is assumed to contain the index name `quotes_source_inquiry_id_key` (standard `duplicate key value violates unique constraint "..."` text, which holds for unique indexes too).

## Self-Check: PASSED

- lib/custom-tours/admin-store.ts, app/api/admin/custom-tours/route.ts, app/api/admin/custom-tours/[id]/route.ts, tests/admin-custom-tours-route.test.ts exist.
- Commits 996e2535 and 46dc6675 exist on branch worktree-agent-a2a3773c7ecfcbb83.
