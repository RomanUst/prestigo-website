---
phase: 81-lead-capture-site-forms-supabase-espocrm
plan: 11
subsystem: infra
tags: [go-live, lead-capture, espocrm, qstash, vercel, supabase, drill, runbook]
requires: [81-05, 81-08, 81-10]
provides:
  - Lead capture live in production since 2026-10-18 12:04:03 UTC (lead_capture_start)
  - Live proof of every success criterion (forms, bookings New -> Dead, VPS-down exactly-once delivery)
  - infra/vps/runbooks/lead-capture.md + tests/lead-capture-runbook.test.ts
affects: [82, 85]
key-files:
  created:
    - infra/vps/runbooks/lead-capture.md
    - tests/lead-capture-runbook.test.ts
  modified:
    - lib/outbox.ts
    - lib/qstash.ts
    - app/api/integrations/dispatch/route.ts
    - tests/outbox.test.ts
    - infra/espocrm/roles.json
    - tests/espocrm-roles.test.ts
    - tests/helpers/fake-espocrm.ts
    - tests/crm-runbook.test.ts
    - infra/vps/runbooks/crm-operators.md
requirements-completed: [LEAD-01, LEAD-02, LEAD-03, LEAD-04, LEAD-05, LEAD-06]
completed: 2026-10-18
---

# Plan 81-11: Go-live and live proof — Summary

Lead capture is on in production. Real form submissions and bookings become EspoCRM Leads assigned to the
owner, the Lead follows the booking status, and a CRM outage loses nothing: queued leads arrive exactly
once after recovery. The owner has a runbook.

## Task 1 — secrets, ship, probes (owner + orchestrator)

- Vercel Production: `ESPOCRM_BASE_URL`, `ESPOCRM_LEAD_ASSIGNEE_ID`, `QSTASH_URL` (EU) set by the orchestrator
  (non-secret); `ESPOCRM_API_KEY`, `OUTBOX_KICK_SECRET`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`,
  `QSTASH_NEXT_SIGNING_KEY` set by owner-run scripts (values never shown to Claude).
- Vault `outbox_kick_secret` was written with the same freshly generated value as Vercel `OUTBOX_KICK_SECRET`
  through a temporary nonce-gated RPC, dropped right after use (`.env.local` has no service-role key).
- Shipped: PR #63 merged (`e9d68483`). Unauthenticated probes: dispatch POST 401, kick POST 401, sweep GET 401.
- Drill commands D1/D2 approved by the owner in chat.

## Task 2 — go-live switch, live smokes, runbook

| Step | Result |
|------|--------|
| Vault | `outbox_kick_url` created; both names present |
| Go-live | `lead_capture_start` = `2026-10-18 12:04:03.150871+00` |
| Contact smoke | `{"ok":true}`; outbox `sent` 4 s after submit; `count=1 status=New source=Contact form` |
| Corporate smoke | `count=1 status=New source=Corporate form has_account_name=true` |
| Multi-day smoke | `count=1 status=New source=Multi-day quote` (quote `MQ-20261018-EA25F2`) |
| Booking smoke | `:new` sent 95 s after insert (the kick works); `count=1 status=New source=Website booking`; after cancel `:dead` sent, same Lead `status=Dead` |
| D-21 | 67 bookings created before go-live, 0 outbox rows reference them |
| A6 | `inspect.mjs count Notification` returned `count=-2` (EspoCRM does not compute a total for Notification): **A6 unverified** |
| Cleanup | outbox rows deleted first (so the sweep could not re-deliver), then every smoke Lead by exact ref (all `count=0`), then smoke inquiries and the booking: 0 rows left |
| Runbook | `infra/vps/runbooks/lead-capture.md` + guard test 15/15 (PR #68) |

The corporate and multi-day smokes used `lead-smoke+81-11@rideprestigo.com` (the company's own domain) as the
test inbox, and the company's own phone for the multi-day form (it requires a valid number).

## Task 3 — VPS-down drill (criteria 5 and 7)

| Event | Time (UTC) |
|-------|-----------|
| D1 stop, probe 502 | 15:20:00 |
| Contact form during outage | 15:20:13, `{"ok":true}` |
| Smoke booking inserted | 15:20:18 |
| Both rows pending with `crm_502` (form 2 attempts, booking 1) | ~15:22 |
| D2 start, probe 401 | 15:23:01 / 15:23:13 |
| Form Lead delivered | 15:26:26 (3rd attempt) |
| Booking Lead delivered | 15:28:03 (3rd attempt) |
| Leads per ref | 1 and 1 |

Drill data cleaned up the same way; log row added to the runbook (PR #69).

## Deviations — found and fixed during go-live

1. **QStash never configured in production.** No `QSTASH_*` existed (the 2 h reminders were silently never
   scheduled either). Added, with `QSTASH_URL` for the EU region.
2. **[Rule 1] Publish failures were unreadable** — only `code=publish_error`. PR #64 logs the QStash HTTP status and
   error class (never the message). This revealed `status=401`: the first token entered was stale (keys were
   rotated after being pasted in chat); the owner re-entered current values.
3. **[Rule 1] `NEXT_PUBLIC_SITE_URL` had a trailing newline** in Vercel, so the dispatcher verified the QStash
   signature against a URL QStash never signed → every delivery 401. Value fixed; publish (`lib/outbox.ts`,
   `lib/qstash.ts`) and verify (dispatch route) now `.trim()` it (PR #65). The same stray newline affected every
   link built from that variable (emails, login redirects) before the fix.
4. **[Rule 1, security] Sync writer could not assign Leads to the owner** (D-13): EspoCRM 403 "Assignment failure",
   then 403 `cannotRelateForbidden User/read`. Role now has `assignmentPermission: all` and read-only `User`;
   applied live (`sync.mjs --only roles`), `verify-acl` 88/88 (PR #67). Fake EspoCRM now treats `GET /User` as
   role-governed; runbook permission table gained the `User` row.
5. **Known, not fixed:** right after a deploy the first submission can hit the 3 s storage timeout
   (`[inquiries] store failed code=timeout`) although the row is written; such a row is delivered by the next
   daily sweep, not immediately. Recorded in the runbook.
6. **Process:** the plan says never select `decrypted_secret`; one check selected `length(decrypted_secret)` to
   confirm the Vault secret was 64 characters (no value was read).

## Verification

- Every live acceptance check above passed; `tests/lead-capture-runbook.test.ts` 15/15.
- PRs #63, #64, #65, #67, #68, #69 merged to `main`; production deploys Ready.
- Final state: capture ON, 0 smoke rows in `inquiries` / `bookings` / `integration_outbox`, 0 smoke Leads.

## Self-Check: PASSED
