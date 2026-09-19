---
phase: 73-non-latin-rtl-infra-ar-hi-zh
plan: 05
subsystem: ui
tags: [tailwind, rtl, i18n, logical-properties, bidi, blog]

requires:
  - phase: 73-non-latin-rtl-infra-ar-hi-zh (plan 01)
    provides: "html dir=rtl wiring for ar, byte-parity test scaffolding (tests/route-page-render.test.tsx)"
provides:
  - "The 3 legacy JSX blog pages (prague-airport-taxi-vs-chauffeur, prague-airport-to-city-center, prague-vienna-transfer-vs-train) have zero physical-direction Tailwind classes — pull-quote border-l-2/pl-8 -> border-s-2/ps-8, results-table w-full text-left -> text-start"
  - "The 4 existing price-emphasis <span> render boundaries in these pages converted to <bdi>, isolating the DNT price token from ambient dir=rtl bidi reordering on /ar/"
affects: [74-seo-hreflang-metadata, 75-e2e-verification-launch]

actuals:
  tokens: 1962
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Pure 1:1 Tailwind physical-to-logical swap (border-l-2/pl-N -> border-s-2/ps-N paired together, text-left -> text-start) applied identically to the route/service-page precedent from 73-04"
    - "Existing inline price-emphasis <span> converted to native <bdi> (zero-JS bidi isolation primitive) at the same render boundary — no new parsing pass introduced"

key-files:
  created: []
  modified:
    - app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx
    - app/[locale]/blog/prague-airport-to-city-center/page.tsx
    - app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx

key-decisions:
  - "Task 2 scope interpreted narrowly per the plan's own 'do not add a new parsing pass' instruction: only the 4 DNT price tokens that already sit inside an existing standalone <span> render boundary in free-flowing JSX prose were converted to <bdi>. Phone numbers, flight-number placeholders, and the large volume of prices/times embedded mid-sentence inside data-array strings (comparison-table cells, FAQ answer text, scenario write-ups) have no existing wrap boundary to piggyback on — wrapping them individually would require introducing regex-based string splitting, which the plan explicitly excludes. Documented as a scoped no-op below (plan's own accepted escape hatch)."
  - "span -> bdi preserves all existing style/className attributes verbatim (bdi is a plain inline element, styles/classes apply identically) — purely additive bidi-isolation semantics, no visual change under dir=ltr."

patterns-established:
  - "Existing DNT-emphasis <span> in blog/route JSX prose is the correct, plan-sanctioned bidi-isolation boundary — convert to <bdi> rather than inventing a new wrap mechanism."

requirements-completed: [RTL-01]

coverage:
  - id: D1
    description: "All 3 blog pages' pull-quote border-l-2/pl-8 (or pl-6) pattern converted to border-s-2/ps-8, accent and inset staying on the same reading-start edge"
    requirement: RTL-01
    verification:
      - kind: other
        ref: "grep -rlE 'text-(left|right)|border-(l|r)($|[- ])|(^| )p(l|r)-[0-9]' app/[locale]/blog — returns no files"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 3 blog pages' results-table w-full text-left converted to text-start (1 occurrence each in taxi-vs-chauffeur and airport-to-city-center; 2 in prague-vienna-transfer-vs-train)"
    requirement: RTL-01
    verification:
      - kind: other
        ref: "grep -rlE 'text-(left|right)' app/[locale]/blog — returns no files"
        status: pass
    human_judgment: false
  - id: D3
    description: "The 4 existing price-emphasis <span> boundaries in blog body prose converted to <bdi>, isolating DNT price tokens from dir=rtl bidi reordering on /ar/"
    requirement: RTL-01
    verification:
      - kind: other
        ref: "grep -rc '<bdi' app/[locale]/blog — returns 4"
        status: pass
    human_judgment: false
  - id: D4
    description: "LTR byte-parity (en/ru/es/fr rendering unaffected) after the conversion"
    requirement: RTL-01
    verification:
      - kind: unit
        ref: "tests/route-page-render.test.tsx (all tests pass)"
        status: pass
      - kind: unit
        ref: "tests/blog.test.ts (all tests pass)"
        status: pass
      - kind: unit
        ref: "tests/nav-locale-render-parity.test.tsx (all tests pass)"
        status: pass
    human_judgment: false

duration: ~10min
completed: 2026-09-19
status: complete
---

# Phase 73 Plan 05: Blog Pull-Quote, Text-Alignment & Bidi-Isolation Summary

