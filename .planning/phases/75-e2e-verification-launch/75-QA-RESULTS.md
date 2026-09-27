# Phase 75, Plan 18 — Pre-deploy Gate Results (D-15)

Run date (UTC): 2026-09-26
Base: `v2.2` (`b62ebee1`) → this worktree's HEAD after plan 75-18 Task 3.
Environment: git worktree (symlinked `node_modules` — see "Known environment-only failures" below).

## Pre-deploy gate

Commands run in order, each recorded with exit code and totals.

### 1. `npx vitest run` (full suite)

**Exit code:** 1 (5 failed suites — see "Known environment-only failures")
**Totals:** 159 test files (152 passed, 5 failed, 2 skipped) · 2788 tests (2639 passed, 10 skipped, 139 todo)

**Failing files (all pre-existing, worktree-environment-only — see below):**
- `tests/account-trips.test.tsx`
- `tests/auth-customer.test.ts`
- `tests/login-actions.test.ts`
- `tests/passenger-actions.test.ts`
- `tests/profile-actions.test.ts`

**D-15 classification of the 5 failing files:**

`git diff --name-only v2.2..HEAD` shows all 5 test files (and the 3 server-action modules they cover — `app/[locale]/account/trips/page.tsx`, `app/[locale]/login/actions.ts`, `app/[locale]/account/actions.ts`) ARE v3.0-touched (modified by earlier Phase 75 plans, e.g. 75-15). Per D-15 this would normally require a fix. The failure itself, however, is not a code regression: every one of the 5 fails at **import time** with `Cannot find module '.../node_modules/next-intl/dist/esm/development/server.react-server.js'` — a relative path into `node_modules` that only resolves from the **main checkout's** `node_modules` tree, not this worktree's symlinked stub (`ln -s <main-repo>/node_modules node_modules`, per this executor's setup instructions). This is identical to the issue independently documented in `75-10-SUMMARY.md` and `75-11-SUMMARY.md` ("5 suites, worktree-environment-specific, not introduced by this plan... none of the 5 failing files were touched by this plan['s own task]"). On the main checkout at this same base commit, the full suite is reported 100% green. **Written justification (D-15): not fixed, not removed** — the failure is an artifact of worktree-relative module resolution that does not reproduce after merge to `main`, and none of the 5 files were modified by plan 75-18 itself. No test was skipped or deleted to reach this state.

**No other failures.** Every other test file — including this plan's own `tests/i18n-freeze-manifest.test.ts` (32 tests), `tests/content-metricool.test.ts` (9 tests), and `tests/content-locale-parity.test.ts` (313 tests, new) — passes.

### 2. `node scripts/i18n-translate.mjs --check`

**Exit code:** 0
**Output:** `✓ i18n-translate --check: PASSED — [ru, es, fr, ar, hi, zh] complete vs messages/en.json, EN unchanged, no API calls made`

Run after committing Task 3's changes (the check asserts EN sources are clean per `git diff`).

### 3. `npx tsc --noEmit`

**Exit code:** 2
**Errors:** 8, across 3 files — all pre-existing, none in a file this plan modified:

| File | Errors | v2.2..HEAD touched? |
|---|---|---|
| `tests/i18n-translate-dnt.test.ts` | 2 (`TS2339`) | yes (by an earlier phase-75 plan, not 75-18) |
| `tests/nav-auth.test.tsx` | 5 (`TS2502`) | yes (by an earlier phase-75 plan, not 75-18) |
| `tests/passenger-actions.test.ts` | 1 (`TS2493`) | yes (by an earlier phase-75 plan, not 75-18) |

Identical to the set independently documented in `75-10-SUMMARY.md` and `75-11-SUMMARY.md` ("Zero tsc errors exist under any file this plan modified"). D-15 (the vitest baseline rule) does not extend to `tsc`; per the executor's Scope Boundary rule these are pre-existing, unrelated-file issues left for whichever plan owns them (or a dedicated cleanup). Zero `tsc --noEmit` errors in any file plan 75-18 created or modified (`scripts/i18n-freeze-manifest.mjs`, `tests/i18n-freeze-manifest.test.ts`, `tests/content-locale-parity.test.ts`, `tests/content-metricool.test.ts`, `lib/content/metricool.ts`, `app/[locale]/contact/page.tsx`) — confirmed by filtering `tsc`'s output against this plan's `files_modified`.

### 4. `npm run lint`

**Exit code:** 1
**Totals:** 60 problems (42 errors, 18 warnings) across ~22 files — all pre-existing, none in a file this plan modified.

Breakdown: the errors are almost entirely `@next/next/no-html-link-for-pages` (raw `<a>` navigation) across several `app/[locale]/**` route/blog pages and `components/**` files, plus `@typescript-eslint/no-explicit-any` / `@typescript-eslint/ban-ts-comment` in 3 unrelated test files (`tests/cron-purge.test.ts`, `tests/gnet-client.test.ts`, `tests/gnet-farmin.test.ts`). None of these files are in plan 75-18's `files_modified`. Per the same Scope Boundary rule applied to `tsc` above (Rule N/A — out-of-scope, pre-existing, unrelated files), this is recorded, not fixed, here. Fixing ~20 unrelated files' lint debt is a scope decision for a dedicated cleanup plan, not an in-place auto-fix under this plan's Rules 1-3. Zero lint errors/warnings in any file plan 75-18 created or modified.

### 5. `node scripts/qa/en_leak_static.mjs`

**Exit code:** 1 (raw) — see classification below.
**Totals:** 19 files with findings, 149 findings (R1=118, R2=25, R3=1, R4=1... see file-by-file table).

**Two genuine, customer-facing leaks were found and fixed** before this final run (both outside the pre-documented UNOWNED admin bucket):

1. **`app/[locale]/contact/page.tsx`** (R2) — the hero background `<Image>`'s `alt` attribute was hardcoded English: `alt="Contact PRESTIGO — Premium Chauffeur Prague"`. Externalized to `content.hero.imageAlt` in `content/pages/en/contact.json`, hand-translated in-session (D-08) into ru/es/fr/ar/hi/zh, wired into the component, and frozen into `i18n/translation-manifest.json` via a new `freeze/75-18.freeze` pattern (`content/pages/en/contact.json::hero.imageAlt`). `node scripts/i18n-freeze-manifest.mjs --verify` now reports 355 frozen units (was 354).
2. **`components/Footer.tsx`** + the same contact page (R1) — both hardcode the `chelautotrans s.r.o.` legal entity's physical postal address (`"Spojovací 685, Vysoký Újezd"`). A postal address must never be translated (mail must reach the actual physical location) — the same treatment the DNT registry already gives the legal entity name itself. Added to `scripts/qa/en_leak_allowlist.json`'s `dnt` category with that reasoning, rather than "translating" a street address into 6 scripts, which would be actively incorrect.

**Remaining 149 findings — all in the pre-documented UNOWNED bucket, no action taken:**

