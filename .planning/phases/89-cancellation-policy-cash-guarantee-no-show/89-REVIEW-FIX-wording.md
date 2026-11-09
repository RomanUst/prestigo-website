---
phase: 89-cancellation-policy-cash-guarantee-no-show
fixed_at: 2026-11-09T19:10:00Z
review_path: .planning/phases/89-cancellation-policy-cash-guarantee-no-show/89-REVIEW-wording.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 89 (wave 10 wording): Code Review Fix Report

**Fixed at:** 2026-11-09T19:10:00Z
**Source review:** .planning/phases/89-cancellation-policy-cash-guarantee-no-show/89-REVIEW-wording.md
**Iteration:** 1
**Branch:** feat/89-wording (commits made in an isolated worktree and fast-forwarded onto the branch; not pushed)

**Summary:**
- Findings in scope: 6 (CR-01, WR-02, WR-03, WR-04, WR-07, WR-08, as selected by the caller)
- Fixed: 6
- Skipped: 0
- Out of scope and still open: WR-01, WR-05, WR-06, IN-01, IN-02, IN-03, IN-04

Every content change is in all 7 locales (en ru es fr ar hi zh), with native wording written for each locale. No English copies and no stubs were used, and `scripts/i18n-translate.mjs` was not run. No price and no `€` was added to `app/` or `components/`.

## Fixed Issues

### CR-01: The flight-delays FAQ still promised "free cancellation up to one hour before pickup"

**Files modified:** `content/pages/{en,ru,es,fr,ar,hi,zh}/faq/flight-delays.json`, `tests/public-cancellation-wording.test.ts`
**Commit:** 1dc87aa7
**Applied fix:**
- The sentence now names no number. It sends the client to the deadline, using the same wording as the book FAQ in each locale. EN: "If you decide not to travel, you can still cancel free of charge until the deadline shown at checkout and in your confirmation email."
- The `[slug]` landing pages do not go through `fillPolicyDeep`, so the policy variables were not used here.

**Guard changes:**
- `EN_FILES` now reads every `content/pages/en/faq/*.json` and `services/*.json`.
- `OLD_PHRASES` gained two patterns: `(one|1) hour(s) before (the) (scheduled) pickup` and `cancel… (one|1) hour`.
- New per-locale check: the one-hour rule as each translation spelled it ("за час до подачи", "una hora antes de la recogida", "une heure avant la prise en charge", "ساعة واحدة قبل موعد الاستقبال", "पिकअप से एक घंटा पहले", "接送前一小时"). It runs over every faq and services file and the book, routes and contact pages of each locale.
- The editorial paragraph is a new surface, so translations are also checked key by key.
- Negative check: the guard was run against the old text and failed it (3 failures).

### WR-02: The book page payment FAQ contradicted the live card and cash flow

**Files modified:** `content/pages/{en,ru,es,fr,ar,hi,zh}/book.json` (`faq.items[1].a`), `tests/public-cancellation-wording.test.ts`, `tests/__snapshots__/book-page-render.test.tsx.snap`
**Commit:** 3b822dfb
**Applied fix:**
- The answer now matches `CARD_FLOW_TRIP_TYPES` (transfer, hourly), Step6CardOnFile, the checkout strings and the terms:
  - For a one-way transfer or an hourly ride, the client chooses at checkout. One option is to pay by card after the trip: the card is saved with Stripe, the fare is held before pickup and charged after the trip. The other is to pay cash to the driver: the card is saved only as a guarantee and nothing is charged if the driver is paid as agreed.
  - Round trips and daily hire are paid in full by card when booking.
- Removed "charged at the moment you confirm" and "We do not accept cash inside the vehicle". The no-extra-payment line now reads "The driver never asks you for more than the agreed fare".
- The corporate invoice, tipping and receipts sentences are unchanged. The answer has no prices and no comparisons.
- The item was added to `SURFACES`, with EN assertions on the new flow.
- The /book EN golden snapshot was updated. Its diff is only this answer.

### WR-03: The terms and FAQ said every booking saves a card

**Files modified:** `content/pages/{en,ru,es,fr,ar,hi,zh}/terms.json` (`section4.items[3].desc`), `content/pages/{…}/faq.json` (`sections[3].faqs[3].a`), `tests/cancellation-wording.test.ts`
**Commit:** 8cf12297
**Applied fix:**
- Terms: "When you book a one-way transfer or an hourly ride, we save your card with Stripe as a guarantee, whether you pay by card after the trip or in cash to the driver. Round trips and daily hire are paid in full by card when you book, and no card is saved for them."
- The operator-only charge sentence now excludes the regular fare of a card-after-trip booking. Without that, the sentence would contradict the card flow.
- FAQ ("Why is my card saved if I pay cash…"): added that cash is offered for one-way transfers and hourly rides, and that round trips and daily hire are paid by card when booking.
- Checked: pay-now (create-payment-intent) sets no `setup_future_usage`. Only the card-flow PaymentIntent in `lib/payments/checkout.ts` saves the card, so "no card is saved" for round trips and daily hire is accurate.

