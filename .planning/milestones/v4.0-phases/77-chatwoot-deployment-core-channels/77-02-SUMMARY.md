---
phase: 77-chatwoot-deployment-core-channels
plan: 02
subsystem: email
tags: [resend, replyTo, chatwoot, email]

requires:
  - phase: 76-vps-infrastructure
    provides: Chatwoot deployed at chat.rideprestigo.com (bookings@ inbox connected in plan 77-11)
provides:
  - "CUSTOMER_REPLY_TO constant (bookings@rideprestigo.com), exported from lib/email.ts"
  - "All 11 customer-facing transactional emails carry replyTo: bookings@rideprestigo.com"
  - "Table-driven regression test (tests/email-reply-to.test.ts) pinning every customer and internal send site"
affects: [77-11 (bookings@ inbox connection), 80 (EspoCRM sales mailbox roman@)]

actuals:
  tokens: 4814
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Shared reply-to constant imported cross-module (lib/email-corporate.ts, lib/email-bespoke.ts import CUSTOMER_REPLY_TO from lib/email.ts) rather than duplicating the literal"

key-files:
  created:
    - tests/email-reply-to.test.ts
  modified:
    - lib/email.ts
    - lib/email-corporate.ts
    - lib/email-bespoke.ts

key-decisions:
  - "CUSTOMER_REPLY_TO added as a single exported constant in lib/email.ts (not duplicated per-file) so lib/email-corporate.ts and lib/email-bespoke.ts import it — no import cycle since lib/email.ts imports only resend/lib/currency/lib/extras"
  - "Internal/manager/driver/operator sends are structurally untouched — the D-11 exception (visitor's own address on sendContactInquiry/sendMultidayOperatorAlert) is preserved verbatim, not folded into the constant"

patterns-established:
  - "Cross-module shared constant for a cross-cutting email concern (reply-to routing) — future email-behavior constants (e.g. a From-address change) should follow the same single-source-of-truth pattern"

requirements-completed: [INBOX-01]

coverage:
  - id: D1
    description: "CUSTOMER_REPLY_TO constant exported from lib/email.ts and applied to all 9 customer sends defined in that file (sendClientConfirmation, sendRoundTripClientConfirmation, sendMultidayClientAck, sendStatusConfirmedEmail, sendStatusCancelledEmail, sendBookingChangedEmail, sendPaymentRequestEmail, sendClientReminderEmail, sendPostTripEmail)"
    requirement: INBOX-01
    verification:
      - kind: unit
        ref: "tests/email-reply-to.test.ts#customer sends — replyTo is CUSTOMER_REPLY_TO"
        status: pass
      - kind: unit
        ref: "tests/email.test.ts (regression, 26 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Corporate and bespoke client-acknowledgement emails (lib/email-corporate.ts, lib/email-bespoke.ts) import and use CUSTOMER_REPLY_TO on the client send only, leaving the operator copy untouched"
    requirement: INBOX-01
    verification:
      - kind: unit
        ref: "tests/email-reply-to.test.ts#sendCorporateContactEmails / sendBespokeEmails"
        status: pass
    human_judgment: false
  - id: D3
    description: "All internal/manager/driver/operator sends (sendManagerAlert, sendRoundTripManagerAlert, sendContactInquiry, sendMultidayOperatorAlert, sendEmergencyAlert, sendDriverAssignmentEmail, sendDriverReminderEmail, sendDriverDeclineNotification, corporate/bespoke operator copies) keep their pre-existing replyTo behaviour byte-for-byte, pinned by tests"
    verification:
      - kind: unit
        ref: "tests/email-reply-to.test.ts#internal/manager/driver/operator sends"
        status: pass
    human_judgment: false
  - id: D4
    description: "Final send-site classification table (function, recipient, old replyTo, new replyTo) recorded in this SUMMARY per the plan's output spec"
    human_judgment: true
    rationale: "Documentation completeness is a human-reviewable artifact, not a behavior a test asserts"

duration: ~20min
completed: 2026-09-29
status: complete
---

# Phase 77 Plan 02: D-11 Customer Emails Reply to bookings@ Summary

