---
phase: 71-content-externalization-marketing-seo-pages
plan: 08
subsystem: content-i18n
tags: [next-intl, content-model, page-content, json, legal, privacy, terms, gdpr]

# Dependency graph
requires:
  - phase: 71-content-externalization-marketing-seo-pages
    provides: "getPageContent(page, locale) loader with EN-fallback and segment-wise path-traversal + locale-allowlist validation (71-01); page-content bespoke-page pattern established in 71-05/71-06/71-07"
provides:
  - "content/pages/en/privacy.json, content/pages/en/terms.json, content/pages/en/data-deletion.json — the three legal-page bodies externalized as JSON content"
  - "Per-page narrow legal content types (no universal PageContent interface, per Pitfall 4)"
  - "Completes CNT-02: all non-route marketing/service/legal page bodies are now served from the locale-aware content model"
affects: [71-09]

# Actuals (#2632)
actuals:
  tokens: 22040
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Legal-clause body copy externalized verbatim into JSON, rendered via getPageContent + getLocale(); JSX structure untouched (D-04)"

key-files:
  created:
    - content/pages/en/privacy.json
    - content/pages/en/terms.json
    - content/pages/en/data-deletion.json
    - tests/legal.test.ts
  modified:
    - app/[locale]/privacy/page.tsx
    - app/[locale]/terms/page.tsx
    - app/[locale]/data-deletion/page.tsx

key-decisions:
  - "Legal-entity constants (chelautotrans s.r.o., IČO, Spojovací 685 address) transcribed verbatim into the JSON content — no reformatting, byte-for-byte"
  - "Each legal page keeps its own narrow content type (Pitfall 4); no shared PageBody renderer (D-04)"

patterns-established:
  - "Legal content parity: EN-fallback across all 7 locales + verbatim spot-checks of representative clauses incl. the legal-entity line (tests/legal.test.ts)"

requirements-completed: [CNT-02]

coverage:
  - id: D1
    description: "Privacy policy body served from content/pages/en/privacy.json via getPageContent; rendered EN output byte-for-byte unchanged"
    requirement: CNT-02
    verification:
      - kind: unit
        ref: "tests/legal.test.ts#privacy EN-fallback + verbatim spot-checks"
        status: pass
  - id: D2
    description: "Terms of service body served from content/pages/en/terms.json via getPageContent; rendered EN output byte-for-byte unchanged"
    requirement: CNT-02
    verification:
      - kind: unit
        ref: "tests/legal.test.ts#terms EN-fallback + verbatim spot-checks"
        status: pass
  - id: D3
    description: "Data-deletion page body served from content/pages/en/data-deletion.json via getPageContent; rendered EN output byte-for-byte unchanged"
    requirement: CNT-02
    verification:
      - kind: unit
        ref: "tests/legal.test.ts#data-deletion EN-fallback + verbatim spot-checks"
        status: pass
---

# Phase 71 / Plan 08: Legal Pages Content Externalization — Summary

## Performance

3 tasks, 3 implementation commits (one per legal page) + merge. ~1107 insertions / 645 deletions across 7 files.

> **Note:** The executor completed all three legal-page conversions and committed them, but its process was interrupted before it wrote this SUMMARY.md. The three feature commits were verified sound (full suite + `tests/legal.test.ts` green, byte-parity spot-checks passing) and merged; this SUMMARY was authored by the orchestrator post-merge to close out the plan.

## Accomplishments

- Externalized the long clause-by-clause bodies of the three legal pages — **privacy**, **terms**, **data-deletion** — from hardcoded JSX literals into `content/pages/en/<page>.json`, served through the `getPageContent` loader built in 71-01.
- Preserved byte-for-byte English output, including the legal-entity line (chelautotrans s.r.o., IČO, Spojovací 685 address) transcribed verbatim.
- Each page kept its existing bespoke JSX and received its own narrow content type (Pitfall 4 / D-04 — no shared renderer).
- Added `tests/legal.test.ts` (6 tests): EN-fallback across all 7 configured locales + verbatim spot-checks of representative clauses (incl. the legal-entity line) for each page.

## Task Commits

- `42185e5` feat(71-08): externalize privacy page to content model
- `70cacec` feat(71-08): externalize terms page to content model
- `d73ceac` feat(71-08): externalize data-deletion page to content model
- `b2d34ae` chore: merge executor worktree (71-08 legal pages)

## Files Created/Modified

- Created: `content/pages/en/{privacy,terms,data-deletion}.json`, `tests/legal.test.ts`
- Modified: `app/[locale]/{privacy,terms,data-deletion}/page.tsx`

## Decisions Made

- Legal-entity constants transcribed verbatim into JSON (no reformatting) to guarantee byte-identical rendered output.
- Narrow per-page content types; no universal `PageContent` interface (Pitfall 4).

## Deviations from Plan

- SUMMARY.md authored by the orchestrator after merge (executor interrupted before writing it). Implementation itself matches the plan with no deviations.

## Issues Encountered

- Executor process was stopped mid-run after all three conversions were committed. Work recovered without loss: branch merged after verifying the full suite (117 files / 1337 tests) and `tests/legal.test.ts` (6/6) green.

## Next Phase Readiness

CNT-02 is now complete — all non-route marketing/service/legal page bodies are served from the locale-aware content model. Only **71-09 (blog per-locale, CNT-03)** remains before phase verification.