### WR-04: A 0-hour window rendered as "up to 0 hours before pickup"

**Files modified:** `content/pages/{en,ru,es,fr,ar,hi,zh}/terms.json` (`section4.items[0].desc`), `content/pages/{…}/faq.json` (`sections[3].faqs[0].a`), `tests/cancellation-wording.test.ts`, `tests/legal.test.ts`
**Commit:** c475e448
**Applied fix:**
- Each hour plural block now holds the whole window phrase in every arm, with an `=0` arm that matches llms ("until the pickup time"). Wrapping only the number would have produced "up to until the pickup time before pickup".
- The `=0` arm in each locale:

| Locale | `=0` arm |
|---|---|
| en | until the pickup time |
| ru | вплоть до времени подачи |
| es | hasta la hora de recogida |
| fr | jusqu'à l'heure de prise en charge |
| ar | حتى موعد الاستقبال |
| hi | पिकअप के समय तक |
| zh | 接送时间之前 |

- zh used plain numbers before, so it now has a plural block too.
- The existing plural assertions still pass: ru 1/3/12, ar one/two/few/many, fr singular, and the EN "up to 3 hours before pickup on trips of up to 250 km".
- New tests:
  - With all windows at 0, no "0" appears in any locale and the until-pickup phrase appears 3 times.
  - With one window at 0, the other windows still show hours.
  - The rendered EN terms and FAQ pages, with `getPolicyNumbers` inputs stubbed to 0, show no "0 hour".
- The digit guards now ignore `=N {` arm selectors, which are syntax, not typed numbers.
- The EN verbatim spot-check in `tests/legal.test.ts` was updated.

### WR-07: Saving a policy or wait setting did not revalidate terms, FAQ or llms

**Files modified:** `app/api/admin/settings/route.ts`, `tests/admin-settings.test.ts`
**Commit:** 79c65af3
**Applied fix:**
- Trigger: a successful update that touches any `cancel_*` or `noshow_wait_*` key.
- Calls made:
  - `revalidatePath('/[locale]/terms', 'page')` and `revalidatePath('/[locale]/faq', 'page')`. This is the same dynamic-segment pattern the price routes use with `'/[locale]'`, and it covers every locale.
  - `revalidatePath('/llms.txt')` and `revalidatePath('/llms-full.txt')`.
- A purge that throws is logged and does not turn the saved setting into a 500.
- Tests (`next/cache` mocked):
  - Each of the 7 published keys purges exactly the four paths.
  - Card-flow, hold, notification and dispatch keys purge nothing.
  - A failed update and a 422 purge nothing.
  - A throwing purge still returns `{ ok: true }`.

### WR-08: The dialog's safe button said "Keep owner test only" when the mode was Off

**Files modified:** `components/admin/CardFlowSettings.tsx`, `tests/CardFlowSettings.test.tsx`
**Commit:** 429bca3c
**Applied fix:**
- The label is now `mode === 'off' ? 'Keep card payment off' : 'Keep owner test only'`.
- The admin panel uses hard-coded English strings with no `messages/*.json` keys, so no translation was needed.
- Tests:
  - From Off, the button reads "Keep card payment off", holds the initial focus, closes without saving and leaves Off checked.
  - From the canary, the label is unchanged.

## Open (out of scope for this run)

- **WR-01:** the public terms, FAQ and llms are not gated by `card_flow_mode`. There is also no "bookings made before 9 November 2026" clause.
- **WR-05:** "60 minutes" of airport waiting is still typed in `services/airport-transfer.json` (lines 42, 66, 132) and in `faq/flight-delays.json`.
- **WR-06:** an ISR revalidation that hits a DB error republishes the default numbers.
- **IN-01..IN-04:** not addressed.
- **Related, not fixed:** the answer to "How can I pay?" in `content/pages/*/services/prague-airport-taxi.json` (faqs[7]) still names only card and bank transfer, and does not mention cash to the driver. The review mentions it under WR-02, but it was not in this run's scope.

## Verification

All gates ran in the isolated worktree (`.claude/worktrees/rf-89-90331-…`), using the main checkout's `node_modules` binaries. The commits were then fast-forwarded onto `feat/89-wording`, so the same tree is now the branch tip.

| Check | Result |
|---|---|
| `tsc --noEmit` | 8 errors, all baseline errors in `tests/` (i18n-translate-dnt, nav-auth, passenger-actions); none in changed files |
| `eslint --quiet` on changed ts/tsx | clean |
| Related tests (16 files, 1055 tests) | pass |
| Pre-commit (price and secret gates) | passed on every commit |

The 16 test files: public-cancellation-wording, cancellation-wording, legal, admin-settings, CardFlowSettings, book-page-render, routes-hub-render, content-locale-parity, i18n-freeze-manifest, static-pages-locale, force-static-metadata, pages-a, business-number-guard, llms-content, no-show-wait-settings, cancellation-policy-settings.

The content fixes (CR-01, WR-02, WR-03, WR-04) change legal and payment wording. A human should read them before they reach production.

---

_Fixed: 2026-11-09T19:10:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
