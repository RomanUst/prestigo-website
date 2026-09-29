---
phase: 78-whatsapp-cloud-api-channel-coexistence
plan: 02
subsystem: infra-security
tags: [secret-custody, pre-commit, whatsapp, meta, isolation-guard, security]
requires: []
provides:
  - "infra/vps/env/whatsapp-meta.env.example: locked META_WA_* credential names (empty values, no PIN)"
  - "pre-commit SECRET_RE blocks the Meta access-token shape (EAA + 40+ alnum)"
  - "secret_gate_probe.sh probes proving block/allow for the new names and the token shape"
  - "tests/infra-vps-isolation-guard.test.ts Phase 78 (D-12) block: site code never uses the WhatsApp Cloud API"
affects: [78-03, 78-09, 78-11, 78-12, 78-13, 78-15]
tech-stack:
  added: []
  patterns:
    - "name gate derived from infra/vps/env/*.env.example (existing) now covers META_WA_SYSTEM_USER_TOKEN and META_WA_APP_SECRET automatically"
    - "secret-shaped probe values assembled at runtime from fragments + /dev/urandom, never literals"
key-files:
  created:
    - infra/vps/env/whatsapp-meta.env.example
  modified:
    - .husky/pre-commit
    - scripts/qa/secret_gate_probe.sh
    - tests/infra-vps-isolation-guard.test.ts
key-decisions:
  - "Token-name probe charset omits the letter E so a random 60-char value can never accidentally form the EAA token shape and trip SECRET_RE before the name gate (would flip the reported needle and make the probe flaky)"
  - "No allowlist for the Phase 78 guard block: an entry would be the exact regression it exists to catch"
requirements-completed: [WA-01]
status: complete
duration: ~10 min
completed: 2026-09-29
commits: 2
plan_head_before: 938a8024af8222d73ee269aac671349d86a3c614
plan_head_after: 7cec6d31
actuals:
  tokens: 2800
  tasks: 2
  commits: 2
---

# Phase 78 Plan 02: WhatsApp credential custody + site isolation guard Summary

WhatsApp Cloud API credentials now have locked names, a pre-commit block (name gate plus the Meta `EAA...` token shape), and a test-proven guarantee that the public site never touches the WhatsApp API, all before any real credential exists.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer) | Credential names -> hook name gate -> probes prove block/allow end to end | 83e3ae0c | infra/vps/env/whatsapp-meta.env.example, scripts/qa/secret_gate_probe.sh |
| 2 | Meta token shape in SECRET_RE + isolation guard forbids WhatsApp API use in site code | 7cec6d31 | .husky/pre-commit, scripts/qa/secret_gate_probe.sh, tests/infra-vps-isolation-guard.test.ts |

## Evidence

Pre-change check (Task 2): `git grep -nE 'EAA[A-Za-z0-9]{40,}'` over the tree found nothing (exit 1), so adding the pattern cannot break existing content. Post-change, `git grep -qE 'EAA[A-Za-z0-9]{40,}' -- . ':!.planning'` also finds nothing (the hook's own pattern text does not self-match).

Probe output lines added by this plan (all from `sh scripts/qa/secret_gate_probe.sh`, exit 0, no "NOT BLOCKED"):

```
PROBE meta-wa-system-user-token: BLOCKED
PROBE meta-wa-app-secret: BLOCKED
PROBE meta-wa-waba-id-identifier: ALLOWED
PROBE meta-wa-empty-example: ALLOWED
PROBE meta-token-shape: BLOCKED
PROBE meta-token-shape-short-allowed: ALLOWED
```

All 17 pre-existing probes still pass. `npx vitest run tests/infra-vps-isolation-guard.test.ts`: 24/24 pass (17 pre-existing + 7 new Phase 78 tests). Acceptance greps: 6 empty META_WA_ names in the example, 0 PIN-named variables, 4 `PROBE meta` lines from Task 1 onward (6 total), `EAA` pattern present once in `.husky/pre-commit`.

Both task commits went through the real husky hook (no `--no-verify`) and passed, including the commit that edited the hook itself.

## Deviations from Plan

None to the plan's behavior. Notes:

- **TDD note (Task 2):** the new guard block asserts an absence (no site code uses the WhatsApp API), which already holds on the current tree, so there was no natural RED state for the real-tree test. The fixture tests prove the regex catches each of the three forms and ignores `META_APP_SECRET` and the Pixel `graph.facebook.com` URL, so a regression would fail loudly. No separate RED commit.
- **Probe hardening (Rule 1, flake prevention):** the META_WA_SYSTEM_USER_TOKEN probe value is generated without the letter `E` (see key-decisions). Not a plan change, only removes a roughly 1-in-15000 flake once the EAA shape lands in SECRET_RE.
- **Plan-head ledger:** the per-plan git-dir ledger file could not be written from inside this worktree (path guard blocks the shared `.git` path), so `commits` was measured against the spawn base 938a8024 supplied in the dispatch prompt: `git rev-list --count 938a8024..HEAD` before this SUMMARY commit = 2.

## Known Stubs

None.

## Threat Flags

None. The plan adds only guards and a placeholder-only example file; no new network endpoint, auth path, or schema.

## Threat model coverage

- T-78-04 (token committed): name gate via new example + EAA shape in SECRET_RE, both probe-proven.
- T-78-05 (app secret pasted): `META_WA_APP_SECRET` blocked by the infra gate (probe); distinct META_WA_ prefix documented against the site's `META_APP_SECRET`.
- T-78-06 (PIN in a repo file): no PIN name exists; the env-example test rejects any PIN-named or non-empty assignment; the example header states the PIN lives only in the password manager.
- T-78-07 (site gains WhatsApp path): Phase 78 guard block, fixture-proven, no allowlist.
- T-78-SC: no package installs.

## Verification for the orchestrator

No node_modules resolution problems occurred in the worktree; vitest ran here directly. Re-running `npx vitest run tests/infra-vps-isolation-guard.test.ts` and `sh scripts/qa/secret_gate_probe.sh` in the main tree after merge is cheap confirmation.

## Self-Check: PASSED

- infra/vps/env/whatsapp-meta.env.example, scripts/qa/secret_gate_probe.sh, .husky/pre-commit, tests/infra-vps-isolation-guard.test.ts exist and are committed.
- Commits 83e3ae0c and 7cec6d31 exist on the worktree branch.
