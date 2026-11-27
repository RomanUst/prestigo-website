---
phase: 94-driver-cabinet
plan: 14
status: complete
completed: 2026-11-26
---

# Phase 94 Plan 14: isolation gates + screen check

## Task 1 (done, commit a2a9d6e9)
Isolation and security source-gate tests for the cabinet.

## Task 2: screen check (done on production, 2026-11-26)
PR #146 merged (769b6894), production deploy green.
- Unauthenticated `/driver/rides` → 307 to `/driver/login?next=…`; `POST /api/driver/cabinet/request-code` without Origin → 403.
- Temporary driver `uat-94@example.invalid` (cabinet_enabled, plate) + a driver_sessions row via MCP; cookie set in the browser pane.
- 390x844 and 360x640: /driver/login, /driver/rides, /driver/rides?view=past, /driver/offers, /driver/you render; scrollWidth == clientWidth (no horizontal scroll); no console errors.
- Push toggle hidden on You before VAPID keys were set (expected).
- cabinet_enabled=false → next request lands on `/driver/login?…&ended=1` "Your session ended".
- Cleanup: driver deleted; drivers/sessions/codes count 0; cookie and token file removed.

## Owner steps (done 2026-11-26)
1. VAPID keys stored in Vercel Production by `scripts/driver-push-vapid-setup.sh` (subject `mailto:info@rideprestigo.com`); production redeployed (dpl_EheUDHE1vCarLCgsB7kGENE5dnph). Re-check with a temporary driver: `/driver/you` carries the Notifications block and the public key; temp driver deleted (count 0).
2. Plates set and the 4 drivers invited in /admin/drivers.
3. Device checks on Android and iPhone passed (sign-in, Home Screen install, push, accepting an offer, disable cuts access).

## Known limitation (accepted by owner)
The "Open in cabinet" email button opens the browser, not the installed Home Screen cabinet. The link (`/driver/offers`) is inside the manifest scope `/driver/`; the cause is the platform: iOS never routes mail links to Home Screen web apps (and their storage is separate from Safari, so the browser asks for a code again), and Android mail apps such as Gmail open links in their in-app browser, which bypasses the installed app. A push tap opens the installed cabinet on both platforms, so push is the primary path and the email is the fallback. No code change.
