---
phase: 70-string-externalization-booking-account
reviewed: 2026-09-05T00:00:00Z
depth: standard
files_reviewed: 35
files_reviewed_list:
  - app/[locale]/account/actions.ts
  - app/[locale]/account/page.tsx
  - app/[locale]/account/reset-password/page.tsx
  - app/[locale]/account/trips/page.tsx
  - app/[locale]/login/actions.ts
  - app/[locale]/login/page.tsx
  - components/account/ProfileForm.tsx
  - components/auth/OAuthButtons.tsx
  - components/booking/AddressInput.tsx
  - components/booking/AddressInputNew.tsx
  - components/booking/BookingSummaryBlock.tsx
  - components/booking/BookingWidget.tsx
  - components/booking/BookingWizard.tsx
  - components/booking/DayCard.tsx
  - components/booking/DurationSelector.tsx
  - components/booking/EntryBar.tsx
  - components/booking/MultiDayForm.tsx
  - components/booking/PriceSummary.tsx
  - components/booking/ProgressBar.tsx
  - components/booking/RouteMap.tsx
  - components/booking/Stepper.tsx
  - components/booking/StickyBookingPanel.tsx
  - components/booking/StopItem.tsx
  - components/booking/StopList.tsx
  - components/booking/TripTypeTabs.tsx
  - components/booking/VehicleCard.tsx
  - components/booking/VehicleSlideshow.tsx
  - components/booking/steps/Step1TripType.tsx
  - components/booking/steps/Step2DateTime.tsx
  - components/booking/steps/Step3Auth.tsx
  - components/booking/steps/Step3Vehicle.tsx
  - components/booking/steps/Step4Extras.tsx
  - components/booking/steps/Step5Passenger.tsx
  - components/booking/steps/Step6Payment.tsx
  - types/booking.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 70: Code Review Report

**Reviewed:** 2026-09-05
**Depth:** standard
**Files Reviewed:** 35
**Status:** issues_found

## Summary

This is the STR-02 string-externalization phase: hardcoded English UI strings in the
booking wizard and account/login surfaces were moved into `messages/en.json` catalog
namespaces and rendered via `useTranslations` / `getTranslations`, with English output
intended byte-for-byte unchanged.

I focused adversarially on the five risk areas called out in the brief: behavioral drift
beyond string sourcing, locale-threading correctness for Server Actions, un-externalized
leftover strings, named-ICU / `t.rich` interpolation correctness, and the Stripe Elements
`locale: 'en'` literal.

The mechanical externalization is high quality. I verified every literal `t('...')` key
used across all 34 non-type files resolves in `messages/en.json` (zero missing keys), the
dynamic key families (`vehicleClasses.*`, `extras.*`, `step5.status*`, `included.*`,
`Errors.*`, `Auth.inWizard.*`, `Booking.validation.*`) all resolve, ICU plural/named-arg
messages reproduce the previous English output (`classPax`, `hoursOption`, `charCount`,
`delayMinutes`, etc.), the `t.rich` sites (`removeConfirm`, `leadTimeNotice`, `codeSentTo`)
keep the markup structure, and the `VEHICLE_CONFIG.label` field removal is followed at
every call site (no dangling `.label` references remain). All five Server Actions in
`login/actions.ts` and the four in `account/actions.ts` take a leading `locale` param and
are bound with `.bind(null, locale)` at every `useActionState` call site. Stripe Elements
`locale: 'en' as const` remains literal in `Step6Payment.tsx:376`.

No correctness, security, or data-loss defects were found. Three externalization-quality
defects are flagged: one hardcoded string that has an orphaned catalog key already prepared
for it, one family of user-facing badge strings never externalized, and one fragile
index-paired label array.

## Warnings

### WR-01: "Loading payment..." left hardcoded despite a prepared catalog key

