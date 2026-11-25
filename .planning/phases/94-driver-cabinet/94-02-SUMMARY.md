---
phase: 94-driver-cabinet
plan: 02
subsystem: auth
tags: [driver-cabinet, signin, safe-next, requireDriver, light-theme, otp-ui]
requires:
  - "94-01: getDriverSession, DRIVER_SESSION_COOKIE, request-code and verify routes"
provides:
  - "lib/driver-cabinet/safe-next.ts: safeDriverNext (allow-list of /driver/rides, /driver/offers, /driver/you)"
  - "lib/driver-cabinet/auth.ts: requireDriver(nextPath) page gate"
  - "app/(internal)/driver/(cabinet)/ route group: layout.tsx (always-light shell, no auth) and driver-cabinet.css (.driver-cabinet-column, .driver-sr-only, .driver-cabinet-header)"
  - "/driver/login page and LoginForm client island (email then 6-digit code)"
affects: [94-03, 94-04, 94-05, 94-06, 94-07, 94-08, 94-09, 94-10, 94-11, 94-12, 94-13, 94-14]
tech-stack:
  added: []
  patterns:
    - "every cabinet page gates itself with requireDriver(); the (cabinet) layout holds no auth (layouts do not re-run on client navigation)"
    - "sign-in answer is status-only: the request-code response body is never read, so no screen depends on whether the email exists"
    - "colour guard (tests/admin-no-hardcoded-colors.test.ts) now scans app/(internal)/driver/(cabinet)"
key-files:
  created:
    - lib/driver-cabinet/safe-next.ts
    - app/(internal)/driver/(cabinet)/layout.tsx
    - app/(internal)/driver/(cabinet)/driver-cabinet.css
    - app/(internal)/driver/(cabinet)/login/page.tsx
    - app/(internal)/driver/(cabinet)/login/LoginForm.tsx
    - tests/driver-cabinet-session.test.ts
    - tests/driver-cabinet-login.test.tsx
  modified:
    - lib/driver-cabinet/auth.ts
    - tests/admin-no-hardcoded-colors.test.ts
key-decisions:
  - "requireDriver adds ended=1 only when a driver cookie was present but getDriverSession rejected it, so a first visit never shows 'Your session ended'"
  - "safeDriverNext rejects /driver/trip/* and /driver/response outright so a trip token can never ride along in a sign-in URL or its Referer"
  - "Resend countdown uses a single setInterval started when the countdown goes idle to running (a per-tick setTimeout chain drifted under batched fake timers)"
  - "Client-side email check is lenient (x@y); the server 400 stays the authority and maps to the same 'Enter a valid email address.' line"
status: complete
commits: 2
plan_head_before: 2d5796caf2e3571b6747051f14c6c0cba87ca856
plan_head_after: 9b4a05bba5c878ceac9f29e0d261a6903edcab61
actuals:
  tokens: 11000
  tasks: 2
  commits: 2
completed: 2026-11-25
---

# Phase 94 Plan 02: Driver sign-in page and page gate Summary

A driver signs in at /driver/login on a phone (email, then a 6-digit code) inside an always-light English shell, and every later cabinet page gets one gate, `requireDriver()`, that sends a signed-out driver to sign-in and back to a safe cabinet path.

`commits: 2` counts the two task commits and is measured before the docs commit that adds this file.

## What was built

- **Task 1 (commit 6963510f, `security:`)**: `safeDriverNext` (no imports, client-safe; the safeAdminNext hygiene plus an allow-list of the three tab areas) and `requireDriver` in `lib/driver-cabinet/auth.ts`. 31 new tests in `tests/driver-cabinet-session.test.ts` (accepted paths, 23 rejected shapes, no cookie / stale cookie / expired / disabled driver / unsafe next / trip-token next).
- **Task 2 (commit 9b4a05bb, `security:`)**: the `(cabinet)` layout (admin-theme.css + driver-trip.css + driver-cabinet.css, `data-admin-theme="light"`, noindex, no auth call), `driver-cabinet.css` (size and layout only, zero colour values), the `/driver/login` server page (redirects signed-in drivers to the safe next, `force-dynamic`, noindex) and `LoginForm` implementing the UI-SPEC sign-in contract: step 1 and step 2 copy, 48/56px fields, auto-submit at 6 digits with repeat-tap guard, wrong/expired/429/network errors in `role="alert"`, field cleared and re-focused after a wrong code, 30 s resend countdown with `role="status"` confirmation, "Use a different email", offers-context body, `?ended=1` line, `tel:` footer, `window.location.assign(next)` on success. 27 tests in `tests/driver-cabinet-login.test.tsx`. The colour guard now scans `app/(internal)/driver/(cabinet)`.

## Verification

- `npx vitest run --exclude '.claude/**' tests/driver-cabinet-session.test.ts tests/driver-cabinet-login.test.tsx tests/admin-no-hardcoded-colors.test.ts tests/driver-cabinet-auth.test.ts`: all pass (58 + 89 across the two runs, 0 failed).
- `npx tsc --noEmit`: 8 errors, all in `tests/` baseline, none in this plan's files.
- `npx eslint --quiet` on all changed source and test files: clean.
- Acceptance greps: no colour literal in `driver-cabinet.css`, no `getDriverSession`/`requireDriver` in the layout, `autoComplete="one-time-code"` present, `data-admin-theme="light"` present.

## Deviations from Plan

None - plan executed as written. Two small judgement calls inside the plan's latitude: the lenient client-side email check, and `aria-label` on the footer phone link that starts with the visible text ("Call the office, {number}").

## Known Stubs

None.

## Threat surface

All threats of the plan's register are covered: T-94-09 and T-94-10 by `safeDriverNext` tests, T-94-11 by the status-only request-code handling and a test where the server body says anything, T-94-12 by the gate living in `requireDriver` with no auth in the layout (the 94-14 source gate enforces per-page use), T-94-13 by plain React text rendering. No new surface beyond the plan.

## Open items carried by the plan (not resolved here)

- OTP autofill and iOS Home Screen cookie sharing are planner assumptions for the owner to check on a real iPhone in 94-14; the form works with a plain typed or pasted code and keeps `next` in standalone mode.
- 200% text zoom (UI-SPEC E1/E2) relies on `dvh` and a flex column with no zoom lock; verification is a backstop (manual).

## Self-Check: PASSED

- FOUND: lib/driver-cabinet/safe-next.ts, app/(internal)/driver/(cabinet)/layout.tsx, driver-cabinet.css, login/page.tsx, login/LoginForm.tsx, tests/driver-cabinet-session.test.ts, tests/driver-cabinet-login.test.tsx
- FOUND commits: 6963510f, 9b4a05bb
