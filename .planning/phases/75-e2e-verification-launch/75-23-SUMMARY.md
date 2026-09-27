---
phase: 75-e2e-verification-launch
plan: 23
subsystem: analytics
status: complete
tags: [meta-pixel, capi, env, analytics, site_locale, qa, gap-closure]
requires: []
provides:
  - "lib/meta-pixel-id.ts normalizeMetaPixelId (trim + digits-only)"
  - "MetaPixel + /api/meta-capi immune to whitespace-polluted pixel ID / token env values"
  - "scripts/qa/analytics_locale_audit.py that actually observes Meta /tr hits (used by 75-30)"
  - "evidence/75-23-analytics-locale-audit.json (production, en+ar, all_pass)"
affects: [75-30]
tech-stack:
  added: []
  patterns:
    - "Env-value normalization at module scope while keeping the literal process.env.NEXT_PUBLIC_* property access so Next.js still inlines it"
    - "QA harness presents as regular desktop Chrome (no AutomationControlled, non-headless UA): third-party pixels drop hits from headless automation"
key-files:
  created:
    - "lib/meta-pixel-id.ts"
    - "tests/meta-pixel-id.test.tsx"
    - ".planning/phases/75-e2e-verification-launch/evidence/75-23-analytics-locale-audit.json"
  modified:
    - "components/MetaPixel.tsx"
    - "app/api/meta-capi/route.ts"
    - "tests/meta-capi.test.ts"
    - "scripts/qa/analytics_locale_audit.py"
decisions:
  - "The production metaHits=0 after the env fix was a QA-harness artifact, not a site defect: fbevents.js processed PageView (eventCount 1) but never sent /tr from headless automation; the audit now presents as regular Chrome."
  - "analytics_locale_audit.py matches multipart/form-data sendBeacon bodies (name=\"cd[site_locale]\" + value): fbevents switches to a POST beacon when the /tr URL is too long (ar pages)."
  - "Audit uses a fresh page per URL and counts only that page's hits; a stale unload time_on_page beacon from the previous page was ending the poll before the real page_view."
metrics:
  duration: "~2 sessions (tasks 1-2 before checkpoint; task 3 verification ~35 min)"
  completed: 2026-09-27
actuals:
  tokens: 4400
  tasks: 3
  commits: 5
---

# Phase 75 Plan 23: Newline-safe Meta Pixel ID + production Meta check (GAP-2) Summary

A stray newline in the Meta pixel ID env value can no longer break the fbq init script or the CAPI request URL: a digits-only normalizer is applied on both client and server. The user re-entered both Vercel env vars and redeployed. Production now fires Meta `/tr` hits that carry `cd[site_locale]` on en and ar, confirmed on `/` and `/book`.

## What was built

- **`lib/meta-pixel-id.ts`**: `normalizeMetaPixelId(raw)` trims all surrounding whitespace (including CR/LF) and returns the value only if it matches `^\d+$`; anything else returns `undefined`.
- **`components/MetaPixel.tsx`**: `PIXEL_ID = normalizeMetaPixelId(process.env.NEXT_PUBLIC_META_PIXEL_ID)`. The literal static access is kept so Next.js still inlines it. An invalid ID renders no pixel script (T-75-G06). Consent gating, PageView, `trackMetaEvent` and `site_locale` are unchanged.
- **`app/api/meta-capi/route.ts`**: the pixel ID is `normalizeMetaPixelId(META_PIXEL_ID)` with a fallback to the normalized public ID. The CAPI token is trimmed, and an empty value means not configured, so the route skips. No newline or `%0A` can reach the graph URL, and the token is never logged (T-75-G07/G08).
- **Tests**: `tests/meta-pixel-id.test.tsx` covers the helper cases, a render with a newline-suffixed env value (the init call contains bare digits) and a non-numeric value (no script). `tests/meta-capi.test.ts` uses a numeric fixture and covers newline-suffixed ID and token, fallback to the public ID, and the both-invalid case where it skips without calling fetch. meta-capi, meta-pixel-id and meta-pixel-locale pass 19/19.
- **Task 3 (human action)**: the user re-entered `NEXT_PUBLIC_META_PIXEL_ID` and `META_PIXEL_ID` in Vercel with no trailing newline and redeployed production ("мета готово").

## Production Meta check

- **Run date:** 2026-09-27, about 11:00–11:15 UTC
- **Command:** `python3 scripts/qa/analytics_locale_audit.py https://rideprestigo.com --locales en,ar`
- **Deployed code:** production runs the env fix and redeploy only. Commits e65400a6..456f2ac4 (the code-side normalization) are **not deployed yet**; plan 75-30 ships them.
- **Evidence:** `evidence/75-23-analytics-locale-audit.json` (`grep -c access_token` = 0)

| Locale | Page | ga4Hits | ga4SiteLocale | metaHits | metaSiteLocale | pass |
|--------|------|---------|---------------|----------|----------------|------|
| en | / | 1 | true | 1 | true | PASS |
| en | /book | 2 | true | 1 | true | PASS |
| ar | / | 1 | true | 1 | true | PASS |
| ar | /book | 2 | true | 1 | true | PASS |

