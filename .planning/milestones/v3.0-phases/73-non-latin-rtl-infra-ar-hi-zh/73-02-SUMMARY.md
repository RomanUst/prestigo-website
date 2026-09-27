---
phase: 73-non-latin-rtl-infra-ar-hi-zh
plan: 02
subsystem: i18n
tags: [anthropic-sdk, claude-opus-5, translation-pipeline, ar, hi, zh, mdx, qa-report]

# Dependency graph
requires:
  - phase: 73-non-latin-rtl-infra-ar-hi-zh
    plan: 01
    provides: glossary.locales.ar/hi/zh, PHASE_72_LOCALES=6 locales, --check wiring
  - phase: 72-ai-translation-pipeline-catalogs
    provides: scripts/i18n-translate.mjs pipeline, manifest idempotency, DNT/plural verifiers
provides:
  - messages/{ar,hi,zh}.json — real translations (stale EN placeholders replaced; --check exits 0)
  - content/{routes,pages,blog}/{ar,hi,zh}/** — 30 routes + 11 pages + 11 blog MDX per locale (all created fresh)
  - i18n/translation-manifest.json reset then re-recorded for 6 locales (+ pre-73 backup)
  - i18n/QA-REPORT.md — ar/hi/zh sampling (completeness, no-English-leakage, DNT/ICU/plural, MDX-structure)
affects: [73-06-rtl-gate]

# Actuals (#2632)
actuals:
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Manifest-safe locale backfill: back up + reset translation-manifest.json to empty units BEFORE the run so the locale-blind change-detector selects every unit for the new locales (Pitfall 1)"
    - "Orchestrator-run local generation (assumption A2): the paid Anthropic run was invoked by the orchestrator against .env.local (loadEnvLocal reads the sandbox-restricted file internally), not a subagent and not CI"

key-files:
  created:
    - messages/ar.json, messages/hi.json, messages/zh.json (real translations)
    - content/routes/{ar,hi,zh}/** , content/pages/{ar,hi,zh}/** , content/blog/{ar,hi,zh}/**
    - i18n/translation-manifest.json.pre-73.bak
  modified:
    - i18n/translation-manifest.json (reset → re-recorded 6 locales)
    - i18n/QA-REPORT.md (ar/hi/zh sampling section)

commits:
  - f6f9af5 feat(73-02): generate real ar/hi/zh catalogs + content
  - be1a990 feat(73-02): QA sampling report for ar/hi/zh
---

# 73-02 — Real ar/hi/zh generation

## What was built

Re-ran the locked Phase-72 translation pipeline for the three non-Latin locales after a mandatory manifest reset:

- **Manifest reset (mandatory, Pitfall 1):** backed up `i18n/translation-manifest.json` (2197 units) to `…pre-73.bak`, reset to `{version:1, units:{}}`, then ran `node scripts/i18n-translate.mjs --locales ar,hi,zh`. Without the reset the locale-blind change-detector would skip every unit Phase 72 already processed for ru/es/fr, leaving ar/hi/zh as stale English placeholders.
- **Catalogs:** `messages/{ar,hi,zh}.json` — real Arabic/Hindi/Chinese (e.g. `Nav.items` now `["الخدمات",…]`), stale EN placeholders replaced.
- **Content:** `content/{routes,pages,blog}/{ar,hi,zh}/**` created fresh — 30 route JSONs + 11 page JSONs + 11 blog MDX per locale (33 blog files total).
- **QA report:** `i18n/QA-REPORT.md` records ar/hi/zh completeness / no-English-leakage / DNT / ICU / plural / MDX-structure sampling.

## Verification (all green)

- `node scripts/i18n-translate.mjs --check --locales ar,hi,zh` → **exits 0** (0 missing keys, EN unchanged, no API calls) — TR-02, SC#1.
- `git diff --exit-code` on `messages/en.json` + all `ru/es/fr` catalogs and content → **clean** (D-12, SC#4).
- Arabic script present in `messages/ar.json` Nav namespace → Pitfall-1 warning-sign cleared.
- 33/33 blog MDX bodies carry target-script prose; full content scan → 0 files below 50% localized (no whole-file English fallbacks).
- `npx vitest run tests/i18n-completeness.test.ts` → **20/20 pass**.

## Deferred / known limitations

- **~10 hi heading units EN-fallback (WINDOWS #6, by design T-73-04):** `whyBook.headingLine1` across ~9 route files and `corporate.json::usagePatterns.headingItalic` drop the `Prestigo`/`PRESTIGO` DNT token in Hindi → verifier rejects and falls back to the EN value (never silently shipped broken; `--check` still passes because keys are present). Revisit glossary/verifier so these headings translate around the DNT token.

## Execution note (cost)

The paid generation ran across multiple partial passes because the Anthropic account balance was exhausted mid-run several times; the locale-blind manifest only locks a unit once all requested locales succeed, so interrupted passes re-translated not-yet-locked units. A single uninterrupted run on a funded account is the cheap path. See [[project_phase73_generation_quota_block]] memory.

## Out of scope (flagged, not touched)

- `content/blog/en/prague-to-budapest-private-transfer.mdx` — a new EN blog post created outside this phase appeared during execution (en=12 blogs, ar/hi/zh=11). Not part of 73-02; its i18n coverage is a future translation task.

## Self-Check: PASSED
