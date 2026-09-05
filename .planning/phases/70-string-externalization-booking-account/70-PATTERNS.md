# Phase 70: String Externalization — Booking & Account - Pattern Map

**Mapped:** 2026-09-04
**Files analyzed:** 36 (28 booking + 8 account/auth)
**Analogs found:** 36 / 36 (all covered by 4 Phase-69 analogs + 1 new Server-Action pattern with no in-repo precedent)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `components/booking/EntryBar.tsx` | Client Component | request-response (form) | `components/Nav.tsx` | role-match |
| `components/booking/TripTypeTabs.tsx` | Client Component | CRUD (tab select) | `components/Nav.tsx` (NAV_LINKS/items zip) | exact |
| `components/booking/AddressInput.tsx` / `AddressInputNew.tsx` | Client Component | request-response | `components/Nav.tsx` | role-match |
| `components/booking/DurationSelector.tsx`, `StopList.tsx`, `StopItem.tsx` | Client Component | CRUD | `components/Nav.tsx` | role-match |
| `components/booking/RouteMap.tsx`, `ProgressBar.tsx`, `DayCard.tsx` (interpolated aria) | Client Component | transform (ICU interpolation) | `messages/en.json` `ratingAria`/`copyright` patterns + `components/Nav.tsx` for hook wiring | exact (ICU) |
| `components/booking/VehicleCard.tsx`, `VehicleSlideshow.tsx`, `steps/Step3Vehicle.tsx`, `StickyBookingPanel.tsx`, `types/booking.ts` VEHICLE_CONFIG, `account/trips/page.tsx` CLASS_LABELS | Client/Server, mixed | CRUD (shared enum labels) | `components/Nav.tsx` NAV_LINKS/items split (Pitfall 3 pattern) | exact (single-source enum) |
| `components/booking/PriceSummary.tsx`, `BookingSummaryBlock.tsx`, `steps/Step4Extras.tsx` (EXTRAS_CONFIG consumers) | Client Component | CRUD (read-only catalog) | `components/Nav.tsx` NAV_LINKS/items split | exact |
| `components/booking/BookingWidget.tsx`, `BookingWizard.tsx`, `Stepper.tsx`, `steps/Step1TripType.tsx`, `steps/Step2DateTime.tsx` | Client Component | request-response | `components/Nav.tsx` | role-match |
| `components/booking/steps/Step3Auth.tsx` | Client Component | request-response (auth) | `app/[locale]/login/page.tsx` (sibling, not yet externalized — use Nav.tsx pattern) | role-match |
| `components/booking/steps/Step5Passenger.tsx` (zod messages) | Client Component | request-response (validation) | `components/Nav.tsx` (hook usage) + next-intl docs zod example | role-match |
| `components/booking/steps/Step6Payment.tsx` | Client Component | request-response (payment UI, Stripe untouched) | `components/Nav.tsx` | role-match |
| `components/booking/MultiDayForm.tsx`, `DayCard.tsx` | Client Component | CRUD | `components/Nav.tsx` | role-match |
| `components/booking/BookingSection.tsx`, `HourlyBookingSection.tsx` | Client Component (marketing teaser) | request-response | `components/Testimonials.tsx` (headline pattern, though Testimonials is Server) | partial-match |
| `components/booking/components/*` (misc) | Client Component | mixed | `components/Nav.tsx` | role-match |
| `app/[locale]/account/page.tsx` | Server Component | request-response | `components/Testimonials.tsx` | exact |
| `app/[locale]/account/trips/page.tsx` | Server Component | CRUD (list render) | `components/Testimonials.tsx` | exact |
| `app/[locale]/account/profile/page.tsx` | Server Component (pure composition, 0 strings) | request-response | `components/Testimonials.tsx` | exact |
| `components/account/ProfileForm.tsx` | Client Component | CRUD (form + Server Action) | `components/Nav.tsx` (hook) + `components/CookieBanner.tsx` (interpolated aria via `t.rich`/named args) | role-match |
| `app/[locale]/account/reset-password/page.tsx` | Client Component | request-response (auth) | `components/Nav.tsx` | role-match |
| `app/[locale]/account/actions.ts` | Server Action (`'use server'`) | request-response (mutation) | **No in-repo analog** — new pattern (see Pattern 3 below) | no-analog (new pattern, doc-sourced) |
| `app/[locale]/login/page.tsx` | Client Component | request-response (auth, 4 modes) | `components/Nav.tsx` | role-match |
| `app/[locale]/login/actions.ts` | Server Action (`'use server'`) | request-response (mutation) | **No in-repo analog** — new pattern (see Pattern 3 below) | no-analog (new pattern, doc-sourced) |
| `app/[locale]/login/auth-helpers.ts` | sync helper | n/a | n/a (likely no strings) | no-analog (verify Wave 0) |
| `components/auth/OAuthButtons.tsx` | Client Component | request-response | `components/Nav.tsx` | role-match |
| `EntryBar.tsx` WhatsApp link, `Step2DateTime.tsx` lead-time notice | Client Component (rich text) | transform | `components/CookieBanner.tsx` (`t.rich` Privacy/Terms links) | exact |
| ~10 existing test files (`tests/BookingWizard.test.tsx`, `BookingWidget.test.tsx`, `StickyBookingPanel.test.tsx`, `BookingSummaryBlock.test.tsx`, `Step3Vehicle.test.tsx`, `DayCard.test.tsx`, `EntryBar.test.tsx`, `MultiDayForm.test.tsx`, `RouteMap.test.tsx`, `Step1TripType.test.tsx`, `Step2DateTime.test.tsx`, `Step4Extras.test.tsx`, `Step5Passenger.test.tsx`, `Step6Payment.test.tsx`, `Stepper.test.tsx`, `VehicleSlideshow.test.tsx`, `booking-store.test.ts`) | test | n/a | `tests/nav-auth.test.tsx` | exact |

