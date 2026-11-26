---
phase: 94-driver-cabinet
plan: 05
subsystem: api
tags: [driver-cabinet, web-push, vapid, security]
requires:
  - "94-01: driver_push_subscriptions table, getDriverSession, rate-limit key /api/driver/cabinet/push, createFakeDriverCabinetDb"
provides:
  - "lib/driver-cabinet/push.ts: DriverPushPayload, pushConfigured, vapidPublicKey, sendDriverPush"
  - "POST / DELETE /api/driver/cabinet/push (subscribe / unsubscribe the session driver's browser)"
  - "scripts/driver-push-vapid-setup.sh (owner-run VAPID key generation into Vercel Production)"
  - "web-push@3.6.7 (exact) and @types/web-push@3.6.4 (exact, dev)"
affects: [94-09, 94-13, 94-14]
tech-stack:
  added: ["web-push@3.6.7", "@types/web-push@3.6.4"]
  patterns:
    - "VAPID env read with readEnv on every call, no module-level cache and no NEXT_PUBLIC copy; the cabinet page hands the public key to the browser as a prop (94-13)"
    - "sendDriverPush: one try/catch around everything, Promise.allSettled per subscription, prune by row id on 404/410, log only the status code"
    - "payload url allow-list regex /driver/... with no '..' and no '//', else /driver/offers"
key-files:
  created:
    - lib/driver-cabinet/push.ts
    - app/api/driver/cabinet/push/route.ts
    - tests/driver-cabinet-push.test.ts
    - scripts/driver-push-vapid-setup.sh
  modified:
    - package.json
    - package-lock.json
key-decisions:
  - "Task 1 (package legitimacy, blocking-human) was resolved by the owner in chat and the orchestrator installed the pins in commit dc488594 (no install scripts in web-push or its dependencies; 4.0.0 avoided as too new); the executor ran no install"
  - "Push stays silently off until VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are all set; the subscribe route answers 503 push_not_configured in that state so the UI can hide the toggle"
  - "The subscribe route runs guards in the order body cap, rate limit, session, JSON, zod, then the 503 check, so an unauthenticated caller learns nothing about push configuration"
status: complete
commits: 1
plan_head_before: 0d8dc2bf3c01795079c62cc17ffaf93aeb409693
plan_head_after: a6a414a305d8ec4ae570fd129e8724a9f588f5d4
actuals:
  tokens: 14000
  tasks: 2
  commits: 1
completed: 2026-11-25
---

# Phase 94 Plan 05: Push transport for the driver cabinet Summary

web-push@3.6.7 per-driver send with dead-subscription pruning, a session-bound subscribe/unsubscribe route, and the owner script that creates the VAPID keys; push is silently off until the owner sets the keys, email stays the guaranteed channel.

`commits: 1` counts the executor task commit and is measured before the docs commit that adds this file; Task 1 is the orchestrator's separate commit dc488594.

## What was built

- **Task 1 (orchestrator, commit dc488594, `chore:`)**: owner approved the package legitimacy check in chat; the orchestrator installed `web-push@3.6.7` (dependencies) and `@types/web-push@3.6.4` (devDependencies) with exact pins. Verified here: `package.json` holds both pins and `require('web-push/package.json').version` prints 3.6.7.
- **Task 2 (commit a6a414a3, `security:`)**:
  - `lib/driver-cabinet/push.ts`: `pushConfigured()` (all three VAPID vars non-empty), `vapidPublicKey()`, `sendDriverPush(supabase, driverId, payload)`. Without keys it returns `{ sent: 0, pruned: 0 }` with no DB query and no web-push call. With keys it calls `setVapidDetails`, selects only that driver's subscriptions, sends `{ TTL: 3600, urgency: 'high' }` to each, deletes rows answered 404 or 410, and logs any other failure as `console.error('[driver-push] send failed', { statusCode })` only. A url outside `/driver/` becomes `/driver/offers`. It never throws.
  - `app/api/driver/cabinet/push/route.ts` (`force-dynamic`, Node runtime): POST upserts on `endpoint` with `driver_id` from the session; DELETE removes by `endpoint` and `driver_id`. Endpoint must be https, at most 1000 chars; `p256dh` and `auth` are bounded base64url. 401 without session, 429, 413, 400 `invalid_json` / `invalid_payload`, 503 `push_not_configured`, 500 `server_error` (nothing logged). All answers carry `Cache-Control: no-store`.
  - `scripts/driver-push-vapid-setup.sh` (executable, `set -euo pipefail`): checks repo root, vercel CLI and `.vercel/project.json`; stops if VAPID vars already exist unless `--rotate`; reads the subject with `read -r` (default `mailto:info@rideprestigo.com`); generates the pair in memory with `web-push`; pipes each value to `vercel env add NAME production`; prints only the public key and "Redeploy production for the keys to take effect". The script holds no key literal and was not run.
  - `tests/driver-cabinet-push.test.ts`: 36 tests with `web-push` mocked and the 94-01 fake DB.

## Verification

- `npx vitest run --exclude '.claude/**' tests/driver-cabinet-push.test.ts`: 36 passed.
- `bash -n scripts/driver-push-vapid-setup.sh` and `test -x`: pass.
- `npx tsc --noEmit`: 8 errors, all pre-existing in `tests/` (baseline), none in the new files.
- `npx eslint --quiet` on the three TS files: clean.
- Acceptance greps: `from 'web-push'` 1; console calls naming endpoint 0 in both files; `getDriverSession` 2 in the route; script secret-pattern grep 0.

## Deviations from Plan

None - plan executed exactly as written. TDD note: the test file was written before the implementation, but the first run after implementing was already green, so no separate RED run was recorded.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-94-SC, T-94-24 to T-94-28 mitigated as listed). Mitigations in code: https-only bounded endpoint (T-94-24), driver_id only from the session and DELETE filtered by it (T-94-25), status-code-only logging with a test asserting the endpoint and keys never appear (T-94-26), private key never printed or stored by the script (T-94-27), allSettled plus catch-all (T-94-28).

## Open items for later plans

- 94-14 (owner): run `bash scripts/driver-push-vapid-setup.sh` in the Terminal panel, redeploy production, and prove delivery on a real Android Chrome and an iOS 16.4+ Home Screen install. CI cannot prove device delivery (planner assumption E3/E15); the service worker must always show a notification.
- 94-09 calls `sendDriverPush` inside `after()`; 94-13 passes `vapidPublicKey()` to the toggle as a prop.

## Self-Check: PASSED

- FOUND: lib/driver-cabinet/push.ts, app/api/driver/cabinet/push/route.ts, tests/driver-cabinet-push.test.ts, scripts/driver-push-vapid-setup.sh
- FOUND commits: dc488594 (Task 1, orchestrator), a6a414a3 (Task 2)
