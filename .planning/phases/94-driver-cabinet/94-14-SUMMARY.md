---
phase: 94-driver-cabinet
plan: 14
status: partial
completed: null
---

# Phase 94 Plan 14: isolation gates + screen check

## Task 1 (done, commit a2a9d6e9)
Isolation and security source-gate tests for the cabinet.

## Task 2: screen check (done on production, 2026-11-26)
PR #146 merged (769b6894), production deploy green.
- Unauthenticated `/driver/rides` → 307 to `/driver/login?next=…`; `POST /api/driver/cabinet/request-code` without Origin → 403.
- Temporary driver `uat-94@example.invalid` (cabinet_enabled, plate) + a driver_sessions row via MCP; cookie set in the browser pane.
- 390x844 and 360x640: /driver/login, /driver/rides, /driver/rides?view=past, /driver/offers, /driver/you render; scrollWidth == clientWidth (no horizontal scroll); no console errors.
- Push toggle hidden on You (VAPID keys not set yet: expected).
- cabinet_enabled=false → next request lands on `/driver/login?…&ended=1` "Your session ended".
- Cleanup: driver deleted; drivers/sessions/codes count 0; cookie and token file removed.

## Still open (owner)
1. `scripts/driver-push-vapid-setup.sh` in Terminal, then redeploy.
2. Plates + Invite for the 4 drivers in /admin/drivers.
3. Device checks (Android + iPhone): Home Screen install, push, "Open in cabinet" email, accept an offer, disable cuts access.

Phase verification and roadmap completion wait for item 3.
