---
phase: 75-e2e-verification-launch
plan: 21
subsystem: testing
tags: [seo, gsc, search-console, i18n, launch, metricool]

requires:
  - phase: 75-e2e-verification-launch
    provides: "scripts/qa/jsonld_audit.py (plan 75-01), the fix plans that closed pre-fix i18n gaps, plan 75-18's draft-capable Metricool client, plan 75-20's production QA baseline"
provides:
  - "scripts/qa/gsc_indexing_baseline.py: reusable read-only GSC per-locale indexing baseline script (exit 3 auth gate, never prints token contents)"
  - "75-LAUNCH.md: per-locale GSC indexing baseline (42 URLs), 10-URL Request-Indexing list, 5-URL Rich Results sample + jsonld_audit.py result, compliant IG/FB announcement copy, verified visual, milestone-close handoff — Tasks 2/3 sections left as explicit PENDING placeholders for the orchestrator/user to fill in"
affects: [75-milestone-close]

actuals:
  tokens: 5090
  tasks: 1
  commits: 1

tech-stack:
  added: []
  patterns:
    - "gsc_indexing_baseline.py follows the gsc_now.py/gsc_request_indexing.py OAuth Credentials(...) pattern but adds an explicit creds.refresh(GoogleAuthRequest()) call up front so an invalid_grant/expired token is caught before any inspect() call and mapped to a documented exit code (3) with a re-auth instruction, rather than surfacing as a raw traceback mid-run"
    - "Defensive top-level key lookup (resp.get('urlInspectionResult') or resp.get('inspectionResult')) guards against a client/version key-name mismatch silently producing all-unknown results"

key-files:
  created:
    - scripts/qa/gsc_indexing_baseline.py
  modified:
    - .planning/phases/75-e2e-verification-launch/75-LAUNCH.md

key-decisions:
  - "Task 1 only, per explicit scope: Tasks 2 (Metricool drafts, MCP-only) and 3 (user GSC web-UI steps) are checkpoint:human-action tasks this executor cannot perform (no MCP access; read-only GSC token cannot submit sitemaps or request indexing per 75-RESEARCH.md Pitfall 7) — both are left as clearly marked PENDING sections in 75-LAUNCH.md for the orchestrator/user to complete and append results to."
  - "Chose public/hero-fleet.webp (the /fleet page hero/OG image) as the announcement visual: verified with the Read tool to show the current V-Class/S-Class/E-Class fleet with standard front-hinged doors and the V-Class's real production roofline, and with zero people in frame — eliminating any gloves/cap risk entirely rather than needing to inspect a chauffeur's hands."
  - "Ran jsonld_audit.py (an existing script) rather than writing a new bespoke Rich-Results-sample script — its fixed PAGES list already covers all 5 sampled (locale, page) pairs in the plan's Rich Results sample, so reusing it satisfies 'run jsonld_audit.py for these first and note its result' without duplicating logic."
  - "Did not update STATE.md, ROADMAP.md, or REQUIREMENTS.md, and did not mark VER-01 complete — per explicit instruction, since Tasks 2-3 (part of this same plan) are still open and D-14/VER-01 is not yet fully satisfied."

requirements-completed: []

coverage:
  - id: D1
    description: "GSC per-locale indexing baseline recorded (7 locales x 6 pages, 42 URLs) via a new read-only script with a documented auth-gate exit code"
    requirement: "VER-01"
    verification:
      - kind: e2e
        ref: "python3 scripts/qa/gsc_indexing_baseline.py (exit 0, 42/42 URLs inspected, 24/42 indexed; re-run for the plan's own <verify> command also exited 0, 25/42 indexed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Rich Results sample pre-check via jsonld_audit.py + Request-Indexing/Rich-Results lists + compliant announcement copy + verified visual, all recorded in 75-LAUNCH.md"
    requirement: "VER-01"
    verification:
      - kind: e2e
        ref: "python3 scripts/qa/jsonld_audit.py https://rideprestigo.com --locales ru,es,ar,hi,zh (exit 0, 60 blocks, 0 findings)"
        status: pass
      - kind: other
        ref: "plan's own <verify> shell command (script exit 0-or-3 check, grep for Request-Indexing/Rich Results/Instagram/Facebook, awk-scoped grep for forbidden price/Uber terms in ## Announcement copy) run against 75-LAUNCH.md"
        status: pass
    human_judgment: false
  - id: D3
    description: "Metricool Instagram + Facebook announcement drafts created (draft=true, distinct best-time slots)"
    verification: []
    human_judgment: true
    rationale: "Task 2 is a checkpoint:human-action performed by the orchestrator via the Metricool MCP — executor subagents have no MCP access. PENDING as of this SUMMARY; the copy and image URL are ready in 75-LAUNCH.md's '## Announcement copy' and 'Chosen visual' sections."
  - id: D4
    description: "Sitemap resubmitted, indexing requested for 10 URLs, Rich Results Test run on 5 sampled URLs"
    verification: []
    human_judgment: true
    rationale: "Task 3 is a checkpoint:human-action performed by the user via the GSC web UI — the existing OAuth token is webmasters.readonly and cannot submit sitemaps or request indexing (75-RESEARCH.md Pitfall 7). PENDING as of this SUMMARY; the exact 10-URL and 5-URL lists are ready in 75-LAUNCH.md."

