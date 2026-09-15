---
phase: 72-ai-translation-pipeline-catalogs
plan: 04
subsystem: infra
tags: [github-actions, ci, next-intl, i18n, anthropic]

requires:
  - phase: 72-ai-translation-pipeline-catalogs (72-01/72-02/72-03)
    provides: scripts/i18n-translate.mjs pipeline (catalogs + MDX blog), hash-manifest, QA report generator
provides:
  - ".github/workflows/i18n-translate.yml — repo's first CI workflow, path-filtered + manual trigger, opens a review PR (D-02/D-08)"
  - "ANTHROPIC_API_KEY GitHub Actions repository secret (owner-provisioned)"
  - "i18n/request.ts comment accurately describing post-Phase-72 catalog state (ru/es/fr translated, ar/hi/zh pending Phase 73)"
affects: [72-05-first-live-run, phase-73-non-latin-rtl-infra]

actuals:
  tokens: 1500
  tasks: 3
  commits: 2

tech-stack:
  added: [peter-evans/create-pull-request@v8, actions/checkout@v4]
  patterns:
    - "First GitHub Actions workflow in the repo — path-filtered push trigger + workflow_dispatch"
    - "CI never commits directly to main; always opens/updates a PR for owner review (D-08)"

key-files:
  created:
    - .github/workflows/i18n-translate.yml
  modified:
    - i18n/request.ts

key-decisions:
  - "Workflow triggers on push to main touching messages/en.json or content/{routes,pages,blog}/en/**, plus workflow_dispatch for the manual first full-catalog run"
  - "Least-privilege permissions block: contents:write + pull-requests:write only"
  - "EN-unchanged assertion (git diff --exit-code) runs before the PR step, failing loudly if the pipeline ever mutates EN sources"
  - "ANTHROPIC_API_KEY read only from the repo secret via ${{ secrets.* }}, never echoed into logs, PR diff, or QA report"
  - "Owner confirmed provisioning the ANTHROPIC_API_KEY GitHub Actions repository secret out-of-band (human-only step, no agent access to GitHub secret store)"

patterns-established:
  - "CI-to-PR pipeline pattern: automated job writes translated files + manifest + QA report to a branch, opens/updates a PR via peter-evans/create-pull-request@v8, never pushes to main directly"

requirements-completed: [TR-01]

coverage:
  - id: D1
    description: "Repo's first GitHub Actions workflow (.github/workflows/i18n-translate.yml) with path-filtered push trigger, workflow_dispatch, least-privilege permissions, EN-unchanged assertion, and PR-only landing via peter-evans/create-pull-request@v8"
    requirement: "TR-01"
    verification:
      - kind: other
        ref: "grep assertions: workflow_dispatch, peter-evans/create-pull-request@v8, secrets.ANTHROPIC_API_KEY, exit-code, pull-requests:\\s*write (WORKFLOW_OK)"
        status: pass
    human_judgment: true
    rationale: "Workflow correctness (trigger firing, PR opening, EN-diff assertion actually catching a mutation) can only be confirmed by a live GitHub Actions run — deferred to 72-05 first live run."
  - id: D2
    description: "ANTHROPIC_API_KEY provisioned as a GitHub Actions repository secret"
    verification: []
    human_judgment: true
    rationale: "No agent in this sandbox can read or verify GitHub repository secrets; owner confirmed provisioning directly (checkpoint resolved with 'готово')."
  - id: D3
    description: "i18n/request.ts doc-comment corrected to state ru/es/fr are translated via scripts/i18n-translate.mjs (CI -> PR) and only ar/hi/zh remain EN placeholders until Phase 73"
    requirement: "TR-01"
    verification:
      - kind: other
        ref: "grep assertions: 'ar/hi/zh' present, 'byte-identical EN-copy stub files' absent (COMMENT_OK)"
        status: pass
    human_judgment: false

duration: ~5min (Task 3 continuation session; Task 1 ~55min, Task 2 owner-provisioned overnight)
completed: 2026-09-15
status: complete
---

# Phase 72 Plan 04: CI Workflow Wiring + Secret Provisioning + Comment Fix Summary

