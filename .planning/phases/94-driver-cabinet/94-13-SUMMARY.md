---
phase: 94-driver-cabinet
plan: 13
subsystem: driver-cabinet-push-ui
tags: [driver-cabinet, web-push, notifications, pwa, ios-home-screen, security]
requires:
  - "94-05: pushConfigured(), vapidPublicKey(), POST/DELETE /api/driver/cabinet/push"
  - "94-08: public/driver/sw.js (scope /driver/), standalone manifest"
  - "94-11: (tabs)/offers/page.tsx"
  - "94-12: (tabs)/you/page.tsx with the Notifications slot"
provides:
  - "lib/driver-cabinet/push-client.ts: PushUiState, PUSH_HINT_DISMISSED_KEY, PUSH_SIGN_IN_URL, pushSupported, isIosSafariOutsideHomeScreen, readPushState, enablePush, disablePush"
  - "components/driver/PushToggle.tsx (New ride offers switch), HomeScreenHint.tsx, OffersNotificationHint.tsx"
  - "#notifications section on /driver/you; one-time hint on /driver/offers"
affects: [94-14]
tech-stack:
  added: []
  patterns:
    - "client push helper imports nothing from the server push module; the page passes only the public VAPID key"
    - "permission requested only inside enablePush(), called from the switch tap; register() is started in the same tick so the prompt keeps its user gesture"
    - "iOS check runs before the support check because iPhone Safari outside the Home Screen exposes no PushManager"
key-files:
  created:
    - lib/driver-cabinet/push-client.ts
    - components/driver/PushToggle.tsx
    - components/driver/HomeScreenHint.tsx
    - components/driver/OffersNotificationHint.tsx
    - tests/driver-cabinet-push-ui.test.tsx
  modified:
    - "app/(internal)/driver/(cabinet)/(tabs)/you/page.tsx"
    - "app/(internal)/driver/(cabinet)/(tabs)/offers/page.tsx"
key-decisions:
  - "A dismissed (neither granted nor denied) permission prompt maps to the 'error' result, so the switch returns to off with 'Could not turn on notifications. Try again.' (the enablePush contract has no separate dismissed outcome)"
  - "Turning off deletes the server row first and only then unsubscribes the browser; if the delete fails the switch stays on with 'Could not turn off notifications. Try again.' so the switch and the stored row never disagree"
  - "If the server does not store a new subscription (401/5xx), the browser subscription is dropped again so the browser and the server agree"
  - "A subscription made with an older VAPID key (InvalidStateError on subscribe) is dropped and re-created once"
status: complete
commits: 2
plan_head_before: 49f16ee48a141c8ab2be67e333fe2b6b712fe638
plan_head_after: 816483205e0ae729ca548eca943afb657633dbe6
actuals:
  tokens: 11000
  tasks: 2
  commits: 2
completed: 2026-11-25
---

# Phase 94 Plan 13: Push opt-in UI (You switch, Home Screen hint, Offers hint) Summary

A driver turns offer notifications on or off with one tap from a "New ride offers" switch in You (iPhone users first get the Add to Home Screen steps), and is invited once from the Offers tab; nothing asks for permission without a tap.

`commits: 2` counts the two task commits and is measured before the docs commit that adds this file.

## What was built

- **Task 1 (commit 97909ba3, `security:`)**: `push-client.ts` with `readPushState` (read-only: ios-install, unsupported, denied, on, off), `enablePush` (register `/driver/sw.js` with `{ scope: '/driver/', updateViaCache: 'none' }`, `Notification.requestPermission`, `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` with the base64url key decoded to bytes, then POST `subscription.toJSON()`; resolves `on` / `denied` / `error` / `unauthorized`) and `disablePush` (DELETE `{ endpoint }`, then unsubscribe). `PushToggle` is a `role="switch"` button (56x32 track, 24px knob, label "New ride offers", helper text per state) with busy (`aria-busy`, spinner knob), denied (disabled, blocked text), error (`role="alert"`), unsupported and ios-install states; 401 goes to `/driver/login?next=%2Fdriver%2Fyou&ended=1`. The switch moves only after the server answered 200. `HomeScreenHint` renders the info card with the three steps and `aria-hidden` Share / SquarePlus icons. The You page renders `<section id="notifications">` between Help and Sign out only when `pushConfigured()` is true, passing `vapidPublicKey()`.
- **Task 2 (commit 81648320, `security:`)**: `OffersNotificationHint` decides after mount (nothing on the server pass) from `isIosSafariOutsideHomeScreen`, `Notification.permission === 'default'`, `readPushState() === 'off'` and the `driver-push-hint-dismissed` localStorage key; shows "Turn on notifications to hear about new rides right away." with "Set up notifications" and "Not now", or on iPhone Safari outside the Home Screen "Add Prestigo to your Home Screen to get notifications." with "Show me how" (same link to `/driver/you#notifications`). "Not now" stores the key and hides the banner. It never calls `requestPermission`. Mounted above the list on the Offers page with `pushEnabled={pushConfigured()}`.

## Verification

- `npx vitest run --exclude '.claude/**' tests/driver-cabinet-push-ui.test.tsx tests/driver-cabinet-you-ui.test.tsx tests/driver-cabinet-offers-ui.test.tsx tests/admin-no-hardcoded-colors.test.ts`: 4 files / 104 tests pass (push-ui: 37 tests). Also green: driver-cabinet-shell, driver-cabinet-pwa, driver-cabinet-push (66 tests).
- `npx tsc --noEmit`: 8 errors, the old baseline in `tests/`; none in this plan's files.
- `npx eslint --quiet` on all changed source and test files: exit 0.
- Acceptance greps: `updateViaCache: 'none'` 1, `role="switch"` 1, `VAPID_PRIVATE_KEY` / server push import in the client files 0, `pushConfigured` in the You page 2, `driver-push-hint-dismissed` in push-client 1, `requestPermission` in the hint 0, `OffersNotificationHint` in the Offers page 2.

## Deviations from Plan

None - plan executed exactly as written. (Tests for both tasks live in one file, as the plan states; the Task 1 commit holds the Task 1 tests and the Task 2 commit extends the file.)

## Known Stubs

None.

## Held-out / owner checks (not provable in CI)

- 200% text zoom on a real phone: the switch row wraps (`flex-wrap`, `overflow-wrap: anywhere`) and the Home Screen hint card has `overflow-x: auto`; the visual zoom check is a backstop item for 94-14.
- Real-device push receipt on Android Chrome and iOS 16.4+ and the iOS Home Screen cookie question (planner assumptions in the plan) are owner checks in 94-14.

## Threat Flags

None. The only new surface is browser-side; the mitigations T-94-59 (client files never import the server push module or name the private key, grep-gated in the test), T-94-61 (register with scope `/driver/` only), T-94-62 (permission only from the switch tap, hint never prompts) are covered by tests.

## Self-Check: PASSED

- FOUND: lib/driver-cabinet/push-client.ts, components/driver/PushToggle.tsx, components/driver/HomeScreenHint.tsx, components/driver/OffersNotificationHint.tsx, tests/driver-cabinet-push-ui.test.tsx
- FOUND commits: 97909ba3, 81648320
