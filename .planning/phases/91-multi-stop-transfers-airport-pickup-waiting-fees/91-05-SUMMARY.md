---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
plan: 05
subsystem: payments
tags: [consent, i18n, email, stripe, extras]
requires: []
provides:
  - "CARD_CONSENT_VERSION 2026-11-3, EXTRAS_CONSENT_VERSIONS and consentCoversExtras (lib/payments/consent-text.ts)"
  - "payment email kind extra_charged with variants waiting and other; vars extraMinutes, extraItem"
  - "catalog keys PaymentEmails.extraCharged.* and the extended Booking.step6.cardOnFile.consent* strings in 7 locales"
affects: [91-08 charge engine, 91-11 admin extras modal]
tech-stack:
  added: []
  patterns:
    - "version-set gate (consentCoversExtras) with a guard test that fails when the current version is not in the set"
    - "one dedicated client-facing operator text field (extraItem), escaped, never in subject"
key-files:
  created: []
  modified:
    - lib/payments/consent-text.ts
    - lib/payments/emails/render.ts
    - lib/payments/emails/send.ts
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - tests/payments-consent.test.ts
    - tests/payments-emails.test.ts
    - tests/payments-copy-i18n.test.ts
key-decisions:
  - "Consent version bumped to 2026-11-3; only versions in EXTRAS_CONSENT_VERSIONS may be charged an extra (D-12)"
  - "extraItem is the single operator-written string a client can see; reason and note still never render (T-89-13 kept)"
  - "Minutes in the waiting copy use the abbreviation (min / мин / 分钟) to avoid plural declension in ru"
duration: ~40min
completed: 2026-11-11
status: complete
actuals:
  tokens: 60000
  tasks: 2
  commits: 2
plan_head_before: 314895a9cdde2df330b014c5c854c544aebba44d
plan_head_after: 2fc9dcc4a6c6a37c3831b2aedf24a5bdc02cb652
---

# Phase 91 Plan 05: Consent covers extras and the extra_charged receipt Summary

The card consent in all 7 locales now ends with one sentence authorising a post-trip charge for waiting beyond the booked time and for agreed extras (version 2026-11-3), the server can tell which bookings consented via `consentCoversExtras`, and a localized `extra_charged` email shows the client the breakdown.

## What was done

**Task 1 (tracer, commit 53be7c5b):** appended the D-12 sentence to all six consent strings (`consentSetup`, `consentSetupNoFree`, `consentHoldNow`, `consentHoldNowNoFree`, `consentCash`, `consentCashNoFree`) in en, ru, es, fr, ar, hi, zh (hand translations). `CARD_CONSENT_VERSION = '2026-11-3'`, `EXTRAS_CONSENT_VERSIONS = new Set(['2026-11-3'])`, `consentCoversExtras` true only for a version in the set (false for 2026-11-2, 2026-11-1, 2026-11-draft-1, empty, null, undefined). The EN digest of the new strings is pinned in `tests/payments-consent.test.ts` (old entries kept), the Prague-label digest got a 2026-11-3 entry equal to the unchanged 2026-11-2 value, and a guard test fails if the current version is not in the extras set. A test that asserts every English variant ends with the exact sentence and stays under 2000 characters was added.

**Task 2 (commit 2fc9dcc4):** `extra_charged` kind with `waiting` and `other` variants in `render.ts` (receipt box: total charged, the minutes or item line, "a person at Prestigo approved this charge"), `extraMinutes` and `extraItem` in `PaymentEmailVars` and `PaymentEmailExtra`, passed through `emailVarsFromRow` and `sendPaymentEmail`. `PaymentEmails.extraCharged` added in 7 locales. A missing or blank minutes, item or amount makes the render throw instead of leaving an open parameter. The item is HTML-escaped, control characters flattened, never placed in the subject; it is rendered in a `dir="auto"` bdi.

## Verification

- `npx vitest run tests/payments-consent.test.ts tests/payments-emails.test.ts tests/payments-copy-i18n.test.ts tests/i18n-completeness.test.ts`: 542 passed.
- Ten other suites that reference the consent version (checkout, webhooks, admin panels, Step6CardOnFile) re-run after Task 1: 471 passed.
- `npx tsc --noEmit`: no error in `lib/`, `app/`, `components/` or the touched tests (baseline errors in other `tests/` files only).
- `npx eslint --quiet` on all touched ts files: clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing NoFree test broke on the new consent sentence**
- **Found during:** Task 1
- **Issue:** `tests/payments-consent.test.ts` asserted the NoFree variant does not contain `'after '`; the new sentence says "after my trip".
- **Fix:** the assertion now checks the real deadline wording (`'cancel after'` and the formatted free-until moment).
- **Files modified:** tests/payments-consent.test.ts
- **Commit:** 53be7c5b

**2. [Rule 2 - Missing critical] Guard that item is the only operator-text parameter**
- **Found during:** Task 2
- **Issue:** the allowed `{item}` parameter weakens the "no operator text in client mail" copy test.
- **Fix:** `tests/payments-copy-i18n.test.ts` now asserts exactly one catalog key (`PaymentEmails.extraCharged.lineOther`) carries `{item}`.
- **Commit:** 2fc9dcc4

The extraCharged keys needed no entry in the fee-wording allow-list (they contain no refund or cancellation-fee wording), so the allow-list is unchanged.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None. T-91-17 (consent version gate, 7 locales) and T-91-18 (escaped extraItem, not in subject, reason and note still never render) are mitigated as planned.

## Notes for downstream plans

- 91-08 must call `consentCoversExtras(booking.consent_version)` before any extra charge and send `sendPaymentEmail({ kind: 'extra_charged', variant, booking, eventKey: 'email:extra_charged:<chargeId>', feeMinor, extraMinutes?, extraItem? })`. The renderer needs `feeMinor` always, `extraMinutes` for `waiting`, a non-blank `extraItem` for `other`.
- Any future consent wording change needs a new version AND an entry in `EXTRAS_CONSENT_VERSIONS` (the guard test enforces the second).
- `node_modules` in this worktree is a symlink to the main checkout (git-ignored); no next-intl failures occurred through it.

## Self-Check: PASSED

- lib/payments/consent-text.ts, render.ts, send.ts, the 7 catalogs and 3 test files exist and are committed.
- Commits 53be7c5b and 2fc9dcc4 exist on branch worktree-agent-a1104089aa5719733.
