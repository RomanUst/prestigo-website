---
phase: 84-chatwoot-dashboard-app
plan: 02
subsystem: auth
tags: [chatwoot, dashboard-app, operator-auth, zod, vitest, security]
status: complete
requires: []
provides:
  - "lib/chatwoot-operator.ts: verifyOperator, loadPanelChatwootConfig, panelChatwootOrigin, PanelChatwootError, PANEL_CHATWOOT_AUTH_HEADER, isPlausibleOperatorToken, resetOperatorCacheForTests, OperatorVerification, OperatorContact"
  - "VPS isolation guard: operator-only allowlist category, embed CSP directive names"
affects: [84-04, 84-05]
tech-stack:
  added: []
  patterns:
    - "panel-only Chatwoot client with its own request core (no import of lib/chatwoot-client.ts)"
    - "sha256-keyed positive-only in-memory auth cache with bounded size and TTL"
key-files:
  created:
    - lib/chatwoot-operator.ts
    - tests/chatwoot-operator.test.ts
  modified:
    - tests/infra-vps-isolation-guard.test.ts
key-decisions:
  - "Operator identity is proven by Chatwoot itself: GET /api/v1/profile (account membership) then GET the conversation, both with the operator's own token; the conversation call is never cached"
  - "Profile cache holds only sha256(token) -> agentId, positive results, 5 min TTL, 500 entries; a cached profile plus conversation 401/403 evicts and re-checks the profile once"
  - "Over-long contact email/phone are truncated to 254/32 characters (spec: capped), not nulled"
  - "An invalid conversation id (not a safe integer 1..2^31-1) returns not_found with no network call"
requirements-completed: [PANEL-02]
duration: 25min
completed: 2026-10-29
commits: 2
plan_head_before: 0987055cdc1dcad8f3942f1ce4f33d2014bb4890
plan_head_after: 6405746fd70af6afcaeae9b4b68b928d2c20bdc8
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
---

# Phase 84 Plan 02: Chatwoot operator verification Summary

Operator-token verification against Chatwoot's own profile and conversation endpoints (lib/chatwoot-operator.ts), returning only the contact keys the booking lookup needs, with a hashed positive profile cache and immediate revocation.

## What was built

- **lib/chatwoot-operator.ts** (server only; imports node:crypto, zod, `@/lib/env`). Reads only `CHATWOOT_BASE_URL` (https-only) and `CHATWOOT_ACCOUNT_ID` (digits); the site API token is never read. All calls are GET, `redirect: 'error'`, 4000 ms timeout (setTimeout raced explicitly so it also works under fake timers), hyphenated `api-access-token` header. Errors carry `METHOD path -> status` only; no console output anywhere.
- **verifyOperator** flow: token shape gate (1..128 printable ASCII) -> conversation id gate -> config -> (cached or fresh) profile with account membership -> uncached conversation GET -> zod-validated mapping to `OperatorContact` (id, trimmed email/phone, `hmac_verified === true`). Outcome mapping follows the plan table (invalid_token / no_access / not_found / unavailable / not_configured).
- **Cache (D-02)**: module Map sha256 hex -> `{ agentId, expiresAt }`, positive only, TTL 300000 ms via `deps.now`, insertion-order eviction at 500. Conversation 401/403 with a cached profile deletes the entry and runs one uncached profile check: 401 -> invalid_token, 200 -> no_access.
- **tests/chatwoot-operator.test.ts**: 36 tests with a local fetch stub (happy path, header/method/redirect assertions, deep key + value leak scan, config loader with readEnv name spy, token and id gates, cache TTL/eviction/hex keys, no negative caching, revocation re-check, full failure matrix, fake-timer timeout, token-leak scan).
- **tests/infra-vps-isolation-guard.test.ts**: allowlist entry for `lib/chatwoot-operator.ts` under a documented second category (operator-only request path), header comment extended, `frame-ancestors`, `base-uri`, `object-src` added to `CSP_DIRECTIVE_NAMES`, one new fixture test (single-directive frame-ancestors line exempt in middleware.ts, same text in a fetch call is not).

## Commits

- `3570bedf` security(84-02): operator-token verification against Chatwoot profile + conversation (tracer)
- `6405746f` security(84-02): hashed positive profile cache + revocation re-check (D-01, D-02)

(`commits: 2` is measured from the ledger at SUMMARY write time and excludes this SUMMARY's own commit.)

## Verification

- `npx vitest run tests/chatwoot-operator.test.ts tests/infra-vps-isolation-guard.test.ts`: 2 files, 61 tests pass (in the worktree via the symlinked node_modules).
- `npx tsc --noEmit`: no errors mentioning chatwoot-operator. `npx eslint --quiet` on both new files: clean.
- Acceptance greps: `CHATWOOT_API_TOKEN` 0, import of chatwoot-client 0, non-GET methods 0, `'api-access-token'` 1, `createHash('sha256')` 1, console calls 0.
- The full `verify` skill was not run as a separate step; its tsc, eslint and test components were run on the changed files. The pre-commit hook ran on both commits (no `--no-verify`).

## Deviations from Plan

### Auto-added

**1. [Rule 2 - Test seam] Added `operatorCacheKeysForTests()` export**
- **Found during:** Task 2
- **Issue:** The behavior spec requires asserting that cache keys are 64-char lowercase hex and never equal the token, which needs read access to the module-private Map. The contract's export list had no way to do that.
- **Fix:** Exported `operatorCacheKeysForTests(): string[]` next to `resetOperatorCacheForTests`. Returns only hashed keys, never tokens.
- **Files modified:** lib/chatwoot-operator.ts, tests/chatwoot-operator.test.ts
- **Commit:** 6405746f

Otherwise: plan executed as written. The plan did not specify the outcome for an invalid conversation id; `not_found` with zero network calls was chosen.

## Known Stubs

None.

## Threat Flags

None. The only new surface is the server-to-Chatwoot GET client described in the plan's threat model (T-84-06..T-84-10 mitigations are covered by tests).

## Notes for the orchestrator

- Tests ran green through the node_modules symlink in the worktree; nothing imports next-intl server modules here. Re-running on the main checkout is still advisable.
- Any future importer of `lib/chatwoot-operator.ts` (plan 84-04's API route) will itself trip the VPS isolation guard and must be allowlisted in that plan with the same operator-only reason.

## Self-Check: PASSED

- lib/chatwoot-operator.ts, tests/chatwoot-operator.test.ts: present.
- Commits 3570bedf and 6405746f: present on the worktree branch.