`all_pass: true`, exit code 0.

### How the result was reached

1. **First run, unmodified audit:** every row showed `metaHits 0`. GA4 hits were present with `ga4SiteLocale true`.
2. **Playwright diagnosis** on `/` and `/ar` with marketing consent. This covers the plan's step to record the actual console and pageerror text:
   - `pageerror`: **none**. `securitypolicyviolation` events: **none**. No console errors related to Meta.
   - The rendered inline init is `fbq('init','<digits>');var __loc…`, so there is **no newline** in the argument and the WINDOWS #15 env fix is live.
   - `fbevents.js` and `signals/config/<id>` both loaded. `fbq.loaded === true`, `fbq.version 2.9.408`, and `fbq.getState().pixels[0].eventCount === 1`, meaning PageView was processed.
   - Despite that, the page sent **no `/tr` request at all**. The context had `navigator.webdriver === true` and the UA contained `HeadlessChrome`.
   - Re-running with `--disable-blink-features=AutomationControlled` and a regular Chrome UA produced a `/tr` hit that contained `site_locale`: GET image on `/`, POST `ping` (sendBeacon) on `/ar`. The hit was aborted, so nothing reached Meta.
   - An earlier diagnostic pass logged CSP `connect-src` and Maps CORS errors. My diagnostic caused those by re-`fetch()`ing every `<script src>`. The site's own loading does not produce them.
3. **Conclusion:** the env fix works on production. The zero came from the audit harness, which is fixed under Deviations below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The audit could not observe Meta hits from headless automation**
- **Found during:** Task 3 verification
- **Issue:** fbevents.js processes PageView but never sends `/tr` when `navigator.webdriver` is true or the UA contains `HeadlessChrome`, so `metaHits` was always 0 whatever the site did. The 75-30 re-verification would have hit the same false failure.
- **Fix:** launch with `--disable-blink-features=AutomationControlled` and a regular desktop Chrome UA (`BROWSER_UA`).
- **Files modified:** `scripts/qa/analytics_locale_audit.py`
- **Commit:** a8754e2f

**2. [Rule 1 - Bug] The site_locale matcher missed multipart sendBeacon bodies**
- **Found during:** Task 3 verification (`ar /` showed metaHits 1 but metaSiteLocale false)
- **Issue:** on `/ar`, fbevents sends `/tr` as a POST beacon with a `multipart/form-data` body, where the pair appears as `name="cd[site_locale]"`, a blank line, then `ar`. `contains_param` only matched `key=value`. The beacon did contain `site_locale=ar`.
- **Fix:** added a multipart `name="<key>"\r\n\r\n<value>\r\n` match. A sanity check confirmed that `ar` matches and that `en` and `arx` do not.
- **Files modified:** `scripts/qa/analytics_locale_audit.py`
- **Commit:** a8754e2f

**3. [Rule 1 - Bug] Stale unload beacon ended the poll early**
- **Found during:** Task 3 verification (`/book` rows showed ga4SiteLocale false)
- **Issue:** one page was reused across URLs. The previous page's unload GA4 `time_on_page` hit, which carries the previous `dl` and no site_locale, landed in the next URL's capture window. The "both hits seen" early break then stopped before the real `page_view`.
- **Fix:** a fresh page per URL. A context-level route still aborts every GA4 and Meta hit (T-75-13), but only hits whose `request.frame.page` is the current page are counted.
- **Files modified:** `scripts/qa/analytics_locale_audit.py`
- **Commit:** a8754e2f

No other deviations: Tasks 1-2 were executed as written.

## TDD Gate Compliance

- Task 1: RED `e65400a6` (test) → GREEN `5cc62391` (feat)
- Task 2: RED `fe5a0750` (test) → GREEN `456f2ac4` (feat)

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | e65400a6 | test(75-23): add failing test for newline-safe Meta pixel ID |
| 1 GREEN | 5cc62391 | feat(75-23): newline-safe Meta pixel ID in fbq init script |
| 2 RED | fe5a0750 | test(75-23): add failing CAPI env-normalization tests |
| 2 GREEN | 456f2ac4 | feat(75-23): CAPI route uses normalized pixel ID and trimmed token |
| 3 | a8754e2f | fix(75-23): make analytics_locale_audit observe real Meta /tr hits |

## Notes for plan 75-30

- The full 7×2 sweep can now use `analytics_locale_audit.py` unchanged. Expect Meta beacons (multipart POST) on long-URL locales.
- After the 75-30 deploy, the normalization code is also live, so a future newline in the env value degrades to "no pixel" rather than a SyntaxError.

## Known Stubs

None.

## Threat Flags

None. No new network surface: the audit aborts every GA4 and Meta hit, and the token is never read or written.

## Self-Check: PASSED

- FOUND: lib/meta-pixel-id.ts, tests/meta-pixel-id.test.tsx, evidence/75-23-analytics-locale-audit.json, scripts/qa/analytics_locale_audit.py
- FOUND commits: e65400a6, 5cc62391, fe5a0750, 456f2ac4, a8754e2f
- `grep -c access_token evidence/75-23-analytics-locale-audit.json` = 0
