---
phase: 75-e2e-verification-launch
plan: 04
subsystem: analytics
tags: [ga4, meta-pixel, meta-capi, gtag, zod, playwright, i18n]

requires:
  - phase: 68-i18n-foundation-routing
    provides: i18n/locales.ts (locales tuple, AppLocale type)
provides:
  - "i18n/locales.ts: siteLocaleFromPathname(pathname) and normalizeSiteLocale(value), dependency-free, feeding site_locale everywhere"
  - "GA4 site_locale: gtag('set', {site_locale}) issued before page_view (AnalyticsPageView, both gtag and dataLayer-fallback branches) and before gtag('config', ...) in the ga-init inline script -- every later GA4 event inherits it"
  - "Meta Pixel site_locale: trackMetaEvent merges it into every event unless the caller already supplied one; both consent-gated PageView fbq calls carry it too"
  - "app/api/meta-capi/route.ts customDataSchema (still .strict()) now allow-lists site_locale (enum of 7 locales), content_type, content_ids -- fixes a pre-existing defect where the confirmation page's own custom_data made the strict parse fail and silently dropped value/currency from every CAPI Purchase"
  - "scripts/qa/analytics_locale_audit.py -- production network-capture QA script (aborts every GA4/Meta request it inspects), pre-deploy baseline recorded"
