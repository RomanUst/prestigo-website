---
phase: 93-day-trips-custom-tours
plan: 32
subsystem: api
tags: [custom-tour, api-route, security, csrf, rate-limit, email, outbox]
requires: [93-29, 93-30, 93-34, 93-02]
provides:
  - "POST /api/custom-tour (public custom-tour request endpoint)"
  - "LIMITS['/api/custom-tour'] = 5 and CSRF prefix /api/custom-tour"
  - "sendCustomTourOperatorAlert, sendCustomTourClientAck, renderCustomTourClientAck (lib/email.ts)"
affects: [custom-tour request page (93-34 form now has a working endpoint), admin custom-tours (93-31/93-33 link target)]
key-files:
  created:
    - app/api/custom-tour/route.ts
    - tests/custom-tour-route.test.ts
    - tests/custom-tour-emails.test.ts
  modified:
    - lib/rate-limit.ts
    - middleware.ts
    - lib/email.ts
    - tests/middleware-csrf-forms.test.ts
decisions:
  - "Route imports enqueueCustomTourAlert from lib/custom-tour-enqueue (not lib/custom-tour-alert): a request route importing chatwoot-client trips the VPS isolation guard"
  - "Strict schema accepts exactly the CustomTourForm payload (where, date, people, wishes, name, email, phone, tourSlug?, locale, website); wishes '' is stored as null, absent tourSlug as null"
  - "Date rule is today-or-later in Prague time (plan truth), though the form asks for tomorrow or later; no start-time field (owner decision 2026-11-23: any start time)"
  - "A storeInquiry rejection is treated as 'nothing stored' (best effort); the visitor still gets { ok: true }"
  - "Client ack renders through a dynamic import of lib/payments/emails/render (render.ts imports lib/email statically; a static import back would be a cycle); locale without TourEmails.ack falls back to English"
  - "Send failures log a fixed line with no error object (Resend errors can echo the recipient)"
metrics:
  tasks: 2
  completed: 2026-11-23
status: complete
actuals:
  tokens: 26000
  tasks: 2
  commits: 2
plan_head_before: 188f2541e04ba81852381a351eed2f8e558665eb
plan_head_after: d9b34e617b6f91cf08604298d23ef231f4127040
---

# Phase 93 Plan 32: Custom-tour request endpoint Summary

Public `POST /api/custom-tour` that turns a request into a stored `custom_tour` inquiry (EspoCRM lead via the existing trigger/outbox, Chatwoot ops note via `alert.custom_tour`) and sends an English operator alert plus a localized client acknowledgement, on the submit-multiday-quote precedent.

## Commits

- a8c9ca4f security(93-32): POST /api/custom-tour stores the request and queues CRM and Chatwoot
- d9b34e61 feat(93-32): custom-tour operator alert (English) and localized client acknowledgement

## What was built

- Guard order: `enforceMaxBody` 10 KB (413) -> `checkRateLimit('/api/custom-tour')` 5/min (429 + `Retry-After: 60`) -> malformed JSON 400 -> `z.strictObject` (400 `{ error, fieldErrors }`, keys where/date/people/name/email/phone as the form maps them) -> honeypot `website` (silent 200 `{ ok: true }`, nothing stored or sent) -> `normalizePhone` (422 `INVALID_PHONE`).
- Schema: `where` trimmed 1..1000 (newlines allowed), `date` real ISO date and >= Prague today, `people` integer 1..50, `wishes` optional trimmed 0..1000, `name`/`email`/`phone` single-line (`NO_LINE_BREAKS`, SMTP header injection), `tourSlug` optional `TOUR_SLUG_PATTERN`, `locale` normalized with `normalizeSiteLocale`.
- Store and queue: `storeInquiry('custom_tour', { email, name, phone E.164, payload { where, date, people, wishes, tourSlug, locale } })`; with an id, `dispatchAfterResponse(inquiryOutboxKey(id))` (lead.inquiry) and `await enqueueCustomTourAlert(id)` (alert.custom_tour). A null id still answers 200 and dispatches nothing.
- Emails behind `Promise.allSettled`: `sendCustomTourOperatorAlert` (subject `[Custom tour] New request from the site`, received time in Prague, locale, starting tour or `None`, `https://rideprestigo.com/admin/custom-tours/<id>` only when an id exists, request summary and contact details, all escaped) and `sendCustomTourClientAck` (TourEmails.ack in the request locale, summary box Where/Date/People, `dir="rtl"` for ar, no button, every value escaped once after parameter insertion). No new message strings: TourEmails.ack already exists in all 8 locales (93-02).
- Middleware: `/api/custom-tour` in `CSRF_PROTECTED_PREFIXES` (non-strict, like the other lead forms); matcher untouched.

## Tests

- tests/custom-tour-route.test.ts (28): happy path with the form's exact payload, empty wishes / no tourSlug, today as date, unknown locale -> en, null store, 413, 429 (+ real limiter: 6th request denied on the in-memory path), malformed JSON, unknown key, CR/LF in name and email, past/impossible date, people 0/51/2.5/'4', where empty/too long, wishes too long, tourSlug 'abc', 422, honeypot, email call sites and failure tolerance, console spy (no email/phone/name in logs).
- tests/custom-tour-emails.test.ts (11): alert content/links/escaping/None/no-id/failure/no MANAGER_EMAIL; ack ru content, ar rtl, unknown locale -> en, escaped, all 8 locales render without open parameters, failure tolerance.
- tests/middleware-csrf-forms.test.ts: `/api/custom-tour` added to FORM_ROUTES (foreign Origin 403, site origin passes, missing Origin passes).
- Run: custom-tour-emails, custom-tour-route, email, middleware-csrf-forms, submit-multiday-quote, inquiry-routes, infra-vps-isolation-guard, custom-tour-form, payments-email-render: all green (192 + 88 tests across the two final runs). `npx tsc --noEmit`: 8 errors, all baseline in tests/. eslint --quiet clean on changed files.

## Deviations from Plan

None - plan executed as written. Two small choices worth noting: the LIMITS check is a real-limiter test inside tests/custom-tour-route.test.ts (LIMITS is not exported); the ack is rendered through a dynamic import of the payments render helpers to avoid an import cycle.

## Orchestrator notes

- No new env vars. Needs the existing `MANAGER_EMAIL`, `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL` (alert link falls back to https://rideprestigo.com), and migration 093 (already live) plus the existing outbox/QStash setup.
- The operator alert links to `/admin/custom-tours/<id>`, which 93-31/93-33 deliver; until that page exists the link 404s.
- The form (93-34) is live with `CUSTOM_TOUR_REQUEST_LIVE = true`; ship this endpoint in the same release.
- Not exercised against a live Resend/Supabase/QStash (no service keys in the worktree); a real POST on production after merge is the live proof: expect a custom_tour inquiry row, a lead.inquiry and an alert.custom_tour outbox row, and the two emails.

## Known Stubs

None.

## Threat Flags

None. Mitigations T-93-72..75 implemented: rate limit + honeypot + 10 KB cap + length caps; CSRF prefix with test; NO_LINE_BREAKS and escapeHtml on every value in both emails; logs carry no PII (console spy test), outbox rows hold ids only.

## Self-Check: PASSED

Files exist: app/api/custom-tour/route.ts, tests/custom-tour-route.test.ts, tests/custom-tour-emails.test.ts. Commits a8c9ca4f and d9b34e61 present on worktree-agent-a1f3ee05c9f803634.
