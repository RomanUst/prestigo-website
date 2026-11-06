---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 04
subsystem: payments
tags: [manage-link, token, email, i18n, cancellation-policy, security]
requires:
  - phase: 89-01
    provides: "booking_manage_tokens (deny-all), bookings.cancel_policy_version / cancel_policy (migration 087, live)"
  - phase: 89-03
    provides: "policyFromSnapshot, evaluateCancellation, proposedFeeMinor, tripFactsFromRow"
provides:
  - "lib/manage-link.ts: ensureManageToken, resolveManageToken, buildManageUrl, revokeManageToken, MANAGE_TOKEN_RE"
  - "cancellation box and outlined Manage booking button in card_saved and both hold_placed emails, gated by the booking's stored policy"
  - "PaymentEmails.policyBox.{label,body} and PaymentEmails.manage.{cta,note} in 7 locales"
  - "FEE_WORDING_ALLOWED positive allow-list replacing the Phase 88 blanket ban"
  - "formatLocaleDateTime (Prague wall clock, Latin digits) and lib/no-show-wait.ts"
affects: [89-05, 89-07, 89-08, 89-25, manage-page, my-trips]
tech-stack:
  added: []
  patterns:
    - "bearer token in a deny-all table, regex before any query, one identical null for every invalid reason"
    - "stored-terms gate: no cancel_policy_version means no token, no box, no button"
key-files:
  created:
    - lib/manage-link.ts
    - lib/no-show-wait.ts
    - tests/manage-link.test.ts
  modified:
    - lib/payments/emails/render.ts
    - lib/payments/emails/send.ts
    - lib/no-show.ts
    - lib/locale-date.ts
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - tests/payments-emails.test.ts
    - tests/payments-copy-i18n.test.ts
    - tests/locale-date.test.ts
key-decisions:
  - "ensureManageToken reads first, inserts, ignores only 23505 and reads again: two concurrent calls end with one token without an upsert; a revoked token is never re-minted (revoke is deliberate)"
  - "resolveManageToken uses two plain queries (token, then booking) instead of a PostgREST join, so the same code runs on the fake DB; any read problem also answers null"
  - "The cancellation box and the button render only for templates flagged policyBox (card_saved, hold_placed at_checkout and scheduled); charged and payment_failed never carry them, and the sender mints no token for those kinds"
  - "emailVarsFromRow became async and exported (it needs the token and the wait thresholds); failures drop the box or the button, never the email; a non-https site URL drops the button"
  - "No-show wait helpers moved to lib/no-show-wait.ts and re-exported from lib/no-show.ts, because importing lib/no-show.ts into the payment sender would pull the status service into an import cycle"
  - "The cash sentence of UI-SPEC 8.1 is not built here: no cash booking exists yet; plan 89-25 adds its key together with the cash variants"
requirements-completed: [CANC-02, HOLD-06]
status: complete
completed: 2026-11-06
commits: 2
plan_head_before: 6ab3ca5b768495670ca81ee2f8bcb0962dbeec1b
plan_head_after: 58d6a8e21b98fcbad09dae0398701700b57686a9
actuals:
  tokens: 15000
  tasks: 2
  commits: 2
---

# Phase 89 Plan 04: Manage link token and the policy box in the confirmation emails Summary

**A 256-bit manage token per booking (deny-all table, uniform null on every invalid reason) flows into card_saved and hold_placed emails as an outlined Manage booking button plus a cancellation box, in all 7 locales, only for bookings that stored a policy.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | manage token to card_saved email, box and button in English | f0453ca3 |
| 2 | translations in ru, es, fr, ar, hi, zh and the positive allow-list | 58d6a8e2 |

Tracer verified end to end: `emailVarsFromRow` on a seeded stored-policy booking mints a token in the fake `booking_manage_tokens`, builds `https://rideprestigo.com/manage/<43 chars>`, derives free-until, percent, fee and wait from the stored snapshot, and `renderPaymentEmail('card_saved', 'en', vars)` contains the button and the box. A NULL-policy booking gets neither and no token row. Expansion to the other locales followed only after that passed.

## What was built

