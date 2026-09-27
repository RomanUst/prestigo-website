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

- **75-28 (out of scope): ArticleByline "By" / "Published" / "Updated"
  words and the `en-GB` byline date stay English on localized blog posts.**
  `components/ArticleByline.tsx` hard-codes the three words and
  `formatBylineDate()` (lib/authors.ts) always formats with `en-GB`; the
  same `en-GB` date shows on `/<locale>/blog` cards (`components/BlogCard.tsx`).
  The 75-26 rendered scan did not flag them (short tokens / date), so they
  carry no `fix:75-28` ledger row. The fix would add `labels.by/published/
  updated` to `content/pages/*/authors/roman-ustyugov.json` and a
  locale-aware date formatter (pick Latin vs native digits for ar/hi
  deliberately). lib/authors.ts must stay unchanged for the Person JSON-LD.

## 75-30 (gap-closure production re-verification, recorded not fixed: this plan may not edit app code)

- **GAP-1: RU/AR signed-in account path (D-04) is still unverified. SKIPPED by user decision, open.**
  - Plan 75-22 was skipped on 2026-09-27 ("пропускаем"). The E2E test account and the git-ignored `scripts/qa/.e2e-account.json` were never created.
  - The guest path is proven for ru and ar. Only the signed-in "My trips" and booking variant is unproven.
  - WINDOWS #25 stays open.
  - To close: the user creates the account and the credentials file, then re-run 75-22 (delete its SUMMARY and run `/gsd-execute-phase 75 --gaps-only`), or run `python3 scripts/qa/booking_e2e.py --locales "" --account ru,ar` and do the strict-marker cleanup.

- **GAP-4 remainder: English og/twitter (and 404 description) metadata on `/login` and the localized 404.**
  - On production there are 20 `meta` findings: ru/ar/hi/zh x (2 on `/login` + 3 on `/this-page-does-not-exist`).
  - es and fr serve the same English values, but the scanner does not flag them.
  - Cause: `app/[locale]/layout.tsx` exports the static English `siteMetadata` (`components/SiteChrome.tsx`). `app/[locale]/login/layout.tsx` (75-28) overrides only title and description. `app/[locale]/[...rest]/page.tsx` `generateMetadata` (75-25) overrides only title and robots.
  - Fix: add localized `description`, `openGraph.title/description` and `twitter.title/description` in both places, or make the locale layout's default metadata locale-aware via `generateMetadata`.
  - Also extend `en_leak_rendered.py` so the es/fr identical-to-EN check covers meta.
  - Both pages are noindex, so SEO impact is low. The English text is visible only in link previews and shares. WINDOWS #24 stays open until this is fixed and re-scanned.

- **Unscanned-page catalog inventory (content follow-up).**
  - Figures from `75-EN-LEAK-RESIDUAL.md` "Unscanned-page catalog inventory", via `en_leak_catalog.py`, before 75-29. The whole catalog has 212 files / 401 leaf findings. Pages outside the audited rendered set account for 72 files / 293 leaf findings: ru 51, ar 33, hi 129, zh 80.
  - Most of it is on route pages (`content/routes/<loc>/prague-*.json`) and on `/privacy`, `/terms` and `/data-deletion`.
  - Two kinds of finding:
    - Proper nouns that are allowlist candidates (venues, border crossings, Czech/German place names, tech vendors on the privacy page).
    - Latin loanwords of the same families as the 75-29 rows. For hi, many of these are now intentional under the 75-29 keep-per-glossary decision (airport, flight, terminal, pickup, driver, chauffeur and so on). The rest are genuinely untranslated fragments: ru `fast-track`, English airport names such as `Prague Airport`, `Old Town`, `WiFi`, cookie/consent terms.
  - Follow-up: run `python3 scripts/qa/en_leak_catalog.py` against the post-75-29 allowlist. Then triage per locale into allowlist additions and catalog rewrites (translated in-session, then frozen), and extend `en_leak_rendered.py` PAGES with a sample of route pages.

