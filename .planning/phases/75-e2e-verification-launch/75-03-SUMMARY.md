---
phase: 75-e2e-verification-launch
plan: 03
subsystem: testing
tags: [playwright, python, e2e, booking, stripe, google-places, i18n, rtl]

requires:
  - phase: 75-e2e-verification-launch (plan 01)
    provides: scripts/qa/ Python Playwright QA-script style (overflow_audit.py skeleton, consent init script, analytics-abort route)
  - phase: 75-e2e-verification-launch (plan 02)
    provides: scripts/qa/en_leak_allowlist.json (DNT/place-name allowlist, reused for the account/trips Latin-leak spot-check)
provides:
  - "scripts/qa/booking_e2e.py -- locale-aware Playwright driver for the guest booking wizard (all 7 locales) and the RU/AR signed-in account path, up to a rendered Stripe Payment Element -- never pays"
  - "scripts/qa/out/booking_e2e_refs.json -- deduplicated {ref, locale, path, createdAt} list of every E2E/TEST-marked bookingReference created, for strict cleanup"
  - "Per-locale Stripe Elements locale + Google Places autocomplete language capture (D-07 surface 4), proving the pre-fix baseline (both hardcoded to 'en' today) that plan 75-05 fixes"
affects: [75-05 (Stripe/Places locale fix -- this script is the regression check), 75-20 (before/after re-run + strict marker cleanup using booking_e2e_refs.json)]

actuals:
  tokens: 6100
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Python Playwright QA script (scripts/qa/booking_e2e.py), styled after overflow_audit.py: CLI positional base_url + --locales/--account flags, consent localStorage init script, network-abort route for GA4/Meta domains, JSON output to scripts/qa/out/"
    - "Locale message resolver (t(locale, dotted_key)) reads messages/<locale>.json directly so every Playwright locator's text comes from the real catalog -- a label still in English on a localized page makes the locator fail, turning the flow itself into an EN-leak detector"
    - "Async-selection readiness waits instead of fixed sleeps: wait for the Places SDK to finish loading (window.google.maps.places.AutocompleteSuggestion) before typing, and wait for the address input's 'Clear' button to appear (value !== null) before submitting -- both races were reproduced live against production and silently stalled the wizard on step 1 without these waits"
    - "Google Places autocomplete language captured from the places.googleapis.com $rpc/google.maps.places.v1.Places/AutocompletePlaces POST body -- a positional JSON array, not an object; language code is index 5 -- works identically whether the legacy AddressInput.tsx or AddressInputNew.tsx code path triggers the request"
    - "Stripe Elements locale captured from the elements-inner iframe's src URL fragment (?...&locale=en&...), with a best-effort visible-field-label fallback if a future Stripe version stops exposing it there"
    - "Pacing (>=20s between create-payment-intent-triggering runs) + single 429 retry after a 65s cool-down, implemented as a paced_run() wrapper around both the guest and account flow entry points"

key-files:
  created:
    - scripts/qa/booking_e2e.py
  modified: []

key-decisions:
  - "Deviation from the plan's read_first list: EntryBar.tsx (Step 1 of the actual booking wizard) imports the legacy components/booking/AddressInput.tsx, not AddressInputNew.tsx as read_first assumed -- AddressInputNew is only wired into the homepage BookingWidget/DayCard behind NEXT_PUBLIC_USE_NEW_PLACES_API. Both ultimately call the same places.googleapis.com v1 Places RPC, so the network-level language capture works identically; only the source-file assumption was off, not the runtime behaviour or the plan's intent."
  - "button.btn-primary:visible (not .btn-primary:visible) is required for every generic-CTA click -- the site's 'Skip to content' accessibility link also carries the btn-primary class and is technically 'visible' to Playwright despite being positioned off-screen, causing an infinite scroll-and-retry hang on the unscoped selector."
  - "Address-selection is asynchronous (handleSelect awaits a place-details fetch before committing to the store); the script waits for the input's 'Clear address' button to render (the value!==null signal) rather than a fixed timeout, after reproducing a step-1-stall race in 2 of 3 live production runs without it."
  - "Hindi is an accepted exception on the Stripe-locale half of the pass/fail check (per 75-RESEARCH.md Pitfall 1 -- Stripe has no hi locale at all), but NOT exempted on the Places-language half, since Google Places does support hi; localeChecksPassed for hi still correctly fails pre-fix because of the Places mismatch alone."
  - "The account/trips Latin-leak spot-check is a lightweight, scoped reuse of the en_leak_allowlist.json shape (75-02) rather than importing the full en_leak_rendered.py scanner -- /account/trips is auth-gated and outside that scanner's page list, so duplicating its full logic here would be new surface to maintain for one page."