- `lib/manage-link.ts`: `MANAGE_TOKEN_RE` (`^[A-Za-z0-9_-]{43}$`), `newManageToken` (`randomBytes(32).toString('base64url')`), `ensureManageToken(bookingId)` (null for no stored policy, partner `booking_source = 'gnet'`, anonymised, unknown id or revoked token), `resolveManageToken(token)` (regex first, no database call for malformed input; null for unknown, revoked, anonymised, partner, pickup more than 30 days past, or a read error; updates `last_used_at`), `buildManageUrl(token, locale)` (`getPathname`, site URL trimmed so a trailing newline cannot break links), `revokeManageToken`. A token is never logged.
- `render.ts`: `PaymentEmailVars.manageUrl` and `.policy` (`PolicyBoxVars`: `freeUntilMs`, `percent`, `feeAmountMinor`, `waitMin`). Cancellation box in the standard box recipe below the journey table; outlined Manage booking button (1px `#BFA06A`, `#E6D6B0` text, 14px, padding 16px 32px) after Add to calendar, 16px apart, with the 11px private-link line. `freeUntil` is isolated in `<bdi dir="auto">`, other parameters in `<bdi dir="ltr">`. The header comment now states the allow-list.
- `send.ts`: `policyBoxFromRow` and `manageUrlFromRow` gated on `cancel_policy_version`; wait from `getNoShowThresholds` plus `isAirportPickup`; fee from `proposedFeeMinor` on the stored percent.
- `lib/locale-date.ts`: `formatLocaleDateTime(ms, locale)`, Europe/Prague wall clock, 24-hour, Latin digits (checked for all 7 locales and across a DST change).
- Catalog: `PaymentEmails.policyBox.label/body` and `PaymentEmails.manage.cta/note`, translated in-session, formal register, parameters and brand untouched, no typed number.
- `tests/payments-copy-i18n.test.ts`: the blanket ban is `FEE_WORDING_ALLOWED` (exactly the two box keys, closed set); every other leaf in every locale must stay free of fee and refund wording. Plan 89-25 extends the list.

## Verification

- `npx vitest run tests/manage-link.test.ts tests/payments-emails.test.ts tests/payments-copy-i18n.test.ts tests/locale-date.test.ts`: 223 passed.
- `tests/driver-no-show.test.ts`, `tests/payments-{tick,settle,hold,engine-gates,review-engine}.test.ts`, `tests/admin-payment-api.test.ts`, `tests/i18n-{completeness,freeze-manifest,catalog-array-types,translate-manifest,translate-dnt}.test.ts`: green.
- `npx tsc --noEmit`: no error outside `tests/`; `npx eslint --quiet` on every touched file exits 0.
- `grep -c "randomBytes(32)" lib/manage-link.ts` prints 1; `grep -cE "console\.[a-z]+\(.*token" lib/manage-link.ts` prints 0; `git diff --stat -- scripts/` is empty.
- Full suite not run in this plan (the worktree used the symlinked node_modules; no next-intl server module failure appeared).

## Deviations from Plan

**1. [Rule 3 - Blocking] No-show wait helpers extracted to `lib/no-show-wait.ts`**
- **Found during:** Task 1
- **Issue:** The box needs the city / airport wait. `getNoShowThresholds` and `isAirportPickup` lived in `lib/no-show.ts`, whose imports (status service, outbox, `next/server`) would form a cycle with the payment engine if the sender imported it.
- **Fix:** Moved both functions unchanged into `lib/no-show-wait.ts`; `lib/no-show.ts` imports and re-exports them, so existing importers and tests are untouched.
- **Files modified:** lib/no-show-wait.ts, lib/no-show.ts
- **Commit:** f0453ca3

**2. [Rule 2 - Missing critical functionality] `formatLocaleDateTime`**
- The box must show the free-until instant with its clock time on the Prague wall clock; `formatLocaleDate` is date-only (UTC). Added the helper with tests rather than formatting inline.
- **Commit:** f0453ca3

**3. [Plan note] `emailVarsFromRow` is now async and exported**
- It needs the service client for the token and the wait. The only caller (`sendPaymentEmail`) awaits it inside its existing render try block.

Process note: the plan-head ledger file could not be written under the sandbox, so `plan_head_before` is the known dispatch base and `commits` was measured with `git rev-list --count 6ab3ca5b..HEAD` (2 before this SUMMARY commit).

## Notes for the orchestrator and later plans

- Between the two commits (f0453ca3 and 58d6a8e2) the six non-English catalogs lacked the new keys, so `tests/payments-copy-i18n.test.ts` was red at the first commit by design (EN keys only in Task 1); the branch tip is green.
- Nothing is visible to a client yet: `cancel_policy_version` is written only by plan 89-07 while the policy is public.
- Plan 89-05 (manage page) can call `resolveManageToken` directly; the URL shape `/manage/<token>` and `/<locale>/manage/<token>` is now a contract with delivered emails (D-02).
- Plan 89-25 adds the cash sentence, the new email kinds and extends `FEE_WORDING_ALLOWED`; the other reminder and `lib/email.ts` confirmation emails (English only) do not carry the button yet.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model: T-89-11 (256-bit token, regex before any query), T-89-12 (one null for every invalid reason, asserted by test, token never logged), T-89-14 (every user string passes the existing escaping shell; box and button text come from the catalog; manage URL must be https).

## Self-Check: PASSED

- lib/manage-link.ts, lib/no-show-wait.ts, tests/manage-link.test.ts: FOUND
- commits f0453ca3 and 58d6a8e2: FOUND on branch worktree-agent-af2cc9f565346f6ac
