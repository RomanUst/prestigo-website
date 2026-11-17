---
phase: 92-quotes
plan: 02
subsystem: payments
tags: [quotes, tokens, deposit, cancellation, pure-functions]
requires: []
provides:
  - lib/quotes vocabulary, row types, token, status, money and terms modules
  - POLICY_BOUNDS.quoteHours (0..720) and the quote- snapshot branch in policyFromSnapshot
affects: [92-03, 92-05, 92-06, 92-08, 92-09]
tech-stack:
  added: []
  patterns: [hash-only secret link, one link-validity function, largest-remainder allocation, quote- policy snapshot prefix]
key-files:
  created:
    - lib/quotes/vocabulary.ts
    - lib/quotes/types.ts
    - lib/quotes/token.ts
    - lib/quotes/status.ts
    - lib/quotes/money.ts
    - lib/quotes/terms.ts
    - tests/quotes-token.test.ts
    - tests/quotes-status.test.ts
    - tests/quotes-money.test.ts
    - tests/quotes-terms.test.ts
  modified:
    - lib/cancellation-policy.ts
    - tests/cancellation-policy.test.ts
key-decisions:
  - "Empty custom fee percent on a quote means 100% of the deposit; empty free hours means the global policy's hours for the first trip (D-06, D-11)"
  - "resolveQuotePolicy throws RangeError on out-of-range custom hours or percent instead of clamping (money and terms are never guessed)"
  - "QUOTE_POLICY_VERSION_PREFIX is defined in lib/cancellation-policy.ts (to avoid an import cycle) and re-exported from lib/quotes/terms.ts"
  - "Quote snapshot version is 'quote-' + the global policy version"
status: complete
commits: 3
plan_head_before: 6325ca5e50e19adb7b7cf63038485cfc259b9250
plan_head_after: 8476cdbc8764b6e1b903fb1ca07e25d991350dda
actuals:
  tokens: 21000
  tasks: 3
  commits: 3
metrics:
  completed: 2026-11-14
---

# Phase 92 Plan 02: Quote pure rules Summary

Pure rule modules for quotes: 256-bit hash-only secret link token, one link-validity function (`quoteLinkState`), deposit maths with proportional largest-remainder allocation and Stripe floors, the remainder-to-booking-mode table, and the quote cancellation snapshot with a 720-hour bound.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1 (tracer) token, reference, link validity | 56ac3811 | 32 tests, DST dates 2027-03-28 and 2027-10-31 |
| 2 deposit, allocation, floors, mode, remainder due | 057eb569 | 29 tests |
| 3 quote terms and the 720-hour bound | 8476cdbc | policyFromSnapshot quote- branch (D-13) |

## Behaviour notes

- `quoteLinkState`: `'offer'` for sent / viewed / accepted with a current unrevoked link, no past expiry and a first pickup in the future (a quote with no readable pickup is not an offer); `'paid'` for paid and not cancelled regardless of expiry and pickup (still requires a current, unrevoked link); `null` otherwise. A quote whose `expires_at` equals now counts as expired.
- `validateVersionMoney` order: no_lines, amount_invalid, deposit_zero, deposit_above_total, deposit_below_minimum, remainder_below_minimum. A non-integer deposit is reported as `amount_invalid`. `saved_card` and `cash` check every non-zero line remainder against the floor; `payment_link` checks the total remainder; `invoice` has no floor.
- `lib/cancellation-policy.ts`: only snapshots whose `version` starts with `quote-` may hold up to 720 free hours. Non-quote snapshots above 72 hours still fall back to the legacy policy (tests with 73 for plain, `quote` and `2026-quote-1` versions). Ordinary bookings behave exactly as before; all existing cancellation tests are green.
- `keptDepositMinor` returns 0 for a zero deposit (proposedFeeMinor alone would return 1).

## Verification

- `npx vitest run` on the five new / extended files plus `cancellation-wording`, `payments-cancel`: 7 files, 305 tests passed. Also green: `email-policy-block`, `payments-emails`, `booking-policy-snapshot`, `payments-fee-webhook`, `cancellation-policy-settings` (546 tests).
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/` (`i18n-translate-dnt`, `nav-auth`, `passenger-actions`); none in `lib/quotes`, `lib/cancellation-policy` or `tests/quotes-*`.
- `npx eslint --quiet` on all touched files: clean.

## Deviations from Plan

None - plan executed as written. Two small choices beyond the plan text: `resolveQuotePolicy` throws on out-of-range custom values (callers must validate first), and the version-prefix constant lives in `cancellation-policy.ts` and is re-exported from `terms.ts` because `terms.ts` already imports that module.

TDD note: the failing (RED) run was observed for tasks 1 and 3; for task 2 the test file was written before `money.ts` but the RED run was skipped and it went straight to green.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or schema change; T-92-05, T-92-06, T-92-07, T-92-08 are covered by the tests above.

## Worktree artefacts

No test failed to load because of the symlinked `node_modules` in this plan's files.

## Self-Check: PASSED

All twelve plan files exist; commits 56ac3811, 057eb569 and 8476cdbc are on the branch.