affects: [75-20 (post-deploy re-run of analytics_locale_audit.py, referenced by plan 04's must_haves key_links)]

actuals:
  tokens: 33000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Static allow-list serialized via JSON.stringify(locales) into an inline <script> (GoogleAnalytics.tsx ga-init, MetaPixel.tsx meta-pixel init) so the locale segment is checked client-side against a constant, never a request-derived value (T-75-12)"
    - "gtag('set', {...}) issued before the paired gtag('config'/'event') call in the SAME inline script -- Consent Mode v2 ordering discipline extended to site_locale scope-persistence"
    - "trackMetaEvent(eventName, params, eventId): site_locale merged in only when the caller's params object does not already have the key ('site_locale' in params check), so callers can still override"
    - "zod .strict() allow-list extension: add bounded fields (z.enum(locales), z.string().max(N), z.array(...).max(N)) rather than switching to .passthrough() -- SEC-07 discipline"
    - "Playwright network-capture QA script: page.route(predicate_fn, handler) records url+post_data then route.abort() -- nothing reaches the real endpoint; predicate-based routing (not glob) needed because GA4/Meta both need multi-domain + path matching"

key-files:
  created:
    - tests/site-locale.test.ts
    - tests/analytics-page-view.test.tsx
    - tests/meta-capi.test.ts
    - tests/meta-pixel-locale.test.ts
    - scripts/qa/analytics_locale_audit.py
  modified:
    - i18n/locales.ts
    - components/AnalyticsPageView.tsx
    - components/GoogleAnalytics.tsx
    - components/MetaPixel.tsx
    - app/api/meta-capi/route.ts
    - app/[locale]/book/confirmation/page.tsx

key-decisions:
  - "site_locale derived purely from the URL pathname (siteLocaleFromPathname), never navigator.language/browser locale, matching D-10's explicit requirement that GA4's built-in language dimension stays separate from site_locale"
  - "GoogleAnalytics.tsx and MetaPixel.tsx both compute site_locale inline in plain browser JS from window.location.pathname (not a server-passed locale prop) -- keeps both components decoupled from SiteChrome's getLocale() plumbing, matching the plan's explicit action text over 75-RESEARCH.md's earlier prop-based sketch"
  - "trackMetaEvent's site_locale merge checks 'site_locale' in params (not just truthiness) so an explicit caller-supplied value of any kind is never silently overwritten"
  - "Rule 1 fix (Task 3): widened analytics_locale_audit.py's poll window from the plan's spec'd 8s to 25s after confirming, via a live manual capture session against production, that Consent Mode v2's wait_for_update:20000 queues every GA4 hit in a quiet period for ~21s regardless of the granted default -- an 8s window can never observe a real hit, which would make the script permanently unable to verify D-10 even after the site_locale code ships"

requirements-completed: [VER-01]

coverage:
  - id: D1
    description: "siteLocaleFromPathname/normalizeSiteLocale in i18n/locales.ts cover every specified edge case (known locale, root, empty, null/undefined, case-mismatch, unknown segment, oversized/non-string input) and stay dependency-free"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/site-locale.test.ts -- 11 assertions, all pass"
        status: pass
      - kind: unit
        ref: "grep -c \"from 'next-intl\\|from 'react'\\|from 'next/\" i18n/locales.ts == 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "AnalyticsPageView issues gtag('set',{site_locale}) before page_view on both the gtag and dataLayer-fallback branches, with site_locale in the page_view payload; GoogleAnalytics's ga-init script sets it before gtag('config',...); /admin skip preserved"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/analytics-page-view.test.tsx -- 4 tests, all pass"
        status: pass
      - kind: unit
        ref: "grep -n site_locale/gtag('config' components/GoogleAnalytics.tsx -- set command precedes config command"
        status: pass
    human_judgment: false
  - id: D3
    description: "trackMetaEvent and both consent-gated PageView fbq calls carry site_locale (caller-supplied values never overwritten); the confirmation page's CAPI custom_data carries an identical site_locale to the paired Pixel Purchase call; eventId/event_id dedup key (ref) unchanged"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/meta-pixel-locale.test.ts -- 4 tests, all pass"
        status: pass
      - kind: unit
        ref: "grep -n site_locale app/[locale]/book/confirmation/page.tsx -- present inside the meta-capi custom_data object"
        status: pass
    human_judgment: false
  - id: D4
    description: "customDataSchema in /api/meta-capi stays .strict() and now allow-lists site_locale (enum)/content_type/content_ids -- a confirmation-shaped payload reaches the Graph API in full; an unknown key or out-of-enum site_locale still drops custom_data entirely"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/meta-capi.test.ts -- 4 tests (pass-through, unknown-key drop, out-of-enum drop, oversized-string drop), all pass"
        status: pass
      - kind: unit
        ref: "grep -c '\\.strict()' app/api/meta-capi/route.ts == 1; grep -c passthrough == 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "scripts/qa/analytics_locale_audit.py captures and aborts every GA4/Meta request per locale/page and records a pre-deploy baseline"
    requirement: VER-01
    verification:
      - kind: e2e
        ref: "python3 scripts/qa/analytics_locale_audit.py https://rideprestigo.com --locales en,ru -- exit 1 (expected pre-deploy), scripts/qa/out/analytics_locale_audit.json written with both locales"
        status: pass
    human_judgment: true
    rationale: "The route handler only records then aborts (code-reviewed), but confirming the script never lets a real hit reach Google/Meta in a live production run is a judgment call about network behavior, not something a unit assertion proves."

duration: 40min
completed: 2026-09-25
status: complete
---

# Phase 75 Plan 04: Analytics site_locale (GA4/Meta) Summary

**Threaded a pathname-derived `site_locale` dimension through GA4 (persistent `gtag('set', ...)` scope), Meta Pixel, and Meta CAPI, fixing a pre-existing zod-schema defect that was silently dropping `value`/`currency` from every CAPI Purchase, plus a production network-capture QA script that surfaced a second, unrelated, severe pre-existing bug: Meta Pixel never initializes in production today.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-09-25T12:15:00Z (approx.)
- **Completed:** 2026-09-25T12:39:00Z
- **Tasks:** 3
- **Files modified:** 6 modified, 5 created

## Accomplishments

- `i18n/locales.ts` gained `siteLocaleFromPathname`/`normalizeSiteLocale` — the single derivation every consumer (GA4 client, Meta Pixel, Meta CAPI) now shares, proven against every edge case in the plan's `must_haves` (empty string, `/`, null, undefined, case-mismatch, unknown segment, oversized/non-string input).
- GA4 now carries `site_locale` persistently: `AnalyticsPageView` issues `gtag('set', {site_locale})` before every `page_view` (both the `gtag` and `dataLayer`-fallback branches), and `GoogleAnalytics.tsx`'s `ga-init` script sets it before `gtag('config', ...)` on first load — every later GA4 event (`begin_checkout`, `purchase`, etc.) inherits it with zero per-call-site edits.
- Meta Pixel and CAPI carry an identical `site_locale`: `trackMetaEvent` merges it into every event (unless the caller already supplied one), both consent-gated `PageView` calls carry it, and the confirmation page's `/api/meta-capi` fetch sends the same derivation in `custom_data` — the shared `eventId`/`event_id` (`ref`) dedup key is untouched.
- Fixed a real, pre-existing production defect in `/api/meta-capi`'s `customDataSchema`: it was `.strict()` but did not allow-list `content_type`/`content_ids`, which the confirmation page's Purchase call already sent — meaning **every CAPI Purchase event today silently drops `custom_data` entirely** (value/currency lost, not just the two new fields). Fixed by adding bounded `content_type`/`content_ids`/`site_locale` fields to the same strict schema (SEC-07 preserved — no `.passthrough()`).
- `scripts/qa/analytics_locale_audit.py` — a Playwright script that captures and aborts every GA4 `/g/collect` and Meta `/tr` request per locale/page and checks `ep.site_locale`/`cd[site_locale]` against the expected value. Run against production for `en,ru` per the plan's verify command: exit code 1 (expected pre-deploy), `scripts/qa/out/analytics_locale_audit.json` written with both locales.
- **Discovered via the audit script:** Meta Pixel does not initialize on live production at all today, for a reason unrelated to this plan's code — see Deviations below (WINDOWS.md #15).

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — locale helpers -> GA4 gtag set + page_view site_locale** - `8ecbd7f8` (feat)
2. **Task 2: Meta Pixel + CAPI site_locale and the strict schema fix** - `1866951c` (security)
3. **Task 3: analytics_locale_audit.py + pre-deploy baseline** - `22174c74` (feat)

_Task 1 is `type="tracer"`: executed and committed exactly like `type="auto"` (single atomic commit, real `<verify>`), per the plan's execution flow — not a separate RED/GREEN/REFACTOR sequence. The tracer feedback gate (re-running its `<verify>` before starting Task 2) passed._

**Plan metadata:** committed alongside this SUMMARY.

## Files Created/Modified

- `i18n/locales.ts` — added `siteLocaleFromPathname`/`normalizeSiteLocale`
- `components/AnalyticsPageView.tsx` — `gtag('set', {site_locale})` before `page_view`, both branches
- `components/GoogleAnalytics.tsx` — `site_locale` set in `ga-init` before `gtag('config', ...)`
- `components/MetaPixel.tsx` — `trackMetaEvent` site_locale merge; both PageView fbq calls
- `app/api/meta-capi/route.ts` — `customDataSchema` extended (site_locale/content_type/content_ids), still `.strict()`
- `app/[locale]/book/confirmation/page.tsx` — CAPI `custom_data.site_locale` added
- `tests/site-locale.test.ts`, `tests/analytics-page-view.test.tsx`, `tests/meta-capi.test.ts`, `tests/meta-pixel-locale.test.ts` — new
- `scripts/qa/analytics_locale_audit.py` — new

## Decisions Made

- `site_locale` is derived only from the pathname, never `navigator.language` — matches D-10 exactly (GA4's built-in `language` dimension already covers browser language separately).
- Both `GoogleAnalytics.tsx` and `MetaPixel.tsx` compute `site_locale` inline from `window.location.pathname` rather than threading a server-passed `locale` prop through `SiteChrome.tsx` — this follows the plan's explicit `<action>` text (which supersedes 75-RESEARCH.md's earlier prop-based sketch) and keeps both components self-contained.
- `trackMetaEvent`'s merge uses `'site_locale' in params` (presence check, not truthiness) so a caller-supplied value of any kind is never silently overwritten.
- Rule 1 fix: widened `analytics_locale_audit.py`'s poll window from the plan's spec'd 8s to 25s (see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `analytics_locale_audit.py` poll window widened from 8s to 25s**
- **Found during:** Task 3
- **Issue:** The plan's action text specified an 8-second wait per locale/page. A manual Playwright capture session against production (run to debug why the script initially reported 0 GA4 hits) showed production's Consent Mode v2 `ga-consent-default` script sets `wait_for_update: 20000` — GA4's `gtag.js` queues every hit in a "quiet period" for up to 20s before actually sending, even though `analytics_storage` is already granted by default (confirmed via `window.google_tag_data.ics.entries.analytics_storage.quiet === true`). An 8s window observes zero hits, which would make the script permanently unable to prove D-10 even after this plan's site_locale code is deployed and correct — not just on this pre-deploy baseline run.
- **Fix:** Poll loop widened to `WAIT_MS = 25000`, still breaking early once both a GA4 and a Meta hit have arrived. Re-ran against production: GA4 hits are now captured (2–3 per page) with `ga4SiteLocale: false` (correct pre-deploy baseline — the change hasn't shipped to production yet).
- **Files modified:** `scripts/qa/analytics_locale_audit.py`
- **Verification:** `python3 scripts/qa/analytics_locale_audit.py https://rideprestigo.com --locales en,ru` — `ga4Hits` now 2–3 per page/locale (was 0), `scripts/qa/out/analytics_locale_audit.json` written, exit code 1 (expected).
- **Committed in:** `22174c74` (Task 3 commit)

**2. [Documented, not fixed — out of Task 3's scope] Pre-existing production defect: Meta Pixel never initializes**
- **Found during:** Task 3, while debugging why `metaHits` stayed 0 even after the Rule 1 timing fix above
- **Issue:** Live production's `NEXT_PUBLIC_META_PIXEL_ID` (and/or `META_PIXEL_ID`) environment variable value has a trailing newline character. The rendered inline Pixel-init script becomes `fbq('init','1502850338180783\n');` — an unterminated single-quoted string literal — which throws a `SyntaxError` the instant the script element is inserted (`document.body.appendChild(el)` in Next.js's `next/script` runtime), surfaced as a `pageerror`: `Failed to execute 'appendChild' on 'Node': Invalid or unexpected token`. `window.fbq` is never defined; the Meta Pixel has not fired a single client-side event on production, in headless or headed Chromium, with or without consent granted, waited up to 25s. This predates this plan's code changes entirely (reproduced against the currently-deployed build) and is a Vercel environment-variable data issue, not a code defect Task 2's `MetaPixel.tsx`/`route.ts` edits could have caused or can fix from this session (no Vercel dashboard/CLI access, `.env.local` is sandbox-denied).
- **Not fixed:** requires a human to re-enter `NEXT_PUBLIC_META_PIXEL_ID`/`META_PIXEL_ID` in the Vercel dashboard without a trailing newline, then redeploy.
- **Recorded:** WINDOWS.md ledger entry #15 (kind `deviation`, phase 75, file `components/MetaPixel.tsx`, status `open`).
- **Impact on this plan:** None on the code delivered — Task 2's `trackMetaEvent`/CAPI `site_locale` wiring is correct and will work identically once the env var is fixed; `analytics_locale_audit.py`'s `metaHits: 0` result is an accurate current-state reading, not a script bug.

---

**Total deviations:** 2 (1 auto-fixed, 1 documented pre-existing production defect — out of scope to fix directly).
**Impact on plan:** The auto-fix was necessary for the QA script to be functionally capable of verifying D-10 at all (pre- or post-deploy). The documented defect is unrelated to this plan's deliverables but is severe (Meta Pixel client-side events are currently silently lost in production) and is now tracked for a human fix.

## Issues Encountered

- Debugging the initial `ga4Hits: 0` / `metaHits: 0` result (Task 3) required a series of manual Playwright capture sessions against production to isolate two independent causes: (1) GA4's Consent Mode v2 quiet period (fixed in the script, see Deviations #1), and (2) the Meta Pixel env-var bug (documented, see Deviations #2, not code-fixable from this session).

## User Setup Required

**Action needed before Meta Pixel/CAPI `site_locale` can be verified end-to-end in production** (unrelated to this plan's code, but blocks observing its effect):
1. In the Vercel dashboard, open the `NEXT_PUBLIC_META_PIXEL_ID` (and `META_PIXEL_ID` if set separately) environment variable for the production environment.
2. Re-enter the Pixel ID value, ensuring no trailing newline/whitespace character is captured (this commonly happens when pasting from a `.env` file or a shell command that includes the newline).
3. Redeploy.
4. Verify with: `python3 scripts/qa/analytics_locale_audit.py https://rideprestigo.com --locales en` after redeploy — `metaHits` should become > 0.

Tracked in WINDOWS.md #15.

## Next Phase Readiness

- `siteLocaleFromPathname`/`normalizeSiteLocale` are ready for plan 75-05 to reuse for PaymentIntent metadata and the server-side GA4 purchase event (per this plan's `key_links`).
- `analytics_locale_audit.py` is ready for the post-deploy re-run in plan 75-20; its baseline (`ga4SiteLocale`/`metaSiteLocale` both `false` for en/ru, `ga4Hits` 2-3, `metaHits` 0) is recorded above and in `scripts/qa/out/analytics_locale_audit.json` (gitignored, regenerated on each run).
- Blocker carried forward: the Meta Pixel env-var fix (WINDOWS.md #15) is a human action outside this plan's scope; `metaHits` will stay 0 in any future run of `analytics_locale_audit.py` until it's resolved, independent of whether this plan's site_locale code is deployed correctly.

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-25*