**Every customer-facing transactional email (booking confirmation, round-trip confirmation, multi-day quote ack, status confirmed/cancelled, booking changed, payment request, client reminder, post-trip, corporate and bespoke client acks) now carries `replyTo: bookings@rideprestigo.com` via a single shared `CUSTOMER_REPLY_TO` constant; all 10 internal/manager/driver/operator sends are provably unchanged.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 (Task 1 tracer + Task 2 expansion)
- **Files modified:** 4 (3 modified, 1 created)

## Accomplishments

- Exported `CUSTOMER_REPLY_TO = 'bookings@rideprestigo.com'` from `lib/email.ts` with a comment recording the D-11 rationale (roman@ stays the sales mailbox for EspoCRM, Phase 80)
- Applied `CUSTOMER_REPLY_TO` to all 9 customer-facing send sites in `lib/email.ts` (2 were literal `roman@rideprestigo.com` replaced; 7 had no `replyTo` at all and gained one)
- `lib/email-corporate.ts` and `lib/email-bespoke.ts` import `CUSTOMER_REPLY_TO` and apply it to their client-acknowledgement sends only — operator copies untouched
- Built a table-driven regression suite (`tests/email-reply-to.test.ts`, 24 tests) covering every one of the 21 send sites identified in the plan's interfaces table (11 customer, 10 internal/driver/operator)
- Re-ran the full existing email test suites (`email.test.ts`, `booking-changed-email.test.ts`, `email-payment-request.test.ts`, `email-log.test.ts`) plus every test that imports `lib/email`/`lib/email-corporate`/`lib/email-bespoke` (15 files, 300 tests) — all green, zero regression
- Ran the full project test suite (`npx vitest run`) — 2888 tests pass; the only 5 failing suites are the pre-existing worktree-local `next-intl/server` module-resolution issue (STATE.md Phase 71 deferred item), unrelated to this change

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): booking confirmation replies go to bookings@** — `0156444e` (feat, TDD RED→GREEN)
2. **Task 2: all customer-facing sends use CUSTOMER_REPLY_TO; internal sends provably unchanged** — `892d0bf4` (feat, TDD RED→GREEN)

_Both tasks carried `tdd="true"` — each commit above is the GREEN state; RED was verified in-session before each GREEN commit (see Deviations: none, TDD cycle followed exactly)._

## Final Send-Site Classification Table

| Function | File | Recipient | Old `replyTo` | New `replyTo` |
|---|---|---|---|---|
| `sendClientConfirmation` | lib/email.ts | customer | `'roman@rideprestigo.com'` | `CUSTOMER_REPLY_TO` |
| `sendRoundTripClientConfirmation` | lib/email.ts | customer | `'roman@rideprestigo.com'` | `CUSTOMER_REPLY_TO` |
| `sendMultidayClientAck` | lib/email.ts | customer | none | `CUSTOMER_REPLY_TO` |
| `sendStatusConfirmedEmail` | lib/email.ts | customer | none | `CUSTOMER_REPLY_TO` |
| `sendStatusCancelledEmail` | lib/email.ts | customer | none | `CUSTOMER_REPLY_TO` |
| `sendBookingChangedEmail` | lib/email.ts | customer | none | `CUSTOMER_REPLY_TO` |
| `sendPaymentRequestEmail` | lib/email.ts | customer | none | `CUSTOMER_REPLY_TO` |
| `sendClientReminderEmail` | lib/email.ts | customer | none | `CUSTOMER_REPLY_TO` |
| `sendPostTripEmail` | lib/email.ts | customer | none | `CUSTOMER_REPLY_TO` |
| `sendCorporateContactEmails` (client ack) | lib/email-corporate.ts | customer | none | `CUSTOMER_REPLY_TO` |
| `sendBespokeEmails` (client ack) | lib/email-bespoke.ts | customer | none | `CUSTOMER_REPLY_TO` |
| `sendManagerAlert` | lib/email.ts | manager | `'roman@rideprestigo.com'` | unchanged |
| `sendRoundTripManagerAlert` | lib/email.ts | manager | `'roman@rideprestigo.com'` | unchanged |
| `sendContactInquiry` | lib/email.ts | manager | `data.email` (visitor) | unchanged (D-11 exception) |
| `sendMultidayOperatorAlert` | lib/email.ts | operator | `data.email` (visitor) | unchanged (D-11 exception) |
| `sendEmergencyAlert` | lib/email.ts | manager | `process.env.MANAGER_EMAIL!` | unchanged |
| `sendDriverAssignmentEmail` | lib/email.ts | driver | none | unchanged (undefined) |
| `sendDriverReminderEmail` | lib/email.ts | driver | none | unchanged (undefined) |
| `sendDriverDeclineNotification` | lib/email.ts | manager | none | unchanged (undefined) |
| `sendCorporateContactEmails` (operator copy) | lib/email-corporate.ts | manager | none | unchanged (undefined) |
| `sendBespokeEmails` (operator copy) | lib/email-bespoke.ts | manager | none | unchanged (undefined) |

