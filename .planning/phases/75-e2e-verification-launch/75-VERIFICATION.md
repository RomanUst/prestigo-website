---
phase: 75-e2e-verification-launch
verified: 2026-09-27T00:00:00Z
status: gaps_found
score: 6/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "RU and AR sign-in + account ('My trips') booking path is verified (ROADMAP SC #2)"
    status: failed
    reason: "scripts/qa/.e2e-account.json was never provided. Both account-path booking_e2e.py runs auto-skipped (skipped:true, reason:'account credentials missing' — confirmed directly in scripts/qa/out/booking_e2e.json). Only the guest path was exercised for ru/ar. This is an explicit ROADMAP Success Criterion #2 clause ('sign-in + account path verified in RU and AR'), not a minor nicety — it was never executed, successfully or otherwise."
    artifacts:
      - path: "scripts/qa/.e2e-account.json"
        issue: "File does not exist (gitignored, git check-ignore confirms; never supplied by the user despite 75-19-SUMMARY.md recording the user's claim of having created the account)"
    missing:
      - "The E2E test account credentials file, then a re-run of `booking_e2e.py --locales \"\" --account ru,ar` with a recorded pass/fail per locale"
  - truth: "Meta Pixel + CAPI carry custom_data.site_locale on every locale without breaking eventId dedup (ROADMAP SC #4, second clause)"
    status: failed
    reason: "Meta Pixel never fires at all in production. Independently confirmed by this verifier: `curl https://rideprestigo.com/` contains zero occurrences of `fbq(` anywhere in the rendered HTML/inline scripts (grep -c \"fbq(\" = 0). analytics_locale_audit.py also recorded metaHits=0 on every one of 7 locales x 2 pages. Root cause per deferred-items.md/WINDOWS.md #15/#21: a trailing newline in the NEXT_PUBLIC_META_PIXEL_ID/META_PIXEL_ID Vercel env var breaks the fbq init script. Not a Phase 75 regression, but it means the D-12 requirement (Meta site_locale) is entirely unverifiable, not merely 'unverified in one spot' — the pixel does not exist client-side at all."
    artifacts:
      - path: "components/MetaPixel.tsx"
        issue: "Component code is presumably correct per code review, but the pixel script never executes in production due to an env var value defect outside the code"
    missing:
      - "Vercel dashboard fix: re-enter NEXT_PUBLIC_META_PIXEL_ID/META_PIXEL_ID without a trailing newline, redeploy, then re-run analytics_locale_audit.py to confirm metaHits > 0 and metaSiteLocale=true"
  - truth: "overflow_audit.py reports 0 issues at 320/375/768/1024/1280px (ROADMAP SC #5, explicit clause)"
    status: failed
    reason: "768px width surfaced a new regression: /ru/fleet has 2 <p> maintenance-copy paragraphs whose translated Russian text overflows its container (scrollWidth 143/150 vs clientWidth 131). Not present in the pre-translation English baseline (0 issues at all 5 widths, captured 2026-09-24). The other 4 widths (320/375/1024/1280) remain clean. This is a concrete, newly-introduced defect caused by Phase 75's translation, contradicting the literal ROADMAP wording 'overflow audit stays at 0 issues.'"
    artifacts:
      - path: "app/[locale]/fleet/page.tsx"
        issue: "Russian maintenance-copy paragraph text is longer than the container allows at 768px tablet width"
    missing:
      - "CSS/copy fix on the fleet page's maintenance-copy block for ru at 768px (candidate follow-up to plan 75-08, logged as WINDOWS.md #23)"
  - truth: "No English leaks onto localized pages (phase goal, broader than the specific named leaks in ROADMAP SC #3)"
    status: partial
    reason: "The SPECIFIC leaks named in ROADMAP SC #3 (/book hero + How it works, /book/multi-day examples, airport-transfer booking block, CorporateForm placeholder, ~10 hi DNT-fallback headings) were fixed and are confirmed in 75-QA-RESULTS.md's static-layer post-fix result (0 actionable non-admin findings). However the phase GOAL text says 'no English leaks onto localized pages' without qualification, and the post-deploy rendered-layer sweep (en_leak_rendered.py) still finds 329 text leaks + 90 link leaks across the 6 non-EN locales in production (down from 2003/1404 pre-fix — an 84%/94% reduction, but not zero). Independently confirmed one concrete instance: curl https://rideprestigo.com/zh/this-page-does-not-exist returns lang=\"en\" and literal 'Page not found' text — the root-caused systemic gap (no catch-all route under app/[locale]/, so Next.js falls through to the unlocalized app/not-found.tsx on every locale for any unmatched path)."
    artifacts:
      - path: "app/not-found.tsx"
        issue: "Reached instead of the already-localized app/[locale]/not-found.tsx for any unmatched path, on every locale — confirmed live via curl"
      - path: "scripts/qa/en_leak_allowlist.json"
        issue: "Missing a proper-noun/person-name category (flags 'Roman Ustyugov' as a leak) and inline mid-sentence handling for already-DNT-allowlisted brand/tech terms (Mercedes E-Class, USB-A/USB-C, Wi-Fi, Visa)"
    missing:
      - "A catch-all route under app/[locale]/ that calls notFound() to route into the localized boundary (WINDOWS.md #22)"
      - "Allowlist categories for person names and inline brand/tech terms (WINDOWS.md #24)"
      - "Fix for the 9 residual internal-nav link leaks on /blog/beyond-transport-luxury-chauffeur-service-prague (per locale)"