`components/admin/**` (18 files, 148 R1/R2/R3 findings) plus one R4 in `app/[locale]/page.tsx` (a person's name in JSON-LD — R4 never affects the exit code, and a name is not translatable content). Every `components/admin/*` finding matches — file-for-file, closely matching finding-count-for-finding-count — the `### UNOWNED (admin panel — explicitly out of i18n scope per STATE.md)` bucket already recorded in `75-EN-LEAK-AUDIT.md` by an earlier phase-75 plan, and `tests/locale-links-backstop.test.ts` already filters this exact directory out of its own R3 assertion with the comment *"`components/admin/**` is explicitly OUT of i18n scope (STATE.md: 'Do NOT localize...')"*. `app/(internal)/admin/**` itself sits entirely outside the `app/[locale]` tree and is never localized; `components/admin/**` is only reachable from that internal, English-only dashboard (`grep -rl "components/admin/" app/[locale]` returns nothing) — confirmed no customer-facing route imports any admin component.

**Effective (non-admin) result:** filtering `components/admin/**` out — the same filter `tests/locale-links-backstop.test.ts` already applies — leaves **zero** actionable R1/R2/R3 findings (one R4, review-only). The raw CLI exit code of 1 is entirely attributable to the pre-existing, already-classified UNOWNED bucket; scoping `en_leak_static.mjs`'s own `scanTree()` to skip `components/admin` the way it already skips `app/[locale]/admin` was considered but rejected as out of this plan's scope — the existing, human-approved convention (STATE.md + `75-EN-LEAK-AUDIT.md`) is to record and exclude at the consuming-test level, not to modify the shared scanner.

### 6. `npx vitest run tests/locale-links-backstop.test.ts`

**Exit code:** 0
**Totals:** 2/2 passed.

### 7. `npx next build` (recorded, environment-limited)

**Exit code:** 1 — but only after `✓ Compiled successfully` and `Finished TypeScript` (the Next.js build's own type-check pass, separate from `tsc --noEmit` above) both succeed. The build then fails during **static page prerendering** for locale pages that reach Supabase-backed code paths (`/en/terms`, `/es/faq`, `/en/blog/prague-vienna-transfer-vs-train`, ...) with:

```
Error: @supabase/ssr: Your project's URL and API key are required to create a Supabase client!
```

`.env.local` is sandbox-denied to this executor and carries no usable Supabase credentials in this worktree (matches the project's own documented Vercel Preview failure mode — "missing Supabase env → /_not-found prerender error"). **Classification: environment-limited**, per this plan's own action ("a failure caused only by missing server-only env vars locally is recorded as environment-limited; a code/type/route-export failure must be fixed"). No code, type, or route-export failure was observed — compilation and typechecking both pass.

## Summary

| Command | Exit | Status |
|---|---|---|
| `npx vitest run` | 1 | 5 pre-existing worktree-only import failures (D-15 written justification above); all other 2639 tests pass |
| `node scripts/i18n-translate.mjs --check` | 0 | PASS |
| `npx tsc --noEmit` | 2 | 8 pre-existing errors, 3 unrelated files, none touched by this plan |
| `npm run lint` | 1 | 42 pre-existing errors + 18 warnings, ~22 unrelated files, none touched by this plan |
| `node scripts/qa/en_leak_static.mjs` | 1 | 149 findings, all in the pre-documented UNOWNED admin bucket (+1 review-only R4); 0 actionable non-admin findings after 2 genuine leaks fixed |
| `npx vitest run tests/locale-links-backstop.test.ts` | 0 | PASS (2/2) |
| `npx next build` | 1 | environment-limited (missing Supabase env only); compiles + typechecks clean |

The tree is frozen (355 units, `--verify` PASSED), content/locale parity is proven (313 cases), the Metricool client is draft-capable, and the two genuine customer-facing EN leaks the gate surfaced are fixed and translated. Every remaining non-zero exit is either a documented worktree-only artifact (vitest), a pre-existing/unrelated-file issue this plan is out of scope to fix (tsc, lint, admin-panel leak findings), or an environment limitation (next build, missing local Supabase credentials) — none block the deploy in plan 75-19.

## Deploy & smoke (plan 75-19, 2026-09-26)

- **Decision (Task 1):** human chose "Через PR (Recommended)", i.e. deploy-via-pr.
- **Pre-push secret scan:** 6809 added lines scanned for sk_live_/rk_live_/sk_test_/whsec_/JWT/private key/AKIA/re_/SERVICE_ROLE_KEY=/password literals and .env paths. 0 hits.
- **Precondition:** 75-17-SUMMARY records option-a plus the migration 062 MCP verification (column, constraint, 0 grants). Satisfied.
- **Deploy:** PR https://github.com/RomanUst/prestigo-website/pull/37 (branch `release/phase-75-i18n`, merge commit `960e4e0f`). The Vercel Production deployment reported `success`.
- Wave 1 (75-01..12, 75-15) had already reached production earlier via PR #35 / #36 (branches created from local main).

| # | Smoke check | Result |
|---|-------------|--------|
| 1 | `/ru/fleet` `<title>` | `Наш автопарк — автомобили Mercedes с водителем в Праге \| PRESTIGO`. PASS |
| 2 | `/ru/routes/prague-berlin` links | 8× `href="/ru/book"`, 0× `href="/book"`. PASS |
| 3 | `/` HTML contains ga-init `site_locale` | 1 occurrence. PASS |
| 4 | `csp_regression.py --compare https://rideprestigo.com` | exit 0, 11 route classes, 0 findings. PASS |
| 5 | `render_audit.py https://rideprestigo.com --locales ar` | exit 1: 21 URLs, 1 finding: `/ar/login` missing canonical. This is a **pre-existing baseline** finding (75-QA-BASELINE.md rows 24-30, all 7 locales; page is `noindex`), not a regression. Deferred to 75-20. |

Observation for 75-20: `/zh/<nonexistent>` renders an English "Page not found" h1. Check whether the root `app/not-found.tsx` vs `app/[locale]/not-found.tsx` (localized in 75-13) is reached for unknown locale paths.

### Human setup (plan 75-19 Task 3)

- **A) GA4 custom dimension "Site Locale" (event-scoped, parameter `site_locale`):** the user confirmed on 2026-09-26 that it is registered. Could not be cross-checked: the analytics MCP returned `invalid_grant`.
- **B) E2E test account:** the user reported it as created, but `scripts/qa/.e2e-account.json` was not present when checked (the path is git-ignored, verified with `git check-ignore`). Plan 75-20 runs the D-04 RU/AR account path only if the file exists at run time; otherwise it records the path as SKIPPED.
- **Delete test account after QA:** YES (user decision). Delete only the E2E TEST account, after 75-20.
- **User directive "no data may be lost":** QA cleanup (the 16 E2E booking refs and the test account) must delete only records verified as E2E/TEST, unpaid, and with no Stripe payment. Show the list to the user before any deletion.

## Production QA — ar tracer (Plan 75-20, Task 1)

Run date (UTC): 2026-09-26. Target: `https://rideprestigo.com`. This is the
first post-deploy production run — Phase 75's other plans (75-02..75-18) have
now landed on `main` (PR #37, merge `960e4e0f`). Every script below ran with
`--locales ar` (or is locale-independent) and is compared against
`75-QA-BASELINE.md`'s pre-change numbers.

| Script | Command | Exit | Baseline (all 7 / all-locale) | Now (ar / locale-independent) | Delta |
|---|---|---|---|---|---|
| `render_audit.py` | `--locales ar` | 1 | 7 findings (`/login` missing canonical, all 7 locales) | 1 finding: `/ar/login` missing canonical | Matches baseline exactly — same pre-existing, unfixed defect, ar's one row of the 7 |
| `switcher_audit.py` | `--locales ar` | 0 | 63 ops, 0 findings (all 7 sources) | 9 ops (ar source: 6 target pairs on `/routes/prague-vienna` + 3 rotating on `/`, `/book`, `/fleet`), 0 findings | Clean, consistent with baseline |
| `en_leak_rendered.py` | `--locales ar` | 1 | 373 text leaks, 234 link leaks (pre-fix, ar only) | 58 text leaks, 15 link leaks (post-fix, ar only) | Large reduction (373→58 text, 234→15 link) — Phase 75's fix plans (75-06..75-16) closed the great majority of ar's pre-fix leaks. Remaining findings recorded below (real gaps, not patched in this plan per Task 1's "do not patch and redeploy" rule) |
| `jsonld_audit.py` | `--locales ar` | 0 | 84 blocks (7 locales x 7 pages), 0 findings | 12 blocks (ar x 7 pages), 0 findings | Clean, consistent with baseline |
| `analytics_locale_audit.py` | `--locales ar` | 1 | N/A (script did not exist pre-change; D-10/D-12 built in Phase 75) | ar `/` and `/book`: `ga4SiteLocale=True` (PASS), `metaSiteLocale=False` (FAIL, `metaHits=0`) | New gap: Meta Pixel never fires at all on production (`metaHits=0`) — this is the pre-known WINDOWS.md #15 defect (`NEXT_PUBLIC_META_PIXEL_ID`/`META_PIXEL_ID` env var has a trailing newline breaking the `fbq` init script), not a Phase 75 regression. GA4 `site_locale` passes. |
| `booking_e2e.py` (guest) | `--locales ar` | 0 | N/A (script did not exist pre-change) | 1 run: `reachedStripe=true`, `bookingReference=PRG-20260926-5BEA0C`, `stripeLocaleParam=ar` (expected `ar`), `placesLanguage=ar` (expected `ar`), `htmlLang=ar`, `htmlDir=rtl`, `localeChecksPassed=true`, `durationMs=11406` | PASS — RTL guest booking reaches Stripe with correct locale on both Stripe Elements and Google Places |
| `hreflang_reciprocity.py` | (locale-independent) | 1 | 63 clusters, 417 alternates, 4 reciprocity errors (3 EN-only blog posts + `/authors/roman-ustyugov`, D-09 intentional allowlist) | 63 clusters, 423 alternates, 3 reciprocity errors (same 3 EN-only blog posts; `/authors/roman-ustyugov` no longer in the failure list) | Improvement — the author page picked up a full hreflang cluster somewhere in Phase 75 (75-11 externalized `/authors/roman-ustyugov`); remaining 3 failures are the same D-09 intentional EN-only `JSX_POSTS` exclusion, not a regression |
| `csp_regression.py --compare` | (locale-independent) | 0 | 11 route classes, 0 findings (self-consistency check right after capture) | 11 route classes, 0 findings | No CSP drift — the golden pre-change baseline still holds after all Phase 75 code landed |

**Acceptance criteria check (Task 1):**
- Every script ran for `ar` and its exit code is recorded above. ✓
- The `ar` guest booking run shows `reachedStripe=true`, `stripeLocaleParam=ar`, `htmlDir=rtl`. ✓
- Comparison against `75-QA-BASELINE.md` baseline numbers is recorded per-script above. ✓

**ar text-leak findings detail** (`en_leak_rendered.py --locales ar`, 58 text leaks / 15 link leaks across 26 pages) — recorded as a verification gap, not fixed in this plan:

| Page | Leaks | Link leaks | Sample finding |
|---|---|---|---|
| `/` | 3 | 0 | English testimonial quote text ("Our driver was waiting before we even cleared customs...") |
| `/fleet` | 3 | 0 | Arabic sentence containing an unallowlisted Latin brand/model run |
| `/services` | 4 | 0 | Arabic sentence containing an unallowlisted Latin run |
| `/services/airport-transfer` | 5 | 0 | Arabic sentence containing an unallowlisted Latin run |
| `/services/city-rides` | 7 | 0 | Arabic sentence containing an unallowlisted Latin run |
| `/services/intercity-routes` | 3 | 0 | Arabic sentence mentioning USB-A/USB-C/Wi-Fi (DNT-adjacent tech terms, not yet allowlisted) |
| `/services/vip-events` | 2 | 0 | Arabic sentence containing an unallowlisted Latin run |
| `/services/concierge` | 2 | 0 | Arabic sentence containing an unallowlisted Latin run (place name "Malá...") |
| `/routes` | 2 | 0 | Arabic sentence mentioning "Mercedes E-Class" (brand/model DNT terms embedded mid-sentence) |
| `/routes/prague-ceske-budejovice` | 2 | 0 | Arabic sentence, RTL mark + place name |
| `/contact` | 1 | 0 | Placeholder email example `ahmed@email.com` (Latin, expected — email format) |
| `/faq` | 2 | 0 | Arabic sentence mentioning "Wi-Fi" |
| `/book` | 1 | 0 | Arabic sentence mentioning payment methods (Visa etc.) |
| `/book/multi-day` | 1 | 0 | Arabic sentence mentioning "Mercedes E-Class"/"Mercedes S-Class" vehicle-class DNT terms |
| `/blog` | 2 | 0 | "Intercity Routes" (English link/heading text) |
| `/login` | 4 | 0 | "PRESTIGO — Premium Chauffeur Service Prague" (metadata/title, EN) |
| `/authors/roman-ustyugov` | 6 | 0 | "Roman Ustyugov" (person name, not translatable — likely allowlist gap for names) |
| `/blog/beyond-transport-luxury-chauffeur-service-prague` | 5 | 3 | "Roman Ustyugov" author name + 3 link leaks (`/blog/prague-airport-meet-and-greet`, `/services/corporate-accounts`, `/services/intercity-routes` missing `/ar/` prefix) |
| `/blog/prague-airport-to-city-center` | 0 | 3 | D-09 EN-only post — text correctly allowlisted; 3 link leaks are its own internal nav dropping the locale prefix (pre-known 75-13 finding) |
| `/this-page-does-not-exist` | 3 | 1 | "Page not found" (404 page, `app/[locale]/not-found.tsx` not localized — pre-known 75-16 finding) |

Most remaining ar leaks are either (a) brand/model/tech-term Latin runs embedded mid-Arabic-sentence that the DNT allowlist does not yet cover mid-sentence, (b) person names (not translatable), or (c) two already-known, already-owned findings (404 page not localized — 75-16; blog post internal nav dropping locale prefix — 75-13). None of these were fixed in this Task-1 tracer per the plan's explicit "do not patch and redeploy" instruction — they carry into Task 2's full-locale sweep and VER-01 facet summary as concrete gap evidence.

## Production QA — all locales (Plan 75-20, Task 2)

Run date (UTC): 2026-09-26/27. Target: `https://rideprestigo.com`, all 7 locales.

| Script | Command | Exit | Baseline | Now | Delta |
|---|---|---|---|---|---|
| `render_audit.py` | (all locales) | 1 | 147 URLs, 7 findings (`/login` missing canonical, all 7 locales) | 147 URLs, 7 findings — identical set (`/login` missing canonical, all 7 locales) | No change — same pre-existing, unfixed defect |
| `switcher_audit.py` | (all locales) | 0 | 63 ops, 0 findings | 63 ops, 0 findings | No change — clean |
| `jsonld_audit.py` | (all locales) | 0 | 84 blocks, 0 findings | 84 blocks, 0 findings | No change — clean |
| `en_leak_static.mjs` | (repo) | 1 | N/A (script built in this phase) | 19 files, 149 findings — all in the pre-documented UNOWNED `components/admin/**` bucket (+1 review-only R4 in `app/[locale]/page.tsx`, a JSON-LD person name) | 0 actionable customer-facing findings (matches 75-18's pre-deploy gate result exactly — no static regression introduced by the deploy) |
| `en_leak_rendered.py` | (ru,es,fr,ar,hi,zh) | 1 | 2003 text leaks, 1404 link leaks (pre-fix, all 6 locales) | 329 text leaks, 90 link leaks (post-fix, all 6 locales) | Large reduction (2003→329 text, 1404→90 link) — see per-locale/per-page breakdown below for the real remaining gaps |
| `analytics_locale_audit.py` | (all locales) | 1 | N/A (script built in this phase) | GA4 `site_locale` PASS on all 7 locales x 2 pages (`/`, `/book`); Meta `site_locale` FAIL on all 7 locales x 2 pages — `metaHits=0` every time (Meta Pixel never fires at all) | D-10/D-12 GA4 half fully proven; Meta half blocked entirely by the pre-known WINDOWS.md #15 env-var defect (not a Phase 75 regression — recorded as a gap below) |
| `hreflang_reciprocity.py` | (locale-independent) | 1 | 63 clusters, 417 alternates, 4 reciprocity errors | 63 clusters, 423 alternates, 3 reciprocity errors | Improvement (author page now clean); remaining 3 are the D-09 intentional EN-only `JSX_POSTS` allowlist, not a regression |
| `csp_regression.py --compare` | (locale-independent) | 0 | 11 route classes, 0 findings | 11 route classes, 0 findings | No drift — golden baseline holds after all Phase 75 code landed |
| `overflow_audit.py` | 320px | 0 | 0 issues (2026-09-24) | 0 issues | No change |
| `overflow_audit.py` | 375px | 0 | 0 issues | 0 issues | No change |
| `overflow_audit.py` | 768px | 1 | 0 issues | 1 page with issues: `/ru/fleet` — 2 `<p>` elements overflow their container (Russian maintenance-copy paragraphs, `scrollWidth` 143/150 vs `clientWidth` 131) | **New gap** — translated RU copy on `/fleet` overflows at 768px tablet width; not present in the pre-translation baseline since the English source text was shorter |
| `overflow_audit.py` | 1024px | 0 | 0 issues | 0 issues | No change |
| `overflow_audit.py` | 1280px | 0 | 0 issues | 0 issues | No change |

### en_leak_rendered per-locale totals (post-fix, production)

| Locale | Baseline text leaks | Now text leaks | Baseline link leaks | Now link leaks |
|---|---|---|---|---|
| ru | 380 | 69 | 234 | 15 |
| es | 232 | 10 | 234 | 15 |
| fr | 232 | 10 | 234 | 15 |
| ar | 373 | 58 | 234 | 15 |
| hi | 405 | 111 | 234 | 15 |
| zh | 381 | 71 | 234 | 15 |

Link leaks dropped from 234 to 15 on every locale (the same 15 pages/links for every locale — a structural, locale-independent fix from the Phase 75 navigation plans, primarily 75-13/75-14/75-15's `next/link`→`@/i18n/routing` `Link` swaps). The remaining 15 per locale are the 9 internal-nav link leaks on `/blog/beyond-transport-luxury-chauffeur-service-prague` (`ArticleByline`/`BlogCard` residual — matches the "RESOLVED in 75-14" note in `deferred-items.md`'s 75-13 entry, confirming that fix closed the byline import but the surrounding blog-post body copy still emits a few unprefixed CTAs), 5 on the D-09 EN-only `/blog/prague-airport-to-city-center` post's own internal nav, and 1 on the 404 page.

### en_leak_rendered per-page detail (post-fix, non-zero rows only)

| Locale | Page | Text leaks | Link leaks | Owning plan / note |
|---|---|---|---|---|
| ru | `/` | 3 | 0 | 75-13 |
| ru | `/fleet` | 6 | 0 | 75-08 |
| ru | `/services` | 3 | 0 | 75-11 |
| ru | `/services/airport-transfer` | 13 | 0 | 75-11 |
| ru | `/services/city-rides` | 4 | 0 | 75-11 |
| ru | `/services/intercity-routes` | 3 | 0 | 75-11 |
| ru | `/services/vip-events` | 2 | 0 | 75-11 |
| ru | `/services/concierge` | 1 | 0 | 75-11 |
| ru | `/routes` | 2 | 0 | 75-09 |
| ru | `/routes/prague-ceske-budejovice` | 2 | 0 | 75-10 |
| ru | `/corporate` | 2 | 0 | 75-12 |
| ru | `/contact` | 1 | 0 | 75-11 |
| ru | `/faq` | 2 | 0 | 75-11 |
| ru | `/book` | 2 | 0 | 75-06 |
| ru | `/book/multi-day` | 1 | 0 | 75-07 |
| ru | `/blog` | 4 | 0 | 75-13 |
| ru | `/login` | 4 | 0 | 75-11 |
| ru | `/authors/roman-ustyugov` | 6 | 0 | 75-11 (person name — see allowlist note below) |
| ru | `/blog/beyond-transport-luxury-chauffeur-service-prague` | 5 | 9 | 75-13 |
| ru | `/blog/prague-airport-to-city-center` | 0 | 5 | 75-13 (D-09 text OK, own nav link leak) |
| ru | `/this-page-does-not-exist` | 3 | 1 | 75-16 / **root-cause found below** |
| es | `/` | 2 | 0 | 75-13 |
| es | `/services/airport-transfer` | 2 | 0 | 75-11 |
| es | `/authors/roman-ustyugov` | 1 | 0 | 75-11 |
| es | `/blog/beyond-transport-luxury-chauffeur-service-prague` | 3 | 9 | 75-13 |
| es | `/blog/prague-airport-to-city-center` | 0 | 5 | 75-13 |
| es | `/this-page-does-not-exist` | 2 | 1 | 75-16 |
| fr | `/` | 2 | 0 | 75-13 |
| fr | `/services/airport-transfer` | 2 | 0 | 75-11 |
| fr | `/authors/roman-ustyugov` | 1 | 0 | 75-11 |
| fr | `/blog/beyond-transport-luxury-chauffeur-service-prague` | 3 | 9 | 75-13 |
| fr | `/blog/prague-airport-to-city-center` | 0 | 5 | 75-13 |
| fr | `/this-page-does-not-exist` | 2 | 1 | 75-16 |
| ar | (all rows) | 58 total | 15 total | see "ar text-leak findings detail" table above (Task 1) |
| hi | `/` | 4 | 0 | 75-13 |
| hi | `/fleet` | 6 | 0 | 75-08 |
| hi | `/services` | 4 | 0 | 75-11 |
| hi | `/services/airport-transfer` | 13 | 0 | 75-11 |
| hi | `/services/city-rides` | 4 | 0 | 75-11 |
| hi | `/services/intercity-routes` | 5 | 0 | 75-11 |
| hi | `/services/vip-events` | 3 | 0 | 75-11 |
| hi | `/services/group-transfers` | 3 | 0 | 75-11 |
| hi | `/services/concierge` | 6 | 0 | 75-11 |
| hi | `/routes` | 2 | 0 | 75-09 |
| hi | `/routes/prague-vienna` | 10 | 0 | 75-10 |
| hi | `/corporate` | 2 | 0 | 75-12 |
| hi | `/contact` | 4 | 0 | 75-11 |
| hi | `/faq` | 3 | 0 | 75-11 |
| hi | `/book` | 18 | 0 | 75-06 |
| hi | `/book/multi-day` | 2 | 0 | 75-07 |
| hi | `/blog` | 4 | 0 | 75-13 |
| hi | `/login` | 4 | 0 | 75-11 |
| hi | `/authors/roman-ustyugov` | 6 | 0 | 75-11 |
| hi | `/blog/beyond-transport-luxury-chauffeur-service-prague` | 5 | 9 | 75-13 |
| hi | `/blog/prague-airport-to-city-center` | 0 | 5 | 75-13 |
| hi | `/this-page-does-not-exist` | 3 | 1 | 75-16 |
| zh | `/` | 3 | 0 | 75-13 |
| zh | `/fleet` | 6 | 0 | 75-08 |
| zh | `/services` | 3 | 0 | 75-11 |
| zh | `/services/airport-transfer` | 11 | 0 | 75-11 |
| zh | `/services/city-rides` | 6 | 0 | 75-11 |
| zh | `/services/intercity-routes` | 3 | 0 | 75-11 |
| zh | `/services/vip-events` | 2 | 0 | 75-11 |
| zh | `/services/concierge` | 1 | 0 | 75-11 |
| zh | `/routes` | 2 | 0 | 75-09 |
| zh | `/routes/prague-vienna` | 2 | 0 | 75-10 |
| zh | `/routes/prague-ceske-budejovice` | 2 | 0 | 75-10 |
| zh | `/corporate` | 1 | 0 | 75-12 |
| zh | `/contact` | 1 | 0 | 75-11 |
| zh | `/faq` | 3 | 0 | 75-11 |
| zh | `/book` | 1 | 0 | 75-06 |
| zh | `/book/multi-day` | 1 | 0 | 75-07 |
| zh | `/blog` | 4 | 0 | 75-13 |
| zh | `/login` | 4 | 0 | 75-11 |
| zh | `/authors/roman-ustyugov` | 8 | 0 | 75-11 |
| zh | `/blog/beyond-transport-luxury-chauffeur-service-prague` | 4 | 9 | 75-13 |
| zh | `/blog/prague-airport-to-city-center` | 0 | 5 | 75-13 |
| zh | `/this-page-does-not-exist` | 3 | 1 | 75-16 |

**Root-cause found for the recurring `/this-page-does-not-exist` (404) finding on every locale — a genuine, systemic gap:**

`app/[locale]/not-found.tsx` IS fully localized (`useTranslations('NotFound')`, RU/ES/FR/AR/HI/ZH catalog entries all present) — but there is **no catch-all route** (`app/[locale]/[...catchAll]/page.tsx` or similar) under the `[locale]` segment tree. Next.js's App Router only invokes a nested `not-found.tsx` boundary when the request structurally resolves into that segment tree via a matching page (or a page explicitly calls `notFound()`); an arbitrary unmatched path like `/zh/this-page-does-not-exist` never matches any `app/[locale]/**/page.tsx`, so Next falls through to the top-level `app/not-found.tsx` (hardcoded `lang="en"`, "Page not found" / "Back to Home") instead of the localized one. Confirmed by reading both files: `app/not-found.tsx`'s literal strings ("Page not found", "Back to Home") match exactly what `en_leak_rendered.py` finds on every locale's `/this-page-does-not-exist` row. This explains 75-19-SUMMARY.md's "`/zh/<unknown>` renders an English 'Page not found' h1" observation — it is not zh-specific, it reproduces on every locale identically. **Fix would require adding a catch-all page under `app/[locale]/` that calls `notFound()` to route into the already-localized boundary** — not attempted in this plan (Task 1's "do not patch and redeploy" rule); logged to `deferred-items.md`.

**Allowlist-worthy findings not fixed here (recorded as gap evidence, not patched):**
- Person names (`Roman Ustyugov`, author byline) flagged as leaks on `/authors/roman-ustyugov` and the one MDX blog post on every non-Latin-script locale (ru/ar/hi/zh) — a name is not translatable content; the allowlist does not yet have a "proper noun / person name" category distinct from the existing `dnt`/`placeNames`/`tierNames` categories.
- Brand/model/tech-term Latin runs embedded mid-sentence in translated ar/ru/hi/zh copy (`Mercedes E-Class`, `USB-A`/`USB-C`, `Wi-Fi`, `Visa`) — the DNT allowlist currently allowlists these as standalone tokens but the 2+/3+ word Latin-run heuristic still catches them when they appear inline in an otherwise-translated sentence with adjacent short connector words.

## Booking E2E (Plan 75-20, Tasks 1+2)

All runs against `https://rideprestigo.com`, guest checkout through all 6 wizard steps to a rendered Stripe payment form (D-01) — **no payment submitted**. RU/AR account path (D-04) attempted with `--account ru,ar`; both auto-skipped because `scripts/qa/.e2e-account.json` does not exist in this worktree (75-19-SUMMARY.md: user reported creating the account, file was not provided — recorded as SKIPPED per this plan's instructions, not a failure).

| Locale | Path | reachedStripe | Stripe locale (expected) | Places language (expected) | html lang/dir | Booking reference | Duration |
|---|---|---|---|---|---|---|---|
| en | guest | true | en (en) | en (en) | en/ltr | `PRG-20260926-93957D` | 25219ms |
| ru | guest | true | ru (ru) | ru (ru) | ru/ltr | `PRG-20260926-080A4D` | 9466ms |
| es | guest | true | es (es) | es (es) | es/ltr | `PRG-20260926-F250B9` | 8099ms |
| fr | guest | true | fr (fr) | fr (fr) | fr/ltr | `PRG-20260926-A516E0` | 7918ms |
| ar | guest | true | ar (ar) | ar (ar) | ar/rtl | `PRG-20260926-5BEA0C` | 11406ms |
| hi | guest | true | auto (auto — Stripe has no Hindi locale, accepted exception per D-07) | hi (hi) | hi/ltr | `PRG-20260926-4A2C2E` | 10516ms |
| zh | guest | true | zh (zh) | zh-CN (zh-CN) | zh/ltr | `PRG-20260926-5233B0` | 7971ms |
| ru | account | — | ru (expected) | ru (expected) | — | SKIPPED — `scripts/qa/.e2e-account.json` absent | — |
| ar | account | — | ar (expected) | ar (expected) | — | SKIPPED — `scripts/qa/.e2e-account.json` absent | — |

**All 7 guest checkouts passed with `localeChecksPassed=true`** — Stripe Elements locale and Google Places autocomplete language both follow the site locale exactly (D-07 surface 4), including the `hi`→`auto` and `zh`→`zh-CN` accepted exceptions documented in the script's own `EXPECTED_STRIPE_LOCALE`/`EXPECTED_PLACES_LANGUAGE` maps. The RU/AR signed-in account path (D-04) could not be exercised in this run because the E2E test account credentials file was never provided — this is a **verification gap**, not a code defect (the guest-path locale-following logic is proven working for RU and AR; only the "My trips"/signed-in variant of the same flow is unverified).

**Full recorded booking references across this phase (for orchestrator Task 3 cleanup, all carry the E2E/TEST marker):**

```
PRG-20260925-0B86E1  en  guest  2026-09-25T11:59:16.591757+00:00
PRG-20260925-5AF603  en  guest  2026-09-25T12:01:29.012665+00:00
PRG-20260925-647415  en  guest  2026-09-25T12:02:59.444775+00:00
PRG-20260925-7E451C  en  guest  2026-09-25T12:03:13.354222+00:00
PRG-20260925-8E2F78  en  guest  2026-09-25T12:03:24.912181+00:00
PRG-20260925-09A6ED  ru  guest  2026-09-25T12:07:34.470861+00:00
PRG-20260925-BD0A24  en  guest  2026-09-25T12:07:52.434319+00:00
PRG-20260925-CBEFC5  ar  guest  2026-09-25T12:08:28.347803+00:00
PRG-20260925-98E72E  hi  guest  2026-09-25T12:08:46.047561+00:00
PRG-20260925-5AFCEA  es  guest  2026-09-25T12:09:10.394742+00:00
PRG-20260925-465512  fr  guest  2026-09-25T12:09:39.427892+00:00
PRG-20260925-2C283E  zh  guest  2026-09-25T12:10:08.498348+00:00
PRG-20260925-1D15C9  en  guest  2026-09-25T12:10:33.689253+00:00
PRG-20260925-9E46A0  ru  guest  2026-09-25T12:11:02.551013+00:00
PRG-20260925-58EF01  ru  guest  2026-09-25T12:11:23.370779+00:00
PRG-20260925-65B2CC  en  guest  2026-09-25T12:11:42.086687+00:00
PRG-20260926-5BEA0C  ar  guest  2026-09-26T21:28:47.804471+00:00
PRG-20260926-93957D  en  guest  2026-09-26T22:01:13.678538+00:00
PRG-20260926-080A4D  ru  guest  2026-09-26T22:01:43.153887+00:00
PRG-20260926-F250B9  es  guest  2026-09-26T22:02:11.256314+00:00
PRG-20260926-A516E0  fr  guest  2026-09-26T22:02:39.183035+00:00
PRG-20260926-4A2C2E  hi  guest  2026-09-26T22:03:09.702743+00:00
PRG-20260926-5233B0  zh  guest  2026-09-26T22:03:37.679161+00:00
```

23 references total (16 from an earlier plan-75-03 pre-fix run + 7 new from this plan's Task 1 ar tracer + Task 2 all-locale sweep). All carry the strict E2E/TEST marker (`client_email LIKE 'e2e+%@rideprestigo.com'`, first name `E2E`, last name `TEST`, `status='unpaid'`) per D-03 — the orchestrator's Task 3 cross-checks this exact list against the production `bookings` table before any deletion.

## D-05 post-booking surfaces (Plan 75-20, Task 2)

Read directly from code (no real payment was submitted, so live email language could not be observed from an actual send — established from source instead, per the plan's own instruction).

**Confirmation page (`app/[locale]/book/confirmation/page.tsx`):** English-only. No `useTranslations`/`getTranslations` import anywhere in the file; every visible string (`BOOKING CONFIRMED`, `YOUR BOOKING REFERENCE`, `JOURNEY DETAILS`, `We will be in touch within 2 hours to confirm your journey and pricing.`, vehicle-class labels `Business`/`First Class`/`Business Van`, etc.) is a hardcoded English literal. This matches the `75-EN-LEAK-AUDIT.md` static-layer row for this file exactly (R1/R2 suppressed per D-05, R3 navigation still flagged and separately fixed). Confirmed as-is, not fixed — matches D-05's expectation ("expected: English copy on both").

**Client email builders (`lib/email.ts`, `lib/email-corporate.ts`, `lib/email-bespoke.ts`):** English-only. `grep -n "useTranslations\|getTranslations\|locale"` returns zero matches in `lib/email.ts`; every subject line and body template (`Your PRESTIGO booking is confirmed — ${ref}`, `Thank you for riding with Prestigo — ${ref}`, etc. — 16 distinct subject templates across the 3 files) is a hardcoded English template literal with no locale parameter anywhere in the call chain (the booking's locale, even though persisted per D-11, is never threaded into any email-sending function). Confirmed as-is, not fixed — matches D-05's expectation.

Both surfaces render English regardless of the booking's site locale. Logged to `deferred-items.md` as the deferred "localized client emails" capability (D-05) and the recorded-as-is confirmation-page finding.

## VER-01 facet summary (Plan 75-20)

| Facet | Status | Evidence |
|---|---|---|
| Render (7 locales x 21 pages, lang/dir/canonical/CSP) | **PASS** (with 1 pre-existing gap) | `render_audit.py`: 147/147 URLs return 200 with correct `lang`/`dir`, zero CSP violations; the only finding (`/login` missing canonical, all 7 locales) is the identical pre-change baseline defect, not a Phase 75 regression |
| Switcher (42 ordered pairs + 21 rotating, all 7 locales) | **PASS** | `switcher_audit.py`: 63/63 operations land on the same page in the target locale with correct `<html lang>`, 0 findings |
| Booking incl. RTL (guest x 7 + RU/AR account) | **PASS (guest) / GAP (account)** | All 7 guest checkouts reach a rendered Stripe form with the correct Stripe/Places locale, including `ar` RTL (`htmlDir=rtl`, `stripeLocale=ar`). RU/AR signed-in account path could not run — E2E test account credentials file was never provided (verification gap, not a code defect) |
| Analytics locale (GA4 + Meta) | **PASS (GA4) / GAP (Meta)** | `analytics_locale_audit.py`: GA4 `site_locale` present on every captured hit, all 7 locales. Meta Pixel never fires at all in production (`metaHits=0` on every locale) — pre-known WINDOWS.md #15 defect (env var trailing newline), not a Phase 75 regression, but Meta CAPI `site_locale` (D-12) is unverifiable until that's fixed |
| CSP regression | **PASS** | `csp_regression.py --compare`: 0 findings across 11 route classes — no drift vs the golden pre-change baseline |
| EN leakage (static + rendered, 2-layer) | **PASS (structural) / GAP (residual leaks)** | Static: 0 actionable customer-facing findings (149 findings are 100% the pre-documented UNOWNED admin bucket + 1 review-only R4). Rendered: text leaks reduced 2003→329 and link leaks 1404→90 across the 6 non-EN locales (Phase 75's fix plans closed the overwhelming majority); 3 concrete residual gap classes remain and are recorded above — person-name allowlist gap, mid-sentence brand/tech-term Latin runs, and the systemic 404-catch-all-routing gap (English "Page not found" on every locale's unmatched-path 404) |
| hreflang / JSON-LD | **PASS** | `hreflang_reciprocity.py`: 3 reciprocity errors, all the D-09 intentional EN-only blog allowlist (improved from 4 pre-change — the author page is now clean). `jsonld_audit.py`: 0 findings across 84 blocks, 7 locales |
| Overflow (5 widths) | **PASS (4/5) / GAP (1/5)** | 320/375/1024/1280px: 0 issues. 768px: 1 new issue — `/ru/fleet` two paragraphs overflow their container with the translated (longer) Russian maintenance copy |

**Overall VER-01 disposition:** the phase's core proof — every locale renders correctly, the switcher works, guest booking (including RTL) reaches a real Stripe form with the correct sub-locale on both Stripe Elements and Google Places, no CSP drift, and hreflang/JSON-LD are clean — is **PASS**. Five concrete, evidenced gaps remain open for follow-up (none are Phase-75-introduced regressions; all are either pre-existing/out-of-Phase-75-scope defects or newly-surfaced-by-translation edge cases): (1) Meta Pixel never fires (WINDOWS #15, pre-existing env config); (2) RU/AR signed-in account path unverified (missing test credentials, a verification gap not a code defect); (3) residual person-name/mid-sentence-brand-term EN-leak allowlist gaps; (4) the systemic English-404-on-unmatched-path defect (missing `[locale]` catch-all route); (5) `/ru/fleet` text overflow at 768px. All five are logged to `deferred-items.md` below.

## E2E cleanup (plan 75-20 Task 3, orchestrator via Supabase MCP, 2026-09-27)

- **Pre-delete marker set** (`client_email like 'e2e+%@rideprestigo.com'`, first `E2E`, last `TEST`): 18 rows total.
  - 17 `unpaid`: 14 recorded refs + 3 unrecorded early 75-03 debug runs (`PRG-20260925-6A73BB`, `-D49762`, `-DB8330`), all carrying the full marker.
  - 1 `cancelled` (`PRG-20260925-65B2CC`).
- 8 recorded refs never produced a bookings row (the reference was issued, but no row was created). Nothing to delete for those.
- Dependencies checked before deletion: 0 driver_assignments, 0 gnet_bookings, 0 audit rows, 0 non-marker bookings linking to these rows. The cancelled row has 1 email_log entry.
- **User decision:** "17 unpaid с бэкапом (Recommended)". Delete the 17 unpaid rows. Keep the cancelled test row and the user's own `PRG-20260828-954109` (no E2E marker).
- **Backup:** `.planning/phases/75-e2e-verification-launch/e2e-cleanup-backup.json`, full column data for all 17 rows, committed before the delete (`4ac008a2`).
- **Delete** (marker AND `paid_at is null` AND explicit id list) returned 17 references, equal to the pre-delete unpaid set, which contains every recorded ref that has a row.
- **Post-delete** unpaid marker count: **0**. Verified kept: `PRG-20260925-65B2CC`, `PRG-20260828-954109`.
- **Test account:** the user answered "delete after QA: yes", but no auth user matching E2E exists (0 rows), and the credentials file was never provided. Nothing to delete. The RU/AR account path (D-04) remains UNVERIFIED.

## D-14 launch (plan 75-21, 2026-09-27)

- GSC baseline: 24/42 key URLs indexed (see 75-LAUNCH.md).
- The user reported sitemap resubmitted OK, all 10 URLs accepted for indexing, and Rich Results valid on all 5 sampled URLs ("все ок").
- Metricool announcement: skipped by user decision.

## Gap closure re-verification (plan 75-30)

Run date (UTC): 2026-09-27. Target: `https://rideprestigo.com`.

### Pre-deploy gate (main checkout, HEAD `42058b28`)

| Check | Result |
|---|---|
| `npx vitest run` | 162 files / 2796 tests, exit 0 |
| `node scripts/i18n-translate.mjs --check` | PASSED |
| `node scripts/i18n-freeze-manifest.mjs --verify` | PASSED (390 frozen units) |
| `python3 -m unittest discover -s scripts/qa -p 'test_*.py'` | 29 tests OK |
| `node scripts/qa/en_leak_static.mjs` | exit 1: 18 files / 148 findings, all in the documented UNOWNED `components/admin/**` bucket. The review-only R4 in `app/[locale]/page.tsx` is gone (fixed by 75-28). 0 actionable customer-facing findings |
| Concurrency guard | `git rev-list --count HEAD..origin/main` = 0 at start and again before push (HEAD was 72 commits ahead) |
| Scope guard (`git diff --name-only origin/main...HEAD`) | 94 paths, all allowed: `.planning/**`, `scripts/qa/**`, the files_modified of 75-22..75-29, the 75-28 deviations `lib/blog-categories.ts` and `tests/shared-sections-i18n.test.tsx`, and `content/pages/ru/corporate.json` (75-29's own commit `453f34c3`, ledger row 15). No foreign path |
| Secret scan (added lines of the diff; 75-19 pattern list) | 7445 added lines, 0 real hits. One false positive: a doc line in this file that names the pattern list. No `.env*`, `.e2e-account.json` or `scripts/qa/out/**` path in the diff |

### Deploy

- Branch `release/phase-75-gaps` pushed. PR: https://github.com/RomanUst/prestigo-website/pull/38
- **Merged by the user** (checkpoint) at 2026-09-27T12:44:47Z. Merge commit `65a1eb4d9836e1ccb6a57271e63519c9d6ac64bd`. Local main fast-forwarded to it by the orchestrator. `gh pr view 38` state: `MERGED`.
- Vercel deployment `6692380135` for that sha, environment **Production**, status **success** (created 12:46:59Z; checked with `gh api .../deployments?sha=...` and `.../statuses`).
- `git ls-files scripts/qa/.e2e-account.json scripts/qa/out` prints nothing.

### Tracer checks (one per gap, production, after the deploy)

| Gap | Command | Exit | Result |
|---|---|---|---|
| GAP-4a (404) | `notfound_audit.py https://rideprestigo.com --locales zh,ar` | 0 | non-shadowing 12/12 PASS; localized 404 4/4 PASS (status 404, `lang`, `dir=rtl` on ar, localized h1 and title). Before (75-25 baseline): 0/14 localized |
| GAP-2 (Meta) | `analytics_locale_audit.py https://rideprestigo.com --locales ar` | 0 | ar `/`: ga4Hits 1, metaHits 1, ga4SiteLocale and metaSiteLocale true. ar `/book`: ga4Hits 2, metaHits 1, both true. `all_pass: True`. Before (75-20): metaHits 0 |
| GAP-3 (overflow) | from `scripts/qa/out`: `overflow_audit.py https://rideprestigo.com 768 --pages /fleet --locales ru` | 0 | pages with issues: 0. Before (75-20): `/ru/fleet` had 2 overflowing `<p>` at 768px |
| GAP-4b/c (EN leak) | `en_leak_rendered.py https://rideprestigo.com --locales ru --pages /blog/beyond-transport-luxury-chauffeur-service-prague,/this-page-does-not-exist` | 1 | MDX post: 0 text leaks, 0 link leaks (before: 5 text / 9 link). 404: 0 link leaks (before: 1). **3 text leaks remain on `/ru/this-page-does-not-exist`, all `kind: meta`**: the English site-default `description`, `og:title` and `og:description` (twitter tags carry the same values) |

**Tracer finding (new, not classified):** the localized 404 now renders inside `LocaleLayout`. Its `generateMetadata` (`app/[locale]/[...rest]/page.tsx`, plan 75-25) overrides only `title` and `robots`. The page inherits the rest from `app/[locale]/layout.tsx`, which exports the static English `siteMetadata` from `components/SiteChrome.tsx`: description "Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. ..." and og/twitter title "PRESTIGO — Premium Chauffeur Service Prague". This is real untranslated text on a non-EN page. Under this plan's rules it is **not** added to `classifiedResidual`. It is recorded as a remaining GAP-4 item: an app-code fix is needed, and this plan does not edit app code. The 75-20 run could not show it, because the old root `app/not-found.tsx` had its own metadata.

### Full production sweep (Task 2)

All runs target `https://rideprestigo.com` after the deploy. Raw outputs are committed under `evidence/`. The 75-23 `analytics_locale_audit.json` was gitignored and stale; it is replaced by the committed `75-30-analytics-locale-audit.json`.

#### Per-gap table

| Gap | Check | Before (75-20) | After (75-30) | Result | Evidence |
|---|---|---|---|---|---|
| GAP-1 (D-04 RU/AR signed-in account path) | `booking_e2e.py --account ru,ar` (plan 75-22) | SKIPPED: credentials file absent | **Not run: plan 75-22 skipped by user decision (2026-09-27)** | **SKIPPED (user decision), open** | `75-22-SUMMARY.md` |
| GAP-2 (Meta Pixel + `site_locale`) | `analytics_locale_audit.py` (7 locales x `/`, `/book`) | metaHits 0 and metaSiteLocale false on 14/14; GA4 pass 14/14 | **14/14 pass**: metaHits 1, metaSiteLocale true, ga4SiteLocale true on every locale x page; `all_pass: True`, exit 0 | **PASS** | `evidence/75-30-analytics-locale-audit.json` |
| GAP-3 (overflow) | `overflow_audit.py` at 320 / 375 / 768 / 1024 / 1280 (7 locales x 21 pages) | 768px: 1 page with issues (`/ru/fleet`, 2 `<p>`); other widths 0 | **pages with issues: 0 at all five widths**, each exit 0, each JSON `{}` | **PASS** | `evidence/75-30-overflow-{320,375,768,1024,1280}.json` |
| GAP-4a (localized 404) | `notfound_audit.py` (7 locales x 2 unmatched paths + 12 non-shadowing probes) | 0/14 localized (75-25 baseline: status 404 but `lang=en`, EN h1/title) | **localized 14/14 PASS** (status 404, lang, `dir=rtl` on ar only, localized h1 and title); **non-shadowing 12/12 PASS**; exit 0 | **PASS** | `evidence/75-30-notfound-audit.json` |
| GAP-4b/c/d (rendered EN leaks) | `en_leak_rendered.py` (ru/es/fr/ar/hi/zh x 26 pages) | 329 text / 90 link | **20 text / 0 link** (ru 5, es 0, fr 0, ar 5, hi 5, zh 5), 1530 allowlisted with reasons; `classifiedResidual` `[]`; exit 1 | **FAIL (partial)**: link leaks closed; 20 meta findings remain | `evidence/75-30-en-leak-rendered.json` |

**GAP-4 remaining items.** These are real untranslated text, so they are not classified. Every one is `kind: meta`.

| Locale | Page | Remaining values |
|---|---|---|
| ru, ar, hi, zh | `/login` | og:title "PRESTIGO — Premium Chauffeur Service Prague"; og:description "Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. …" (twitter:* carry the same values) |
| ru, ar, hi, zh | `/this-page-does-not-exist` | meta description, og:title and og:description with the same English site-default values |

Root cause: `app/[locale]/layout.tsx` exports the static English `siteMetadata` (`components/SiteChrome.tsx`). `/login` overrides only title and description, and the 404's `generateMetadata` overrides only title and robots. es and fr serve the same English values, but the scanner does not flag them. The fix is app code, so it is out of scope here and recorded in `deferred-items.md` (75-30).

#### Regression table (vs 75-20)

| Script | 75-20 | 75-30 | Result |
|---|---|---|---|
| `render_audit.py` | 147 URLs, 7 findings (`/login` missing canonical x 7) | 147 URLs, 7 findings: the same `/login` missing canonical x 7, exit 1 | No regression (pre-existing) |
| `switcher_audit.py` | 63 ops, 0 findings | 63 ops, 0 findings, exit 0 | No regression |
| `csp_regression.py --compare` | 11 route classes, 0 findings | 11 route classes, 0 findings, exit 0 | No regression |
| `hreflang_reciprocity.py` | 63 clusters, 423 alternates, 3 errors (D-09 EN-only posts) | 63 URLs, 423 alternates, 3 errors: `prague-airport-to-city-center`, `prague-airport-taxi-vs-chauffeur`, `prague-vienna-transfer-vs-train` (D-09), exit 1 | No regression (by design) |
| `jsonld_audit.py` | 84 blocks, 0 findings | 84 blocks, 0 findings, exit 0 | No regression |

Evidence files committed: `evidence/75-30-analytics-locale-audit.json`, `75-30-notfound-audit.json`, `75-30-en-leak-rendered.json`, and `75-30-overflow-{320,375,768,1024,1280}.json` (8 files). The regression outputs remain in the gitignored `scripts/qa/out/`.
