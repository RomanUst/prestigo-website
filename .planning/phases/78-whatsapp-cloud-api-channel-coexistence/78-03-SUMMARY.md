---
phase: 78-whatsapp-cloud-api-channel-coexistence
plan: 03
subsystem: infra
tags: [whatsapp, meta-graph-api, templates-as-code, chatwoot, node]
requires:
  - phase: 77-chatwoot-deployment-core-channels
    provides: "lib/client.mjs conventions (parseEnvFile, redactor, redirect refusal) and sync.mjs subsetEqual/planCollection"
provides:
  - "infra/chatwoot/lib/graph.mjs Meta Graph client (loadMetaConfig, createGraphClient, MetaConfigError, MetaApiError)"
  - "infra/chatwoot/whatsapp-templates.mjs idempotent templates-as-code CLI (--validate, --dry-run, --status, --only, --allow-edit)"
  - "tests/whatsapp-graph.test.ts fake Graph API harness (43 tests)"
affects: [78-08, 78-10, 78-13]
tech-stack:
  added: []
  patterns: ["fake fetchImpl Graph harness", "cursor-only paging on a fixed origin", "GET/POST-only client"]
key-files:
  created:
    - infra/chatwoot/lib/graph.mjs
    - infra/chatwoot/whatsapp-templates.mjs
    - tests/whatsapp-graph.test.ts
  modified: []
key-decisions:
  - "Client refuses any method other than GET/POST and any absolute URL at the API boundary, so no delete path can exist even by mistake"
  - "Non-REJECTED, non-APPROVED/PAUSED statuses (PENDING, IN_APPEAL, DISABLED...) with changed copy stay drift even with --allow-edit (Meta does not allow editing them)"
  - "Lengths measured with String.length; drift compares NFC-normalized, trimmed body/header/buttons only (category excluded)"
  - "Added --dir <path> and --delay-ms <n> options (beyond the plan's list) so the CLI is testable from a spawned process and the mutation delay is configurable"
patterns-established:
  - "Output line format: '<name> <language> <action>' (dry-run: '<name> <language> plan <action>')"
requirements-completed: [WA-02]
status: complete
duration: 25min
completed: 2026-09-29
commits: 2
plan_head_before: 938a8024af8222d73ee269aac671349d86a3c614
plan_head_after: 1365faa3758bb0ee2d7692a4c8c0bb5f030841ee
actuals:
  tokens: 27000
  tasks: 2
  commits: 2
---

# Phase 78 Plan 03: WhatsApp templates as code Summary

**Idempotent, never-destructive Graph API tool that validates, plans, creates, re-submits and reports the 8 x 7 WhatsApp templates from git, with a token-safe Graph client.**

## Accomplishments

- `lib/graph.mjs`: env-then-file config (`META_WA_SYSTEM_USER_TOKEN`, `META_WA_WABA_ID`, optional `META_WA_GRAPH_VERSION`, default v25.0), Bearer header only, redactor (token, `access_token`, `Bearer ...`), `redirect: 'error'`, 30 s timeout, cursor paging (max 50 pages, never follows `paging.next`), GET/POST only.
- `whatsapp-templates.mjs`: `loadTemplates`, `validateTemplate`, `buildCreateBody`, `planTemplates`, `runTemplates`, `parseArgs`; validation of every file runs before any network call; `--validate` needs no token.
- Test harness: 43 tests against an in-memory fake Graph (trap `paging.next` on an evil host, injectable failures, no network).

## Exact output contract

- Per name+language: `<name> <language> <action>` where action is `create | unchanged | resubmit | drift <fields> | edit | exists`; with `--dry-run`: `<name> <language> plan <action>`.
- `summary: create=N unchanged=N resubmit=N drift=N edit=N exists=N`
- `--status`: `status <name> <language> <STATUS> <CATEGORY>` (STATUS `MISSING`, category `-` when the pair is absent remotely), `rejected_reason <name> <language> <reason>` for REJECTED, then `status_summary approved=N pending=N rejected=N paused=N other=N` (MISSING counts as other).
- `--validate`: `valid <name> <language> body_chars=<n>` lines, then `validated=<N>`.
- Exit codes: 0 ok; 1 config/validation/drift/no templates found; 2 API error or rate limit.
- Rate limit: prints partial summary then `rate limit reached - stopping now; rerun later ...` on stderr, exit 2.

## Task Commits

1. Task 1 (tracer): `f908cce9` - Graph client + CLI create path + offline validate (8 tests green; tracer gate re-ran `<verify>` green before expansion)
2. Task 2: `1365faa3` - drift/resubmit/edit/status/dry-run/paging/exists/rate-limit/redaction matrix (43 tests total)

## Deviations from Plan

### Auto-fixed / plan-scope notes

**1. [Rule 3 - Process] TDD RED phase compressed**
- The implementation was written in one pass for both tasks before the Task 2 test matrix, so the Task 2 tests did not go through a separate failing (RED) run; the one failing test seen was a test-arithmetic bug (1030 vs 1025 characters), fixed in the test.
- Task 1's commit therefore already contains the full CLI logic (drift/status/rate-limit code paths) while its tests cover the create path; Task 2's commit adds the matrix tests only.

**2. [Rule 3 - Blocking] node_modules absent in worktree**
- Created an ignored symlink `node_modules` -> main checkout's node_modules to run vitest/eslint/tsc. No packages installed. It is git-ignored and not committed.

**3. Extra CLI options** `--dir <path>` and `--delay-ms <n>` added (the plan required a configurable delay, default 1,500 ms, but named no flag; `--dir` allows testing the real CLI entry).

**4. Sentinel/ledger files** for cwd-drift and plan head could not be created (the sandbox blocks commands that reference the worktree git dir); the commit count was measured against the known base `938a8024...` instead.

Otherwise the plan executed as written.

## Open assumptions (unchanged from the plan, still unverified live)

- A5: rate-limit signals HTTP 429 or error.code 4, 80007, 130429, 613.
- Already-exists signal: HTTP 400 with message matching /already exists/i, or error_subcode 2388024.
- `header` (DOCUMENT) example handle: `buildComponents` emits `header_handle: []` unless the template's header carries an `example` string; header is reserved (null) and 78-10 decides at the D-10 checkpoint.
- PENDING/other-status templates with changed copy stay `drift` even with `--allow-edit`.

## Verification

- `npx vitest run tests/whatsapp-graph.test.ts`: 43 passed (no network).
- `npx eslint --quiet` on the 3 files: clean. `npx tsc --noEmit`: no errors in the new test file.
- `node infra/chatwoot/whatsapp-templates.mjs --validate` with no templates dir: exit 1, "no templates found".
- `grep -c "process.argv" infra/chatwoot/lib/graph.mjs` = 0; no DELETE/PUT/PATCH method strings in either module.
- The tests ran with node_modules symlinked from the main checkout; the orchestrator should re-run the suite in the main tree after merge.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-78-08..11 mitigated and tested; T-78-SC no installs).

## Self-Check: PASSED

- infra/chatwoot/lib/graph.mjs, infra/chatwoot/whatsapp-templates.mjs, tests/whatsapp-graph.test.ts exist.
- Commits f908cce9 and 1365faa3 exist on the worktree branch.