duration: ~25min
completed: 2026-09-27
status: complete
---

# Phase 75 Plan 21: GSC Indexing Baseline + Launch Brief (Task 1 only) Summary

**Built and ran a new read-only GSC per-locale indexing baseline script (42 URLs, exit-0/exit-3 contract) and wrote the full D-14 launch brief — baseline table, Request-Indexing/Rich-Results lists, compliant 7-language announcement copy, and a verified fleet photo — leaving Tasks 2 (Metricool drafts) and 3 (GSC web-UI steps) explicitly PENDING for the orchestrator/user.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 1 of 3 (Tasks 2 and 3 are `checkpoint:human-action` steps outside this executor's scope — see below)
- **Files modified:** 2 (`scripts/qa/gsc_indexing_baseline.py` created, `75-LAUNCH.md` created)
- **Commits:** 1

## Accomplishments

- **Task 1 (tracer, done):** Wrote `scripts/qa/gsc_indexing_baseline.py` following the existing `gsc_now.py`/`gsc_request_indexing.py` OAuth pattern (`Credentials(...)` from the existing `~/.config/google-ads/gsc_token.json`, `webmasters.readonly` scope), but added an explicit `creds.refresh(GoogleAuthRequest())` call before any API call so an expired/invalid token is caught immediately and mapped to a documented `exit 3` with a re-auth instruction — never a raw traceback, never printed token contents. Ran it twice against production: first run exit 0, 42/42 URLs inspected, 24/42 indexed; the plan's own `<verify>` command re-ran it, again exit 0, 25/42 indexed (the one-URL delta between runs, `en/fleet` newly indexed, reflects real-time Google crawl state 8 minutes apart — expected, not a bug).
- Wrote `75-LAUNCH.md`: the full per-locale baseline table (grouped by locale, with per-locale indexed counts, e.g. `en: 5/6`, `zh: 1/6`), the 10-URL Request-Indexing list (6 non-EN homepages + `/ru/book`, `/ar/book`, `/es/fleet`, `/zh/routes`, cross-checked against the baseline), and the 5-URL Rich Results sample (`/ru/routes/prague-vienna`, `/ar/faq`, `/es/fleet`, `/zh/routes`, `/hi/services/airport-transfer`) with a placeholder results table for Task 3.
- Ran the existing `scripts/qa/jsonld_audit.py --locales ru,es,ar,hi,zh` ahead of the manual Rich Results Test — its fixed 7-page list already covers every one of the 5 sampled (locale, page) pairs — exit 0, 60 blocks checked, 0 findings, so the structured data behind the 5 sample URLs is clean going into Task 3's manual test.
- Wrote the "## Announcement copy" section: English Instagram + Facebook captions naming all 7 languages by endonym (English, Русский, Español, Français, العربية, हिन्दी, 中文), opening with the traveller's pain (booking a chauffeur abroad in a language you don't read) and its fix (book/read/pay in your own language, same door-to-door chauffeur, fixed quote at rideprestigo.com), with zero price/currency mentions and zero ride-hailing comparisons — verified by the plan's own `awk`-scoped grep (only greps inside that one section, not the whole file).
- Chose and verified the announcement visual: `public/hero-fleet.webp` (already served as the `/fleet` page hero and its OG image) — opened with the Read tool and confirmed the current V-Class/S-Class/E-Class fleet, standard front-hinged doors, the V-Class's real production roofline (no Maybach-style raised roof), and zero people in frame (eliminates any gloves/cap check entirely).
- Wrote the milestone-close handoff at the end of `75-LAUNCH.md` (`/gsd-verify-work 75` → `/gsd-audit-milestone` → `/gsd-complete-milestone v3.0`), explicitly noting these are workflow-level commands that run after Tasks 2-3 resolve, not inside this plan.

## Task Commits

1. **Task 1: Tracer — GSC indexing baseline script run end-to-end + launch brief** - `ae680d2a` (feat)

_Tasks 2 (Metricool MCP drafts) and 3 (user GSC web-UI steps) are `checkpoint:human-action` steps performed by the orchestrator/user after this executor returns — no executor commit for either._

## Files Created/Modified

- `scripts/qa/gsc_indexing_baseline.py` — new read-only GSC indexing baseline script; 42-URL sweep (7 locales x 6 pages), exit 0/3 contract, never prints token data
- `.planning/phases/75-e2e-verification-launch/75-LAUNCH.md` — new launch brief: baseline table, Request-Indexing list, Rich Results sample + jsonld_audit result, announcement copy, verified visual, Task 2/3 PENDING sections, milestone-close handoff

