---
phase: 75-e2e-verification-launch
plan: 05
subsystem: payments
tags: [stripe, google-places, ga4, next-intl, zod, i18n]

requires:
  - phase: 75-e2e-verification-launch (plan 04)
    provides: "i18n/locales.ts normalizeSiteLocale -- the single allow-list this plan reuses for PaymentIntent metadata and the server GA4 site_locale param"
  - phase: 75-e2e-verification-launch (plan 03)
    provides: "scripts/qa/booking_e2e.py -- captured the pre-fix baseline (Stripe Elements locale + Google Places language both hardcoded to 'en') that this plan's regression check target"
provides:
  - "lib/booking-locale.ts: STRIPE_ELEMENTS_LOCALE (hi -> 'auto', no Hindi in Stripe) and PLACES_LANGUAGE (zh -> 'zh-CN' Simplified) maps -- the single source for both third-party locale vocabularies"
  - "bookingData.locale (Step6Payment client payload) -> metadata.locale (create-payment-intent, normalizeSiteLocale output) -> meta.locale (webhook) -- persists the booking's site locale on the PaymentIntent and the ABND unpaid-capture row input"
  - "Ga4PurchaseParams.siteLocale -- always emitted as events[0].params.site_locale (normalizeSiteLocale, default 'en') on the server-side GA4 Measurement Protocol purchase event"
  - "All three webhook sendGa4Purchase call sites (handleOneWaySucceeded, handleRoundTripSucceeded, handlePaymentLinkSucceeded) now pass siteLocale through -- one-way/round-trip from meta.locale, payment-link from the reconciled row's optional locale field"
  - "Step6Payment's Stripe Elements options.locale and AddressInputNew's Places `language` follow useLocale() through the new maps instead of a hardcoded 'en'"
  - "components/booking/AddressInput.tsx (the legacy component the live wizard actually calls) Places `language` also follows useLocale() through PLACES_LANGUAGE -- fixed post-completion, see Deviations"
  - "Stripe confirmPayment return_url built via the i18n getPathname bridge -- a /ru booking returns to /ru/book/confirmation, not the EN root"
affects: [75-17 (bookings.locale column, if chosen, feeds the payment-link row.locale accessor added here), 75-20 (re-run scripts/qa/booking_e2e.py post-deploy -- localeChecksPassed should flip true for all 7 locales)]

actuals:
  tokens: 10800
  tasks: 2
  commits: 6

tech-stack:
  added: []
  patterns:
    - "lib/booking-locale.ts: two independent Record<AppLocale, X> maps for two third-party locale vocabularies that don't line up with AppLocale 1:1 (Stripe has no Hindi; Google Places wants zh-CN not zh) -- single source of truth pattern extended from i18n/locales.ts to payment-adjacent third-party APIs"
    - "normalizeSiteLocale (Plan 04) reused at a NEW trust boundary (Stripe PaymentIntent metadata) and inside a shared library (lib/analytics-server.ts) rather than only at the route layer -- the allow-list travels with the value through Stripe's own round-trip (metadata -> webhook) rather than being re-validated ad hoc at each hop"
    - "getPathname({ locale, href }) from the i18n navigation bridge, called from client-side event-handler code (not just server components/pages) -- confirms the bridge is safe to call in Client Component handlers, not just render paths"
    - "Local per-test-file vi.mock('@stripe/react-stripe-js', ...) override of the global tests/setup.ts mock, to capture the `options` prop the global mock silently drops -- needed whenever a test asserts on Elements() props, not just that PaymentElement renders"

key-files:
  created:
    - lib/booking-locale.ts
    - tests/booking-locale.test.ts
    - tests/analytics-server.test.ts
    - tests/address-input-locale.test.tsx
  modified:
    - components/booking/steps/Step6Payment.tsx
    - components/booking/AddressInputNew.tsx
    - components/booking/AddressInput.tsx
    - app/api/create-payment-intent/route.ts
    - lib/analytics-server.ts
    - app/api/webhooks/stripe/route.ts
    - tests/create-payment-intent.test.ts
    - tests/webhooks-stripe.test.ts
    - tests/webhooks-stripe-checkout-session.test.ts
    - tests/Step6Payment.test.tsx
    - tests/AddressInput.test.tsx

