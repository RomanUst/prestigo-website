---
phase: 82-site-crm-chatwoot-sync-foundation
plan: 15
status: partial
requirements: [SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05, GDPR-01]
---

# 82-15 Backfill, drill, erasure smoke

Counts and codes only.

## Task 1: backfill (owner approved 2026-10-20, choice "approve"; 0 phone merges, nothing to split)

- `select public.crm_backfill_enqueue('bf', 5)` at 23:13:41 UTC → **n = 90** (71 non-abandoned bookings incl. the 82-14 smoke + 19 profiles).
- Delivered within ~9 min: 71 `sync.booking`, 19 `sync.signup`, 59 `sync.espo`, 95 `sync.chatwoot` rows — all `sent`, attempts 1, 0 errors. Open rows (pending / processing / failed) in the whole outbox afterwards: **0**. No retry was needed.

| Count | Before | After |
|---|---|---|
| identities (Supabase) | 43 | 43 (all 43 have espo_contact_id and chatwoot_contact_id) |
| non-abandoned bookings (Supabase) | — | 71 |
| EspoCRM CBooking | 57 | **71** (= non-abandoned bookings, incl. 2 GNet orphans without Contact) |
| EspoCRM Contact | 30 | 45 |
| Chatwoot contacts | 66 | 98 |
| `backfill.mjs --audit` | — | records=71 **duplicates=0** |
| EspoCRM Contact with `noreply@gnet.local` (Open Question 8, report only) | — | 1 (pre-existing; GNet placeholders never get an identity) |

- Runbook `infra/vps/runbooks/crm-sync.md` + guard `tests/crm-sync-runbook.test.ts` (25 tests pass).

## Task 2: EspoCRM outage drill — PENDING

Needs SSH to the VPS (D1/D2 in lead-capture.md), which runs only in the main session after the owner allows those two commands.

## Task 3: erasure smoke — PENDING (owner)

Owner erases `crm-smoke+82-14@…` from /admin/erasure after the drill; Claude then verifies every system.