requirements-completed: [VER-01]

coverage:
  - id: D1
    description: "Guest booking driven through all 6 wizard steps to a rendered, localized Stripe payment form on production in all 7 locales (D-01/D-02), with the E2E/TEST marker and bookingReference recorded for cleanup (D-03)"
    requirement: VER-01
    verification:
      - kind: e2e
        ref: "python3 scripts/qa/booking_e2e.py https://rideprestigo.com --locales en (repeated 3x for stability, then en,ru together) -- reachedStripe=true, ref matches ^PRG-, ref recorded in booking_e2e_refs.json"
        status: pass
      - kind: e2e
        ref: "python3 scripts/qa/booking_e2e.py https://rideprestigo.com --locales <locale> run individually against production for ru, es, fr, ar, hi, zh -- all 7 locales reach the Stripe form (reachedStripe=true)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Stripe Elements locale and Google Places autocomplete language captured per locale and compared against expected values (D-07 surface 4), proving the pre-fix baseline (non-EN runs show both hardcoded to 'en', localeChecksPassed=false) that plan 75-05 fixes; RTL (dir=rtl) asserted on ar"
    requirement: VER-01
    verification:
      - kind: e2e
        ref: "python3 scripts/qa/booking_e2e.py https://rideprestigo.com --locales ru -- stripeLocaleParam/placesLanguage/htmlLang/htmlDir all recorded, htmlDir=ltr; ar run separately recorded htmlDir=rtl"
        status: pass
    human_judgment: false
  - id: D3
    description: "Signed-in account path (RU/AR, --account) with password sign-in + 'My trips' verification + booking to Stripe with signed-in state auto-skipping the guest path, and a clean explicit skip when scripts/qa/.e2e-account.json is absent"
    requirement: VER-01
    verification:
      - kind: e2e
        ref: "python3 scripts/qa/booking_e2e.py https://rideprestigo.com --account ru (with .e2e-account.json absent) -- result {skipped: true, reason: 'account credentials missing'}, exit code 0, no traceback"
        status: pass
      - kind: other
        ref: "grep -n password scripts/qa/booking_e2e.py -- confirms no print/log statement outputs the password value"
        status: pass
    human_judgment: true
    rationale: "The real signed-in flow (password sign-in succeeding, 'My trips' rendering, passenger pre-fill being overwritten) cannot be exercised without a live test-account credentials file, which is git-ignored and human-provisioned per plan 75-01 D-08. Only the skip-path and the code path itself are machine-verified here; a human (or a later plan run once .e2e-account.json exists) must confirm the credentialed path end-to-end."

duration: 30min
completed: 2026-09-25
status: complete
---

# Phase 75 Plan 03: Booking E2E Driver (Guest ×7 Locales + RU/AR Account Path) Summary

**Playwright-driven booking E2E (`scripts/qa/booking_e2e.py`) that checks out as a guest through all 6 wizard steps to a rendered Stripe payment form in all 7 locales, captures the pre-fix Stripe/Places locale baseline, and drives the RU/AR signed-in account path — proven directly against production, never submitting a real payment.**

## Performance