key-decisions:
  - "PaymentLinkReconciledRow gained an optional `locale?: string | null` field read via a narrow typed accessor (row.locale ?? undefined) rather than an `as` cast -- the DB column does not exist yet (deferred to 75-17's human checkpoint), so the accessor is currently always undefined in production and normalizeSiteLocale's 'en' default carries the reconciliation path until the column ships."
  - "locale is read via useLocale() inside PaymentForm (the inner component that owns handleSubmit/confirmPayment), not passed down as a prop from Step6Payment -- both components are 'use client' and already inside the same NextIntlClientProvider tree, so calling the hook directly avoids a prop-drilling detour for a single value."
  - "Both the 3DS-redirect return_url and the non-3DS window.location.href success-branch assignment in handleSubmit were updated to the same localizedConfirmPath -- the plan's action text only mentioned the Stripe confirmParams.return_url, but leaving the second assignment on the un-prefixed confirmPath would have sent a same-request success (no 3DS bounce) back to the EN root for every non-EN locale, defeating the fix for exactly the common case."

requirements-completed: [VER-01]

coverage:
  - id: D1
    description: "Booking locale threads from Step6Payment through PaymentIntent metadata.locale (normalizeSiteLocale allow-list, invalid/missing input always -> 'en') to all three server-side GA4 purchase call sites via Ga4PurchaseParams.siteLocale (D-11)"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/create-payment-intent.test.ts -- 6 new D-11 tests (ru/missing/empty/xx/script-like -> metadata.locale, <=50 keys), all pass"
        status: pass
      - kind: unit
        ref: "tests/analytics-server.test.ts -- 4 tests (ar/missing/xx/always-present site_locale), all pass"
        status: pass
      - kind: unit
        ref: "tests/webhooks-stripe.test.ts + tests/webhooks-stripe-checkout-session.test.ts -- one D-11 test per call site (one-way ru, round-trip zh, payment-link es + undefined-fallback), all pass"
        status: pass
    human_judgment: false
  - id: D2
    description: "Stripe Elements options.locale and Google Places `language` follow the site locale via lib/booking-locale.ts maps (hi -> Stripe 'auto', zh -> Places 'zh-CN'); no hardcoded 'en' remains in any booking component -- including components/booking/AddressInput.tsx, the legacy component the live wizard actually calls, fixed in the post-completion deviation below (D-07)"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/booking-locale.test.ts -- 7 tests (map shape/keys/hi/zh), all pass"
        status: pass
      - kind: unit
        ref: "tests/Step6Payment.test.tsx -- 3 Elements-locale tests (ru/hi-auto/en), all pass"
        status: pass
      - kind: unit
        ref: "tests/address-input-locale.test.tsx -- 3 tests (zh/ar/en language, AddressInputNew), all pass"
        status: pass
      - kind: unit
        ref: "tests/AddressInput.test.tsx -- 3 tests (zh/ar/en language, legacy AddressInput used by the live wizard), all pass"
        status: pass
      - kind: other
        ref: "grep -rnE \"language:\\s*'en'\" components/booking/ -- returns nothing (exit 1), covers both AddressInputNew.tsx and AddressInput.tsx"
        status: pass
      - kind: other
        ref: "grep -nE \"locale:\\s*'en'\" components/booking/steps/Step6Payment.tsx -- returns nothing (exit 1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stripe confirmPayment return_url (both the 3DS redirect path and the non-3DS window.location.href success branch) is built through i18n getPathname, keeping the booking locale on return (e.g. /ru/book/confirmation) instead of the EN root"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/Step6Payment.test.tsx -- 2 return_url tests (ru-prefixed, en-unprefixed), all pass"
        status: pass
      - kind: other
        ref: "grep -n getPathname components/booking/steps/Step6Payment.tsx -- present at both call sites"
        status: pass
    human_judgment: true
    rationale: "The unit tests exercise the redirect: 'if_required' non-3DS success branch (jsdom does not support real cross-origin 3DS navigation); the actual 3DS-bounce return_url has not been exercised against a live Stripe test card that triggers 3D Secure. A human/QA pass against a 3DS test card per locale would close this gap fully; the code path is identical for both branches (same localizedConfirmPath variable) so the risk is low, not zero."

