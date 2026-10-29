---
phase: 84-chatwoot-dashboard-app
plan: 03
subsystem: security
tags: [chatwoot, cve-2025-12245, postmessage, origin-guard, runbook]
requires: []
provides:
  - installWidgetOriginGuard / WIDGET_MESSAGE_PREFIX in components/chat/load-chat-widget.ts
  - infra/vps/runbooks/chatwoot-dashboard-app.md (CVE section, evidence log, re-check recipe)
affects: [84-06 (adds operator sections to the runbook and extends tests/dashboard-app-runbook.test.ts), 84-09 (live widget check, evidence re-run)]
tech-stack:
  added: []
  patterns: [capture-phase window message guard, runbook content-guard test]
key-files:
  created:
    - tests/chat-widget-origin-guard.test.ts
    - infra/vps/runbooks/chatwoot-dashboard-app.md
    - tests/dashboard-app-runbook.test.ts
  modified:
    - components/chat/load-chat-widget.ts
key-decisions:
  - "D-13: CVE-2025-12245 is closed on our side by a capture-phase origin guard installed before the widget SDK; Chatwoot stays pinned at v4.18.0-ce (compose.yml untouched)"
requirements-completed: [PANEL-02]
status: complete
duration: 15min
completed: 2026-10-29
commits: 2
plan_head_before: 0987055cdc1dcad8f3942f1ce4f33d2014bb4890
plan_head_after: 7ced1c115aa84d5b3e06903a6525811d092d1039
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
---

# Phase 84 Plan 03: CVE-2025-12245 gate Summary

Capture-phase message-origin guard in the site's Chatwoot widget loader plus a dated evidence runbook (no upstream fix exists; Chatwoot stays on v4.18.0-ce).

## What was built

- **Task 1 (tracer), commit 589937e4:** `installWidgetOriginGuard(widgetOrigin)` and `WIDGET_MESSAGE_PREFIX` in `components/chat/load-chat-widget.ts`. One `window.addEventListener('message', handler, true)` for the page lifetime; the handler calls `stopImmediatePropagation()` for a string message starting with `chatwoot-widget:` whose `event.origin` is not the trusted origin. `loadAndRun` calls it with `new URL(config.baseUrl).origin` before the re-run branch and before the sdk.js script is created. Repeated calls register no second listener and a later call updates the trusted origin. File still holds no chat host literal or uppercase env name.
- **Task 2, commit 7ced1c11:** `infra/vps/runbooks/chatwoot-dashboard-app.md` with scope (widget SDK `IFrameHelper.js`, not `DashboardApp/Frame.vue`), status, pinned image, compensating control, evidence log and re-check recipe; `tests/dashboard-app-runbook.test.ts` pins the content.

## Tracer gate

Tracer verified end to end (auto mode not required here): the real `openChatWidget` loader path is exercised in jsdom; a foreign-origin `chatwoot-widget:` message never reaches a later (SDK stand-in) listener, own-origin and non-prefixed messages do, and `chat-launcher.test.tsx` / `chat-launcher-i18n.test.ts` stay green unchanged.

## Evidence-log rows recorded (2026-10-29)

| Date | Check | Result |
|---|---|---|
| 2026-10-26 | Research (advisory, OSV, IFrameHelper.js v4.7.0/v4.18.0/v4.19.1/develop) | `vulnerabilities: []`; OSV fixed: none; handler identical |
| 2026-10-29 | `gh api /advisories/GHSA-hgg8-54gw-8v33` | CVE-2025-12245, updated 2025-10-27, `vulns: []` |
| 2026-10-29 | newest release | v4.19.1 |
| 2026-10-29 | repository security-advisories | patched in >= 4.9.0, 4.13.0, 4.11.2, 3.16.0 (all <= pinned v4.18.0) |
| 2026-10-29 | IFrameHelper.js v4.18.0 vs v4.19.1 | byte-identical (344 lines), no origin check |

The recipe was actually run (network available), so no row is a carried-over placeholder.

## Verification

- `npx vitest run tests/chat-widget-origin-guard.test.ts tests/chat-launcher.test.tsx tests/chat-launcher-i18n.test.ts tests/infra-vps-isolation-guard.test.ts tests/dashboard-app-runbook.test.ts`: all pass (493 + 38 tests across the two runs).
- `tsc --noEmit`: no errors in the changed files. `eslint --quiet`: clean. Pre-commit hook passed on both commits.
- Tests were run through the node_modules symlink and passed; no next-intl server-module failures observed.

## Deviations from Plan

- **Test stand-in for the SDK handler:** the plan suggested a `window.onmessage` spy. jsdom does not fire `window.onmessage` for dispatched events, so the tests register a non-capture `addEventListener('message')` listener after the guard instead. In browsers the SDK's `window.onmessage` handler behaves as a non-capture target listener registered after ours, so ordering is equivalent. Not a Rule 1-3 fix, only a test-technique change.
- Acceptance check `grep -c "chatwoot/chatwoot:v4.18.0-ce" infra/vps/chatwoot/compose.yml` prints 3 (the image is referenced by several services), not 1; the pin is intact and compose.yml was not modified.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- FOUND: components/chat/load-chat-widget.ts, tests/chat-widget-origin-guard.test.ts, infra/vps/runbooks/chatwoot-dashboard-app.md, tests/dashboard-app-runbook.test.ts
- FOUND commits: 589937e4, 7ced1c11
