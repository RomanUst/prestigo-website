---
phase: 75-e2e-verification-launch
plan: 20
subsystem: testing
tags: [e2e, qa, playwright, i18n, verification, production]

requires:
  - phase: 75-e2e-verification-launch
    provides: "scripts/qa/*.py (plans 75-01..75-05), the fix plans 75-06..75-18 that closed the pre-fix EN-leak/navigation gaps, 75-19's production deploy (PR #37, merge 960e4e0f)"
provides:
  - "75-QA-RESULTS.md: full production QA record for VER-01 — ar tracer, all-locale sweep, booking E2E (7 guest + 2 account-skipped), D-05 surfaces, VER-01 facet summary"
  - "75-EN-LEAK-AUDIT.md: post-fix production result section (2003->329 text leaks, 1404->90 link leaks across 6 non-EN locales)"
  - "deferred-items.md: 7 recorded gaps with owner/next-action for follow-up"
  - "WINDOWS.md: 6 new open ledger entries for the gaps found"
  - "scripts/qa/out/booking_e2e_refs.json: 23 E2E booking references (16 prior + 7 new) for the orchestrator's Task 3 cleanup"
affects: [75-21]

actuals:
  tokens: 11575
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "booking_e2e.py --locales \"\" --account <locales> isolates the account-path run from the guest sweep without re-running guest bookings (empty-string locales arg parses to an empty list, not a literal 'none' locale)"

key-files:
  created: []
  modified:
    - .planning/phases/75-e2e-verification-launch/75-QA-RESULTS.md
    - .planning/phases/75-e2e-verification-launch/75-EN-LEAK-AUDIT.md
    - .planning/phases/75-e2e-verification-launch/deferred-items.md
    - .planning/WINDOWS.md

key-decisions:
  - "Root-caused the recurring '/this-page-does-not-exist' EN leak on every locale: app/[locale]/not-found.tsx IS fully localized, but no catch-all route exists under app/[locale]/, so Next.js's App Router falls through to the un-localized root app/not-found.tsx for any unmatched path. Explains 75-19-SUMMARY.md's zh/<unknown> observation as universal, not zh-specific. Not fixed (out of this plan's read-only-verification scope) — logged to deferred-items.md and WINDOWS.md."
  - "RU/AR signed-in account booking path (D-04) recorded as a verification gap, not attempted with fabricated credentials: scripts/qa/.e2e-account.json was checked for existence only (never printed/logged) and found absent, so both account-path runs were driven through booking_e2e.py --account ru,ar (which auto-skips without credentials) rather than skipped silently — this produces a real, JSON-recorded SKIP result distinct from simply omitting the row."
  - "Task 1's tracer findings (ar leaks, hreflang delta, Meta Pixel failure) were recorded as concrete gap evidence and explicitly NOT patched, per the plan's own instruction that a failure becomes a verification gap rather than a same-plan fix-and-redeploy cycle."

requirements-completed: []

