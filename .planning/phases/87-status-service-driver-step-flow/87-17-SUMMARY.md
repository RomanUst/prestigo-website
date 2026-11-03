---
phase: 87-status-service-driver-step-flow
plan: 17
subsystem: chat-crm-bridge
tags: [chatwoot, espocrm, driver-help, gap-closure, security]
requires: []
provides:
  - lib/driver-help-contract.ts (driver chat identifier, help paths, storage key, config validator, storage helpers, hard navigation)
  - hook.chat_intake guard filtered_driver
  - hook.chat_contact guard driver_contact
affects: [87-18, 87-19, 87-20]
tech-stack:
  added: []
  patterns: [namespaced chat identifier, rebuild-from-checked-fields validator]
key-files:
  created:
    - lib/driver-help-contract.ts
    - tests/driver-help-contract.test.ts
  modified:
    - lib/chat-intake.ts
    - lib/chat-contact.ts
    - tests/chat-intake.test.ts
    - tests/chat-contact.test.ts
    - tests/chat-resolve.test.ts
decisions:
  - "Driver case reuses chat_conversations outcome 'filtered' (migration 078 CHECK) with skip code filtered_driver; no migration"
  - "lib/chat-resolve.ts unchanged: it goes through ensureIntake, the new test proves zero CRM writes"
status: complete
commits: 2
plan_head_before: 21dc8556785013ed7fce08dcb82d8d0cec80ae86
plan_head_after: f9e0d7a7525881fbbd3f4979685b403735347f46
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
completed: 2026-11-03
---

# Phase 87 Plan 17: Driver help contract and CRM guard Summary

A Chatwoot contact whose identifier is `driver:<uuid>` can no longer become an EspoCRM Lead, Contact or Note through any of the three chat hooks, and `lib/driver-help-contract.ts` is the one tested, client-safe contract that 87-18 and 87-19 build on.

## What was built

- **Task 1 (tracer)** `110601c8`: `lib/driver-help-contract.ts` with `DRIVER_CHAT_IDENTIFIER_PREFIX`, `driverChatIdentifier`, `isDriverChatIdentifier`. `ensureIntake` in `lib/chat-intake.ts` records outcome `filtered` and returns `{ skipped: 'filtered_driver' }` right after the contact read, before the no-lead label and filter checks. A replay is a no-op (registry outcome `filtered`). Bare-uuid customer identifier still creates a Lead (test).
- **Task 2** `f9e0d7a7`: `contactEntry` in `lib/chat-contact.ts` returns `skipped('driver_contact')` right after the contact read, before the echo check. Resolve path verified by test (no Lead, Note, Contact or identity write). Contract completed: `DRIVER_HELP_PAGE_PATH`, `driverHelpConfigPath`, `DRIVER_HELP_STORAGE_KEY`, `DRIVER_HELP_CONTEXT_KEYS`, config types, `parseDriverHelpConfig`, `saveDriverHelpConfig`, `loadDriverHelpConfig`, `openDriverHelpPage`.

## Verification

- `npx vitest run tests/driver-help-contract.test.ts tests/chat-contact.test.ts tests/chat-resolve.test.ts tests/chat-intake.test.ts tests/infra-vps-isolation-guard.test.ts`: 5 files, 177 tests passed (run in the worktree through the node_modules symlink; no next-intl failures seen).
- Scoped `tsc --noEmit`: no errors in changed files. `eslint --quiet` on all changed files: clean.
- `grep -cE "chat\.rideprestigo|CHATWOOT_|ESPOCRM_" lib/driver-help-contract.ts` = 0 (VPS isolation guard untainted).
- Pre-existing tests in chat-intake, chat-contact and chat-resolve pass unmodified; only new cases were added.

## Deviations from Plan

None in scope. Minor process note: for the Task 1 tracer the implementation and test were written together and the red phase was not observed separately; for Task 2 the chat_contact test was observed failing (`sent` instead of `skipped/driver_contact`) before the guard was added. No `lib/chat-resolve.ts` change was needed.

## Known Stubs

None.

## Threat Flags

None. T-87-53 (driver data into CRM) mitigated by zero-write tests; T-87-55 (malformed sessionStorage config) mitigated by `parseDriverHelpConfig` rebuilding from checked fields; T-87-54 accepted (HMAC identity validation on the inbox).

## Notes for the orchestrator

- The live check (a real driver chat creates no EspoCRM Lead, `chat_conversations.outcome = 'filtered'`) is in 87-20.
- Commit count excludes this SUMMARY commit.

## Self-Check: PASSED

- lib/driver-help-contract.ts, tests/driver-help-contract.test.ts: present
- Commits 110601c8, f9e0d7a7: present