## Pattern Assignments

### Pattern A — Client Component `useTranslations` (majority pattern, ~28 of 36 files)

**Analog:** `components/Nav.tsx` (Phase 69)

**Imports pattern** (lines 1-8):
```tsx
'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/routing'
```

**Hook + simple key access** (line 24-26):
```tsx
export default function Nav() {
  const t = useTranslations('Nav')
  const navItems = t.raw('items') as string[]
```

**Usage in JSX** (line 129, 148):
```tsx
aria-label={t('homeAriaLabel')}
...
{t('signIn')}
```

**Apply to every booking/account/auth Client Component:** call `useTranslations('Booking.<subKey>')` / `useTranslations('Account.<subKey>')` / `useTranslations('Auth.<subKey>')` at component top, replace literal JSX text/placeholder/aria-label strings with `t('key')`.

---

### Pattern B — Structural array / translated-labels split (TripTypeTabs, vehicle-class labels, EXTRAS_CONFIG consumers)

**Analog:** `components/Nav.tsx` lines 14-21 + 25 + 136-149 (NAV_LINKS/items zip)

```tsx
// Structural array keeps only non-translatable data (href, isNew flag, key, price)
const NAV_LINKS: ReadonlyArray<{ href: string; isNew?: boolean }> = [
  { href: '/services' },
  { href: '/fleet' },
  // ...
]
// in component body:
const t = useTranslations('Nav')
const navItems = t.raw('items') as string[]   // JSON array, index-paired
// render:
{NAV_LINKS.map((link, i) => <Link key={link.href}>{navItems[i]}</Link>)}
```

**Apply this exact split to:**
- `TripTypeTabs.tsx` — keep `TRIP_TYPES` as `{kind, value|href}` only, add `Booking.tripTypeTabs.items` JSON array in catalog, index-zip.
- Vehicle-class labels (`types/booking.ts` VEHICLE_CONFIG, `StickyBookingPanel.tsx` VEHICLE_LABELS, `VehicleSlideshow.tsx` CLASS_LABELS, `account/trips/page.tsx` CLASS_LABELS) — replace all four duplicate maps with `t(\`Booking.vehicleClasses.${key}.label\`)` (client) / `getTranslations` (the one server page).
- `lib/extras.ts` `EXTRAS_CONFIG` consumers (`Step4Extras.tsx`, `PriceSummary.tsx`, `BookingSummaryBlock.tsx`) — read `key`/`price` from `EXTRAS_CONFIG` as today for iteration, but render label/description via `t(\`Booking.extras.${key}.label\`)`/`.description`. **Do not touch `lib/extras.ts` itself** (shared with `lib/email.ts`).