coverage:
  - id: D1
    description: "Every locale renders correctly in production (render_audit.py: 7 locales x 21 pages, 200 status, correct html lang/dir, zero CSP violations)"
    requirement: "VER-01"
    verification:
      - kind: e2e
        ref: "scripts/qa/render_audit.py https://rideprestigo.com"
        status: pass
    human_judgment: false
  - id: D2
    description: "LocaleSwitcher works for all 42 ordered pairs + 21 rotating cases across all 7 locales"
    requirement: "VER-01"
    verification:
      - kind: e2e
        ref: "scripts/qa/switcher_audit.py https://rideprestigo.com"
        status: pass
    human_judgment: false
  - id: D3
    description: "Guest booking reaches a rendered Stripe payment form through all 6 wizard steps in all 7 locales incl. ar RTL, with Stripe Elements locale and Google Places language following the site locale; no payment submitted"
    requirement: "VER-01"
    verification:
      - kind: e2e
        ref: "scripts/qa/booking_e2e.py https://rideprestigo.com --locales en,ru,es,fr,ar,hi,zh (7/7 reachedStripe=true, localeChecksPassed=true)"
        status: pass
    human_judgment: false
  - id: D3b
    description: "RU/AR signed-in account ('My trips') booking path (D-04)"
    requirement: "VER-01"
    verification: []
    human_judgment: true
    rationale: "scripts/qa/.e2e-account.json was never provided (checked for existence only, per the plan's own instruction never to print its contents) — both account-path runs auto-skipped. This is an unresolved verification gap requiring a human to supply the credentials file, not a pass/fail a test can currently assert."
  - id: D4
    description: "No EN leakage across visible text, attributes, metadata/JSON-LD, and internal-link locale (two-layer static + rendered scan)"
    requirement: "VER-01"
    verification:
      - kind: e2e
        ref: "node scripts/qa/en_leak_static.mjs (exit 1, 0 actionable customer-facing findings — all 149 findings are the pre-documented UNOWNED admin bucket)"
        status: pass
      - kind: e2e
        ref: "python3 scripts/qa/en_leak_rendered.py https://rideprestigo.com (exit 1, 329 text / 90 link leaks remain across 6 non-EN locales, down from 2003/1404 pre-fix)"
        status: fail
    human_judgment: true
    rationale: "The static layer is fully clean (0 actionable findings). The rendered layer still has real residual leaks (allowlist gaps for person names/mid-sentence brand terms, one blog post's internal nav, and the systemic 404-catch-all gap) — these are evidenced, root-caused, and logged to deferred-items.md/WINDOWS.md but not fixed in this plan, so a human must decide whether this residual level is acceptable for launch or blocks it."
  - id: D5
    description: "GA4 and Meta carry site_locale on every captured hit, all 7 locales"
    requirement: "VER-01"
    verification:
      - kind: e2e
        ref: "python3 scripts/qa/analytics_locale_audit.py https://rideprestigo.com (GA4 site_locale True on all 7 locales x 2 pages; Meta site_locale False on all 7 — metaHits=0 every time)"
        status: fail
    human_judgment: true
    rationale: "GA4 half fully proven. Meta half is entirely blocked by the pre-existing, already-tracked WINDOWS.md #15 defect (env var trailing newline breaks fbq init) — not a Phase 75 regression, but Meta's D-12 requirement cannot be verified until a human fixes the Vercel env var and redeploys."
  - id: D6
    description: "hreflang reciprocal, JSON-LD passes, CSP no drift vs golden baseline, overflow 0 issues at 320/375/768/1024/1280"
    requirement: "VER-01"
    verification:
      - kind: e2e
        ref: "scripts/qa/hreflang_reciprocity.py (3 errors, all D-09 intentional EN-only allowlist — improved from 4 pre-change)"
        status: pass
      - kind: e2e
        ref: "scripts/qa/jsonld_audit.py (0 findings, 84 blocks x 7 locales)"
        status: pass
      - kind: e2e
        ref: "scripts/qa/csp_regression.py --compare (0 findings, 11 route classes)"
        status: pass
      - kind: e2e
        ref: "scripts/qa/overflow_audit.py at 320/375/1024/1280px (0 issues each)"
        status: pass
      - kind: e2e
        ref: "scripts/qa/overflow_audit.py at 768px (1 new issue: /ru/fleet, 2 paragraphs overflow)"
        status: fail
    human_judgment: true
    rationale: "4 of 5 sub-checks pass cleanly. The 768px overflow regression on /ru/fleet is a new, real finding (translated Russian copy is longer than the English source) that was not present in the pre-translation baseline — logged to deferred-items.md/WINDOWS.md as a candidate follow-up to 75-08, not fixed here."
  - id: D7
    description: "D-05 post-booking surfaces (confirmation page copy, client email language) recorded as-is from code/templates"
    requirement: "VER-01"
    verification:
      - kind: e2e
        ref: "grep -n useTranslations|getTranslations|locale app/[locale]/book/confirmation/page.tsx lib/email*.ts (0 matches in every file — confirmed English-only)"
        status: pass
    human_judgment: false
  - id: D8
    description: "All results (per script, per locale, pre-change baseline vs post-deploy) recorded in 75-QA-RESULTS.md"
    requirement: "VER-01"
    verification:
      - kind: e2e
        ref: "grep -n 'Production QA|Booking E2E|D-05|VER-01' .planning/phases/75-e2e-verification-launch/75-QA-RESULTS.md"
        status: pass
    human_judgment: false
  - id: D9
    description: "Every E2E booking row removed from production Supabase by the strict marker, cross-checked against booking_e2e_refs.json"
    verification: []
    human_judgment: true
    rationale: "Task 3 (checkpoint:human-action, gate=blocking-human) is explicitly performed by the ORCHESTRATOR via the Supabase MCP after this executor returns — executors have no MCP access. PENDING as of this SUMMARY; 23 booking references are recorded in 75-QA-RESULTS.md 'Booking E2E' for the orchestrator's cross-check."

duration: ~60min
completed: 2026-09-27
status: complete
---

# Phase 75 Plan 20: Full Production QA Sweep (Tasks 1-2) Summary

**Ran the complete VER-01 production proof (render, switcher, guest booking incl. ar RTL, two-layer EN-leak, hreflang, JSON-LD, CSP, analytics locale, overflow) across all 7 locales on rideprestigo.com post-deploy, root-caused a systemic 404-localization gap, and recorded every result against the pre-change baseline — Task 3 (E2E row cleanup via Supabase MCP) is PENDING, owned by the orchestrator.**

