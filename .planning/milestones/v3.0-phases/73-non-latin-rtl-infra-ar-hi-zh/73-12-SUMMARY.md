---
phase: 73-non-latin-rtl-infra-ar-hi-zh
plan: 12
subsystem: i18n
tags: [rtl, font-01, rtl-01, noto, bidi, visual-qa, ar, hi, zh, wordmark]

requires:
  - phase: 73-07
    provides: Nav chevron/dropdown + carousel RTL fixes (CR-01/WR-01/WR-03) validated by this pass
  - phase: 73-08
    provides: interpolateBidi()/bdi price-token isolation (CR-02) validated by this pass
  - phase: 73-09
    provides: CR-02 bidi sweep across route/service pages validated by this pass
  - phase: 73-10
    provides: globals.css logical props + blog CTA bdi scope (WR-02/WR-05) validated by this pass
  - phase: 73-11
    provides: localized skip-to-content link (WR-04) validated live on /ar,/hi,/zh
provides:
  - Completed D-10/D-11 RTL visual QA record (73-RTL-QA.md) with recorded PASS across Groups 1-4
  - tests/rtl-backstop.test.ts — re-runnable source-level backstop for every 73-07..73-12 RTL fix
  - RTL-01 wordmark fix (.wordmark direction:ltr) closing the last /ar mirrored-layout defect
affects: [gsd-verify-work, gsd-ship, future SiteChrome/Nav/CookieBanner edits, phase-73 verification]

actuals:
  tokens: 9000
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Latin brand wordmark forced direction:ltr so flex/inline-flex layouts never reverse under dir=rtl"
    - "Source-reading vitest backstop (fs.readFileSync + regex) as machine evidence for human-only RTL visual items"

key-files:
  created:
    - tests/rtl-backstop.test.ts
  modified:
    - .planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md
    - app/globals.css

key-decisions:
  - "Performed the D-10/D-11 visual pass via the built-in browser (orchestrator) against the local dev server instead of deferring to a separate human step — self-verify with screenshot + geometry + scrollWidth evidence."
  - "The one FAIL found (brand wordmark reversing to GOPRESTI under dir=rtl) was fixed inline in this plan (globals.css .wordmark direction:ltr) rather than deferred, because a reversed brand mark on the flagship /ar page is exactly the mirrored-layout breakage RTL-01 forbids."
  - "Fixed via CSS (direction:ltr on .wordmark), not a conditional dir attribute in JSX, specifically to avoid changing page HTML — byte-parity for en/ru/es/fr is preserved (snapshots compare HTML, not CSS)."
  - "Local dev €0 price values (reproduced on en/ru too) recorded as a cross-locale dev-data artifact, NOT a Phase-73 RTL FAIL — the bidi isolation of the token is correct."

patterns-established:
  - "Wordmark LTR lock: any Latin brand mark in an RTL-capable layout gets direction:ltr at the CSS layer."

requirements-completed: [RTL-01, FONT-01]

coverage:
  - id: D1
    description: "D-10/D-11 RTL visual QA on /ar (5 representative pages) + /hi/login + /zh/login recorded PASS across mirroring, tofu, mixed LTR-in-RTL, and backstops"
    requirement: RTL-01
    verification:
      - kind: manual_procedural
        ref: ".planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md#task-3 (performed 2026-09-19, built-in browser)"
        status: pass
  - id: D2
    description: "FONT-01 tofu confirmation — /ar,/hi,/zh render Noto glyphs with no fallback boxes"
    requirement: FONT-01
    verification:
      - kind: manual_procedural
        ref: ".planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md#group-2 (screenshot-verified /ar, /hi/login, /zh/login)"
        status: pass
  - id: D3
    description: "Re-runnable source-level backstop asserting every 73-07..73-12 RTL code fix is in place"
    requirement: RTL-01
    verification:
      - kind: unit
        ref: "tests/rtl-backstop.test.ts (46 tests)"
        status: pass
  - id: D4
    description: "Brand wordmark no longer reverses under dir=rtl (RTL-01 defect closed)"
    requirement: RTL-01
    verification:
      - kind: unit
        ref: "tests/rtl-backstop.test.ts#forces the Latin brand wordmark to LTR"
        status: pass
