---
phase: 82-site-crm-chatwoot-sync-foundation
plan: 14
status: complete-pending-owner-decision
requirements: [SYNC-01, SYNC-02, SYNC-03, GDPR-02]
completed: 2026-10-20
---

# 82-14 Go-live record

Sync is live in production. Ids, counts and codes only; no PII, no secrets.

## Task 1: owner steps

| Item | Result |
|---|---|
| Retention (D-13) | owner confirmed "10 years" (no copy change needed) |
| Chatwoot credential model | **A**: the existing infra token from `~/.config/prestigo/chatwoot-api.env` serves both `CHATWOOT_API_TOKEN` and `CHATWOOT_ADMIN_API_TOKEN` |
| Vercel Production env | set by the owner-run script `set-82-14-env.mjs` (values never seen by Claude): `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_API_TOKEN`, `CHATWOOT_ADMIN_API_TOKEN`, `ERASURE_HMAC_KEY`; `CHATWOOT_BASE_URL` already existed. Names checked with `vercel env ls production`. The script ran twice (two terminal tabs), so the last values win; `ERASURE_HMAC_KEY` was regenerated before any erasure request existed, so nothing depends on the first value. |
| Ship | PR RomanUst/prestigo-website#72 merged (merge commit 0738b643); prod redeployed twice after the env change (`prestigo-site-fx207xcy0` then a final redeploy aliased to rideprestigo.com). `/api/admin/outbox` answers 401. |
| Desk numbers marked shared | 0 (owner: none known) |
| Outage-drill allow-rules (for 82-15) | not done yet |

## Task 2: live config, identity pass, switch, smoke

1. EspoCRM: `sync.mjs --only roles` updated **Sync writer** (Contact delete allowed); a second dry-run plans no change; `verify-acl --role "Sync writer"`: pass=30 fail=0 (note: verify-acl has no Contact-DELETE probe; the converged dry-run is the evidence).
2. Chatwoot: `sync.mjs --only attributes` created 7 contact attributes; dry-run afterwards `create=0 update=0 unchanged=23`.
3. Identity pass (before the switch, 0 manual flags):

| measure | value |
|---|---|
| bookings seen / linked / no identity / abandoned | 71 / 68 / 2 (GNet placeholders) / 1 |
| profiles seen / linked | 19 / 19 |
| identities | 42 (19 with an account) |
| emails by basis | email 32, signup 10, phone 0, split 0 |
| phone merges / shared numbers | 0 / 0 |
| bookings with unparseable phone | 17 (no country code; never used for matching) |

4. `crm_sync_start` = **2026-10-20 23:04:54.279662+00**.
5. Smoke booking `SMK-82-14` (id `083a1699-3fab-482c-aa77-586695cfc904`, manual, pending, no phone, marker email `crm-smoke+82-14@…`), created 23:05:07:
   - outbox: `sync.booking` sent 23:07:19, `sync.espo` sent 23:07:33, `sync.chatwoot` sent (2 rows: fan-out + the refresh enqueued by the new Espo contact id), Phase 81 `lead.booking` sent 23:06:48. All attempts=1, no last_error.
   - EspoCRM: `count Contact emailAddress=<marker>` → 1; `count CBooking supabaseBookingId=<id>` → 1.
   - Chatwoot: `inspect --contact <marker>` → `contact_found=true`.
6. Status → `cancelled` at 23:08:49; after delivery the CBooking reads `status=cancelled` with its Contact link intact (read-only GET; `inspect count` takes one filter only, so a one-off read printing `status` only was used). All 9 outbox rows since the switch are `sent`, 0 errors.
7. The smoke person stays in place for 82-15 (outage drill, then erasure, which also removes its Phase 81 Lead).

## Task 3: backfill decision

Pending owner decision. With 0 phone merges there is nothing to split first. Backfill would enqueue ~86 rows (68 bookings + 19 profiles, minus the smoke booking already synced), staggered 5 s → about 7 minutes.

## Security note

During the env script run a string resembling a token was typed at the shell prompt in one of the terminal tabs (it went to bash as a command, not to Vercel). The owner was advised to rotate that token if it is a real secret and to clear the shell history.