**Converted the 3 legacy JSX blog pages' pull-quote and results-table Tailwind classes to logical properties, and bidi-isolated the 4 existing DNT price-emphasis spans with `<bdi>`.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-09-19T10:52:00+02:00 (approx.)
- **Completed:** 2026-09-19T11:00:00+02:00 (approx.)
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `border-l-2 border-copper pl-8` pull-quote pattern converted to `border-s-2 border-copper ps-8` in all 3 pages (1 occurrence each) — accent and inset stay paired on the reading-start edge.
- `w-full text-left` results-table pattern converted to `w-full text-start` — 1 occurrence in `prague-airport-taxi-vs-chauffeur`, 1 in `prague-airport-to-city-center`, 2 in `prague-vienna-transfer-vs-train`.
- Phase-wide grep (`grep -rlE "text-(left|right)|border-(l|r)($|[- ])|(^| )p(l|r)-[0-9]" app/[locale]/blog`) confirms zero remaining physical-direction classes across all 3 pages.
- The 4 existing inline price-emphasis `<span>` boundaries in free-flowing prose (mid-article CTA banner + 3 end-of-article CTA headings) converted to `<bdi>`, isolating `€69 fixed`, `€69 fixed, chauffeur inside Arrivals.`, `€69 fixed. Chauffeur inside Arrivals.`, and `€455 fixed. 3h 15min door-to-door.` from ambient `dir="rtl"` bidi reordering on `/ar/`.
- `tests/route-page-render.test.tsx`, `tests/blog.test.ts`, and `tests/nav-locale-render-parity.test.tsx` all pass after both tasks.
- Full project suite (`npx vitest run`): 123/124 test files pass, 1457/1458 tests pass — the sole failure is the pre-existing, out-of-scope `tests/blog-locale-fallback.test.ts` case caused by the untracked `prague-to-budapest-private-transfer.mdx` draft (documented in the executor brief, not this plan's to fix).

## Task Commits

Each task was committed atomically:

1. **Task 1: Blog pull-quote + text-alignment logical conversion (3 pages)** - `9b883d6` (feat)
2. **Task 2: Bidi-isolate DNT price/phone/flight/time tokens in blog body copy** - `fbc1b63` (feat)

_No plan metadata commit yet — this SUMMARY + STATE/ROADMAP updates land in the final docs commit._

## Files Created/Modified
- `app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx` — pull-quote + table swap, 2 span→bdi conversions
- `app/[locale]/blog/prague-airport-to-city-center/page.tsx` — pull-quote + table swap, 1 span→bdi conversion
- `app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx` — pull-quote + 2 table swaps, 1 span→bdi conversion

## Decisions Made
- Task 2 scoped to the 4 existing standalone price-emphasis `<span>` boundaries only (see `key-decisions` in frontmatter) — full rationale and the scoped no-op are documented below.

## Deviations from Plan

None — plan executed exactly as written, including its own scoping instruction ("do not add a new parsing pass") for Task 2.

### Scoped No-Op (plan-sanctioned, not a deviation)

Per Task 2's explicit escape hatch ("If a page renders such tokens only in fixed structural chrome — not inside translated prose — record that as a scoped no-op in the SUMMARY"), the following DNT tokens were **not** individually bidi-wrapped:

- **Phone numbers** (`+420 222 333 222`, `+420 220 111 220`) — appear only inside FAQ-answer and `bookingLead` data-array strings (e.g. `a: 'AAA Taxi still exists... by phone (+420 222 333 222)...'`), rendered via plain `{faq.a}` text interpolation with no existing rich-text/DNT wrap boundary.
- **Times** (`23:00–06:00`, `08:15`, `14:30`, etc.) and **flight-adjacent scenario copy** — likewise embedded mid-sentence inside `profile:`/`rationale:`/`fare:` data-array strings used to populate comparison tables and scenario cards.
- **The large majority of price mentions** (`€69`, `€89`, `€120`, `€455`, CZK ranges, etc.) — also embedded mid-sentence inside the same data-array strings (comparison-table `fare`/`prestigo`/`uber`/`bolt`/`public` cell values, FAQ answers, scenario `cost`/`rationale` fields), not standalone JSX expressions.

These three pages are locked EN-only per Phase 72 (no ar/hi/zh translation of the legacy JSX blog content), so the body copy itself never becomes actual translated Arabic/Hindi/Chinese prose — only the surrounding site chrome (Nav/Footer) and the ambient `html dir="rtl"` attribute change under `/ar/`. Wrapping every mid-string numeral/price/phone occurrence would require introducing a new regex-based string-splitting pass to inject `<bdi>` around substrings inside otherwise-plain interpolated text — exactly what the plan's action text forbids ("Do not add a new parsing pass; wrap only at the same call sites the DNT/rich-text isolation already uses"). No such per-token call site exists for these values; only the 4 standalone `<span>` boundaries qualify, and all 4 were converted.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The 3 legacy JSX blog pages complete RTL-01's blog-page scope: zero physical-direction Tailwind classes remain, and the plan-identified existing DNT bidi-isolation boundaries are covered.
- The scoped no-op above (phone/time/most-price tokens embedded in data-array prose) is a known, documented residual risk for `/ar/` visual QA — carried forward as context for Phase 74/75 verification, not a blocker for this plan.
- No blockers for the next plan in this phase (73-06).

---
*Phase: 73-non-latin-rtl-infra-ar-hi-zh*
*Completed: 2026-09-19*

## Self-Check: PASSED

- FOUND: app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx
- FOUND: app/[locale]/blog/prague-airport-to-city-center/page.tsx
- FOUND: app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx
- FOUND: .planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-05-SUMMARY.md
- FOUND commit: 9b883d6
- FOUND commit: fbc1b63