---

### Pattern C — Server Component `getTranslations` (3 account pages only)

**Analog:** `components/Testimonials.tsx` (full file, Phase 69)

```tsx
import { getTranslations } from 'next-intl/server'

export default async function Testimonials() {
  const t = await getTranslations('Testimonials')
  return (
    <section>
      <p className="label mb-6">{t('label')}</p>
      <h2>{t('headingLine1')}<br /><span>{t('headingLine2')}</span></h2>
      <p>{t('body')}</p>
    </section>
  )
}
```

**Apply to:** `app/[locale]/account/page.tsx`, `app/[locale]/account/trips/page.tsx`, `app/[locale]/account/profile/page.tsx` — replace `useTranslations` with `await getTranslations('Account.<subKey>')`; async function signature unchanged (all three already `async` Server Components).

---

### Pattern D — `t.rich` for embedded links / interpolated aria

**Analog:** `components/CookieBanner.tsx` lines 168-188 (full excerpt)

```tsx
<p className="mt-3 font-body font-light text-[12px] text-warmgrey leading-relaxed">
  {t.rich('consentBody', {
    privacy: (chunks) => (
      <Link href="/privacy" className="text-copper-light hover:text-copper underline underline-offset-2">
        {chunks}
      </Link>
    ),
    terms: (chunks) => (
      <Link href="/terms" className="text-copper-light hover:text-copper underline underline-offset-2">
        {chunks}
      </Link>
    ),
  })}
</p>
```

**Apply to:**
- `EntryBar.tsx` WhatsApp lead-time notice: `t.rich('leadTimeNotice', { wa: (chunks) => <a href="https://wa.me/...">{chunks}</a> })`.
- `Step2DateTime.tsx` lead-time notice with embedded WhatsApp link — same shape.
- Named-ICU-only (no embedded markup) cases use plain `t('key', {arg})` — e.g. `RouteMap.tsx` aria (`t('routeMap.aria', {origin, destination})`), `ProgressBar.tsx` aria (`t('progressAria', {step, total})`), `ProfileForm.tsx` `Edit ${name}`/`Delete ${name}` aria (`t('profile.editPassengerAria', {name})`) — modeled on existing `messages/en.json` named-ICU entries `priceAnchor`/`copyright`/`ratingAria` (lines 21, 23, 66).

---

### Pattern E — Server Action locale threading (NEW to this codebase — no in-repo analog, doc-sourced)

**Source:** next-intl official docs (Context7 `/amannn/next-intl`, `docs/environments/actions-metadata-route-handlers.mdx`) — quoted verbatim in RESEARCH.md lines 252-274.

**Applies to:** `app/[locale]/login/actions.ts` (`sendMagicLink`, `signInWithPassword`, `signUpWithPassword`, `sendPasswordReset`, `saveBookingWithUserId`) and `app/[locale]/account/actions.ts` (`updateProfile`, `addPassenger`, `updatePassenger`, `deletePassenger`).

**Server Action side:**
```tsx
'use server'
import { getTranslations } from 'next-intl/server'

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
```

**Client call site (locale bound before `useActionState`):**
```tsx
'use client'
import { useLocale } from 'next-intl'

const locale = useLocale()
const [magicState, magicAction, magicPending] = useActionState(
  sendMagicLink.bind(null, locale),
  null
)
```

**Critical rule:** `locale` is added as the Server Action's FIRST parameter and bound via `.bind(null, locale)` from the client, preserving `useActionState`'s required 2-arg `(prevState, formData)` shape for the caller. Never call `useTranslations` inside a `'use server'` file — it will throw.