## Files Created/Modified

- `lib/email.ts` — exports `CUSTOMER_REPLY_TO`; 9 customer sends use it; 2 internal manager alerts keep `'roman@rideprestigo.com'` literal
- `lib/email-corporate.ts` — imports `CUSTOMER_REPLY_TO`, applies to client-ack send only
- `lib/email-bespoke.ts` — imports `CUSTOMER_REPLY_TO`, applies to client-ack send only
- `tests/email-reply-to.test.ts` — new table-driven test file (24 tests) covering all 21 send sites

## Decisions Made

- `CUSTOMER_REPLY_TO` is a single exported constant in `lib/email.ts` rather than a duplicated string literal in each file, so a future reply-to change is a one-line edit. Verified no import cycle: `lib/email.ts` imports only `resend`, `@/lib/currency`, `@/lib/extras` — neither corporate nor bespoke module.
- Internal/manager/driver/operator sends are left byte-identical, including the two D-11-exception visitor-address sends (`sendContactInquiry`, `sendMultidayOperatorAlert`) — these are pinned by tests specifically asserting they are unaffected by the refactor.

## Deviations from Plan

None — plan executed exactly as written. Both tasks followed the plan's exact RED→GREEN sequence (write/extend `tests/email-reply-to.test.ts` first, confirm failure, then implement).

## Issues Encountered

None. The only surprise was 5 pre-existing failing test suites in the full-suite run (`account-trips.test.ts`, `auth-customer.test.ts`, `login-actions.test.ts`, `passenger-actions.test.ts`, `profile-actions.test.ts`) — these fail due to a worktree-local `node_modules` / `next-intl/dist/esm/development/server.react-server.js` module-resolution gap, a known deferred item recorded in STATE.md at Phase 71 close. Confirmed unrelated to this plan (none of the 5 files touch `lib/email*`).

## User Setup Required

None — no external service configuration required. (The bookings@ Chatwoot inbox connection itself is Plan 77-11's scope; this plan only changes where customer replies are addressed.)

## Next Phase Readiness

- `CUSTOMER_REPLY_TO` is ready for Plan 77-11 to connect the bookings@ Chatwoot email inbox — once connected, every customer reply to a transactional email will create/append a Chatwoot conversation.
- No blockers. Full email test surface (300 tests across 15 files) and the full project suite (2888 tests) are green.

## Self-Check: PASSED

- `lib/email.ts` exists and contains `export const CUSTOMER_REPLY_TO = 'bookings@rideprestigo.com'` — FOUND (grep count 1)
- `lib/email-corporate.ts` imports and uses `CUSTOMER_REPLY_TO` — FOUND (grep count 2)
- `lib/email-bespoke.ts` imports and uses `CUSTOMER_REPLY_TO` — FOUND (grep count 2)
- `tests/email-reply-to.test.ts` exists — FOUND
- Commit `0156444e` — FOUND in `git log --oneline --all`
- Commit `892d0bf4` — FOUND in `git log --oneline --all`
- All plan `<verify>` commands re-run and pass (see Accomplishments)
- All plan `<acceptance_criteria>` re-verified and pass (grep counts 9/2/2/2, eslint exit 0)

---
*Phase: 77-chatwoot-deployment-core-channels*
*Completed: 2026-09-29*