duration: 55min
completed: 2026-09-26
status: complete
---

# Phase 75 Plan 05: Booking Payment Locale (Stripe/Places/GA4) Summary

**Threaded the booking's site locale from the Step6Payment wizard through PaymentIntent metadata to all three server-side GA4 purchase events, and made Stripe Elements/Google Places/the Stripe return URL follow the site locale instead of being hardcoded to English.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-09-26T16:36:00Z (approx.)
- **Completed:** 2026-09-26T16:55:00Z
- **Tasks:** 2
- **Files modified:** 6 modified, 4 created (production + test code combined)

## Accomplishments

- `lib/booking-locale.ts` is the new single source for two third-party locale vocabularies that don't map 1:1 to the app's 7 `AppLocale`s: `STRIPE_ELEMENTS_LOCALE` (Stripe has no Hindi locale at all — `hi` maps to `'auto'` so Stripe follows the browser instead of forcing English) and `PLACES_LANGUAGE` (Google Places wants the Simplified-Chinese-specific tag — `zh` maps to `'zh-CN'`).
- `Step6Payment.tsx` sends `useLocale()` in `bookingData.locale`; `create-payment-intent`'s existing `.catchall(BOUNDED_STRING)` schema needed zero changes — it writes `locale: normalizeSiteLocale(bookingData.locale)` straight into the same `meta` map already reused for the Phase-62 unpaid-capture row, so the capture row and PaymentIntent metadata never drift apart.
- `Ga4PurchaseParams` gained `siteLocale?: string`; `sendGa4Purchase` always emits `events[0].params.site_locale` via `normalizeSiteLocale` (default `'en'`) regardless of whether the caller supplied a value.
- All three webhook `sendGa4Purchase` call sites now forward the locale: `handleOneWaySucceeded` and `handleRoundTripSucceeded` from `meta.locale`, `handlePaymentLinkSucceeded` from the reconciled row's new optional `locale` field (absent until Plan 75-17's human-gated schema decision — falls through to `'en'` until then).
- `Step6Payment`'s Stripe `Elements` `options.locale` and `AddressInputNew`'s Google Places `language` now read from `useLocale()` through the new maps — no hardcoded `'en'` remains in either file (verified by negative grep).
- The Stripe `confirmPayment` `return_url` — both the 3DS-redirect path and the non-3DS success branch — is built through the i18n `getPathname` bridge, so a `/ru` booking returns to `/ru/book/confirmation` instead of the EN root.
- Task 1 executed as `type="tracer"` (RED/GREEN TDD, real implementation, real `<verify>`); the tracer feedback gate (re-running Task 1's `<verify>` before starting Task 2) passed.

## Task Commits

Each task was committed atomically (RED then GREEN per `tdd="true"`):

1. **Task 1 RED — failing tests for PaymentIntent metadata.locale / GA4 site_locale** — `69b61cd9` (test)
2. **Task 1 GREEN — booking locale threaded to PaymentIntent metadata and all three webhook GA4 calls (D-11)** — `8bda15d6` (feat)
3. **Task 2 RED — failing tests for Stripe Elements locale, Places language, localized return_url** — `73cca4d5` (test)
4. **Task 2 GREEN — Stripe Elements/Places/return_url follow the site locale (D-07)** — `9821d371` (feat)
5. **Test cleanup — removed unused `screen` import (eslint) in Step6Payment.test.tsx** — `87b02f5d` (test)
6. **Post-completion fix — legacy AddressInput.tsx Places `language` follows site locale** — `de762ea0` (fix)

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified

- `lib/booking-locale.ts` — `STRIPE_ELEMENTS_LOCALE` / `PLACES_LANGUAGE` maps
- `components/booking/steps/Step6Payment.tsx` — `bookingData.locale`, `options.locale`, `getPathname`-built `return_url`
- `components/booking/AddressInputNew.tsx` — Places `language: PLACES_LANGUAGE[locale]`
- `app/api/create-payment-intent/route.ts` — `meta.locale = normalizeSiteLocale(bookingData.locale)`
- `lib/analytics-server.ts` — `Ga4PurchaseParams.siteLocale`, `site_locale` MP param
- `app/api/webhooks/stripe/route.ts` — `siteLocale` threaded through all 3 `sendGa4Purchase` call sites; `PaymentLinkReconciledRow.locale?`
- `components/booking/AddressInput.tsx` — Places `language: PLACES_LANGUAGE[locale]` (legacy component, live-wizard fix, see Deviations)
- `tests/booking-locale.test.ts`, `tests/analytics-server.test.ts`, `tests/address-input-locale.test.tsx` — new
- `tests/create-payment-intent.test.ts`, `tests/webhooks-stripe.test.ts`, `tests/webhooks-stripe-checkout-session.test.ts`, `tests/Step6Payment.test.tsx`, `tests/AddressInput.test.tsx` — extended

## Decisions Made

- `PaymentLinkReconciledRow.locale` is optional and read defensively (`row.locale ?? undefined`) rather than assumed present — the underlying `bookings.locale` column is a Plan 75-17 human-gated decision, not this plan's to make; the code is forward-compatible without a second edit once that column ships.
- `useLocale()` is called directly inside `PaymentForm` (not threaded as a prop from `Step6Payment`) since both are `'use client'` components already inside the same `NextIntlClientProvider`.
- Both `return_url` assignment sites in `handleSubmit` (3DS redirect and the non-3DS `window.location.href` success branch) were updated together — see Deviations below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Non-3DS success-branch redirect also needed the localized path**
- **Found during:** Task 2
- **Issue:** The plan's `<action>` text described building `return_url` for `stripe.confirmPayment`'s `confirmParams`, but `handleSubmit` has a second, un-mentioned assignment — `window.location.href = ...confirmPath` — fired when `paymentIntent.status === 'succeeded'` without a 3DS bounce (the common case for most cards). Leaving that second site on the un-prefixed `confirmPath` would have silently defeated D-07 for exactly the majority of successful payments (only the rarer 3DS-redirect path would have kept the locale).
- **Fix:** Both sites now read the same `localizedConfirmPath` variable, computed once via `getPathname({ locale, href: confirmPath })`.
- **Files modified:** `components/booking/steps/Step6Payment.tsx`
- **Verification:** `tests/Step6Payment.test.tsx`'s return_url tests exercise this exact branch (mocked `confirmPayment` resolves `{ paymentIntent: { status: 'succeeded' } }`, no `error`) and assert the localized URL.
- **Committed in:** `9821d371` (Task 2 GREEN commit)

**2. [Rule 1 - Bug, found post-completion] Task 2 fixed the wrong Places component — the live wizard calls `AddressInput.tsx`, not `AddressInputNew.tsx`**
- **Found during:** Coordinator follow-up review, after this plan's own completion report.
- **Issue:** `AddressInputNew.tsx` (fixed in Task 2, `9821d371`) is a Places-API-(New) replacement gated behind `NEXT_PUBLIC_USE_NEW_PLACES_API` and only wired into the homepage `BookingWidget`/`DayCard`. The actual booking wizard's Step 1 (`EntryBar.tsx`, and the shared `Step1TripType.tsx`/`Step3Vehicle.tsx`/`StopItem.tsx`/`DayCard.tsx` call sites) imports the legacy `components/booking/AddressInput.tsx` — confirmed by Plan 75-03's `booking_e2e.py` network-level capture (75-03-SUMMARY.md key-decisions) and by the coordinator. That file's `fetchAutocompleteSuggestions` call still hardcoded `language: 'en'`, so D-07's Google Places half did NOT actually hold in production for the live wizard after this plan's original completion — only the currently-dormant `AddressInputNew.tsx` path was fixed.
- **Fix:** Added `useLocale()` + `PLACES_LANGUAGE[locale]` to `AddressInput.tsx` (same map from `lib/booking-locale.ts`, same pattern as `AddressInputNew.tsx`), added `locale` to the `fetchSuggestions` `useCallback` dependency array. Admin usages (`ManualBookingForm`, `BookingsTable`) render under the non-localized `(internal)` route group, where `SiteChrome` resolves `getLocale()` to `'en'` — `PLACES_LANGUAGE['en'] === 'en'`, so their behavior is unchanged with zero special-casing.
- **Files modified:** `components/booking/AddressInput.tsx`, `tests/AddressInput.test.tsx`
- **Verification:** Extended `tests/AddressInput.test.tsx` with 3 tests (zh -> 'zh-CN', ar -> 'ar', en -> 'en') against `AddressInput`, mocking `@googlemaps/js-api-loader` and stubbing `window.google.maps.places`. Sanity-checked the tests actually catch the regression by temporarily reverting the fix locally (zh/ar tests failed as expected, en test still passed) before restoring and committing. `grep -rnE "language:\s*'en'" components/booking/` now returns nothing across BOTH Places components. Broader regression sweep (`EntryBar`, `BookingWidget`, `Step1TripType`, `Step3Vehicle`, `StopList`, `DurationSelector`, `BookingWizard` test files) — 74 passed, 0 new failures. `npx tsc --noEmit` and `npx eslint` clean on both changed files.
- **Committed in:** `de762ea0` (post-completion fix commit)

---

**Total deviations:** 2 auto-fixed (1 missing-critical fix, 1 bug found post-completion via coordinator follow-up).
**Impact on plan:** Deviation 1 was necessary for D-07 to actually hold for the common (non-3DS) payment success path. Deviation 2 was necessary for D-07 to hold at all in production — without it, the plan's Task 2 fix targeted a component the live wizard does not use, and the original completion report would have incorrectly claimed the Google Places half of D-07 was live. No scope creep in either case — same map, same pattern, no new surface.

## Issues Encountered

- The global `tests/setup.ts` mock for `@stripe/react-stripe-js` drops the `options` prop passed to `Elements`, which would have hidden exactly the prop (`locale`) this plan's tests needed to assert on. Resolved with a local, per-test-file `vi.mock('@stripe/react-stripe-js', ...)` override in `tests/Step6Payment.test.tsx` that captures `options` — standard Vitest per-file mock precedence, no change to the shared `tests/setup.ts`.
- `getPathname` from `@/i18n/routing` (a pure function, no React hooks) works correctly when called from Client Component event-handler code in the Vitest/jsdom environment without any additional mocking — confirmed by the passing `return_url` tests.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `lib/booking-locale.ts`, `meta.locale`, and `Ga4PurchaseParams.siteLocale` are ready inputs for Plan 75-17's `bookings.locale` column decision (if chosen) — the `PaymentLinkReconciledRow.locale` accessor added here will start returning real values with zero further code changes once that column exists and the reconciliation SELECT includes it.
- `scripts/qa/booking_e2e.py` (Plan 75-03) is the concrete regression check for D-07 — its pre-fix baseline (`localeChecksPassed: false` for every non-EN locale, both Stripe and Places locale hardcoded to `'en'`) is exactly what this plan's code should flip to `true` on a post-deploy re-run (Plan 75-20). With the post-completion fix to the legacy `AddressInput.tsx`, that check now targets the component the live wizard actually calls.
- The 3DS-redirect branch of the localized `return_url` (as opposed to the non-3DS success branch, which is unit-tested here) has not been exercised against a live Stripe test card that triggers 3D Secure — flagged as `human_judgment: true` on coverage D3. Low risk (same code path, same variable) but worth a QA pass in Plan 75-20's post-deploy verification.
- `AddressInputNew.tsx` (Places API New) remains dormant behind `NEXT_PUBLIC_USE_NEW_PLACES_API`, wired only into the homepage `BookingWidget`/`DayCard`; it was still fixed in Task 2 and is correct for when/if it's promoted to the wizard's Step 1.

## Self-Check: PASSED

All created files confirmed on disk (`lib/booking-locale.ts`, `tests/booking-locale.test.ts`, `tests/analytics-server.test.ts`, `tests/address-input-locale.test.tsx`, this SUMMARY.md). All 6 task commit hashes (`69b61cd9`, `8bda15d6`, `73cca4d5`, `9821d371`, `87b02f5d`, `de762ea0`) confirmed in `git log`. Plan-level `<verification>` re-run clean: all 8 relevant test files pass (112 passed, 33 pre-existing `it.todo` unaffected), `npx tsc --noEmit` shows only pre-existing unrelated errors in 3 other test files, `npx eslint` clean on all touched files, `grep -rnE "language:\s*'en'" components/booking/` returns nothing.

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-26*