**File:** `components/booking/steps/Step6Payment.tsx:570`
**Issue:** The payment-loading placeholder still renders the literal `Loading payment...`
JSX text node. The catalog already contains `Booking.step6.loadingPayment` = `"Loading
payment..."` (present in all seven locale files), which was clearly created for this exact
string but never wired up — an orphaned key. Every other user-facing string in this file was
externalized (`t('loading')` is used for the pay-button label right above, `t('remove')`,
`t('applyCode')`, etc.). Consequence: once the translation phase populates locale files, this
string will silently remain English in RU/ES/FR/AR/HI/ZH. This is the exact defect class the
phase exists to prevent.
**Fix:**
```tsx
// Step6Payment.tsx ~line 570 (the `: (` branch after {paymentError})
<p style={{ /* unchanged */ }}>
  {t('loadingPayment')}
</p>
```

### WR-02: Place-type badge labels (AIRPORT/HOTEL/TRAIN/TRANSIT) never externalized

**File:** `components/booking/AddressInput.tsx:310-317` (rendered at `:480`) and
`components/booking/AddressInputNew.tsx:387-399` (rendered at `:400`)
**Issue:** The autocomplete suggestion rows render a visible uppercase category badge from a
hardcoded `PLACE_TYPE_LABELS` map (`airport → 'AIRPORT'`, `lodging → 'HOTEL'`,
`train_station → 'TRAIN'`, `transit_station → 'TRANSIT'`). These are user-facing strings shown
in the dropdown, but they were not moved into the catalog (`Booking.addressInput` only holds
`clearAddress`, `airportAutoSet`, `noResults`). The phase touched both AddressInput components
(externalizing their other three strings) yet left these behind, so they will not translate.
Confidence is medium — it is possible these were intentionally deferred as data-derived tags —
but no catalog key or deferral note exists, so it reads as a miss.
**Fix:** Add e.g. `Booking.addressInput.typeAirport/typeHotel/typeTrain/typeTransit` and resolve
the badge via `t(...)` instead of the inline map, in both `AddressInput.tsx` and
`AddressInputNew.tsx`.

### WR-03: Trip-type tab labels rely on fragile array index-pairing with the catalog

**File:** `components/booking/TripTypeTabs.tsx:37,48-49`
**Issue:** `TRIP_TYPES` was stripped of its `label` field and the tab text now comes from
`t.raw('items')` (a raw string array) paired positionally: `const label = labels[i]`. This
couples the routing array order to the catalog array order across all seven locales. If any
locale's `Booking.tripTypeTabs.items` array gains/loses/reorders an entry, tabs silently
mislabel (or render `undefined` for a missing index) with no type-safety or runtime guard.
English is correct today (`['TRANSFER','HOURLY','MULTI-DAY']` matches), so this is a
robustness/maintainability concern rather than an active bug.
**Fix:** Prefer keyed lookups over positional indexing, e.g. give each `TRIP_TYPES` entry a
stable `labelKey` and call `t(entry.labelKey)`, so a catalog drift is a missing-key error
rather than a silent mislabel.

## Info

### IN-01: `saveBookingWithUserId` gained a `locale` param but has no production caller

**File:** `app/[locale]/login/actions.ts:218`
**Issue:** The action now takes a leading `locale` and calls `getTranslations` for its two
error returns, and the tests were updated to pass `'en'`. However, repo-wide search finds no
production caller — only `tests/auth-customer.test.ts`. The locale threading is internally
consistent, but the function is effectively dead outside tests. Not introduced as a defect by
this phase; noting for cleanup awareness.
**Fix:** None required for this phase. Track whether ACCT-04 wiring is still pending or the
action should be removed.

### IN-02: next-intl `t` functions added to effect/memo dependency arrays

**File:** `components/booking/BookingWizard.tsx:64`, `components/booking/steps/Step6Payment.tsx:262`,
`components/booking/steps/Step5Passenger.tsx:80`
**Issue:** `tClass` was added to the GA4 `useEffect` deps, `tb, t` to the analytics `useMemo`
deps, and `tv` to the schema `useMemo` deps. next-intl returns referentially stable `t`
functions for a fixed namespace + message set, so these do not cause extra re-runs or a
stale-schema resolver problem, and they satisfy exhaustive-deps. No action needed — recorded
so a future reviewer does not mistake them for a re-render hazard.
**Fix:** None.

---

_Reviewed: 2026-09-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