- **Duration:** 30 min
- **Started:** 2026-09-25T11:45:00Z
- **Completed:** 2026-09-25T12:12:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- `scripts/qa/booking_e2e.py`: CLI (`base_url`, `--locales`, `--account`, `--headed`) driving a Chromium browser through the real `/book` wizard on production — origin/destination autocomplete, date/time, vehicle auto-select, guest-or-signed-in auth branching, extras, passenger details (marker-stamped per D-03), and a hard stop the instant the Stripe Payment Element iframe is visible. Never clicks pay, never types into a Stripe field.
- Every locator's text is resolved from `messages/<locale>.json` via a small `t(locale, key)` helper — a label still in English on a localized page makes the run fail, so the flow doubles as a leak detector per D-01/D-07.
- Two real race conditions were found and fixed by running the script live against production (not just reasoned about): the Google Maps Places SDK not yet loaded when typing begins, and the async place-details fetch not yet committed to the Zustand store when "View vehicles" is clicked — both silently stranded the wizard on step 1 without explicit readiness waits.
- Generalized to all 7 locales with pacing (≥20s between `create-payment-intent` calls) and a single 429 retry after 65s; verified individually against production for en/ru/es/fr/ar/hi/zh — every locale reaches the Stripe form.
- Captured the Stripe Elements locale (from the `elements-inner` iframe's `src` fragment) and the Google Places autocomplete language (from the `places.googleapis.com` `AutocompletePlaces` RPC's positional JSON body) per locale, confirming the exact pre-fix defect: both are hardcoded to `'en'` today regardless of site locale — the baseline plan 75-05 will fix.
- Added the RU/AR signed-in account path: password sign-in, "My trips" render + a lightweight Latin-leak spot-check (reusing 75-02's allowlist), then a booking run where Step3Auth's own mount effect auto-advances past the guest-path click, and the passenger step is overwritten with the account-variant D-03 marker (`e2e+account-{locale}@rideprestigo.com`) so the row still matches strict cleanup. Skips cleanly with an explicit reason when `scripts/qa/.e2e-account.json` is absent — verified.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — EN guest booking on production through 6 steps to a rendered Stripe Payment Element** - `74f7a1fa` (feat)
2. **Task 2: All 7 locales + RTL + Stripe/Places locale capture + RU/AR account path** - `3727fc3f` (feat)

**Plan metadata:** commit hash recorded after this SUMMARY is committed.

## Files Created/Modified
- `scripts/qa/booking_e2e.py` - locale-aware booking E2E driver (guest ×7 locales, RU/AR account path, Stripe/Places locale capture)

## Decisions Made
- EntryBar actually imports the legacy `AddressInput.tsx`, not `AddressInputNew.tsx` as the plan's read_first assumed — both call the same underlying Places RPC, so the network-level capture logic is unaffected; only the source-file reference was corrected.
- `button.btn-primary:visible` (element-type-scoped), not the bare class selector — the site's "Skip to content" accessibility link also carries `.btn-primary` and hung the script in an infinite scroll-retry loop under the unscoped selector.
- Async place-selection and Maps-SDK-load races were fixed with explicit readiness waits (the "Clear address" button appearing; `window.google.maps.places.AutocompleteSuggestion` existing) instead of fixed sleeps, after reproducing both races live against production.
- Hindi is an accepted exception only on the Stripe-locale half of the locale check (no Stripe `hi` locale exists at all); it is NOT exempted on the Places-language half, since Google Places does support `hi` — `localeChecksPassed` for `hi` still correctly reports `false` pre-fix, driven by the genuine Places mismatch.
- The account/trips Latin-leak spot-check reuses `en_leak_allowlist.json`'s shape directly rather than importing the full `en_leak_rendered.py` scanner, since `/account/trips` is auth-gated and outside that scanner's existing page list.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `.btn-primary:visible` matched the "Skip to content" link and hung indefinitely**
- **Found during:** Task 1, first live run against production
- **Issue:** The site's accessibility skip-link (`<a href="#main-content" class="skip-link btn-primary">`) is reported "visible" by Playwright (not `display:none`/`visibility:hidden`) despite being positioned off-screen, so the unscoped `.btn-primary:visible` locator resolved to it instead of the intended `<button>`, and `.click()` retried "scrolling into view" forever since the element is deliberately kept off-screen.
- **Fix:** Scoped every generic-CTA locator to `button.btn-primary:visible` (element-type qualifier).
- **Files modified:** `scripts/qa/booking_e2e.py`
- **Verification:** Full step-1→step-6 run completed without a hang after the fix.
- **Committed in:** `74f7a1fa`

**2. [Rule 1 - Bug] Address selection race — wizard silently stalled on step 1**
- **Found during:** Task 1, live production runs (2 of 3 attempts failed before the fix)
- **Issue:** `AddressInput.tsx`'s `handleSelect()` awaits an async `place.fetchFields()` call before writing the selected place into the Zustand store; the input's displayed text updates synchronously, but proceeding immediately (filling date/time and clicking "View vehicles") could race ahead of the store commit, leaving `origin`/`destination` still `null` when `validate()` ran — the wizard then silently stayed on step 1 with no visible error.
- **Fix:** Wait for the address input's "Clear address" (×) button to become visible after each selection — it only renders once the store value is non-null — before proceeding, instead of a fixed sleep.
- **Files modified:** `scripts/qa/booking_e2e.py`
- **Verification:** 4/4 clean runs after the fix (was 1/3 before).
- **Committed in:** `74f7a1fa`

**3. [Rule 1 - Bug] Google Maps SDK not yet loaded when typing began**
- **Found during:** Task 1, live production runs (further flakiness after fix #2)
- **Issue:** `AddressInput.tsx` lazy-loads the Google Maps JS SDK on mount (`ensureMapsLoaded()`); if the script types into the origin field before `mapsLoaded` flips true, `fetchSuggestions()` early-returns with no suggestions and no retry on the stale debounce, so the listbox never appears.
- **Fix:** `page.wait_for_function()` on `window.google.maps.places.AutocompleteSuggestion` existing, before any typing.
- **Files modified:** `scripts/qa/booking_e2e.py`
- **Verification:** 4/4 clean runs after the fix.
- **Committed in:** `74f7a1fa`

---

**Total deviations:** 3 auto-fixed (3 bugs, all in the QA script itself, not application code)
**Impact on plan:** All three fixes were necessary for the script to reliably drive the real wizard at all; no scope creep, no application code touched.

## Issues Encountered
None beyond the three deviations above (all auto-fixed and verified).

## User Setup Required
None - no external service configuration required. (`scripts/qa/.e2e-account.json` for the RU/AR account path is a human-provisioned, git-ignored credentials file per plan 75-01 D-08 — its absence is handled as a clean, expected skip, not a setup blocker for this plan.)

## Next Phase Readiness
- `scripts/qa/booking_e2e.py` is committed and proven against production for all 7 locales (guest path) and the account-skip path. `booking_e2e_refs.json` now holds 16 E2E/TEST-marked booking references (all 7 locales) accumulated across this plan's live verification runs — ready input for plan 75-20's strict marker cleanup.
- The captured pre-fix baseline (Stripe Elements locale + Google Places language both hardcoded to `'en'`, `localeChecksPassed: false` for every non-EN locale) is the concrete before-state that plan 75-05 (Stripe/Places locale fix) must flip to `true`; this script is also that fix's regression check.
- Deferred: a fully credentialed live run of the RU/AR account path (real sign-in → My trips → booking) — needs a human to provision `scripts/qa/.e2e-account.json` first; the code path is implemented and the skip-path is verified, but the credentialed path itself has not been exercised end-to-end in this session.

## Self-Check: PASSED

`scripts/qa/booking_e2e.py` confirmed present on disk; both task commit hashes (`74f7a1fa`, `3727fc3f`) confirmed in `git log`.

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-25*
