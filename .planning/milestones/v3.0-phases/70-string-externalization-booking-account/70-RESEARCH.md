# Phase 70: String Externalization — Booking & Account - Research

**Researched:** 2026-09-04
**Domain:** next-intl string externalization for a highly-interactive React/Next.js booking wizard + customer account/auth surface, extending a locked Phase 69 convention
**Confidence:** HIGH (convention, provider wiring, file inventory all directly verified from the repo; a few forward-looking items — cross-tier data coupling risk, Server Action locale-threading — are HIGH-confidence from source reading + official docs, not yet exercised in this codebase)

## Summary

Phase 70 is a large, mechanical-but-risky externalization pass over ~36 files across three surfaces: the booking wizard (28 files under `components/booking/`), the account/auth surface (9 files under `app/[locale]/{login,account}/` + `components/account/`, `components/auth/`), and scattered shared validation/error copy. Almost every booking file is a Client Component (`'use client'`); only three account pages are Server Components. The good news: `NextIntlClientProvider` is already wired **once**, globally, in `components/SiteChrome.tsx` (Phase 69), so no new provider plumbing is needed anywhere in this phase — every component in the tree can call `useTranslations`/`getTranslations` today.

The real risk in this phase is not "how do I call `t()`" — Phase 69 already answered that exhaustively (see Approved Convention below, reused verbatim). The real risk is **three concrete cross-tier data-coupling traps** found by reading the actual source: (1) `lib/extras.ts`'s `EXTRAS_CONFIG.label`/`.description` array is imported by three UI components AND by `lib/email.ts` (server-side transactional email templates) — touching it in place will silently change confirmation emails; (2) vehicle-class display labels ("Business"/"First Class"/"Business Van") are hand-duplicated in at least three places (`types/booking.ts` `VEHICLE_CONFIG.label`, `StickyBookingPanel.tsx` `VEHICLE_LABELS`, `account/trips/page.tsx` `CLASS_LABELS`) with no single source of truth; (3) Server Actions (`'use server'` files) cannot call `useTranslations()` — they need `getTranslations({namespace, locale})` with an explicitly-threaded `locale` argument, a pattern this codebase has never used before. A fourth, quieter trap: at least 6 of the ~15 Server Action error strings are byte-identical copies of the same 3-4 sentences repeated across `login/actions.ts` and `account/actions.ts` — a strong signal to define one shared `Errors` namespace rather than one key per call site.

**Primary recommendation:** Reuse the Phase 69 convention exactly (PascalCase top-level namespace per feature area — `Booking`, `Account`, `Auth`, plus a small shared `Errors` namespace — camelCase nested sub-keys, JSON arrays for ordered lists, named ICU args). Run a tracer slice first (EntryBar + its validation errors, end-to-end) before fanning out to the other 27 booking files, and budget real time for updating the ~10 existing booking/account test files that use bare `render()` instead of `renderWithIntl()` — every one of them will start throwing once its component calls `useTranslations`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STR-02 | Booking flow (wizard/EntryBar/vehicle cards), account + auth pages, forms, validation/error/toast text are fully externalized. | File inventory in the Namespace Plan covers all 28 booking-flow files + 9 account/auth files; Architecture Patterns 1-3 cover Client Component, Server Component, and Server Action access; Pitfalls 1-3/5/8 identify the pre-existing cross-file duplication (vehicle-class labels, extras, `TRIP_TYPES`, error strings, status labels) that must be resolved to single-source catalog keys rather than mechanically copy-pasted; Validation Architecture maps each surface to its existing test file so `npx vitest run` + `npm run build` prove byte-for-byte EN output and unbroken analytics/guest-checkout (Success Criterion 4). |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Booking wizard UI strings (labels, placeholders, aria, CTA copy) | Browser / Client Component | — | All 28 booking files except none are Server Components; `useTranslations` (client hook) is the access pattern |
| Booking client-side validation messages (EntryBar, Step5Passenger zod schema) | Browser / Client Component | — | Validation runs entirely client-side today (hand-rolled `validate()` in EntryBar, `zodResolver` in Step5Passenger) — no server round-trip |
| Account dashboard / trips list (Server Components) | Frontend Server (SSR) | — | `account/page.tsx`, `account/trips/page.tsx` have no `'use client'`; use `getTranslations()` (async, server-only) |
| Account profile editing (`ProfileForm`) | Browser / Client Component | Frontend Server (SSR) via Server Actions | `ProfileForm` itself is client; its `useActionState`-bound mutations (`updateProfile`, `addPassenger`, …) are Server Actions returning localized error strings |
| Auth (`/login`, `Step3Auth` in-wizard) | Browser / Client Component | Frontend Server (SSR) via Server Actions | `login/page.tsx` and `Step3Auth.tsx` are both client; `login/actions.ts` (`'use server'`) returns error strings that must be localized server-side |
| Shared error/validation copy (rate-limit, "not authenticated", generic retry) | Frontend Server (SSR) — Server Actions | Browser / Client Component — zod/hand-rolled validators | Split ownership: Server Action strings need `getTranslations`; client-only validators (EntryBar, Step5Passenger) need `useTranslations` |
| Analytics event names/params (GA4, Meta CAPI) | API / Backend contract (GA4/Meta schema) | — | `'begin_checkout'`, `item_category`, `tripType` raw values etc. are third-party schema identifiers, not user-facing copy — must NOT be routed through the catalog |
| Stripe Elements internal UI (card form chrome) | External embedded widget (Stripe-hosted) | — | Controlled by Stripe's own `locale` option (currently hardcoded `'en'`), a separate i18n system from next-intl — out of this phase's reach |

## File Inventory

Grouped by surface. **Type** = Client (`'use client'`) or Server Component or Server Action (`'use server'`) — verified by reading each file's top lines this session. **Strings** = approximate count of visible user-facing strings (labels/placeholders/button text/aria-labels/validation-error text); files marked "(sampled)" were grep-sampled for JSX text/aria/placeholder patterns rather than read in full — treat those counts as a floor, not a ceiling; the planner's Wave 0 pass should re-count against the actual diff.

### (a) Booking flow — `components/booking/`

