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
