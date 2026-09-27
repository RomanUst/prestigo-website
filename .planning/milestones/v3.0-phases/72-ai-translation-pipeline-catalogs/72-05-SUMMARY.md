---
phase: 72-ai-translation-pipeline-catalogs
plan: 05
status: complete
requirements: [TR-02]
completed: 2026-09-17
---

# 72-05 SUMMARY — First full pipeline run (ru/es/fr catalogs + content)

## Outcome

Executed the translation pipeline end-to-end for the first time, producing complete
**ru/es/fr** catalogs + content. TR-02 satisfied for ru/es/fr. EN byte-for-byte unchanged;
ar/hi/zh remain EN placeholders (Phase 73 scope).

Commit: `13756b9` — feat(72-05): generate complete ru/es/fr catalogs + content.

## Tasks

| Task | Type | Result |
|------|------|--------|
| 1 | checkpoint:human-action | Run executed. Owner provisioned credits; run completed via `scripts/i18n-translate.mjs`. |
| 2 | auto (verification) | Completeness + EN-unchanged asserted on the real corpus (see below). |
| 3 | checkpoint:human-verify (D-09) | Owner native-RU spot-check **approved**. |

## What was generated

- `messages/{ru,es,fr}.json` — complete UI catalogs, **0 missing / 0 extra keys** vs `messages/en.json` (incl. the 22 previously-drifted `RoutePage.*` keys, backfilled).
- `content/routes/{ru,es,fr}/` — 30 route files each.
- `content/pages/{ru,es,fr}/` — 17 page files each (incl. services/).
- `content/blog/{ru,es,fr}/` — 11 MDX posts each (frontmatter + body translated, MDX structure preserved).
- `i18n/translation-manifest.json` — populated (sha256 change-detection for future runs).
- `i18n/QA-REPORT.md` — recorded QA sampling pass.

## Verification (Task 2)

- `git diff --exit-code` over `messages/en.json` + `content/**/en/**` → **clean** (EN unchanged, SC#4).
- `node scripts/i18n-translate.mjs --check` → **PASSED** (ru/es/fr key-complete vs en.json, 0 missing).
- QA-REPORT: 0 missing / 0 extra per locale; **0 verification failures** (DNT/ICU/plural/MDX-structural).
- Per-surface coverage confirmed non-EN for all three locales (routes 30/30, pages 17/17, blogs 11/11).
- Quality spot-check (RU): formal «Вы» register, standard exonyms («Прага → Зальцбург», «город Моцарта»), premium tone — owner-approved.

### Leakage triage (D-09)

QA-REPORT lists 52 "output == EN" units — all legitimate DNT / structural, kept English by design:
email `info@rideprestigo.com`, domains (`rideprestigo.com/book`, `www.uoou.cz`), phone, founder name
`Roman Ustyugov`, Czech authority name `Úřad pro ochranu osobních údajů`, route arrow labels, and a
few borderline UI headings (`Blog`, `Cookies`, `Questions`) left per glossary. No unresolved no-EN-leakage.

## Deviations from plan

1. **Run executed LOCALLY, not via CI (D-02 path).** The CI `workflow_dispatch` requires the workflow on the
   default branch (`main`); the milestone (workflow + pipeline code) is not on `main` yet, so a local run of
   `scripts/i18n-translate.mjs` (key from `.env.local`) was used instead. Same artifacts; the CI workflow
   (72-04) remains in place for future runs.
2. **Committed to the milestone branch, not merged to `main` via PR.** The plan's Task 3 "merge PR → prod"
   step is **deferred**: the owner chose to hold the production merge until the milestone is ready. The
   translations are committed on `milestone/v3.0-i18n`; `/ru /es /fr` go live in prod only when the milestone
   merges to `main`. Post-merge smoke (/ru translated, / unchanged, /ar English) to be done then.
3. Run was iterative: credit exhausted twice mid-run; the sha256 manifest made each re-run resume and
   translate only not-yet-completed units (backstop truth verified in practice).

## Follow-ups

- Production merge of the milestone → `main` (ships ru/es/fr live) — separate owner decision.
- Optional: translate borderline DNT headings (`Blog`→«Блог», `Questions`→«Вопросы») if desired.
- Phase 73: ar/hi/zh real translations (currently EN placeholders).
