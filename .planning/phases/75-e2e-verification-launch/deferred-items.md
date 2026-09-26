# Phase 75 — Deferred Items

Out-of-scope discoveries logged during plan execution per the executor's
scope-boundary rule (fix only what the current task's `files_modified`
covers; log everything else here instead of silently expanding scope).

## 75-13

- **`components/ArticleByline.tsx` uses `next/link`'s default import instead
  of the i18n `Link`.** `.planning/phases/75-e2e-verification-launch/75-EN-LEAK-AUDIT.md`
  row 85 attributes this finding to plan 75-13, but the plan's own
  `files_modified` frontmatter and task list do not include this file — it
  was never one of 75-13's targets (BookingSection, HourlyBookingSection,
  Routes/RoutesBento/RoutesMap, BlogCard, StepStub, not-found, /book
  loading, blog post CTA, author page). Severity is low (R3: a byline link
  on an article page drops the locale prefix on click-through). Mocked out
  in `tests/shared-sections-i18n.test.tsx`'s blog-CTA test so it doesn't
  interfere with that test's own assertions. Needs its own task/plan (or
  folding into 75-20's final EN-leak re-verify) to fix.

  **RESOLVED in 75-14** (Task 2, `09b5d6ad`): swapped
  `import Link from 'next/link'` to `import { Link } from '@/i18n/routing'`
  in `components/ArticleByline.tsx`. `tests/shared-sections-i18n.test.tsx`'s
  mock of the whole component is unaffected (it renders `null` regardless of
  the import). WINDOWS.md ledger entry #20 marked `fixed`.

## 75-20 (Task 2 — full production QA sweep, recorded not fixed per Task 1's "do not patch and redeploy" rule)

- **D-05 deferred capability — localized client emails.** `lib/email.ts`,
  `lib/email-corporate.ts`, `lib/email-bespoke.ts` are 100% English-only
  (no `useTranslations`/`getTranslations`/locale param anywhere in any of
  the 16 subject-line templates across the 3 files); the booking's locale,
  though persisted server-side per D-11, is never threaded into any email
  function. Localizing client-facing booking emails (confirmation, receipt,
  cancellation, etc.) into the booking's site locale is a new capability,
  not a fix — recorded as-is per D-05, full detail in
  `75-QA-RESULTS.md` "D-05 post-booking surfaces".

- **D-05 recorded-as-is — confirmation page copy is English-only.**
  `app/[locale]/book/confirmation/page.tsx` has no `useTranslations` import;
  every visible string (`BOOKING CONFIRMED`, `YOUR BOOKING REFERENCE`,
  `JOURNEY DETAILS`, vehicle-class labels, etc.) is a hardcoded English
  literal. Internal navigation (the `next/link` import) was already fixed
  separately (R3, owned by 75-14) — D-05 exempts TEXT only, never
  navigation. Recorded as-is per D-05 (not a fix target this phase).

- **Playwright E2E in CI — deferred until Preview deploys work.**
  `scripts/qa/booking_e2e.py` (and its sibling QA scripts) are Python
  Playwright scripts run manually against production; they are not wired
  into GitHub Actions CI because Vercel Preview deploys always fail
  (missing Supabase env — see memory `project_vercel_preview_fails`), so
  there is no safe pre-merge environment to run a real booking E2E against.
  Revisit once Preview deploys have working Supabase env vars.

- **EN-leak allowlist gap — person names flagged as leaks.**
  `en_leak_rendered.py`'s Latin-run heuristic flags "Roman Ustyugov" (the
  author byline) as a leak on `/authors/roman-ustyugov` and the one
  translated MDX blog post, on every non-Latin-script locale (ru/ar/hi/zh).
  A person's name is not translatable content — the allowlist
  (`scripts/qa/en_leak_allowlist.json`) needs a dedicated "proper noun /
  person name" category distinct from the existing `dnt`/`placeNames`/
  `tierNames` categories. Not fixed in 75-20 (script/allowlist change is
  out of this plan's `files_modified` scope).

- **EN-leak allowlist gap — mid-sentence brand/tech-term Latin runs.**
  Terms already allowlisted as standalone DNT tokens (`Mercedes E-Class`,
  `USB-A`/`USB-C`, `Wi-Fi`, `Visa`) still trip the 2+/3+-word Latin-run
  heuristic when embedded inline in an otherwise-fully-translated ar/ru/hi/
  zh sentence with adjacent connector words. Affects `/fleet`, `/services/*`,
  `/routes`, `/book`, `/book/multi-day` on ar/ru/hi/zh. Not fixed in 75-20
  (same reasoning as above — allowlist/scanner change out of scope).

- **Systemic gap — English 404 ("Page not found") on every locale's
  unmatched path, root-caused.** `app/[locale]/not-found.tsx` IS fully
  localized (`useTranslations('NotFound')`, all 6 non-EN catalogs present),
  but there is no catch-all route (`app/[locale]/[...catchAll]/page.tsx`)
  under the `[locale]` segment tree. An arbitrary unmatched path (e.g.
  `/zh/this-page-does-not-exist`) never structurally resolves into the
  `[locale]` route tree, so Next.js's App Router falls through to the
  top-level `app/not-found.tsx` (hardcoded `lang="en"`, "Page not found" /
  "Back to Home") instead of the localized boundary. Reproduces identically
  on every locale — explains 75-19-SUMMARY.md's "`/zh/<unknown>` renders an
  English 'Page not found' h1" observation (it is universal, not
  zh-specific). Fix requires adding a catch-all page under `app/[locale]/`
  that calls `notFound()`. Not fixed in 75-20 (architectural/new-file
  change, out of this plan's read-only-verification scope; candidate for a
  small dedicated fix plan or a 75-16 follow-up).

- **New overflow regression — `/ru/fleet` at 768px viewport.**
  `overflow_audit.py` at 768px width found 1 page with issues:
  `/ru/fleet` has 2 `<p>` maintenance-copy paragraphs whose translated
  Russian text (`scrollWidth` 143/150 vs `clientWidth` 131) overflows their
  container — not present in the pre-translation English baseline (which
  had 0 issues at all 5 widths on 2026-09-24). 320/375/1024/1280px remain
  clean. Not fixed in 75-20 (CSS/copy change out of this plan's scope —
  candidate for a small follow-up to 75-08, which owns `/fleet`).

- **RU/AR signed-in account booking path (D-04) unverified.**
  `booking_e2e.py --account ru,ar` auto-skipped both locales because
  `scripts/qa/.e2e-account.json` does not exist — the user reported
  creating the E2E test account (75-19-SUMMARY.md) but never provided the
  credentials file. The guest-path locale-following logic (Stripe Elements
  locale, Google Places language) IS proven for both ru and ar via the
  guest checkout runs; only the signed-in "My trips" + booking variant of
  the same flow remains unverified. This is a verification gap, not a code
  defect — re-run `booking_e2e.py --locales "" --account ru,ar` once the
  credentials file is provided.

- **Meta Pixel never fires on production (pre-existing, not a Phase 75
  regression).** `analytics_locale_audit.py` confirms `metaHits=0` on
  every one of the 7 locales x 2 pages tested — Meta CAPI/Pixel
  `custom_data.site_locale` (D-12) cannot be verified until the underlying
  defect is fixed. Matches the already-tracked WINDOWS.md #15 issue
  (`NEXT_PUBLIC_META_PIXEL_ID`/`META_PIXEL_ID` env var has a trailing
  newline breaking the `fbq` init script) — requires human re-entry in the
  Vercel dashboard + redeploy, already logged in STATE.md's Phase 75 input
  notes. No new action here beyond confirming it systematically across all
  7 locales.