## Decisions Made

- Left Tasks 2 and 3 as explicit PENDING sections in `75-LAUNCH.md` (with the exact instructions each needs) rather than attempting any workaround — Task 2 needs the Metricool MCP (unavailable to executor subagents) and Task 3 needs write-scope GSC access this token does not have (75-RESEARCH.md Pitfall 7).
- Reused the existing `jsonld_audit.py` script for the Rich Results pre-check instead of writing a new bespoke one, since its fixed page list already covers all 5 sampled (locale, page) pairs.
- Selected `hero-fleet.webp` specifically because it has no people in frame at all, sidestepping the gloves/cap verification entirely while still satisfying the current-fleet/standard-doors/real-V-Class-body checks.
- Did not touch STATE.md/ROADMAP.md/REQUIREMENTS.md and did not mark VER-01 complete, per this plan's explicit scope (only Task 1, with Tasks 2-3 still open in the same plan).

## Deviations from Plan

None — plan executed exactly as written for Task 1. No auto-fixes were needed; the token was valid, the script ran cleanly, and the announcement copy passed the plan's own forbidden-term check on the first draft.

## Known Stubs

None. This plan produced a QA script and a documentation/launch-brief artifact only; no application code stubs were introduced. The "Task 2/3 PENDING" placeholder sections in `75-LAUNCH.md` are intentional handoff markers, not stubs — they are explicitly scoped to the orchestrator/user in this plan's own task definitions (`checkpoint:human-action`), not deferred work this plan should have completed.

## Issues Encountered

- The GSC `urlInspection().index().inspect()` call is throttled to roughly 1 request/second in practice; each 42-URL run took ~5-6 minutes wall-clock (well past the 3-minute default Bash foreground timeout) and had to run detached in the background, polled to completion. No functional issue — same pattern noted in `75-20-SUMMARY.md`'s "Issues Encountered" for other long-running QA scripts.

## User Setup Required

None from this task. Tasks 2 and 3 of this same plan require the orchestrator (Metricool MCP access) and the user (GSC web UI), respectively — see the "Task 2 — Metricool drafts (PENDING)" and "Task 3 — Sitemap resubmit, Request Indexing, Rich Results Test (PENDING)" sections in `75-LAUNCH.md` for the exact next steps.

## Next Phase Readiness

- Task 1 is complete: the baseline is recorded, the two lists (Request-Indexing, Rich Results sample) are ready, the announcement copy and visual are compliant and verified.
- **Task 2 is PENDING** — the orchestrator must create the Instagram and Facebook Metricool drafts (MCP: `getBestTimeToPostByNetwork`, `getScheduledPosts`, `createScheduledPost` with `info.draft = true`, then re-verify via `getScheduledPosts`) using the copy/image in `75-LAUNCH.md`, and append the post IDs/slots/draft confirmation there.
- **Task 3 is PENDING** — the user must resubmit the sitemap, request indexing for the 10 listed URLs, and run the Rich Results Test on the 5 sampled URLs via the GSC/Rich-Results web UIs, then report back so the results can be recorded in `75-LAUNCH.md` and `75-QA-RESULTS.md`.
- Once Tasks 2 and 3 are recorded, the milestone-close handoff at the bottom of `75-LAUNCH.md` applies: `/gsd-verify-work 75` → `/gsd-audit-milestone` → `/gsd-complete-milestone v3.0`. VER-01 remains `Pending` in `REQUIREMENTS.md` until then — this SUMMARY intentionally does not mark it complete.

## Self-Check: PASSED

- `[ -f scripts/qa/gsc_indexing_baseline.py ]` → FOUND
- `[ -f .planning/phases/75-e2e-verification-launch/75-LAUNCH.md ]` → FOUND
- `git log --oneline --all | grep ae680d2a` → FOUND (`ae680d2a feat(75-21): add gsc_indexing_baseline.py and D-14 launch brief`)
- Task 1 acceptance criteria re-checked: script exit 0 with 42 recorded URLs (confirmed twice); `75-LAUNCH.md` contains the baseline table, the 10-URL Request-Indexing list, the 5-URL Rich Results sample, IG+FB copy, and the verified image URL (all present, greps in the plan's own `<verify>` command passed); the `## Announcement copy` section contains no currency amount and no ride-hailing brand (confirmed via the plan's exact `awk`-scoped grep, `NO_FORBIDDEN_PASS`).

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-27*

## Tasks 2–3 (orchestrator/user). Resolved 2026-09-27
- Task 2 (Metricool drafts): SKIPPED by user decision ("Без анонса"). No posts were created.
- Task 3 (GSC sitemap / Request Indexing / Rich Results): DONE by the user ("все ок"). Recorded in 75-LAUNCH.md and 75-QA-RESULTS.md.