- **Content rule conflict: Uber comparison in the airport-transfer copy (content follow-up, not changed here).**
  - The English `/services/airport-transfer` copy (`content/pages/en/services/airport-transfer.json`, FAQ "How does PRESTIGO compare to taking an Uber from the airport?") compares the service with the Uber taxi rank at PRG, including a fare comparison. All six translations carry the same entry (`content/pages/{ru,es,fr,ar,hi,zh}/services/airport-transfer.json`).
  - This conflicts with the project's content rule: never compare against Uber or ride-hailing, compare with the train or a budget flight, or sell on value.
  - The same theme appears in blog content: `content/blog/<loc>/premium-airport-transfer-prague-shortcut.mdx`, `content/blog/<loc>/prague-airport-arrivals-guide.mdx`, and the EN-only JSX posts `app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx` and `prague-airport-to-city-center/page.tsx`.
  - Follow-up: rewrite the FAQ entry in EN and re-translate it into all six locales in-session, then freeze. Review the blog posts against the rule too. Any rewrite must also avoid stating prices (no-prices content rule).

## 75-36 (gap round 2 production re-verification: explicit deferrals, none of them an English leak)

GAP-4 is closed on production (see 75-QA-RESULTS.md "Full production sweep (plan 75-36)"). The review items below are not fixed in gap round 2. Each is deferred on purpose, with the reason.

- **WR-06: malformed Meta pixel ID or CAPI token still turns tracking off silently** (`lib/meta-pixel-id.ts`, `app/api/meta-capi/route.ts`, `components/MetaPixel.tsx`). Deferred: this is observability (a warn-once log on a bad env value), not an English leak. The live pixel works (GAP-2, 14/14 at 75-30). Follow-up: add the server-side warn-once from 75-REVIEW.md WR-06.
- **IN-01: MDX link helper would double-prefix an href that already carries a locale** (`mdx-components.tsx`). Deferred: no MDX file contains a locale-prefixed internal link today (grep in 75-REVIEW), so nothing renders wrong. It is not an English leak. Follow-up: return a plain `<a>` when the first path segment is a configured locale, before the next AI translation run.
- **IN-02: testimonials check only `quote` before reading `role`/`sourceLabel`** (`components/TestimonialsCarousel.tsx`). Deferred: the catalogs are complete for all 6 locales (`i18n-translate.mjs --check` PASSED at 75-35), so no partial entry exists. It is not an English leak. Follow-up: gate each field with its own `t.has`.
- **IN-03: CAPI token put into the Graph URL without encoding** (`app/api/meta-capi/route.ts`). Deferred: robustness for a token containing `&`, `#` or a space. It is not an English leak, and CAPI works in production. Follow-up: build the URL with `URL.searchParams`.
- **IN-04: `analytics_locale_audit.py` can skip `route.abort()` on a binary request body.** Deferred: QA-script robustness only. Requests are never forwarded, so T-75-13 holds. Follow-up: `try/finally: route.abort()` or `post_data_buffer`.
- **IN-05 residual: the raw 404 error shell has no `lang` attribute.** On production `/ru/this-page-does-not-exist` and `/ru/blog/<unknown>` serve `<html id="__next_error__">` without `lang` in the server HTML. This is Next.js framework behaviour for the not-found error shell. The raw `<title>`/meta are now localized (share_meta `notfound-title` 0), and the hydrated `lang`/`dir` are correct (notfound_audit 21/21). Deferred: framework limitation, not English text.
- **twitter:image keeps `/og-image.jpg` on pages with a custom og image** (e.g. the ru MDX post: `og:image` is the cover, `twitter:image` is `/og-image.jpg`). Deferred: not a text leak. It is kept on purpose, so pages whose openGraph has no image never lose `twitter:image`. Follow-up (optional): mirror `og:image` into twitter where a page sets one.
- **`og:locale` is absent on pages that override `openGraph`** (e.g. the ru MDX post; `/ru/data-deletion`, which uses the layout default, has `og:locale=ru_RU`). Deferred: a machine code, not visible text.
- **Pages without their own openGraph override show the localized site default instead of a page-specific share title** (e.g. `/ru/data-deletion` og:title "PRESTIGO — премиальный сервис трансферов с водителем в Праге"). Deferred: the text is localized, so it is not an English leak. Page-specific share titles are an SEO/share-quality follow-up.
- **GAP-1 (RU/AR signed-in account path):** closed by the user override recorded in 75-VERIFICATION.md. WINDOWS #25 was not touched by this plan; the verifier/orchestrator decides its status.
