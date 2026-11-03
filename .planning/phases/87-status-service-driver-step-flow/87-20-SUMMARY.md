---
phase: 87-status-service-driver-step-flow
plan: 20
gap_closure: true
status: complete-pending-human-checks
completed: 2026-11-03
owner_decision: option-b
---

# 87-20 Summary: gate, Drivers inbox, merge, production smoke

## Task 1 (tracer + automated gate)
Ran by the orchestrator against the local dev server (preview `prestigo`, :3000).
- `/driver/trip/help`: CSP has a nonce. `frame-src` is `https://js.stripe.com https://hooks.stripe.com https://accounts.google.com https://chat.rideprestigo.com`. The body contains `driver-shell`, "Chat with the office" and robots noindex.
- `/driver/trip/<uuid>`: CSP does not contain chat.rideprestigo.com (0 matches).
- `POST /api/driver/trip/<uuid>/help` with `Origin: https://evil.example` returns 403. `POST /api/driver/trip/not-a-uuid/help` with the site origin returns `400 {"error":"invalid_token"}`.
- Full `npx vitest run`, after the wave 2 merge plus the `tests/chatwoot-sync.test.ts` count fix (17 conversation attributes): 325 files green. The only failure on the first run was that stale count, fixed in 132f29b8.
- `tsc --noEmit`: 8 errors, all baseline in `tests/`.
- `eslint --quiet` on every changed .ts/.tsx: clean.
- Static checks over the gap-closure diff: 0 added price or currency literals in app/ and components/, and no changes to messages/, package.json or package-lock.json.

## Task 2 (decision)
Owner answer: **option-b**, «Отдельный инбокс Drivers».

## Task 3 (setup, merge, smoke)
- `infra/chatwoot/inboxes.json`: Drivers WebWidget managed entry added (b12b13a2).
- **Deviation (bug fix):** `buildInboxRefs` could fall back to the Website inbox for the not-yet-created Drivers entry, because both are WebWidget. A sync would then have patched greeting/CSAT on the client Website inbox. The Website inbox is now excluded from the same-type fallback. A regression test is added, and the sync tests cover the sixth managed inbox.
- Chatwoot attributes: `sync --only attributes` dry-run, then real run, gave create=2 (chat_role, driver_trip_ref) and unchanged=23.
- Drivers inbox and Vercel env:
  - Created by the owner-run one-off script (scratchpad `setup-drivers-inbox.mjs`). The Claude auto-mode classifier denied the secret-store write, so the owner ran it.
  - `vercel env ls production` shows `CHATWOOT_DRIVER_WEBSITE_TOKEN` and `CHATWOOT_DRIVER_WIDGET_HMAC_SECRET`. Only names were checked; values were never printed.
- `sync --only inboxes` result: update=1 (Drivers owner member), unchanged=4, skipped=1 (WhatsApp, pre-existing and parked since Phase 78).
- Merge: PR #85 merged to main as 0943f82c. Production deploy went live after about 160 s.
- Production smoke on https://rideprestigo.com:
  - The help page CSP has chat.rideprestigo.com in `frame-src`.
  - The token page CSP has 0 matches.
  - The help API returns 403 for a foreign origin and 400 `invalid_token` for a bad id.
  - The home page returns 200.

## Open: human checks on a real phone (87-UAT re-run)
1. Accept email: "Trip confirmed" with OPEN TRIP, no Accept/Decline, no client price.
2. Google Maps / Waze chooser, including the WhatsApp, Telegram and Instagram in-app browsers.
3. Help chat reaches the Drivers inbox from "<name> (driver)" with chat_role and driver_trip_ref set, and the trip token appears nowhere. The orchestrator then checks `chat_conversations.outcome = 'filtered'` and that no new EspoCRM lead was created.

## Notes for the owner
- Pre-existing and outside these gaps: Google Analytics is excluded only on /admin. On consent, the trip page URL, which contains the token, reaches GA. Candidate follow-up.
- GRiDD and no-show notes carried from 87-13 stay open.