**Shared `Errors` namespace** (avoids 15+ near-duplicate keys — Pitfall 5): define once —
`Errors.genericRetry`, `Errors.rateLimited`, `Errors.notAuthenticated`, `Errors.fullNameRequired`, `Errors.phoneRequired`, `Errors.duplicateDefaultPassenger` — both action files' `getTranslations({namespace: 'Errors', locale})` calls reuse these 6 keys instead of one key per call site.

---

### Pattern F — Test helper migration (`render` → `renderWithIntl`)

**Analog:** `tests/helpers/renderWithIntl.tsx` (full file) + `tests/nav-auth.test.tsx` lines 1-15 (usage)

**Helper (already exists, no changes needed):**
```tsx
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { render, type RenderOptions } from '@testing-library/react'
import enMessages from '@/messages/en.json'

export function renderWithIntl(ui, { locale = 'en', messages = enMessages, ...options } = {}) {
  return render(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    ),
    ...options,
  })
}
```

**Call-site migration (mechanical import swap, no assertion changes):**
```tsx
// Before:
import { render, screen } from '@testing-library/react'
// After:
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl as render } from './helpers/renderWithIntl'
```

**Apply to every test file listed under "Files with no existing renderWithIntl usage" below** — swap import, keep all `render(...)` call sites and assertions unchanged (aliasing `renderWithIntl as render` avoids touching every call site).

---

## Shared Patterns

### Client Component translation hook
**Source:** `components/Nav.tsx:1-8, 24-26`
**Apply to:** all ~28 booking Client Components + `ProfileForm.tsx`, `login/page.tsx`, `reset-password/page.tsx`, `OAuthButtons.tsx`, `Step3Auth.tsx`

### Server Component translation
**Source:** `components/Testimonials.tsx` (full file)
**Apply to:** `account/page.tsx`, `account/trips/page.tsx`, `account/profile/page.tsx`

### Rich text / embedded links
**Source:** `components/CookieBanner.tsx:168-188`
**Apply to:** `EntryBar.tsx` and `Step2DateTime.tsx` WhatsApp lead-time notices

### Named ICU interpolation
**Source:** `messages/en.json` — `priceAnchor` (line 21), `copyright` (line 23), `ratingAria` (line 66)
**Apply to:** all interpolated aria-label templates (RouteMap, DayCard, ProgressBar, StickyBookingPanel, ProfileForm)

### Structural-array / translated-label split
**Source:** `components/Nav.tsx:14-21, 25, 136-149`
**Apply to:** `TripTypeTabs.tsx`, vehicle-class label single-sourcing (4 call sites), `EXTRAS_CONFIG` label/description consumers (3 call sites)

### Server Action locale threading (new pattern)
**Source:** next-intl official docs (no in-repo precedent — see Pattern E above)
**Apply to:** `login/actions.ts`, `account/actions.ts`

### Test helper migration
**Source:** `tests/helpers/renderWithIntl.tsx`, `tests/nav-auth.test.tsx:1-15`
**Apply to:** all ~10-17 booking/account test files still using bare `render()`

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `app/[locale]/login/actions.ts` | Server Action | request-response (mutation) | No existing Server Action in this codebase threads a locale; use doc-sourced Pattern E |
| `app/[locale]/account/actions.ts` | Server Action | request-response (mutation) | Same as above |
| `app/[locale]/login/auth-helpers.ts` | sync helper | n/a | Likely zero user-facing strings (`safeReturnTo()`); confirm in Wave 0, no analog needed if empty |
| A dedicated `tests/login-actions.test.ts` | test | n/a | Not found in repo — RESEARCH.md flags this as a Wave 0 gap; if absent, add minimal coverage for the `Errors` namespace round-trip using `tests/nav-auth.test.tsx`'s `vi.hoisted` mock-setup structure as the closest testing-pattern analog |

## Metadata

**Analog search scope:** `components/`, `app/[locale]/`, `tests/`, `messages/en.json`, `tests/helpers/`
**Files scanned:** Nav.tsx, CookieBanner.tsx, Testimonials.tsx, renderWithIntl.tsx, nav-auth.test.tsx, messages/en.json (excerpted), plus full RESEARCH.md File Inventory (36 files)
**Pattern extraction date:** 2026-09-04
