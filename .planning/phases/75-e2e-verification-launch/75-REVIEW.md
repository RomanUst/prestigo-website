---
phase: 75-e2e-verification-launch
reviewed: 2026-09-27T00:00:00Z
depth: standard
files_reviewed: 79
files_reviewed_list:
  - app/[locale]/about/page.tsx
  - app/[locale]/account/page.tsx
  - app/[locale]/account/reset-password/page.tsx
  - app/[locale]/account/trips/page.tsx
  - app/[locale]/authors/roman-ustyugov/page.tsx
  - app/[locale]/blog/[slug]/page.tsx
  - app/[locale]/blog/page.tsx
  - app/[locale]/book/confirmation/page.tsx
  - app/[locale]/book/loading.tsx
  - app/[locale]/book/multi-day/page.tsx
  - app/[locale]/book/page.tsx
  - app/[locale]/contact/page.tsx
  - app/[locale]/corporate/CorporateForm.tsx
  - app/[locale]/data-deletion/page.tsx
  - app/[locale]/faq/page.tsx
  - app/[locale]/fleet/page.tsx
  - app/[locale]/login/actions.ts
  - app/[locale]/login/auth-helpers.ts
  - app/[locale]/not-found.tsx
  - app/[locale]/privacy/page.tsx
  - app/[locale]/routes/page.tsx
  - app/[locale]/services/airport-transfer/page.tsx
  - app/[locale]/services/city-rides/page.tsx
  - app/[locale]/services/concierge/page.tsx
  - app/[locale]/services/corporate-accounts/page.tsx
  - app/[locale]/services/group-transfers/page.tsx
  - app/[locale]/services/intercity-routes/page.tsx
  - app/[locale]/services/page.tsx
  - app/[locale]/services/vip-events/page.tsx
  - app/[locale]/terms/page.tsx
  - app/api/create-payment-intent/route.ts
  - app/api/meta-capi/route.ts
  - app/api/validate-promo/route.ts
  - app/api/webhooks/stripe/route.ts
  - app/sitemap.ts
  - components/AnalyticsPageView.tsx
  - components/ArticleByline.tsx
  - components/BlogCard.tsx
  - components/BookingSection.tsx
  - components/ContactForm.tsx
  - components/GoogleAnalytics.tsx
  - components/HourlyBookingSection.tsx
  - components/MetaPixel.tsx
  - components/Routes.tsx
  - components/RoutesBento.tsx
  - components/RoutesMap.tsx
  - components/admin/BookingsTable.tsx
  - components/auth/OAuthButtons.tsx
  - components/booking/AddressInput.tsx
  - components/booking/AddressInputNew.tsx
  - components/booking/BookingWidget.tsx
  - components/booking/BookingWizard.tsx
  - components/booking/TripTypeTabs.tsx
  - components/booking/steps/Step3Auth.tsx
  - components/booking/steps/Step6Payment.tsx
  - components/booking/steps/StepStub.tsx
  - i18n/locales.ts
  - lib/analytics-server.ts
  - lib/auth-error-code.ts
  - lib/booking-locale.ts
  - lib/content/metricool.ts
  - lib/localized-href.ts
  - lib/route-content.ts
  - lib/supabase.ts
  - lib/supabase/middleware.ts
  - scripts/i18n-freeze-manifest.mjs
  - scripts/qa/analytics_locale_audit.py
  - scripts/qa/booking_e2e.py
  - scripts/qa/csp_regression.py
  - scripts/qa/en_leak_rendered.py
  - scripts/qa/en_leak_static.mjs
  - scripts/qa/gsc_indexing_baseline.py
  - scripts/qa/hreflang_reciprocity.py
  - scripts/qa/jsonld_audit.py
  - scripts/qa/render_audit.py
  - scripts/qa/switcher_audit.py
  - supabase/migrations/062_bookings_locale.sql
  - types/database.types.ts
  - app/[locale]/routes/prague-vienna/page.tsx
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 75: Code Review Report

**Reviewed:** 2026-09-27
**Depth:** standard
**Files Reviewed:** 79
**Status:** issues_found

## Summary