---

## Accomplishments

- **Task 1 (auto):** Created `tests/rtl-backstop.test.ts` — a source-reading vitest backstop
  (46 assertions) covering Nav chevron/inset (CR-01/WR-01), carousel `useLocale`+deltas (WR-03),
  globals.css logical props / no left transform-origin (WR-02), blog CTA `<bdi>` scope (WR-05),
  route/service price bidi isolation across 31 routes + 3 services (CR-02), and the new wordmark
  LTR lock. Committed `ce1e613`.
- **Task 2 (checkpoint:human-verify → performed by orchestrator via built-in browser):**
  Walked the 5 D-10 pages on `/ar` (`/ar`, `/ar/book`, `/ar/routes/prague-vienna`,
  `/ar/blog/prague-airport-arrivals-guide`, `/ar/login`) plus `/hi/login` and `/zh/login`.
  Recorded PASS across all four groups in `73-RTL-QA.md`; zero PENDING cells remain.

## What the pass verified (PASS)

- **Mirroring (Group 1):** nav layout, alignment, chevrons (CR-01), dropdown inset (WR-01) all mirror correctly under `dir=rtl`.
- **Tofu (Group 2):** Noto Arabic / Devanagari / SC glyphs render with no fallback boxes on `/ar`, `/hi/login`, `/zh/login` (screenshot-verified).
- **Mixed LTR-in-RTL (Group 3):** price/phone/time tokens bidi-isolated (`dir=ltr; unicode-bidi:isolate`), un-reversed.
- **Backstops (Group 4):** no horizontal overflow on any page; ar/hi text in bounds; zh headings wrap cleanly.
- **WR-04 live:** localized skip-to-content link renders in Arabic/Hindi/Chinese.

## FAIL found & fixed (deviation — Rule 2)

- **Brand wordmark reversal (RTL-01):** `.wordmark` (`Nav.tsx`, `CookieBanner.tsx`) is an
  `inline-flex` row; under `dir=rtl` its two children (`PRESTI` + `GO`) reversed to render
  **"GOPRESTI"** on every `/ar` page (proven via child `getBoundingClientRect().left` ordering).
  Fixed by adding `direction: ltr` to the `.wordmark` rule in `app/globals.css` (deviation:
  `globals.css` was not in this plan's declared `files_modified` — added because it is the
  correct, minimal fix for the QA finding). No-op for LTR locales; changes no page HTML so
  byte-parity for en/ru/es/fr holds; fixes the flex main-axis order under RTL. Re-verified PASS
  on `/ar` and `/ar/login`; a backstop assertion was added to `tests/rtl-backstop.test.ts`.

## Deviations

1. **Task 2 performed by the orchestrator (browser), not deferred to a separate human step** —
   per the project's self-verify discipline, using screenshot + DOM-geometry + `scrollWidth`
   evidence.
2. **`app/globals.css` modified (outside declared files_modified)** — the inline fix for the
   Group-1 wordmark FAIL discovered during the pass.

## Known out-of-scope (recorded, NOT Phase-73 FAILs)

- Local dev `€0` price values (reproduced on `en`/`ru` too) — missing local Supabase pricing
  data, a cross-locale dev artifact, not an RTL/bidi defect.
- `/book` hardcoded-EN decorative heading (STR-02) and the 7 static pages `getLocale()`
  EN-fallback (WINDOWS #7) — pre-existing, in `deferred-items.md`, none in the D-10 set.

## Verification

- `npx vitest run tests/rtl-backstop.test.ts` → 46/46 pass.
- `npx vitest run` (full suite) → 1509 passed, 0 failed (126 files), byte-parity preserved.
- `73-RTL-QA.md` gate: zero `PENDING — operator` cells, PASS/FAIL recorded per row → GATE_PASS.

## Self-Check: PASSED
