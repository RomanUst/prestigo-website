---
phase: 89-cancellation-policy-cash-guarantee-no-show
fixed_at: 2026-11-07T01:05:00Z
review_path: .planning/phases/89-cancellation-policy-cash-guarantee-no-show/89-REVIEW-public.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 89: Public-Surface Review Fix Report

**Base:** bb56ea2b on worktree branch `worktree-agent-afb751af3cb7550f4`
**Source review:** `89-REVIEW-public.md`
**Scope:** WR-01 to WR-04 and the trivial info items. CR-01 and WR-06 belong to the payments fixer. WR-05 needs no code.

**Gates run:** tsc (8 errors, all in `tests/`, the documented baseline), eslint on every touched file (clean), 14 touched suites (856 tests, green). Vitest ran through an untracked config with `preserveSymlinks` because the `node_modules` symlink breaks the `next-intl` react-server path in `vi.importActual`; the config is not committed.

## Fixed

### WR-02: CSP violation reports wrote manage and driver-trip links to the logs
**Commit:** 27a6eb4a (`security:`)
**Files:** `lib/csp-report-redact.ts` (new), `app/api/csp-report/route.ts`, `tests/csp-report-redact.test.ts` (new)
**Fix:** every string in the report, at any depth (classic `csp-report` and the Reporting API array shape), has the secret segment of `/manage/<x>` and `/driver/trip/<x>` replaced by `[redacted]`, with or without a locale prefix. Not just `document-uri` and `referrer`, so `blocked-uri`, `source-file` and unknown fields are covered. Test posts a real report to the route and asserts neither token reaches `console.warn`.

### WR-01: unpaid or abandoned pay-now rows were treated as paid
**Commit:** 298c94a3 (`security:`)
**Files:** `app/[locale]/account/trips/page.tsx`, `lib/manage-view.ts`, `tests/manage-page.test.tsx`
**Fix:**
- My trips skips `unpaid` rows before any token is minted (no Manage link for an unfinished checkout).
- The manage view counts a payment intent id as payment only once the row has left `unpaid` (`payNowPaid`). For an unpaid pay-now row: no "Paid by card", `freeMoney: none` (page says "Nothing has been charged"), no refund, no bank-delay note, no proposed fee. The status line already reads "Awaiting payment".
- Tests: view-model (unpaid vs the same row confirmed), the rendered page (no refund or "Paid by card" wording), My trips (no link, `ensureManageToken` not called).

**Not fixed here (other fixer's files, needs their attention):** `lib/payments/cancel.ts` (`refundsPayNow`) and `lib/payments/fee.ts` (`isFeeEligible`) still key on "pay-now with any PaymentIntent id". A client holding an older link or a direct POST on an `unpaid` row would still reach `refunds.create` on an unpaid PI and open a fee case. The public surface no longer offers the link or the promise, but the engine should also require `status !== 'unpaid'` (or `paid_at`). I also left `ensureManageToken` unchanged on purpose: gating it on status risks dropping the link from a confirmation email if the unpaid to confirmed flip races the send.

### WR-04: deadlines had no time-zone label
**Commit:** 06bb7fe1
**Files:** `lib/locale-date.ts`, `lib/payments/consent-text.ts`, tests (`locale-date`, `payments-consent`, `payments-emails`, `cancellation-policy-note`, `manage-page`)
**Fix:** `formatLocaleDateTime` now appends a localized Prague label, "12 November 2026, 14:30 (Prague time)". One change reaches every place at once: checkout note, stored consent text, all payment emails and the legacy-email policy box, the manage panel, cancelled summary and hold date. Labels (real translations, in the `PRAGUE_TIME_LABEL` map): en "Prague time", ru "по пражскому времени", es "hora de Praga", fr "heure de Prague", ar "بتوقيت براغ", hi "प्राग का समय", zh "布拉格时间".
The rendered consent text changed, so `CARD_CONSENT_VERSION` is now `2026-11-2`. The EN consent catalog strings did not change, so the EN digest pin for the new version equals the old digest. The label map is pinned to the version with its own digest in `tests/payments-consent.test.ts` (a label edit without a bump fails). Old bookings keep their stored text and version.
**Why a map and not a catalog key:** `formatLocaleDateTime` is called from the browser (consent), the server and emails with no translator; embedding the label in the formatted value keeps client text and stored text identical (the existing equality test still holds). Reviewer's alternative (`timeZoneName: 'short'`) gives "GMT+1" in several locales, which is not a Prague label.

### WR-03: emails said "Free cancellation until" a time already past
**Commit:** d7dee6b5
**Files:** `lib/payments/emails/send.ts`, `lib/payments/emails/render.ts`, `messages/{en,ru,es,fr,ar,hi,zh}.json`, `tests/payments-emails.test.ts`
**Fix:** `policyBoxFromRow` evaluates the window against now (as `/api/card-checkout/init` does) and sets `freeUntilPassed`. The box then uses new `PaymentEmails.policyBox.bodyNoFree` ("Free cancellation is not available for this trip. If you cancel, N% ...", no deadline), and the cash confirmation uses new `cardSaved.cashLineIfNeededNoFree` instead of "if you cancel after {freeUntil}". Covers the late-booking confirmation and the 24 h and 2 h reminders after the deadline. Both strings are translated in all 7 locales. Tests pin the clock (the old test also depended on the real date) and cover late booking, cash line, before/after the deadline, and all 7 locales.
Logic bug limitation: wording choice depends on "now" at send time, so a retried or re-driven send after the deadline switches wording. That is intended (the email must not promise a past moment) but is a behaviour worth a human glance.

## Info items

- **IN-01** (CSP and preconnect on `/manage`): skipped, not trivial (policy split in `middleware.ts` plus path-aware `SiteChrome`).
- **IN-02** (group email gives the payer a link per booking): skipped, an owner decision, no code.
- **IN-03** (pay-now step has no staleness check): skipped, needs a design choice (re-run init or cross-check).
- **IN-04** (bare `getLocale()` in `manage/[token]/loading.tsx`): skipped, no regression today and `loading.tsx` receives no `params`.

## Other findings

- **WR-05:** no code, per the task (087 is live, 088 ships with the deploy).
- **CR-01, WR-06:** the payments fixer's.

---

_Fixed: 2026-11-07_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