## Performance

- **Duration:** ~60 min
- **Tasks:** 2 of 3 (Task 3 is orchestrator-owned, not executor scope)
- **Files modified:** 4 (`75-QA-RESULTS.md`, `75-EN-LEAK-AUDIT.md`, `deferred-items.md`, `WINDOWS.md`)
- **Commits:** 3

## Accomplishments

- **Task 1 (tracer):** Ran every QA script for `ar` (RTL) on production — `render_audit`, `switcher_audit`, `en_leak_rendered`, `jsonld_audit`, `analytics_locale_audit`, `booking_e2e` (guest), plus the locale-independent `hreflang_reciprocity` and `csp_regression --compare`. The ar guest checkout reached a rendered Stripe form with `stripeLocale=ar`, `placesLanguage=ar`, `htmlDir=rtl`, `localeChecksPassed=true`. All results recorded against `75-QA-BASELINE.md`.
- **Task 2 (all locales):** Extended the sweep to all 7 locales — `render_audit` (147 URLs, 7 pre-existing findings, unchanged from baseline), `switcher_audit` (63 ops, 0 findings), `jsonld_audit` (84 blocks, 0 findings), `en_leak_static.mjs` on the repo (0 actionable customer-facing findings), `en_leak_rendered.py` across ru/es/fr/ar/hi/zh (2003→329 text leaks, 1404→90 link leaks post-fix), `analytics_locale_audit` (GA4 `site_locale` passes on all 7 locales; Meta never fires), `hreflang_reciprocity` (4→3 errors), `csp_regression --compare` (0 drift), and `overflow_audit` at all 5 widths (768px surfaced 1 new regression on `/ru/fleet`). Ran `booking_e2e.py` guest checkout for the remaining 6 locales (en/ru/es/fr/hi/zh — ar already done in Task 1) — all 7 reached Stripe with correct locale-following. Ran the RU/AR account path (`--account ru,ar`); both auto-skipped because `scripts/qa/.e2e-account.json` was never provided (checked for existence only, per instruction never to read its contents). Read the D-05 post-booking surfaces (confirmation page, email builders) directly from source and confirmed both are English-only, as-is.
- **Root-caused a systemic defect:** every locale's unmatched-path 404 (`/this-page-does-not-exist`) renders the un-localized root `app/not-found.tsx` (English "Page not found"/"Back to Home") instead of the already-fully-localized `app/[locale]/not-found.tsx`, because no catch-all route exists under `app/[locale]/` to route an arbitrary unmatched path into that segment tree. This explains and generalizes the `75-19-SUMMARY.md` observation ("`/zh/<unknown>` renders an English 'Page not found' h1") — it reproduces identically on every locale, not just zh.
- Wrote the VER-01 facet summary into `75-QA-RESULTS.md` (8 facets: render, switcher, booking incl. RTL, EN leakage, analytics locale, CSP, hreflang/JSON-LD, overflow) and a "Post-fix production result" section into `75-EN-LEAK-AUDIT.md`.
- Logged 7 concrete, evidenced gaps to `deferred-items.md` with owner/next-action, and appended 6 corresponding entries to the cross-phase `WINDOWS.md` broken-windows ledger.

## Task Commits

1. **Task 1: Tracer — full script sweep for /ar (RTL) on production, recorded** - `a3325a38` (docs)
2. **Task 2: All locales, booking E2E x 7 + RU/AR account, overflow x 5 widths, D-05 record, full results** - `ef3ab495` (docs)
3. **WINDOWS.md ledger updates (6 entries)** - `ab86f12b` (docs)

_Task 3 (E2E cleanup via Supabase MCP) is a `checkpoint:human-action` performed by the orchestrator — no executor commit for it._

## Files Created/Modified

- `.planning/phases/75-e2e-verification-launch/75-QA-RESULTS.md` — full production QA record (ar tracer, all-locale sweep, booking E2E table with 23 references, D-05 surfaces, VER-01 facet summary)
- `.planning/phases/75-e2e-verification-launch/75-EN-LEAK-AUDIT.md` — post-fix production result section (per-locale before/after leak counts, 4 residual-gap classes)
- `.planning/phases/75-e2e-verification-launch/deferred-items.md` — 7 new entries under a `## 75-20` heading
- `.planning/WINDOWS.md` — 6 new open ledger entries (ids 21-25 plus the overflow entry at 23; see ledger for exact ids)

## Decisions Made

