---
phase: 94-driver-cabinet
plan: 12
subsystem: driver-cabinet-you
tags: [driver-cabinet, you-tab, profile, stats, help-chat, sign-out, security]
requires:
  - "94-01: DRIVER_SESSION_COOKIE, sha256Hex, isDriverSessionTokenShape, getDriverSession, driverSessionCookieOptions; rate-limit key /api/driver/cabinet/help; CSRF strict Origin on /api/driver/cabinet"
  - "94-02: requireDriver(nextPath)"
  - "94-06: loadDriverRides, pastRideRows"
provides:
  - "lib/driver-cabinet/profile.ts: DriverProfile, DriverStats, getDriverProfile, getDriverStats"
  - "lib/driver-help-inbox.ts: driverHelpWidgetEnv (shared by the trip and cabinet help routes)"
  - "POST /api/driver/cabinet/help (session-gated Chatwoot identity, reference DRIVER-CABINET)"
  - "POST /api/driver/cabinet/sign-out"
  - "/driver/you page, components/driver/YouHelpSection.tsx, components/driver/SignOutButton.tsx"
  - "openDriverHelpPage({ from: 'cabinet' }); DriverHelpChat 'Back' label"
affects: [94-13]
tech-stack:
  added: []
  patterns:
    - "inbox selection extracted into one helper so both help routes pick the same Chatwoot inbox pair"
    - "sign-out expires cookies on the response (session cookie + every cw_*), deletes the row by token hash only"
key-files:
  created:
    - lib/driver-cabinet/profile.ts
    - lib/driver-help-inbox.ts
    - app/api/driver/cabinet/help/route.ts
    - app/api/driver/cabinet/sign-out/route.ts
    - "app/(internal)/driver/(cabinet)/(tabs)/you/page.tsx"
    - components/driver/YouHelpSection.tsx
    - components/driver/SignOutButton.tsx
    - tests/driver-cabinet-you.test.ts
    - tests/driver-cabinet-you-ui.test.tsx
    - tests/driver-cabinet-signout.test.ts
  modified:
    - "app/api/driver/trip/[token]/help/route.ts"
    - lib/driver-help-contract.ts
    - "app/(internal)/driver/trip/help/DriverHelpChat.tsx"
key-decisions:
  - "The cabinet help route never reads the request body: the driver id comes from getDriverSession() only, so a driverId in the body cannot mint another driver's identity (T-94-54)"
  - "Sign-out answers 200 { ok: true } even if the session delete fails: the cookie is cleared regardless and an unreachable database must not trap the driver on a shared phone"
  - "Notifications slot left as a comment between Help and Sign out for 94-13"
status: complete
commits: 3
plan_head_before: 03213be8f05b37da8334da9792d89ee40972ec43
plan_head_after: 6de51801ea9b714e3011b30f582004e5d2d034e0
actuals:
  tokens: 17000
  tasks: 3
  commits: 3
completed: 2026-11-25
---

# Phase 94 Plan 12: You tab (profile, stats, help, sign out) Summary

A signed-in driver opens /driver/you to see their own name, phone, email, vehicle and plate (read-only), two stat tiles (rides completed, offers accepted percent), chat with or call the office, and sign out, which deletes the session row and clears the session and chat cookies.

`commits: 3` counts the three task commits and is measured before the docs commit that adds this file.

## What was built

- **Task 1 (commit 44f549fa, `security:`)**: `driverHelpWidgetEnv()` extracted from the trip help route (dedicated Drivers inbox pair only when both values are set, else the Website pair); the trip help route now calls it with no other change (`tests/driver-help-route.test.ts` untouched and green). `getDriverProfile` selects only `name, phone, email, vehicle_info, vehicle_plate` for the session driver (empty phone becomes null, plate normalised). `getDriverStats` counts completed past rides via `loadDriverRides` / `pastRideRows` and computes `round(100 * accepted / (accepted + declined))`, null when nothing answered. `POST /api/driver/cabinet/help`: body-size guard, rate limit under `/api/driver/cabinet/help`, 401 without a session, `buildDriverWidgetConfig` with the session driver and `DRIVER-CABINET`, `no-store`.
- **Task 2 (commit c581fce2, `security:`)**: `/driver/you` (`requireDriver('/driver/you')`, force-dynamic) with Profile card, two stat tiles and the Help section; muted dash for a missing phone or vehicle, "Pending" for a missing plate, email with `overflow-wrap: anywhere`. `YouHelpSection` (client) follows the 87 Amendment B flow: POST, `saveDriverHelpConfig`, `openDriverHelpPage({ from: 'cabinet' })`; "Opening chat…" disabled and `aria-busy` while pending, 401 to `/driver/login?next=%2Fdriver%2Fyou&ended=1`, `{ enabled: false }` / non-200 / network error to a `role="alert"` line and the "Try chat again" label, bfcache `pageshow` reset; "Call the office" is a `tel:` link with the number below. `openDriverHelpPage` accepts `{ from: 'cabinet' }` (`?from=cabinet`), `DriverHelpChat` reads `window.location.search` and labels its history button "Back".
- **Task 3 (commit 6de51801, `security:`)**: `POST /api/driver/cabinet/sign-out` deletes the `driver_sessions` row whose `token_hash` is `sha256Hex(cookie)` (other sessions stay), sets `prestigo_driver_session` to empty with `maxAge: 0` on Path `/` and expires every `cw_*` cookie; idempotent, no DB call for a missing or malformed cookie. `SignOutButton` posts, shows "Signing out…" disabled, removes the stored help config from sessionStorage and navigates to `/driver/login`; mounted last on the You page with the helper text.

## Verification

- `npx vitest run --exclude '.claude/**'` on tests/driver-cabinet-you.test.ts, driver-cabinet-you-ui.test.tsx, driver-cabinet-signout.test.ts, driver-help-route.test.ts, driver-help-contract.test.ts, driver-help-chat.test.tsx, admin-no-hardcoded-colors.test.ts, plus driver-cabinet-shell / offers-ui / rides-ui, driver-cabinet-auth and chatwoot-identity: all pass (10 files / 207 tests in the combined run; 3 files / 69 for Task 1).
- `npx tsc --noEmit`: 8 errors, the old baseline in `tests/`; none in this plan's files.
- `npx eslint --quiet` on all changed source and test files: exit 0.
- Acceptance greps: `driverHelpWidgetEnv` in both help routes, `DRIVER-CABINET` in the cabinet route, `.eq('driver_id', driverId)` in profile.ts, `cw_` and `maxAge: 0` in the sign-out route, `SignOutButton` in the page, `rating|documents|earnings` 0 in the page and `YouHelpSection.tsx`.

## Deviations from Plan

None - plan executed as written. Notes: the Task 1 oversize-body test sets a `Content-Length` header because `enforceMaxBody` is header-based; the UI test restores `window.location` in `afterEach` so the `?from=cabinet` case reads the real address.

## Known Stubs

None.

## Threat surface

All threats of the register are mitigated: T-94-54 (driver id from the session only, body never read, 401, rate limit, CSRF prefix), T-94-55 (no logging, `no-store`), T-94-56 (row deleted by token hash, session and `cw_*` cookies expired, stored help config removed), T-94-57 (`.eq` gates on the session driver id), T-94-58 (helper extraction only, trip help tests unchanged). No new threat flags.

## Self-Check: PASSED

All created files exist; commits 44f549fa, c581fce2, 6de51801 present in `git log`.