deferred:
  - truth: "Metricool announcement drafts created (ROADMAP SC #7 clause)"
    addressed_in: "User decision, 2026-09-27 (75-LAUNCH.md Task 2 result)"
    evidence: "User explicitly answered 'Без анонса' (no announcement) when asked — a deliberate decision, not an omission. The draft-capable Metricool client (createMetricoolPost with draft:true) was built in 75-18 and remains available if the announcement is wanted later. Not treated as a gap."
human_verification:
  - test: "GA4 'Site Locale' custom dimension registration"
    expected: "An event-scoped custom dimension named 'Site Locale' bound to the site_locale event parameter exists in the GA4 property admin UI"
    why_human: "The user confirmed this is registered (2026-09-26), but the GA Admin API MCP call returned invalid_grant and could not cross-check it programmatically. This verifier independently confirmed the CLIENT-SIDE code sets site_locale on gtag('config', ...) before the first page_view (curl of https://rideprestigo.com/ shows the __siteLocale wiring), which proves the site emits the parameter — it does not prove the GA4 property-side dimension binding exists."
  - test: "RU/AR signed-in account booking path, once credentials are supplied"
    expected: "booking_e2e.py --locales \"\" --account ru,ar reaches a rendered Stripe form for both locales with the correct Stripe/Places locale, matching the already-proven guest-path behavior"
    why_human: "Requires the user to supply scripts/qa/.e2e-account.json (test account credentials) before this can be automated at all — currently structurally impossible to verify without that file."
  - test: "Meta Pixel env var fix in Vercel dashboard + redeploy, then re-run analytics_locale_audit.py"
    expected: "metaHits > 0 and metaSiteLocale=true on all 7 locales x 2 pages after the trailing-newline env var is corrected"
    why_human: "Requires Vercel dashboard access to edit an environment variable — not something a script or this verifier can fix or trigger a redeploy for."
---

# Phase 75: E2E Verification & Launch Verification Report

**Phase Goal:** Prove the multilingual site works end-to-end on production for all 7 locales and close milestone v3.0. Every locale renders, the switcher works, the guest booking flow reaches a localized Stripe payment form in every locale (incl. RTL /ar), no English leaks onto localized pages (systematic static + rendered audit, fixes translated in-session), GA4 and Meta events carry a site_locale dimension (client and server-side via the booking), hreflang clusters validate, Rich Results pass, CSP has no regression, and the vitest red baseline in v3.0-touched files is cleared. Launch = GSC sitemap resubmit + indexing baseline, milestone close, and Metricool announcement drafts.

