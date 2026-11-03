---
phase: 87-status-service-driver-step-flow
plan: 19
subsystem: driver-trip-help-chat
tags: [chatwoot, csp, driver, gap-closure, security]
requires:
  - phase: 87-16
    provides: TripScreen/NavigateChooser baseline the help dialog change builds on
  - phase: 87-17
    provides: lib/driver-help-contract.ts (config validation, sessionStorage handoff, openDriverHelpPage)
  - phase: 87-18
    provides: POST /api/driver/trip/[token]/help (called over HTTP only, fetch mocked in tests)
provides:
  - openDriverHelpChat next to the unchanged openChatWidget
  - tokenless noindex page /driver/trip/help with DriverHelpChat client
  - Help dialog with Chat with the office primary and the call link as fallback
  - path-scoped CSP (buildCspDriverHelp) for the exact path /driver/trip/help
  - UI-SPEC Amendment B
affects: [87-20 live phone check]
tech-stack:
  added: []
  patterns:
    - "performOpenWith(spec): one shared open sequence for the public launcher and the driver help chat"
    - "Identity handed to a tokenless page through same-tab sessionStorage plus a full page load"
key-files:
  created:
    - app/(internal)/driver/trip/help/page.tsx
    - app/(internal)/driver/trip/help/DriverHelpChat.tsx
    - tests/driver-help-chat.test.tsx
  modified:
    - components/chat/load-chat-widget.ts
    - app/(internal)/driver/trip/[token]/ConfirmStepDialog.tsx
    - app/(internal)/driver/trip/[token]/TripScreen.tsx
    - middleware.ts
    - tests/driver-trip-screen.test.tsx
    - tests/middleware-i18n.test.ts
    - .planning/phases/87-status-service-driver-step-flow/87-UI-SPEC.md
key-decisions:
  - "The Chatwoot widget runs only on /driver/trip/help, reached by a hard navigation, so the trip token never reaches Chatwoot through the SDK's current-page URL"
  - "Driver conversation attributes are exactly { chat_role, driver_trip_ref }; no contact attributes, no visit context, no referrer"
  - "buildCspDriverHelp is a full literal copy of buildCsp with the chat origin added, so each chat-host directive stays a lone string literal (isolation guard exemption)"
status: complete
duration: ~35 min
completed: 2026-11-03
commits: 3
plan_head_before: af012c8f84eecc11862c37efcf1ac15eee8cde45
plan_head_after: a4a56b6b685f0d1d7060cfb1f55ebf4b290d1615
actuals:
  tokens: 21000
  tasks: 3
  commits: 3
---

# Phase 87 Plan 19: Help opens an identified Chatwoot chat on a tokenless driver page Summary

Help on the trip screen now offers "Chat with the office": the trip page fetches the driver identity, stores it in sessionStorage, performs a full page load to `/driver/trip/help`, and there the Chatwoot widget opens identified as the driver with `{ chat_role: 'driver', driver_trip_ref }`; the call option stays as the fallback in every state.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | Help -> Chat with the office -> tokenless help page -> identified widget | 4b85a630 |
| 2 | Path-scoped CSP lets the widget load on /driver/trip/help only | 0aa2b9bd |
| 3 | Failure and fallback states, source gates, UI-SPEC amendment B | a4a56b6b |

## What was built

- `components/chat/load-chat-widget.ts`: `performOpen` became `performOpenWith(spec)`; `openChatWidget` keeps its exact call order (visit context, identity fetch, setUser, setLocale, setCustomAttributes with site_locale, conversation attributes, on-message re-send, toggle). `openDriverHelpChat({ config, texts })` shares `inFlight`, `configuredIdentifier`, `sdkReady`, `awaitReady`, `loadAndRun` (origin guard before sdk.js, CSP fail-fast), uses no fetch, locale en, no contact attributes. `tests/chat-launcher.test.tsx` and `tests/chat-widget-origin-guard.test.ts` pass unmodified.
- `/driver/trip/help` (`page.tsx` noindex, `DriverHelpChat.tsx`): first render never touches sessionStorage; an effect loads the stored config and the loader through the single dynamic import; states checking / missing / opening / open / error with retry and re-open; "Back to trip" only when `history.length > 1`; call link always present.
- `ConfirmStepDialog` help mode: optional `chat` prop; accent "Chat with the office" (Opening chat… / Try chat again), `role=alert` error line, neutral outline "Call the office" with the number, Close.
- `TripScreen`: POST to `driverHelpConfigPath(token)` with a 10 s abort, `saveDriverHelpConfig` then `openDriverHelpPage()` (never the router); disabled / 429 / network / timeout / invalid config go to the error state; 400 `invalid_token` closes the dialog and `router.refresh()`; dialog dismissal blocked while opening; a `pageshow` (bfcache) reset so Back to trip cannot leave the button stuck on "Opening chat…".
- `middleware.ts`: `DRIVER_HELP_PATH` and `buildCspDriverHelp(nonce)`, chosen only on the exact raw path; matcher, CSRF lists and all other CSPs untouched.
- UI-SPEC Amendment B appended; the old Help sentence and Copywriting row are marked superseded, not deleted.

## Verification

- `npx vitest run tests/driver-help-chat.test.tsx tests/driver-trip-screen.test.tsx tests/chat-launcher.test.tsx tests/chat-widget-origin-guard.test.ts tests/admin-no-hardcoded-colors.test.ts tests/driver-help-contract.test.ts` green (227 tests in the final run of the five-file set).
- `npx vitest run tests/middleware-i18n.test.ts tests/infra-vps-isolation-guard.test.ts tests/middleware-embed.test.ts tests/middleware-csrf-forms.test.ts tests/middleware-matcher.test.ts` green (130 tests).
- Scoped `tsc` and `eslint --quiet` clean for all changed files.
- No change to `messages/*`, `tests/chat-launcher.test.tsx`, `tests/chat-widget-origin-guard.test.ts`, `tests/middleware-matcher.test.ts` (verified with `git log --grep='87-19'`).
- Not verified here: the live chat in a real phone browser (message arrives in Chatwoot, "initiated from" shows no token, in-app browsers). That is the 87-20 human check.

## Deviations from Plan

- **Test-first ordering was not strictly followed.** I wrote the implementation and tests in the same pass for Tasks 1 and 2 and did not run a red phase first; the Task 2 CSP tests were written after `middleware.ts` was edited. The tests were checked to assert the specified behaviors and all pass, but a red run is not on record.
- **Task 3 state tests landed in Task 1's commit.** The `DriverHelpChat` state/fallback/source-gate tests in `tests/driver-help-chat.test.tsx` were written together with the component in the Task 1 commit (the component implements all states from the start). Task 3's commit holds the TripScreen failure-state tests, the UI-SPEC amendment and the loader comment.
- **[Rule 2 - robustness] bfcache reset in TripScreen.** Not in the plan: a `pageshow` listener resets the help chat state when the page is restored from the back/forward cache, otherwise "Back to trip" could return to a dialog stuck on "Opening chat…".
- **[Rule 1 - test fix]** The first run of the "Back to trip is absent" test timed out because the preceding test ended with an open still in flight (shared module-level `inFlight`); the preceding test now waits for "Open chat". Test-only change.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-87-61..65). The only new trust-boundary surface is the exact-path CSP, covered by T-87-62 and its parity test.

## Self-Check: PASSED

- Files exist: help/page.tsx, help/DriverHelpChat.tsx, tests/driver-help-chat.test.tsx, 87-19-SUMMARY.md
- Commits exist: 4b85a630, 0aa2b9bd, a4a56b6b