| File | Type | ~Strings | Notes |
|------|------|----------|-------|
| `EntryBar.tsx` | Client | 20 | Full read. Hand-rolled `validate()` returns literal error strings — not zod. Homepage/services-page entry form. |
| `TripTypeTabs.tsx` | Client | 4 | Full read. `TRIP_TYPES` mixes structural `{kind,value\|href}` with hardcoded `label` — split per Pitfall 3. |
| `AddressInput.tsx` | Client | 12 (sampled) | Used by `EntryBar`, `Step1TripType`, `StopItem`. Shares labels with `AddressInputNew.tsx` — candidate for one shared `Booking.addressInput` sub-namespace. |
| `AddressInputNew.tsx` | Client | 16 (sampled) | Used by `BookingWidget.tsx`, `DayCard.tsx`. Actively used, not dead code — verified via repo-wide grep. |
| `DurationSelector.tsx` | Client | 2 | Full read. `"DURATION"` label + `aria-label="Duration"`; option text `{h}h` is a template, not literal. |
| `StopList.tsx` | Client | 1 (sampled) | `aria-label="Add stop"`. |
| `StopItem.tsx` | Client | 4 (sampled) | `aria-label="Remove stop"`/`"Wait time"`, placeholder `"Enter stop address"`. |
| `RouteMap.tsx` | Client | 2 | Full read. Empty-state message + interpolated `aria-label` template (Pattern 4). |
| `VehicleCard.tsx` | Client | 1 | Full read. Only an `alt={`Prestigo ${config.label}`}` template — `config.label` sourced from `VEHICLE_CONFIG` (Pitfall 2). |
| `VehicleSlideshow.tsx` | Client | 5 | Full read. Duplicate `CLASS_LABELS` map (Pitfall 2); prev/next aria, interior-slideshow aria, caption. |
| `PriceSummary.tsx` | Client | 8 (sampled) | Renders `EXTRAS_CONFIG.label` (Pitfall 1); Outbound/Combined row labels. |
| `BookingSummaryBlock.tsx` | Client | 15+ (sampled — undercounted by regex, verify in Wave 0) | Renders `EXTRAS_CONFIG` (Pitfall 1); Outbound/Subtotal/Final labels confirmed. |
| `BookingWidget.tsx` | Client | 17 | Standalone widget embedded via `BookingSection.tsx`/`HourlyBookingSection.tsx` (see Open Question 1) and reachable at `/book`. Pick-up/Drop-off placeholders, pickup date/time aria, "Choose a slot". |
| `BookingWizard.tsx` | Client | 13 (sampled) | Orchestrator — GA4/Meta event firing (do NOT touch event names/params, only any adjacent UI text). |
| `Stepper.tsx` | Client | 0 direct + interpolated aria | `` `Decrease ${label}` ``/`` `Increase ${label}` `` — `label` is a prop from the call site (e.g. Step1TripType's passenger/luggage steppers), not hardcoded here. |
| `ProgressBar.tsx` | Client | 1 | Full read. Interpolated `aria-label={`Booking progress: Step ${currentStep} of 5`}` (Pattern 4). |
| `MultiDayForm.tsx` | Client | 18 | `/book/multi-day` flow. `aria-label="Select start date"`/`"Start date"`, `role="alert"` validation block. |
| `DayCard.tsx` | Client | 11+ | Six+ interpolated `Day ${index+1} ...` aria templates (Pattern 4), HOUR/MIN/"Start time" labels, address sub-labels. |
| `steps/Step1TripType.tsx` | Client | 12 | Swap-origin/destination aria, pickup/destination placeholders. |
| `steps/Step2DateTime.tsx` | Client | 8 | Full read (this is the phase's "time-slot picker"). Pickup/Return date labels, Hour/Min column headers, lead-time notice with embedded WhatsApp link (`t.rich` candidate), "Select a pickup date to continue". |
| `steps/Step3Auth.tsx` | Client | 25+ (partial read, 502 lines) | This is the phase's "auth-aware... inline" step — a SEPARATE sign-in/register implementation from `login/page.tsx` (own Supabase client calls, own tabs: Sign In/Create Account, Code/Password sub-tabs). |
| `steps/Step3Vehicle.tsx` | Client | 24 (sampled) | Renders `VEHICLE_CONFIG` (Pitfall 2) + date/time review summary + return-date/time sub-form. |
| `steps/Step4Extras.tsx` | Client | 0 direct | Renders `EXTRAS_CONFIG.label`/`.description` entirely from the shared data import (Pitfall 1) — no hardcoded JSX text of its own. |
| `steps/Step5Passenger.tsx` | Client | 25+ | Full read (this is the phase's "inline flight field"). Zod schema messages, flight-check status block (3 interpolated lines), "CHECK FLIGHT"/"RE-CHECK FLIGHT"/"CHECKING…" states. |
| `steps/Step6Payment.tsx` | Client | 15+ | "SECURE PAYMENT", promo code UI, "Remove" button. **Stripe `locale: 'en'` hardcode at line 376 — see Pitfall 7, do not touch this phase.** |
| `steps/StepStub.tsx` | Client | 0 | Placeholder/dev scaffold — confirm still referenced before including in scope. |
| `components/BookingSection.tsx` | Client | 3 (sampled) | Homepage teaser wrapping `BookingWidget` — see Open Question 1 (headline copy is borderline Phase 71 scope). |
| `components/HourlyBookingSection.tsx` | Client | 3 (sampled) | Services-page teaser wrapping `BookingWidget` — same as above. |

### (b) Account + Auth

| File | Type | ~Strings | Notes |
|------|------|----------|-------|
| `app/[locale]/account/page.tsx` | Server Component | 10 | Full read. "My Account", "Signed in as {email}" (needs ICU), two nav cards. |
| `app/[locale]/account/trips/page.tsx` | Server Component | 15 | Full read. Empty-state block (icon + heading + body + CTA), per-trip card labels, duplicate `CLASS_LABELS`/`STATUS_STYLES` maps (Pitfalls 2, 8), `formatDate` hardcodes `'en-GB'` locale (flag, not in this phase's scope — see below). |
| `app/[locale]/account/profile/page.tsx` | Server Component | 0 | Full read. Pure composition — no strings of its own, just wires `ProfileForm`. |
| `components/account/ProfileForm.tsx` | Client | 35+ | Full read. Contact-details form, account-type toggle, conditional corporate fields (Company name/IČO/DIČ), saved-passenger list + inline editor + delete-confirmation bar. Several interpolated aria-labels (`Edit ${name}`, `Delete ${name}`). |
| `app/[locale]/account/reset-password/page.tsx` | Client | ~15 (partial read) | Recovery-session gating, password-update form. |
| `app/[locale]/account/actions.ts` | Server Action (`'use server'`) | 15 (many duplicates — see Pitfall 5) | Full read. `updateProfile`, `addPassenger`, `updatePassenger`, `deletePassenger`. |
| `app/[locale]/login/page.tsx` | Client | 30 | Full read. Four modes (magic/password/register/reset) in one component, each with its own form + tab/divider/OAuth-handoff copy. |
| `app/[locale]/login/actions.ts` | Server Action (`'use server'`) | 10 (many duplicates — see Pitfall 5) | Full read. `sendMagicLink`, `signInWithPassword`, `signUpWithPassword`, `sendPasswordReset`, `customerSignOut`, `saveBookingWithUserId`. |
| `app/[locale]/login/auth-helpers.ts` | sync helper (no directive) | 1 (sampled) | `safeReturnTo()` — likely no user-facing string; confirm in Wave 0. |
| `components/auth/OAuthButtons.tsx` | Client | 2 | Full read. `aria-label="Sign in with Google"` + "Continue with Google" button text (Apple not yet wired). |

**Total: 36 files** (28 booking + 8 account/auth, matching the phase description's surface list; `Step3Auth.tsx` is counted under booking since it lives in `components/booking/steps/`).

**`account/trips/page.tsx`'s `formatDate` note:** uses `toLocaleDateString('en-GB', {...})` — a hardcoded date-format locale, separate from string externalization. Out of this phase's charter (STR-02 is about moving *strings* into the catalog, not number/date formatting — that's `L10N-PRICE`, explicitly deferred to v2 per REQUIREMENTS.md Out of Scope). Do not touch; flagged for awareness only.

## Standard Stack

No new packages are required for this phase. It is a pure application of the stack Phase 68/69 already installed and verified.

### Core (already installed, reused as-is)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-intl | 4.14.2 [VERIFIED: npm registry — `npm view next-intl version` → `4.14.2`, matches `package.json` pin] | `useTranslations`/`getTranslations`/`t.rich`/ICU messages | Already the project's locked i18n library (Phase 68 checkpoint-approved); STR-01 already proved the full pipeline |
| zod + @hookform/resolvers | already in `package.json` (`^5.2.2` resolvers) [CITED: package.json] | Client-side form validation (`Step5Passenger.tsx`) | Existing pattern; only the message *strings* passed to `.min()`/`.refine()`/`.email()` need externalizing, not the validation library |
| react-hook-form | already in `package.json` | Form state (`Step5Passenger.tsx`) | Existing pattern, unaffected |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `validate()` return-object pattern (EntryBar) | Migrate EntryBar to react-hook-form + zod like Step5Passenger | Out of scope for STR-02 — this phase externalizes strings, it does not refactor validation architecture. Keep EntryBar's existing `Record<string,string>` error-state shape; just source the message text from `t()` instead of an inline literal. |
| One `Errors` message per call site (15 near-duplicate keys) | One shared `Errors` namespace, ~6-8 keys, reused across `login/actions.ts` + `account/actions.ts` | Six call sites already return the byte-identical string `"Something went wrong. Please try again."` (see Common Pitfalls) — a shared namespace avoids 6 independent translations drifting apart later |

**Installation:** None — no `npm install` needed this phase.

## Package Legitimacy Audit

No new external packages are introduced by this phase. `next-intl` was already audited and approved in Phase 68 (STATE.md: "68-01: next-intl@4.14.2 exact pin approved via blocking-human package-legitimacy checkpoint"). Nothing to re-audit.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Request → app/[locale]/layout.tsx (setRequestLocale)
             │
             ▼
       SiteChrome (async Server Component)
             │  getLocale() + getMessages()  ──►  messages/${locale}.json
             │
             ▼
       <NextIntlClientProvider locale messages>   ◄── wraps EVERYTHING below,
             │                                         already wired (Phase 69,
             │                                         no new provider work here)
             ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  Booking wizard (all Client Components)                     │
   │  EntryBar → BookingWizard → Step1..Step6 → StickyBookingPanel│
   │       useTranslations('Booking.<subKey>')  per component     │
   │       zod .min()/.refine() messages ← t('Booking.validation.*')│
   └─────────────────────────────────────────────────────────────┘
   ┌─────────────────────────────────────────────────────────────┐
   │  Account (Server Components) → ProfileForm (Client)          │
   │  account/page.tsx, trips/page.tsx: await getTranslations()   │
   │  ProfileForm.tsx: useTranslations('Account.*')                │
   │       └─ useActionState(updateProfile, ...) ─────────────────┼──►  'use server'
   └─────────────────────────────────────────────────────────────┘   action files
   ┌─────────────────────────────────────────────────────────────┐        │
   │  Auth: login/page.tsx (Client) + Step3Auth.tsx (Client)       │        │
   │       useTranslations('Auth.*')                                │        │
   │       └─ useActionState(sendMagicLink, ...) ───────────────────┼────────┤
   └─────────────────────────────────────────────────────────────┘        │
                                                                            ▼
                                                          login/actions.ts, account/actions.ts
                                                          ('use server' — CANNOT call
                                                          useTranslations; must call
                                                          getTranslations({namespace, locale})
                                                          with locale threaded in from the
                                                          calling Client Component's useLocale())
```

### Recommended Namespace Plan (extends the Phase 69 convention)

Phase 69's locked convention (STATE.md / `69-01-SUMMARY.md`, approved verbatim, quoted below) is: **one PascalCase top-level namespace per closely-related feature area**, camelCase semantic sub-keys, JSON arrays for ordered lists, named ICU args, `t.rich` for embedded links. Hero's four sub-components share one `Hero` namespace; the same "one namespace per feature, nested by sub-component" pattern is the correct extension for a 28-file wizard — do **not** create 28 top-level namespaces.

```
Booking                              (one top-level namespace for the whole wizard)
├── entryBar.*                       EntryBar.tsx
├── addressInput.*                   shared by AddressInput.tsx AND AddressInputNew.tsx
├── tripTypeTabs.items[]             TripTypeTabs.tsx (TRANSFER/HOURLY/MULTI-DAY, index-paired
│                                     with the existing TRIP_TYPES structural array — same
│                                     pattern as Nav's NAV_LINKS/items split)
├── durationSelector.*               DurationSelector.tsx
├── stopList.*, stopItem.*           StopList.tsx, StopItem.tsx
├── routeMap.*                       RouteMap.tsx (empty-state message, aria template)
├── vehicleClasses.{business,firstClass,businessVan}.label
│                                     SINGLE SOURCE for the label duplicated today in
│                                     VEHICLE_CONFIG (types/booking.ts), VEHICLE_LABELS
│                                     (StickyBookingPanel.tsx), CLASS_LABELS
│                                     (VehicleSlideshow.tsx AND account/trips/page.tsx)
├── vehicleCard.*                    VehicleCard.tsx (alt-text template)
├── vehicleSlideshow.*               VehicleSlideshow.tsx (prev/next aria, caption)
├── extras.{meetAndGreet,infantSeat,childSeat,boosterSeat}.{label,description}
│                                     mirrors lib/extras.ts EXTRAS_CONFIG shape — READ ONLY
│                                     from UI components; lib/extras.ts itself is not
│                                     touched (see Common Pitfalls — email coupling)
├── step1..step6.*                   one nested object per wizard step component
├── multiDayForm.*, dayCard.*        /book/multi-day flow
├── stickyPanel.*, priceSummary.*, summaryBlock.*
├── progressBar.*, stepper.*
└── validation.*                     shared client-side validation strings (EntryBar
                                      hand-rolled errors + Step5Passenger zod messages)
                                      that recur across steps — e.g. a single
                                      "requiredField" style message reused by both

Account
├── dashboard.*                      app/[locale]/account/page.tsx
├── trips.*                          app/[locale]/account/trips/page.tsx
│   ├── statusLabels.{unpaid,pending,confirmed,assigned,enRoute,onLocation,completed,cancelled}
│   └── classLabels.{business,firstClass,businessVan}   ← reuse Booking.vehicleClasses instead
│                                     of a second copy (see Common Pitfalls)
└── profile.*                        components/account/ProfileForm.tsx (contact fields,
                                      corporate fields, saved-passenger editor)

Auth
├── login.*                          app/[locale]/login/page.tsx (4 modes: magic/password/
│                                     register/reset)
├── oauth.*                          components/auth/OAuthButtons.tsx
└── inWizard.*                       components/booking/steps/Step3Auth.tsx — a SEPARATE,
                                      independently-implemented sign-in/register UI (own
                                      OTP/password/register form, own client-side Supabase
                                      calls) — do not assume it shares code with login/page.tsx,
                                      but DO share copy where the English text is identical
                                      (e.g. "Email", "Password", "Create one")

Errors                               (NEW shared namespace — see Common Pitfalls: six call
├── genericRetry                     sites already return the byte-identical English string)
├── rateLimited
├── notAuthenticated
├── fullNameRequired
├── phoneRequired
└── duplicateDefaultPassenger
```

### Pattern 1: Client Component — `useTranslations` (the majority pattern, 25+ of 36 files)
**What:** Every booking component and most account/auth components are `'use client'`. `NextIntlClientProvider` is already in scope from `SiteChrome`, so no additional wiring is needed per component.
**When to use:** Any file already marked `'use client'` (verify with `grep -l "'use client'"` before writing the plan task — do not assume).
**Example:**
```tsx
// Source: components/Nav.tsx (Phase 69, verified pattern) — Booking/Account components follow identically
'use client'
import { useTranslations } from 'next-intl'

export default function EntryBar() {
  const t = useTranslations('Booking.entryBar')
  // ...
  return <label>{t('pickupLocation')}</label>
}
```

### Pattern 2: Server Component — `getTranslations` (3 account pages only)
**What:** `app/[locale]/account/page.tsx`, `app/[locale]/account/trips/page.tsx`, `app/[locale]/account/profile/page.tsx` have no `'use client'` directive [VERIFIED: read all three files this session — none contains a `'use client'` line].
**Example:**
```tsx
// Source: components/Testimonials.tsx (Phase 69, verified Server Component pattern)
import { getTranslations } from 'next-intl/server'

export default async function AccountTripsPage() {
  const t = await getTranslations('Account.trips')
  // ...
}
```

### Pattern 3: Server Action locale-threading (NEW to this codebase — high-risk pattern)
**What:** `login/actions.ts` and `account/actions.ts` are both `'use server'` modules [VERIFIED: `app/[locale]/login/actions.ts:1` and `app/[locale]/account/actions.ts:1`, both start with `'use server'`]. `useTranslations` is a **client hook** and cannot be called inside a `'use server'` function. next-intl's own docs are explicit that Server Actions need an **explicitly-passed locale**, because the automatic request-locale context does not reliably propagate into a Server Action invocation:

> "Pass the locale to `getTranslations` inside a Server Action to return localized error messages." [CITED: next-intl docs, `docs/environments/actions-metadata-route-handlers.mdx`, via Context7 `/amannn/next-intl`]
```tsx
import {getTranslations} from 'next-intl/server';

async function loginAction(locale: string, data: FormData) {
  'use server';
  const t = await getTranslations({namespace: 'LoginForm', locale});
  if (!areCredentialsValid) return {error: t('invalidCredentials')};
}
```
**Why it matters here:** `login/page.tsx` currently calls `useActionState(sendMagicLink, null)` directly — `sendMagicLink`'s signature is `(prevState, formData) => Promise<...>`, matching `useActionState`'s required 2-arg shape exactly. Adding a `locale` argument breaks that shape. The documented fix is to make the locale the **first bound argument** and `.bind()` it from the client before passing to `useActionState`:
```tsx
'use client'
import { useLocale } from 'next-intl'
// server action signature becomes: async function sendMagicLink(locale, prevState, formData)
const locale = useLocale()
const [state, action] = useActionState(sendMagicLink.bind(null, locale), null)
```
This is a genuinely new pattern for this codebase (no existing Server Action currently takes a locale) — the plan MUST call this out explicitly as its own task with its own verification, not fold it silently into "externalize login/actions.ts."
**Files requiring this pattern:** `login/actions.ts` (`sendMagicLink`, `signInWithPassword`, `signUpWithPassword`, `sendPasswordReset`, `saveBookingWithUserId`), `account/actions.ts` (`updateProfile`, `addPassenger`, `updatePassenger`, `deletePassenger`).

### Pattern 4: Named ICU interpolation (established, reuse verbatim)
**What:** Phase 69 already uses named args for all interpolation — no positional/`%s`-style placeholders anywhere in `messages/en.json`.
**Examples already in the catalog:** `"priceAnchor": "Airport transfers from <price>€{amount}</price> — fixed price, no surcharges"`, `"copyright": "© {year} PRESTIGO..."`, `"ratingAria": "Rated {rating} out of 5 from {count} Google reviews"` [VERIFIED: `messages/en.json:21,23,66`].
**Phase 70 needs this for (all confirmed by direct source reading):**
- `RouteMap.tsx:322` — `` aria-label={`Route map from ${origin.address} to ${destination.address}`} `` → `t('routeMap.aria', {origin: origin.address, destination: destination.address})`
- `DayCard.tsx` — `` aria-label={`Day ${index + 1} hour`} `` (and 6 sibling variants) → `t('dayCard.hourAria', {day: index + 1})`
- `ProgressBar.tsx:15` — `` aria-label={`Booking progress: Step ${currentStep} of 5`} `` → `t('progressAria', {step: currentStep, total: 5})`
- `StickyBookingPanel.tsx:97,102` — `` `Select ${VEHICLE_LABELS[vehicleClass]} class — €${selectedPrice.base}` `` → `t('stickyPanel.selectClassAria', {className: t(\`vehicleClasses.${vehicleClass}.label\`), price: selectedPrice.base})`
- `ProfileForm.tsx:565,612` — `` aria-label={`Edit ${passenger.full_name}`} ``/`` aria-label={`Delete ${passenger.full_name}`} `` → `t('profile.editPassengerAria', {name: passenger.full_name})`
- `Step5Passenger.tsx` flight status block — `` `Airport mismatch: flight arrives at ${...}, not PRG` `` → `t('step5.airportMismatch', {airport: flightCheckResult.flight_arrival_airport})`

### Pattern 5: ICU pluralization (documented, not yet needed — verify during Wave 0)
**What:** next-intl supports inline cardinal plurals: `` t('{count, plural, =0 {no followers yet} =1 {one follower} other {# followers}}.', {count}) `` [CITED: next-intl docs, `docs/usage/extraction.mdx`, via Context7]. No genuinely plural-sensitive English string was found across the ~15 files read in full or grep-sampled during this research pass (counts in this codebase are shown as bare numbers next to a fixed unit — `{h}h`, `maxPassengers`/`maxLuggage` as plain integers — not as pluralized sentences). **If Wave 0's file-by-file audit finds one**, use the ICU syntax above rather than hand-rolling an `n === 1 ? 'x' : 'xs'` ternary.

### Anti-Patterns to Avoid
- **Second copy of vehicle-class labels:** Do not add a fourth hardcoded `{business: 'Business', ...}` map anywhere. Route every display of a vehicle-class name through `t(\`Booking.vehicleClasses.${key}.label\`)`.
- **Editing `lib/extras.ts` EXTRAS_CONFIG.label/.description in place:** see Common Pitfalls — this file is shared with server-side email generation.
- **Hand-rolled `${locale}${href}` string concatenation for internal links:** use `Link`/`usePathname` from `@/i18n/routing`, exactly as `Nav.tsx` and `CookieBanner.tsx` already do [VERIFIED: `components/Nav.tsx:5`, `components/CookieBanner.tsx:5`].
- **Calling `useTranslations` from a `'use server'` file:** will throw at build/runtime. Use `getTranslations({namespace, locale})` with an explicitly bound locale (Pattern 3).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Locale-aware internal links | `` `/${locale}${href}` `` string concatenation | `Link`/`usePathname` from `@/i18n/routing` | Already the single source (`createNavigation(routing)`, `i18n/routing.ts:36`) — Phase 69 code review (WR-01 area) flags this class of bug |
| Plural English sentences | `n === 1 ? 'passenger' : 'passengers'` ternaries | next-intl ICU `{count, plural, ...}` | Handles all locale plural rules uniformly once translation starts (Phase 72/73), not just English |
| Server Action localization | Manually reading a cookie/header inside the action to guess the locale | `getTranslations({namespace, locale})` with `locale` passed in from the calling Client Component's `useLocale()` | The documented, supported next-intl pattern (Pattern 3 above) — anything else risks resolving the wrong locale under concurrent requests |
| Vehicle-class / status display labels | A fourth ad-hoc `Record<string,string>` map per component | One `Booking.vehicleClasses`/`Account.trips.statusLabels` catalog entry, read everywhere | Three duplicate maps already exist in the codebase (see Common Pitfalls) — a fourth compounds the drift risk |

**Key insight:** This phase's actual difficulty is not the next-intl API surface (fully solved by Phase 69) — it's untangling the pre-existing duplication and cross-tier coupling in the booking domain's data layer (`types/booking.ts`, `lib/extras.ts`) that predates i18n and was never single-sourced.

## Common Pitfalls

### Pitfall 1: `lib/extras.ts` `EXTRAS_CONFIG` is shared with server-side email generation
**What goes wrong:** `EXTRAS_CONFIG` (`lib/extras.ts:19-45`) is imported by THREE UI components (`Step4Extras.tsx`, `PriceSummary.tsx`, `BookingSummaryBlock.tsx`) **and** by `lib/email.ts` (four separate call sites: lines 3, 105, 305, 542, 728) [VERIFIED: `grep -rn "EXTRAS_CONFIG"` across the repo this session]. If a plan task blanks out or ICU-keys `EXTRAS_CONFIG[i].label`/`.description` in place (the natural first instinct — "just replace the hardcoded string"), every transactional confirmation email built by `lib/email.ts` silently loses its extras description text, with no compile error and no test failure unless email-template tests assert on that exact copy.
**Why it happens:** The data array was originally built as "one source of truth" for extras, before i18n existed — it now serves two audiences (translatable UI text, and English-only server email copy) that must diverge.
**How to avoid:** Leave `lib/extras.ts` completely untouched. In each of the three UI components, read `key`/`price`/`alwaysSelected` from `EXTRAS_CONFIG` for iteration/structure as today, but render the **label and description from `t(\`Booking.extras.${key}.label\`)`/`t(\`Booking.extras.${key}.description\`)`** instead of `extra.label`/`extra.description`. `lib/email.ts` keeps reading `.label`/`.description` directly from the untouched array (still English, correct for now — email localization is not in this milestone's scope).
**Warning signs:** Any diff that touches `lib/extras.ts` in this phase is a red flag — it should not need to change at all.

### Pitfall 2: Vehicle-class labels are already duplicated three ways
**What goes wrong:** The exact triplet `{business: 'Business', first_class: 'First Class', business_van: 'Business Van'}` (or the equivalent `VehicleConfig.label` field) appears independently in `types/booking.ts:54-58` (`VEHICLE_CONFIG`), `StickyBookingPanel.tsx:12-16` (`VEHICLE_LABELS`), `VehicleSlideshow.tsx:25-29` (`CLASS_LABELS`), and `account/trips/page.tsx:8-12` (`CLASS_LABELS`) [VERIFIED: all four files read directly this session; `VehicleClass` type itself is `'business' | 'first_class' | 'business_van'`, `types/booking.ts:16`]. Externalizing only one copy and missing the other three produces a page where some labels translate in Phase 72/73 and others silently stay in English forever — exactly the class of bug Phase 69's WR-02 review finding ("NEW badge externalized in Nav but left hardcoded in Footer and Services") already demonstrated happens when a duplicated string is fixed in one place and missed in its siblings.
**Why it happens:** No single source of truth for this enum's display labels predates this phase.
**How to avoid:** Define `Booking.vehicleClasses.{business,firstClass,businessVan}.label` once. Update all four call sites to read from it (`t()` in client components, `getTranslations()` in the one server-rendered site — `account/trips/page.tsx`). Grep for the literal strings `'Business'`, `'First Class'`, `'Business Van'` across `components/` and `app/[locale]/` as a completeness check before closing the phase.
**Warning signs:** A `grep -rn "First Class"` (or similar) after the phase claims completion that still returns hits outside `messages/en.json`.

### Pitfall 3: `TRIP_TYPES` and similar arrays mix structural data with translatable labels in one object
**What goes wrong:** `TripTypeTabs.tsx:11-15` defines `TRIP_TYPES` as `Array<{kind, value|href, label: string}>` — the `label` field ('TRANSFER'/'HOURLY'/'MULTI-DAY') is hardcoded English inline with routing/store logic. A naive fix wraps the whole array in `t.raw(...)`, which would also try to translate `kind`/`value`/`href` (breaking routing) or forces an awkward object-in-JSON shape.
**Why it happens:** This is the exact shape Phase 69 already solved for `Nav.tsx`'s `NAV_LINKS`.
**How to avoid:** Follow the locked precedent exactly: keep `TRIP_TYPES` holding only `{kind, value|href}` (drop `label` from the in-code array), add a parallel `Booking.tripTypeTabs.items` JSON array in the catalog (`["TRANSFER", "HOURLY", "MULTI-DAY"]`), and index-pair them at render time — identical to how `Nav.tsx:25,136-149` zips `t.raw('items')` against `NAV_LINKS[i]`.
**Warning signs:** A component-level object array where a JSON-array-in-catalog + parallel-structural-array split would be simpler — this is the recurring shape across `TripTypeTabs`, `VEHICLE_CONFIG`, `EXTRAS_CONFIG`; treat all three with the same split.

### Pitfall 4: Server Actions cannot call `useTranslations` — locale must be threaded explicitly
See Pattern 3 above. **Warning sign:** any attempt to `import {useTranslations} from 'next-intl'` inside a file whose first line is `'use server'` — this will fail at build/runtime, not silently.

### Pitfall 5: Six error strings are byte-identical duplicates across two Server Action files
**What goes wrong:** `"Something went wrong. Please try again."` appears verbatim at `login/actions.ts:59,128` and `account/actions.ts:58,122,186,227` — six occurrences [VERIFIED: read both files in full this session, all six call sites quoted]. `"Not authenticated."` appears at `login/actions.ts:219` and `account/actions.ts:33,88,154,217` — five occurrences. `"Too many attempts. Please try again in a minute."` appears three times in `login/actions.ts` (lines 44, 80, 108). `"Full name is required."`/`"Phone number is required."`/`"Another default passenger already exists. Please try again."` each appear twice in `account/actions.ts` (`addPassenger` and `updatePassenger`). If each call site gets its own key (`login.magicLinkGenericError`, `login.passwordGenericError`, `account.updateProfileGenericError`, …) instead of one shared key, the phase produces 15+ near-duplicate catalog entries that will drift independently once translated in Phase 72/73.
**Why it happens:** The Server Actions were written incrementally across multiple prior phases (57-60), each adding its own literal error string without an existing shared-error convention to reuse.
**How to avoid:** Define the small `Errors` namespace proposed above (6 keys) and have both action files' `getTranslations({namespace: 'Errors', locale})` calls reuse it.
**Warning signs:** Any RESEARCH/PLAN artifact that lists 15 distinct error-message keys for these two files instead of ~6 shared ones plus a handful of genuinely unique ones (`'Invalid email or password.'`, `'Invalid account type.'`, `'Could not save booking.'`).

### Pitfall 6: Existing booking/account tests use bare `render()`, not `renderWithIntl()` — they will break the moment their component calls `useTranslations`
**What goes wrong:** `tests/helpers/renderWithIntl.tsx`'s own doc comment states: "components no longer render without a next-intl context once they call `useTranslations`/`t()`" [VERIFIED: `tests/helpers/renderWithIntl.tsx:6-8`]. Confirmed this session: `tests/BookingWizard.test.tsx`, `tests/BookingWidget.test.tsx`, `tests/StickyBookingPanel.test.tsx`, `tests/BookingSummaryBlock.test.tsx`, `tests/booking-store.test.ts`, `tests/Step3Vehicle.test.tsx` (and by extension every other test file for the 28 booking components — `DayCard`, `EntryBar`, `MultiDayForm`, `RouteMap`, `Step1TripType`, `Step2DateTime`, `Step4Extras`, `Step5Passenger`, `Step6Payment`, `Stepper`, `VehicleSlideshow`) all currently import plain `render`/`screen` from `@testing-library/react` with no `NextIntlClientProvider` wrapper. Only `tests/nav-auth.test.tsx`, `tests/TestimonialsCarousel.test.tsx`, and `tests/i18n-navigation.test.tsx` (all Phase 69 output) already use `renderWithIntl`.
**Why it happens:** These tests predate Phase 69/70 and were written when the components had no i18n dependency.
**How to avoid:** Every plan task that adds `useTranslations`/`useTranslations`-consuming JSX to a booking/account component MUST, in the same commit, swap that component's existing test file's `render` import to `renderWithIntl` (the swap Phase 69 already did for `nav-auth.test.tsx` — "render swapped to renderWithIntl (aliased, no assertion changes)"). This is a mechanical, low-risk change, but it is easy to defer and then discover a wall of red tests at the wave boundary.
**Warning signs:** `npx vitest run` failing with "invariant expected requestLocale to be set" or similar next-intl context errors after a component conversion.

### Pitfall 7: Stripe Elements has its own, separate, hardcoded locale
**What goes wrong:** `Step6Payment.tsx:376` sets `locale: 'en' as const` inside the Stripe Elements `options` object [VERIFIED: read the surrounding `options` object, `Step6Payment.tsx:370-383`, quoting `locale: 'en' as const,` verbatim at line 376]. This controls the language of Stripe's own injected card-entry UI and its own validation/error messages — completely separate from next-intl. This phase (EN-only) does not need to change it, but a plan that assumes "externalize Step6Payment" covers the whole payment UI will be surprised that some of what's on screen (Stripe's card-number/expiry/CVC field chrome) is not reachable through `messages/en.json` at all.
**Why it happens:** Stripe.js ships its own i18n system with its own locale codes (which do not map 1:1 to next-intl's 7 configured locales).
**How to avoid:** Leave `locale: 'en'` untouched this phase. File an Open Question (below) for Phase 73/75 to decide the Stripe→next-intl locale mapping when non-EN locales actually render this step.

### Pitfall 8: `account/trips/page.tsx`'s status-label map is already incomplete — preserve the gap, don't silently fix it
**What goes wrong:** The full booking status set is `unpaid | pending | confirmed | assigned | en_route | on_location | completed | cancelled` [VERIFIED: `lib/booking-transitions.ts:11-20`, `VALID_TRANSITIONS` object, quoted keys verbatim]. `account/trips/page.tsx`'s `STATUS_STYLES` (`account/trips/page.tsx:14-19`) only defines `confirmed | pending | completed | cancelled` — the other four statuses (`unpaid`, `assigned`, `en_route`, `on_location`) fall back to the `pending` entry via `STATUS_STYLES[trip.status] ?? STATUS_STYLES.pending`, so a customer whose trip is `assigned` or `en_route` currently sees a "PENDING" badge. This is a pre-existing bug unrelated to i18n.
**Why it happens:** The trips page was likely written before the fuller status vocabulary (Phase 40/53/65-67) existed.
**How to avoid:** Externalize exactly the same 4-key map with the same fallback behavior (Success Criterion 4 requires byte-for-byte EN output). Do NOT expand it to 8 keys as part of this phase — that would be a silent behavior/scope change outside STR-02's charter. Flag the gap in the plan's Open Questions for a future bug-fix phase if desired.

## Code Examples

### Server Component (account pages)
```tsx
// Source: components/Testimonials.tsx (Phase 69, verified) — apply identically to
// app/[locale]/account/page.tsx, account/trips/page.tsx
import { getTranslations } from 'next-intl/server'

export default async function AccountTripsPage() {
  const t = await getTranslations('Account.trips')
  // ...
  return <h1>{t('heading')}</h1>
}
```

### Client Component with array zip (TripTypeTabs, mirrors Nav's NAV_LINKS pattern)
```tsx
// Source: components/Nav.tsx:14-21,25,136-149 (Phase 69, verified pattern)
const TRIP_TYPES: ReadonlyArray<{ kind: 'store' | 'navigate'; value?: TripType; href?: string }> = [
  { kind: 'store', value: 'transfer' },
  { kind: 'store', value: 'hourly' },
  { kind: 'navigate', href: '/book/multi-day' },
]
// in component:
const t = useTranslations('Booking.tripTypeTabs')
const labels = t.raw('items') as string[]   // ["TRANSFER", "HOURLY", "MULTI-DAY"]
// ...tabs.map((tab, i) => <button>{labels[i]}</button>)
```

### Rich text with embedded link (matches CookieBanner's Privacy/Terms pattern — for EntryBar's WhatsApp link)
```tsx
// Source: components/CookieBanner.tsx:171-188 (Phase 69, verified)
{t.rich('leadTimeNotice', {
  wa: (chunks) => (
    <a href="https://wa.me/420725986855?text=..." target="_blank" rel="noopener noreferrer">
      {chunks}
    </a>
  ),
})}
// messages/en.json: "leadTimeNotice": "Online bookings require at least {hours} hours advance
//   notice. For urgent or same-day transfers, message us on <wa>WhatsApp</wa>."
```

### Zod validation messages sourced from the catalog (Step5Passenger)
```tsx
// Adapts components/booking/steps/Step5Passenger.tsx:32-43 (verified current shape)
const t = useTranslations('Booking.validation')
const passengerSchema = z.object({
  firstName: z.string().min(1, t('firstNameRequired')),
  email: z.string().email(t('invalidEmail')),
  flightNumber: z.string().optional().refine(
    (val) => !val || IATA_RE.test(val),
    t('invalidFlightFormat')
  ),
  // ...
})
```
Note: `useTranslations` must be called at component-body scope before the schema is built (it already is a hook, unlike `getTranslations`) — the schema itself can be constructed inline in the component body (not module scope) since it now depends on `t`.

### Server Action locale threading (login/actions.ts)
```tsx
// See Pattern 3 above for the full explanation.
// login/actions.ts ('use server'):
export async function sendMagicLink(
  locale: string,
  prevState: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const t = await getTranslations({ namespace: 'Errors', locale })
  const rl = await checkRateLimit('/login', ip, { failClosed: false })
  if (!rl.allowed) return { error: t('rateLimited') }
  // ...
}

// login/page.tsx (client):
const locale = useLocale()
const [magicState, magicAction, magicPending] = useActionState(sendMagicLink.bind(null, locale), null)
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No genuinely plural-sensitive English string exists in the audited booking/account files (Pattern 5) | Architecture Patterns, Pattern 5 | Low — if Wave 0 finds one, the documented ICU syntax handles it without a stack change; only affects that one string's key shape |
| A2 | `Auth.inWizard` (Step3Auth) and `Auth.login` (login/page.tsx) should share copy for identical labels ("Email", "Password") but are otherwise independent namespaces, since they are separately-implemented forms (Namespace Plan) | Namespace Plan | Low — worst case is a small amount of key duplication between the two, not a functional bug |
| A3 | `components/BookingSection.tsx`/`HourlyBookingSection.tsx` (homepage/service-page teaser wrappers around `BookingWidget`) — their own headline copy is Phase 71 (marketing page) scope, but the embedded `BookingWidget` itself is Phase 70 scope | Namespace Plan / Open Questions | Medium — if the planner assumes these two wrapper files are fully out of scope, `BookingWidget`'s strings could be missed since it's reached only through them and `/book` |
| A4 | Server Actions' locale should be threaded via `useLocale()` + `.bind(null, locale)` from each calling Client Component, rather than reading a cookie/header inside the action | Pattern 3 | Medium — this is the officially documented next-intl approach (Context7-sourced), but it is unexercised in this codebase; a plan Wave 0 spike/tracer task should confirm it round-trips correctly through `useActionState` before fanning out to all 9 actions |

## Open Questions

1. **Do `BookingSection.tsx`/`HourlyBookingSection.tsx` belong to Phase 70 or Phase 71?**
   - What we know: both wrap `components/booking/BookingWidget.tsx` (definitely Phase 70 scope — it's under `components/booking/`) with their own `<h2>` headline text (marketing copy, arguably Phase 71 — Content Externalization — Marketing & SEO Pages).
   - What's unclear: whether the planner should externalize the headline text now (small, cheap, avoids a second touch of the same file) or explicitly defer it.
   - Recommendation: externalize `BookingWidget` in Phase 70 regardless; treat the two wrapper headlines as **optional** stretch scope this phase, explicitly deferred to 71 if time-boxed — note either choice in the plan so it isn't silently dropped.

2. **Should the Stripe Elements `locale` option ever be wired to the active next-intl locale?**
   - What we know: it's currently hardcoded `'en'` (Pitfall 7); Stripe's supported locale codes don't map 1:1 to this project's 7 locales (e.g. Stripe has no dedicated `hi` locale as of current Stripe.js docs — would need a fallback).
   - What's unclear: exact Stripe-supported-locale list and fallback behavior.
   - Recommendation: explicitly out of Phase 70 scope (EN-only); flag for Phase 73 or 75 research when non-EN locales actually reach checkout.

3. **`account/trips/page.tsx` STATUS_STYLES gap (Pitfall 8) — fix now or preserve?**
   - What we know: 4 of 8 real statuses fall back to the "pending" display.
   - What's unclear: whether the product owner considers this a bug worth fixing opportunistically.
   - Recommendation: preserve as-is per Success Criterion 4 (byte-for-byte EN output); do not expand scope.

## Environment Availability

Skipped — this phase has no new external dependencies. All tooling (next-intl, vitest, Stripe.js, Supabase client, Google Maps loader) is already installed and verified working by Phase 68/69.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.1 [VERIFIED: `package.json` devDependencies, `"vitest": "^4.1.1"`] |
| Config file | `vitest.config.ts` — `test.server.deps.inline: ['next-intl']` already set [VERIFIED: read `vitest.config.ts` this session] |
| Quick run command | `npx vitest run <touched test file(s)>` |
| Full suite command | `npx vitest run` |
| Baseline (end of Phase 69) | 105 test files, 1184 tests passing [CITED: `69-01-SUMMARY.md` D5 verification log] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STR-02 | Every booking component renders its strings via `useTranslations`/`getTranslations`; EN output byte-identical | unit | `npx vitest run tests/EntryBar.test.tsx tests/BookingWizard.test.tsx ...` (one file per touched component) | ✅ — all 28 booking components already have a corresponding `tests/*.test.tsx`, per the inventory below; each just needs its `render` swapped to `renderWithIntl` (Pitfall 6) |
| STR-02 | Account/auth pages and forms render via the catalog | unit | `npx vitest run tests/account-trips.test.tsx tests/profile-actions.test.ts tests/auth-customer.test.ts tests/auth-callback.test.ts` | ✅ |
| STR-02 | Server Action error strings localize correctly and still return the same English text | unit | new/extended assertions in `tests/profile-actions.test.ts` / a `login-actions.test.ts` (verify none currently exists — check during Wave 0) | ⚠️ verify in Wave 0 |
| STR-02 | Full production build succeeds for all 7 locale subpaths with no `MISSING_MESSAGE` | integration | `npm run build` | ✅ existing script |
| STR-02 | Analytics events (GA4 `begin_checkout`/`checkout_progress`/`login`/`sign_up`, Meta `InitiateCheckout`/`AddPaymentInfo`) fire with unchanged event names/params | unit/manual | existing analytics-assertion tests (grep `tests/*` for `dataLayer`/`gtag` assertions) + a manual dev-server checkout walkthrough | ✅ existing coverage should not need new tests — only needs to stay green |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched test file(s)>`
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green + `npm run build` green before `/gsd-verify-work`, matching the exact bar Phase 69 used (`69-01-SUMMARY.md` D5)

### Wave 0 Gaps
- [ ] Confirm whether a dedicated `tests/login-actions.test.ts` exists for `login/actions.ts` error-string assertions — not found in this research pass; if absent, add minimal coverage for the `Errors` namespace round-trip through at least one Server Action (the tracer task, Pattern 3) before fanning out.
- [ ] No new test framework/config install needed — `vitest.config.ts`'s `server.deps.inline: ['next-intl']` already covers this phase's needs.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Unaffected by this phase — only the *display text* of `login/actions.ts`/`Step3Auth.tsx` changes; rate-limiting (`checkRateLimit`), Supabase Auth calls, and the `safeReturnTo()` open-redirect guard [CITED: STATE.md 57-02 decision] must remain byte-identical in logic, only their error *messages* route through `t()`/`getTranslations()` |
| V3 Session Management | no | Not touched by string externalization |
| V4 Access Control | yes | `account/actions.ts`'s ownership checks (`user_id` derived from `getUser()`, never trusted from FormData — T-58-13/T-58-14 per code comments) must NOT be touched; only the returned `{error: '...'}` string values change to `{error: t('...')}` |
| V5 Input Validation | yes | Zod schema logic (`.min()`, `.email()`, `.refine()`) stays identical; only the second argument (the message string) is swapped for `t('...')` — the validation *rule* itself must not change |
| V6 Cryptography | no | Not touched |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Locale mismatch masking a real auth/rate-limit failure (e.g. a Server Action silently falling back to a wrong-locale `t()` call and showing a blank/garbled error) | Repudiation (user doesn't understand why an action failed) | Verify `getTranslations({namespace, locale})` always receives a valid, allow-listed locale (the same 7 configured in `i18n/routing.ts`) — never trust an unvalidated client-supplied locale string passed into a Server Action; derive it from `useLocale()` (which reads the already-validated route segment), not from raw user input |
| Regression in the `safeReturnTo()` open-redirect guard while touching `login/actions.ts` for i18n | Spoofing / Elevation of Privilege | This phase changes only string literals inside error branches — do not touch `safeReturnTo()` or the `redirect(returnTo)` call; verify with a diff review that the function body outside string literals is untouched |
| Ownership-check strings (`'Not authenticated.'`) accidentally deduplicated into a shared key that also gets used somewhere the check is looser | Elevation of Privilege (cosmetic risk only — the string is just a message, not a control) | Low risk since the underlying `if (!user) return {error: ...}` guard logic is untouched; only the message text is shared, not the authorization logic itself |

## Sources

### Primary (HIGH confidence)
- Context7 `/amannn/next-intl` — Server Action locale-threading pattern (`getTranslations({namespace, locale})`, `.bind(null, locale)`), ICU plural/rich-text syntax
- Direct repo reads (this session): `messages/en.json`, `i18n/request.ts`, `i18n/routing.ts`, `components/Nav.tsx`, `components/CookieBanner.tsx`, `components/Testimonials.tsx`, `components/SiteChrome.tsx`, `app/[locale]/layout.tsx`, `tests/helpers/renderWithIntl.tsx`, `types/booking.ts`, `lib/extras.ts`, `lib/booking-transitions.ts`, and all 36 in-scope booking/account/auth files listed in the Namespace Plan (full reads for EntryBar, RouteMap, StickyBookingPanel, VehicleCard, VehicleSlideshow, Step2DateTime, Step5Passenger, ProfileForm, OAuthButtons, login/page.tsx, login/actions.ts, account/actions.ts, account/page.tsx, account/trips/page.tsx, account/profile/page.tsx, reset-password/page.tsx partial, TripTypeTabs, DurationSelector, Step3Auth partial; grep-sampled for the remainder)
- `.planning/phases/69-string-externalization-ui-chrome/69-01-SUMMARY.md` (locked convention, verbatim), `69-REVIEW.md` (WR-01/WR-02/WR-03/IN-01/IN-02 findings — directly informs Pitfalls 2 and 6), `69-VALIDATION.md`

### Secondary (MEDIUM confidence)
- npm registry check (`npm view next-intl version`) confirming `4.14.2` is current

### Tertiary (LOW confidence)
- None — all findings this session were either directly verified against source files or cited from official next-intl documentation via Context7

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, reuses Phase 68/69's already-approved and version-verified stack
- Architecture: HIGH — provider wiring, Client/Server split, and the namespace convention are all directly observed in the current codebase, not inferred
- Pitfalls: HIGH — all eight pitfalls are grounded in direct source reads with file:line citations, not speculation; Pitfalls 1-3 and 8 involve cross-referencing three or more files to establish the coupling, done this session

**Research date:** 2026-09-04
**Valid until:** 30 days (stable — next-intl API and this codebase's booking/account structure are not expected to churn before Phase 70 executes)