**Repo's first GitHub Actions workflow (path-filtered + manual trigger, least-privilege, PR-only landing) wired to the AI translation pipeline, with the API key secret provisioned and the stale i18n/request.ts catalog comment corrected.**

## Performance

- **Task 1 duration:** ~55 min (committed 2026-09-14 22:05:41 +0200)
- **Task 2:** owner-provisioned overnight (human-only, no agent-measurable duration)
- **Task 3 (this continuation session) duration:** ~5 min (committed 2026-09-15 09:23:22 +0200)
- **Tasks:** 3/3 complete
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Authored `.github/workflows/i18n-translate.yml` — the repo's first CI workflow: path-filtered push trigger (`messages/en.json`, `content/{routes,pages,blog}/en/**`) plus `workflow_dispatch` for the manual first full-catalog run, least-privilege `contents:write` + `pull-requests:write` permissions, EN-unchanged `git diff --exit-code` assertion before the PR step, and `peter-evans/create-pull-request@v8` opening/updating a review PR against main (never a direct main commit — D-08)
- Owner confirmed provisioning `ANTHROPIC_API_KEY` as a GitHub Actions repository secret (human-only step; no agent in this sandbox can create repo secrets)
- Corrected the stale `i18n/request.ts` doc-comment: removed the false "byte-identical EN-copy stub files" claim and replaced it with an accurate statement that ru/es/fr are translated by `scripts/i18n-translate.mjs` (CI -> PR) while ar/hi/zh remain EN placeholders until Phase 73

## Task Commits

Each task was committed atomically:

1. **Task 1: Author .github/workflows/i18n-translate.yml** - `a6f1bd0` (feat) — verified `WORKFLOW_OK`
2. **Task 2: Owner provisions ANTHROPIC_API_KEY GitHub Actions secret** - no commit (human-only action; owner confirmed "готово" at the checkpoint)
3. **Task 3: Correct the stale i18n/request.ts comment** - `746b284` (feat) — verified `COMMENT_OK`

**Plan metadata:** (this commit) `docs: complete 72-04 plan`

## Files Created/Modified
- `.github/workflows/i18n-translate.yml` - repo's first CI workflow: path-filtered trigger + manual dispatch, npm ci, runs `scripts/i18n-translate.mjs`, EN-unchanged assertion, opens a review PR via peter-evans/create-pull-request@v8
- `i18n/request.ts` - doc-comment corrected (comment only, no runtime change to `getRequestConfig`)

## Decisions Made
- Workflow permissions scoped to exactly `contents: write` + `pull-requests: write` (least privilege, per T-72-03 mitigation)
- EN-unchanged assertion placed before the PR step so a pipeline bug that mutates EN sources fails the job loudly instead of silently landing in a PR
- No run step prints env or the secret value anywhere in the workflow (T-72-01 mitigation)

## Deviations from Plan

None - plan executed exactly as written across all 3 tasks.

## Issues Encountered

None. Task 2 was a genuine human-only checkpoint (GitHub repository secrets cannot be created or read by any agent in this sandbox) — the owner confirmed provisioning it directly, resolving the checkpoint without further agent action.

## User Setup Required

None remaining. The one required external configuration step (ANTHROPIC_API_KEY repository secret) was completed by the owner during Task 2's checkpoint.

## Next Phase Readiness
- The CI-to-PR pipeline is fully wired: a push touching EN sources (or a manual `workflow_dispatch`) will run `scripts/i18n-translate.mjs` and open a review PR — ready for 72-05's first live run to validate the end-to-end path (trigger fires, PR opens, EN-unchanged assertion holds under real conditions).
- `i18n/request.ts`'s comment now accurately reflects the post-Phase-72 catalog state, removing a stale claim that would have misled future readers/agents in Phase 73.
- Phase 72 (AI Translation Pipeline & Catalogs, TR-01) is now fully executed pending the live-run verification in 72-05.

---
*Phase: 72-ai-translation-pipeline-catalogs*
*Completed: 2026-09-15*

## Self-Check: PASSED

- FOUND: .github/workflows/i18n-translate.yml
- FOUND: i18n/request.ts
- FOUND: .planning/phases/72-ai-translation-pipeline-catalogs/72-04-SUMMARY.md
- FOUND commit: a6f1bd0
- FOUND commit: 746b284