Reviewed the Phase 75 diff (`90fe38b0..HEAD`) across all 79 listed files, with focused attention on the priority security/correctness surfaces: the locale-aware open-redirect guard (`safeReturnTo`/`auth-helpers.ts`, `login/actions.ts`, `lib/supabase/middleware.ts`, `OAuthButtons.tsx`, `Step3Auth.tsx`), server-side locale validation before it reaches Stripe metadata/`bookings.locale` (`create-payment-intent`, `lib/supabase.ts`, `lib/booking-locale.ts`), the `meta-capi`/GA4/Meta Pixel `site_locale` schema additions, the Stripe webhook's new group-payment-link branch, and the locale-preserving navigation migration (`i18n/routing` `Link`/`useRouter`/`getPathname` replacing raw `<a href>`/`next/link`/`next/navigation`).

The open-redirect guard itself (`safeReturnTo`) is untouched — only an optional `fallback` parameter was added, and every call site supplies a server-computed, already-validated `getPathname(...)` value as that fallback, never client input. Locale values that reach Stripe metadata and `bookings.locale` are always passed through the `locales` allow-list (`normalizeSiteLocale`) before being trusted downstream. The webhook's new `handleGroupPaymentSucceeded` branch is correctly status-gated and idempotent, consistent with the existing `payment_intent.succeeded`/`checkout.session.completed` dual-path pattern. A broad sample of the ~45 localized page files was checked for `localizedHref`/`Link`/`getPathname` usage and no remaining un-localized internal `<a href="/...">` links were found outside the already-known, tracked exceptions.

No Critical/BLOCKER-level defects were found in the reviewed diff. Four WARNING-level and two INFO-level issues are listed below — mostly a migration-convention deviation, a variable-shadowing hazard introduced alongside a translation-hook addition, and minor client-side debug-logging additions.

## Warnings

### WR-01: `bookings_locale_format_check` constraint is not idempotent, breaking this repo's established migration re-run convention

**File:** `supabase/migrations/062_bookings_locale.sql:26-28`
**Issue:** Every prior migration in this repo that adds a `CHECK` constraint follows a `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` pattern specifically so the migration is safe to re-run (see `supabase/migrations/039_gnet_bookings.sql` and `040_extended_booking_statuses.sql`, both explicitly documented as idempotent for this reason). Migration 062 uses `ADD COLUMN IF NOT EXISTS` for the column (idempotent) but then does a bare `ADD CONSTRAINT bookings_locale_format_check ...` with no preceding `DROP CONSTRAINT IF EXISTS`. Since this repo's own convention is "operator applies migrations LIVE manually" (no automated migration runner enforcing exactly-once application), a second manual application of this file — e.g. after a partial failure, or during a recovery/rollback replay — will fail with `constraint "bookings_locale_format_check" already exists`, whereas the column half of the same statement would silently no-op.
**Fix:**
```sql
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_locale_format_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_locale_format_check
  CHECK (locale IS NULL OR locale ~ '^[a-z]{2}(-[A-Za-z]{2,4})?$');
```

### WR-02: Raw Supabase `AuthError.message` logged to the browser console defeats the point of the new error-code mapping

**File:** `components/booking/steps/Step3Auth.tsx:257` (register handler), `app/[locale]/account/reset-password/page.tsx:78`
**Issue:** Both call sites were changed this phase specifically to stop showing the raw, English, potentially implementation-revealing GoTrue `error.message` to the user — replaced with `authErrorKey(error.code)` mapped through the message catalog. That's a good D-07 fix. But both sites now do `console.error('...:', error.message)` immediately before that, which still puts the raw internal error string in front of anyone with devtools open (and in any error-tracking integration that captures `console.error`). This re-opens a smaller version of the same internal-detail-leak the surrounding change was meant to close.
**Fix:** Either drop the `console.error` entirely (the mapped, localized error is already shown to the user) or log only the stable `error.code`, never `error.message`:
```ts
console.error('Step3Auth register error code:', error.code)
```

### WR-03: `groupBookingIds` UUID filter is a character-class check, not a structural UUID validation