- Root-caused the recurring 404-EN-leak finding to a missing catch-all route under `app/[locale]/` rather than treating it as 6 separate per-locale findings — a single structural cause, recorded once with full explanation.
- Used `booking_e2e.py --locales "" --account ru,ar` (empty-string locales) to isolate the account-path run without re-triggering the already-completed guest sweep; the naive `--locales none` was tried first and misfired (treated `"none"` as a literal locale, producing a real failed guest-booking attempt against `/none/book`) — corrected before any data was created from that misfire (the failed attempt made no booking, since it timed out waiting for `/none/book` to load).
- Did not fabricate or synthesize E2E account credentials to force the RU/AR account path through — recorded it as a genuine, evidenced verification gap per the plan's own conditional instruction ("Plan 75-20 runs the D-04 RU/AR account path only if the file exists at run time; otherwise it records the path as SKIPPED").

## Deviations from Plan

None — plan executed exactly as written for Tasks 1-2. Task 1's explicit "a failure is recorded with its concrete finding (it becomes a verification gap) — do not patch and redeploy from this plan" instruction was followed literally: every finding across both tasks (ar leaks, all-locale leaks, Meta Pixel, overflow regression, 404 gap, account-path skip) was recorded as evidence, not patched.

## Known Stubs

None. This plan produced documentation/QA-record artifacts only; no application code stubs were introduced.

## Issues Encountered

- The `overflow_audit.py` 5-width sweep and the `en_leak_rendered.py` all-locale run each individually exceeded the 3-minute default Bash timeout and had to run detached in the background, polled to completion — no functional issue, just longer wall-clock time than a single foreground call budget allows (booking pacing/back-off + Playwright browser launches across 6-7 locales × 21-26 pages add up).
- `booking_e2e.py --locales none --account ru,ar` was first tried to isolate the account-path run and misfired (interpreted `"none"` as a literal locale string rather than an empty set) — caught immediately from the script's own `[FAIL] none/guest` output, corrected to `--locales ""` on retry with no side effects (the misfired attempt timed out waiting for a nonexistent `/none/book` page and created no booking row).

## User Setup Required

None — no external service configuration required by this plan.

## Next Phase Readiness

- Tasks 1-2 are complete. **Task 3 is PENDING** — the orchestrator must perform the E2E row cleanup via the Supabase MCP (executors have no MCP access): cross-check the 23 recorded booking references in `75-QA-RESULTS.md` "Booking E2E" against a strict-marker `SELECT` on production `bookings`, then `DELETE ... RETURNING` and verify the post-delete count is 0, following the exact steps in this plan's Task 3 `<instructions>`.
- 7 gaps are open and logged (WINDOWS.md ids for: Meta Pixel #15 confirmed systemically, D-05 client emails, 404 catch-all routing, `/ru/fleet` 768px overflow, EN-leak allowlist person-names/brand-terms, RU/AR account path unverified, plus the earlier /routes hub per-route English text #16). None block VER-01's core PASS disposition but should be triaged before the milestone close (plan 75-21).
- The RU/AR signed-in account path (D-04) remains unverified — needs the E2E test account credentials file (`scripts/qa/.e2e-account.json`) supplied, then a single re-run of `booking_e2e.py --locales "" --account ru,ar`.

## Self-Check: PASSED

- `[ -f .planning/phases/75-e2e-verification-launch/75-QA-RESULTS.md ]` → FOUND
- `[ -f .planning/phases/75-e2e-verification-launch/75-EN-LEAK-AUDIT.md ]` → FOUND
- `[ -f .planning/phases/75-e2e-verification-launch/deferred-items.md ]` → FOUND
- `[ -f .planning/WINDOWS.md ]` → FOUND
- `git log --oneline --all --grep="75-20"` → 3 commits found (`a3325a38`, `ef3ab495`, `ab86f12b`)
- Task 1 acceptance criteria re-checked: ar ran on every script (recorded in `75-QA-RESULTS.md`), ar guest booking `reachedStripe=true`/`stripeLocale=ar`/`htmlDir=rtl` (confirmed in `scripts/qa/out/booking_e2e.json`), baseline comparison present for every script.
- Task 2 acceptance criteria re-checked: all-locale results present for every script, 7 guest + 2 account rows recorded, 5 overflow widths recorded, D-05 section present, VER-01 facet summary present (`grep -n "VER-01" 75-QA-RESULTS.md` → 3 hits), `deferred-items.md` has the D-05/CI entries, `scripts/qa/out/booking_e2e_refs.json` has 23 entries (verified via `python3 -c "import json; print(len(json.load(open('scripts/qa/out/booking_e2e_refs.json'))))"`).

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-27*


## Task 3 (orchestrator) — DONE 2026-09-27
17 E2E/TEST unpaid rows removed after a full backup (e2e-cleanup-backup.json) and explicit user approval. Post-delete marker count is 0. The cancelled test row and the user's own test booking were kept. There was no test account to delete (none exists). Details: 75-QA-RESULTS.md, "E2E cleanup".