**Verified:** 2026-09-27
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Merged from ROADMAP.md Phase 75 Success Criteria (1-7) and the PLAN 75-20 `must_haves.truths` frontmatter.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every locale renders correctly (render_audit.py: 7 locales x 21 pages, 200 status, correct lang/dir, zero CSP violations) | ✓ VERIFIED | 75-QA-RESULTS.md: 147/147 URLs, only finding is pre-existing `/login` missing-canonical (all 7 locales, unchanged from baseline, not a regression). Independently re-confirmed by this verifier: `curl https://rideprestigo.com/ar` returns `lang="ar" dir="rtl"`; `/login` canonical link independently confirmed absent via curl; hreflang cluster on `/` independently confirmed complete (8 alternates incl. `zh-Hans` and `x-default`); CSP header independently fetched and matches the documented static policy. |
| 2 | The switcher works for all 42 ordered pairs + 21 rotating cases, all 7 locales | ✓ VERIFIED | 75-QA-RESULTS.md: switcher_audit.py 63/63 operations, 0 findings, both pre- and post-deploy. Independently confirmed the `locale-switcher-trigger-`/`locale-switcher-menu-` DOM id prefixes are present in the live homepage HTML. |
| 3a | Guest booking reaches a rendered Stripe form in all 7 locales incl. /ar RTL, correct Stripe/Places locale, no payment submitted | ✓ VERIFIED | 75-QA-RESULTS.md "Booking E2E" table: all 7 guest runs `reachedStripe=true`, `localeChecksPassed=true`, incl. `ar` → `htmlDir=rtl`, `stripeLocale=ar`, `placesLanguage=ar`. `scripts/qa/out/booking_e2e.json` independently inspected and confirms the `en` guest row matches the table exactly. 23 real booking references were created, cross-checked, and 17 unpaid E2E rows were verified deleted from production Supabase (backup retained at `e2e-cleanup-backup.json`, 5 top-level fields incl. row data). |
| 3b | RU and AR **sign-in + account path** verified (ROADMAP SC #2, explicit clause) | ✗ FAILED | `booking_e2e.py --account ru,ar` auto-skipped both locales (`scripts/qa/out/booking_e2e.json`: `"skipped": true, "reason": "account credentials missing"` — confirmed directly by this verifier). `scripts/qa/.e2e-account.json` does not exist (`git check-ignore` confirms it's gitignored; `ls` confirms absent). Never executed, successfully or otherwise. See gap #1. |
| 4 | No English leakage: named leaks in SC #3 fixed; systematic two-layer audit run | ⚠️ PARTIAL | Static layer: 0 actionable customer-facing findings (149 findings are 100% the pre-documented `components/admin/**` UNOWNED bucket + 1 review-only R4). Rendered layer: reduced from 2003→329 text leaks and 1404→90 link leaks across 6 non-EN locales — a large improvement, but not zero. Independently confirmed one concrete residual leak: `curl https://rideprestigo.com/zh/this-page-does-not-exist` returns `lang="en"` and literal "Page not found" text, proving the root-caused systemic 404-catch-all gap live in production. See gap #4. |
| 5a | GA4 carries a `site_locale` param on captured hits, all 7 locales | ✓ VERIFIED | 75-QA-RESULTS.md: `analytics_locale_audit.py` — `ga4SiteLocale=True` on every one of 7 locales x 2 pages. Independently confirmed: `curl https://rideprestigo.com/` inline script sets `var __siteLocale` from the pathname before `gtag('config', ...)`, applied to every event including the first `page_view`. |
| 5b | Meta Pixel + CAPI carry `custom_data.site_locale`, no dedup break | ✗ FAILED | `analytics_locale_audit.py`: `metaHits=0` on every one of 7 locales x 2 pages. Independently confirmed: `curl https://rideprestigo.com/` contains zero occurrences of `fbq(` anywhere in the HTML. The pixel does not fire at all — pre-existing WINDOWS.md #15 env-var defect (trailing newline), not a Phase 75 regression, but this makes D-12 entirely unverifiable. See gap #2. |
| 6a | hreflang clusters reciprocal, JSON-LD passes, no CSP drift | ✓ VERIFIED | `hreflang_reciprocity.py`: 3 errors, all the pre-existing intentional D-09 EN-only blog/author allowlist (improved from 4 pre-change). `jsonld_audit.py`: 0 findings, 84 blocks x 7 locales, plus a targeted 60-block re-check for the 5 Rich-Results sample URLs. `csp_regression.py --compare`: 0 findings, 11 route classes. Independently confirmed live CSP header matches the documented static policy exactly. |
| 6b | Rich Results Test passes on sampled locale URLs | ✓ VERIFIED (human-reported) | User reported "все ок" for all 5 sampled URLs (2026-09-27), consistent with `jsonld_audit.py`'s 0 findings on the same URLs. |
| 6c | Overflow audit stays at 0 issues (all widths) | ✗ FAILED | 320/375/1024/1280px clean, but 768px surfaced a new regression: `/ru/fleet` — 2 paragraphs overflow their container with translated Russian text (not present in the pre-translation baseline). See gap #3. |
| 7 | vitest green for all v3.0-touched files; pre-existing unrelated failures listed | ✓ VERIFIED | This verifier independently ran `npx vitest run` on `main` (current HEAD, post-merge): **157 test files passed, 2 skipped; 2692 tests passed, 0 failed, 10 skipped, 139 todo** — matches the orchestrator's claim exactly. The 5 files that fail inside the phase's worktree (documented D-15 justification: worktree-relative `node_modules` symlink import failure) do NOT fail on `main`, confirmed directly. |
| 8 | Launch: sitemap resubmitted, indexing baseline recorded, Metricool drafts, milestone audited/closed | ⚠️ PARTIAL (deferred item, see below) | GSC sitemap resubmit + 10 indexing requests + 5 Rich Results tests: user-reported "все ок" (2026-09-27). Indexing baseline recorded: 24/42 key URLs indexed (`75-LAUNCH.md`). Metricool announcement: explicitly declined by user decision ("Без анонса") — not a gap, see `deferred` section. Milestone audit/close: correctly NOT yet done — that is the next workflow step contingent on this verification passing. |

**Score:** 6/10 truths verified (2 explicit FAILED against literal ROADMAP wording — RU/AR account path, Meta site_locale; 1 FAILED — overflow regression; 1 PARTIAL — residual EN leaks below full closure; 2 human-reported/deferred items noted above but not counted against the denominator twice).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/phases/75-e2e-verification-launch/75-QA-RESULTS.md` | Production QA record, all scripts, all locales, pre/post comparison | ✓ VERIFIED | Present, detailed, cross-checked against raw JSON artifacts in `scripts/qa/out/` and live production curl checks by this verifier |
| `.planning/phases/75-e2e-verification-launch/75-EN-LEAK-AUDIT.md` | Pre-fix + post-fix two-layer EN-leak inventory | ✓ VERIFIED | Present, both layers populated, post-fix section cross-references 75-QA-RESULTS.md |
| `.planning/phases/75-e2e-verification-launch/deferred-items.md` | Every out-of-scope discovery logged with owner/next-action | ✓ VERIFIED | 8 items logged across 75-13 and 75-20 sections, matching WINDOWS.md ledger entries 20-25 |
| `.planning/phases/75-e2e-verification-launch/75-LAUNCH.md` | GSC baseline + launch brief + Metricool decision record | ✓ VERIFIED | Present, Task 1/2/3 results recorded, milestone-close handoff documented |
| `scripts/qa/*.py`, `scripts/qa/en_leak_static.mjs` | Repeatable QA harness | ✓ VERIFIED | All 11 scripts exist on disk, sized appropriately (not stubs), invoked with real output referenced throughout 75-QA-RESULTS.md |
| `scripts/qa/out/*.json` | Raw script output for cross-check | ⚠️ PARTIAL | `booking_e2e.json`, `render_audit.json` inspected and consistent with the narrative. **`analytics_locale_audit.json` on disk is stale** (mtime 2026-09-25 14:36, before the 2026-09-26 deploy; only contains `en`/`ru`, both `ga4SiteLocale=False` — an early dev-testing artifact from plan 75-04, NOT the final production sweep). This file is gitignored and does not persist the executor's actual final run; the claim of "GA4 PASS on all 7 locales" therefore rests on 75-QA-RESULTS.md's narrative table plus this verifier's independent code-level confirmation (site_locale wiring present in live HTML), not on a reproducible raw-JSON artifact. Flagged for transparency, not treated as invalidating the GA4 finding given the independent code check. |
| `supabase/migrations/062_bookings_locale.sql` | `bookings.locale` column + constraint | ✓ VERIFIED | Applied and verified via Supabase MCP per 75-17-SUMMARY.md; code review (75-REVIEW.md WR-01) flagged a non-idempotent constraint (missing `DROP CONSTRAINT IF EXISTS`) as a WARNING, not a blocker — migration already applied successfully once. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| Booking flow | Stripe Elements / Google Places | Locale param passed through `create-payment-intent` metadata + client widget props | ✓ WIRED | Confirmed via 7/7 guest `booking_e2e.py` runs with `localeChecksPassed=true` |
| `bookings.locale` | Stripe webhook → server GA4 purchase + CAPI | `handleGroupPaymentSucceeded` / payment-succeeded handlers forward locale | ✓ WIRED (code-reviewed) | 75-REVIEW.md confirms locale is validated through the `locales` allow-list before reaching Stripe metadata/DB; no live server-side purchase event was captured in this verification (no real payment submitted, by design) |
| GA4 client script | `gtag('config', ...)` | `site_locale` set before first `page_view` | ✓ WIRED | Independently confirmed via live curl of homepage HTML |
| Meta Pixel component | `fbq('init', ...)` | Env var → script injection | ✗ NOT WIRED | Independently confirmed: zero `fbq(` occurrences in live HTML. Root cause: env var defect (WINDOWS #15), not missing code. |
| `app/[locale]/not-found.tsx` | Any unmatched path under a locale | Missing catch-all route | ✗ NOT WIRED | Independently confirmed via live curl: unmatched path resolves to root `app/not-found.tsx` (English), not the localized boundary |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|--------------|--------|----------|
| VER-01 | All 21 phase-75 plans (`requirements: [VER-01]` in every PLAN frontmatter, confirmed by grep) | Cross-locale E2E green: render, switcher, booking, analytics locale, no EN leakage, CSP, hreflang, Rich Results, vitest baseline, launch | ⚠️ PARTIALLY SATISFIED | 6 of the underlying facets fully pass (render, switcher, guest booking, GA4, hreflang/JSON-LD/CSP, vitest); 3 facets fail against the literal ROADMAP wording (RU/AR account path, Meta site_locale, overflow 0-issues); EN-leakage is substantially but not completely closed. REQUIREMENTS.md's traceability table still shows VER-01 as "Pending" — consistent with this verification's `gaps_found` status; should be updated to reflect the gaps once closed, not marked "Complete" yet. |

No orphaned requirements: REQUIREMENTS.md maps only VER-01 to Phase 75, and every one of the 21 plans declares it.

### Anti-Patterns Found

No new TBD/FIXME/XXX/HACK/PLACEHOLDER debt markers were introduced by Phase 75's application-code changes (79 files reviewed in 75-REVIEW.md, 0 critical findings). The 4 WARNING/2 INFO findings in 75-REVIEW.md are code-quality issues (non-idempotent migration constraint, raw error message logged to console, imprecise UUID regex, a variable-shadowing hazard in `RoutesBento.tsx`) — none are stubs or fabricated implementations, and none block the phase goal. They are pre-existing-quality issues layered onto real, working code, not evidence of unfinished work.

### Behavioral Spot-Checks / Live Production Checks (this verifier, 2026-09-27)

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Homepage reachable | `curl -o /dev/null -w '%{http_code}' https://rideprestigo.com/` | 200 | ✓ PASS |
| `/ar` renders RTL | `curl https://rideprestigo.com/ar \| grep lang/dir` | `lang="ar" dir="rtl"` | ✓ PASS |
| `/login` canonical still missing (pre-existing baseline defect, not a regression) | `curl https://rideprestigo.com/login \| grep rel="canonical"` | no match | ✓ PASS (matches documented baseline) |
| Systemic 404 gap reproduces live | `curl https://rideprestigo.com/zh/this-page-does-not-exist` | `lang="en"`, "Page not found" | ✓ CONFIRMS documented gap |
| GA4 `site_locale` wiring present | `curl https://rideprestigo.com/ \| grep site_locale` | `__siteLocale` set before `gtag('config',...)` | ✓ PASS |
| Meta Pixel never fires | `curl https://rideprestigo.com/ \| grep -c "fbq("` | 0 | ✓ CONFIRMS documented gap |
| hreflang cluster complete on `/` | `curl https://rideprestigo.com/ \| grep 'rel="alternate"'` | 8 alternates incl. `zh-Hans` + `x-default` | ✓ PASS |
| CSP header matches documented static policy | `curl -D- -o /dev/null https://rideprestigo.com/` | matches `csp_regression.py` baseline shape | ✓ PASS |
| `npx vitest run` (full suite, once) | — | 157 files passed/2 skipped, 2692 tests passed/0 failed | ✓ PASS |

### Human Verification Required

### 1. GA4 "Site Locale" custom dimension registration

**Test:** Open GA4 Admin → Custom definitions and confirm an event-scoped dimension named "Site Locale" is bound to the `site_locale` parameter.
**Expected:** Dimension exists and is actively populating in reports.
**Why human:** User-confirmed already, but the GA Admin API MCP returned `invalid_grant` and could not cross-check programmatically. Client-side code emitting the parameter is independently confirmed; the property-side dimension binding is not.

### 2. RU/AR signed-in account booking path

**Test:** Supply `scripts/qa/.e2e-account.json` with real test-account credentials, then run `booking_e2e.py --locales "" --account ru,ar`.
**Expected:** Both locales reach a rendered Stripe form via the signed-in "My trips" flow with correct Stripe/Places locale.
**Why human:** Structurally impossible to automate without the credentials file; only a human can supply it.

### 3. Meta Pixel env var fix

**Test:** In the Vercel dashboard, re-enter `NEXT_PUBLIC_META_PIXEL_ID`/`META_PIXEL_ID` without a trailing newline, redeploy, then re-run `analytics_locale_audit.py`.
**Expected:** `metaHits > 0` and `metaSiteLocale=true` on all 7 locales.
**Why human:** Requires Vercel dashboard access this verifier does not have.

### Gaps Summary

Phase 75 achieved the large majority of its goal: every locale renders correctly (independently re-confirmed live), the locale switcher works, guest booking reaches a real, correctly-localized Stripe payment form in all 7 locales including RTL Arabic (independently corroborated via raw JSON + real, later-cleaned-up Supabase rows), GA4 carries `site_locale` (client wiring independently confirmed live), hreflang/JSON-LD/CSP show no regression (independently re-confirmed), and the full vitest suite is green on `main` (independently re-run: 2692/2692 passing, 0 failed). The specific EN leaks named in the ROADMAP success criterion were fixed, and static-layer leaks are down to zero actionable customer-facing findings.

However, four concrete items keep this phase from a clean "passed": (1) the RU/AR **signed-in account** booking path — an explicit ROADMAP clause — was never executed because the test-account credentials file was never supplied; (2) Meta Pixel/CAPI `site_locale` is entirely unverifiable because the pixel never fires at all in production (confirmed independently — zero `fbq(` calls), a pre-existing env var defect outside this phase's code but one that blocks half of ROADMAP SC #4; (3) the overflow audit — explicitly required to "stay at 0 issues" — now shows 1 new regression at 768px on `/ru/fleet`; (4) the rendered-layer EN-leak sweep, while dramatically improved (2003→329 text leaks), is not zero, and one instance (the systemic English 404 on any unmatched locale path) was independently reproduced live by this verifier. None of these are fabricated-work or stub findings — all four are honestly self-reported by the executor in 75-QA-RESULTS.md/deferred-items.md/WINDOWS.md with root causes, and three of the four (Meta Pixel, RU/AR credentials, overflow) require a human action (Vercel env fix, credentials file, CSS follow-up) rather than more agent work. The Metricool-announcement clause of SC #7 is not a gap — the user explicitly declined it.

Recommended next step: either accept overrides for the Meta-Pixel-env-var and RU/AR-credentials items (both are human-gated, not code defects) and open a small follow-up plan for the overflow regression + 404 catch-all route + EN-leak allowlist gaps, or route all four through `/gsd-plan-phase --gaps` for a closure plan before declaring VER-01 complete and closing milestone v3.0.

---

*Verified: 2026-09-27T00:00:00Z*
*Verifier: Claude (gsd-verifier)*