**File:** `app/api/webhooks/stripe/route.ts:448`
**Issue:** `.filter((s) => /^[0-9a-f-]{36}$/i.test(s))` only verifies that each of the 36 characters is a hex digit or a dash — it does not enforce the `8-4-4-4-12` UUID grouping, so a string like `36` dashes in the wrong positions (e.g. all dashes, or a dash-heavy garbage string of the right length) passes this filter and is then handed to `.in('id', ids)`. This isn't currently exploitable (the value originates from Stripe metadata set server-side at payment-link creation, and the downstream query is parameterized, so a malformed "UUID" just matches zero rows), but the regex comment/intent ("each `s` looks like a UUID") is stricter than what the code actually enforces, which will mislead a future reader relying on this as an input-shape guarantee.
**Fix:**
```ts
.filter((s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))
```

### WR-04: `t` (translation function) is shadowed by the pre-existing tile-index parameter inside `RoutesBento.tsx`'s carousel `useEffect` — only the render-loop occurrence was renamed

**File:** `components/RoutesBento.tsx:33,39,41,45,51,56-57,62` (vs. the fix already applied at line 79's `.map((tile, i) => ...)`)
**Issue:** This phase added `const t = useTranslations('RoutesSection')` to `RoutesBento` (needed for the new `t('fromPrice', ...)` / `t('viewRoute')` calls) and, in the same diff, correctly renamed the JSX render loop's index parameter from `t` to `i` specifically to avoid shadowing that new translation function (confirmed against the pre-Phase-75 version of this file, where the render loop's index was still named `t`). However, the auto-rotation `useEffect` a few lines above still declares three more `t`-named scopes that were **not** renamed: `const swap = (t: number) => {...}`, `const schedule = (t: number) => {...}`, and `tiles.forEach((_, t) => schedule(t))`. Inside all three, the local numeric `t` now shadows the outer translation function for the whole body. Nothing inside `swap`/`schedule` currently calls `t(...)` as a translation, so there is no runtime crash today — but the partial rename leaves a latent trap: any future edit that adds a translated string inside `swap`/`schedule` (e.g. a toast on route swap, or a dev-only log message) will call a `number` as a function and throw a `TypeError` at runtime, and the bug will be invisible in review because the outer `t` looks like the right identifier.
**Fix:** Rename the three remaining occurrences the same way the render loop was renamed, e.g.:
```ts
const swap = (tileIdx: number) => { ... slotsRef.current.map((v, i) => (i === tileIdx ? next : v)) ... }
const schedule = (tileIdx: number) => { ... swap(tileIdx); schedule(tileIdx) ... }
tiles.forEach((_, tileIdx) => schedule(tileIdx))
```

## Info

### IN-01: `wait_for_update: 20000` contradicts the surrounding comment (pre-existing, not introduced this phase, flagged for visibility)

**File:** `components/GoogleAnalytics.tsx:63`
**Issue:** The comment directly above (`Consent Mode v2 with wait_for_update:2500 ... GA4 waits 2.5 s`) describes a 2.5-second wait, but the code sets `wait_for_update: 20000` (20 seconds). This line was not touched by the Phase 75 diff, so it predates this phase, but since `GoogleAnalytics.tsx` was in-scope for this review and the D-10 `site_locale` change was added just below it in the same script block, it's worth a follow-up ticket rather than silently carrying the mismatch forward.
**Fix:** Confirm the intended wait and align the comment or the value (`2500` if the comment is authoritative, given the "Data from Apr 13–14" tuning note referenced just above it).

### IN-02: `KNOWN_STEP6_ERROR_CODES` duplicates the server's error-code vocabulary with no shared source of truth

**File:** `components/booking/steps/Step6Payment.tsx:20-31`
**Issue:** The `Set` of known codes is hand-maintained in the client and must stay in sync with the literal `code:` strings scattered across `app/api/create-payment-intent/route.ts` and `app/api/validate-promo/route.ts`. All current codes line up correctly today (verified against both route files and all 7 `messages/*.json` catalogs), but nothing enforces this at compile time — a future new server error code will silently fall back to the generic message instead of failing a build or test.
**Fix:** Extract a shared `const` array/type (e.g. `lib/booking-error-codes.ts`) imported by both the API routes and `Step6Payment.tsx`, so adding a code in one place is a type error if the other isn't updated.

---

_Reviewed: 2026-09-27T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
