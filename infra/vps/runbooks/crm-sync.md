# Runbook: Site ↔ EspoCRM / Chatwoot sync (Phase 82)

Owner-facing. Live since 2026-10-20 23:04 UTC (`integration_config.crm_sync_start`). Companion to
[lead-capture.md](lead-capture.md) (Phase 81: leads, outbox, kick, QStash, sweep).

## 1. How it works

```
bookings / customer_profiles write
  └─ AFTER trigger (069: bookings_crm_sync, customer_profiles_crm_sync; gated by crm_sync_start)
       └─ outbox row  sync.booking:<id>:<bucket>  /  sync.signup:<userId>:<bucket>   (ids only)
            └─ outbox_kick (pg_net → /api/integrations/kick) → QStash → dispatcher
                 └─ resolver hop: identity_resolve_booking / identity_resolve_user (one person per email,
                    phone merges once, then the number is shared)
                      ├─ sync.espo:<identity>      → EspoCRM Contact + one CBooking per booking
                      └─ sync.chatwoot:<identity>  → Chatwoot contact + trip attributes
erasure (admin): /admin/erasure → erasure_confirm → erase.person:<request>
                 → Chatwoot delete → EspoCRM scrub+delete → verify → Supabase anonymise → auth delete → audit
daily: /api/cron/outbox-sweep re-publishes due rows, purges, and emails the owner a digest only when
       rows are failed or stuck (step digest_failed never blocks the sweep)
```

- Keys are bucketed per 90 s, so a burst of edits becomes one delivery; each row is delivered at most once per key.
- Identity data lives only in Supabase (`contact_identities`, `identity_emails`, `identity_phones`, `phone_flags`,
  `booking_identity`), deny-all RLS. It never grants a customer access to anyone else's bookings.
- Operator edits win: Chatwoot name / email / phone / identifier are filled only when empty; EspoCRM names, account,
  title and description are never written by the sync.

## 2. Configuration (names only — values live in Vercel / ~/.config/prestigo)

| Name | Where | Purpose |
|---|---|---|
| `crm_sync_start` | `public.integration_config` | go-live switch read by the triggers |
| `ESPOCRM_API_KEY` | Vercel Production | EspoCRM "Sync writer" API user (plus `ESPOCRM_BASE_URL`) |
| `CHATWOOT_BASE_URL` | Vercel Production | `https://chat.rideprestigo.com` |
| `CHATWOOT_ACCOUNT_ID` | Vercel Production | Chatwoot account |
| `CHATWOOT_API_TOKEN` | Vercel Production | everyday contact sync |
| `CHATWOOT_ADMIN_API_TOKEN` | Vercel Production | contact merge + erasure deletes |
| `ERASURE_HMAC_KEY` | Vercel Production | keyed hash of the email in the erasure audit (min 32 chars) |
| `MANAGER_EMAIL`, `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL` | Vercel Production | daily digest |
| `QSTASH_TOKEN` | Vercel Production | dispatch publish |

Go-live used credential model **A**: the infra Chatwoot token serves both `CHATWOOT_API_TOKEN` and
`CHATWOOT_ADMIN_API_TOKEN`. That token can read every conversation — see section 8.

After changing any env value: `vercel redeploy <latest prod url> --target production`.

## 3. Switches

| Action | How | Effect |
|---|---|---|
| Pause capture | `delete from public.integration_config where key = 'crm_sync_start';` | triggers stop enqueuing; rows already queued still deliver |
| Resume capture | `insert into public.integration_config (key, value) values ('crm_sync_start', now()::text);` | changes made while paused are NOT captured — run a backfill (section 5) |
| Park Chatwoot | remove `CHATWOOT_API_TOKEN` + redeploy | `sync.chatwoot` rows wait in breaker `chatwoot_unconfigured`; EspoCRM unaffected |
| Park EspoCRM | remove `ESPOCRM_API_KEY` + redeploy | `sync.espo` and lead rows wait in breaker `crm_unconfigured`; Chatwoot unaffected |

## 4. Event types and codes (shown on /admin/outbox)

Event types: `sync.booking`, `sync.signup` (resolver hop), `sync.espo`, `sync.chatwoot`, `erase.person`.

| Code | Meaning | Fix |
|---|---|---|
| `crm_unconfigured` | EspoCRM env missing | set `ESPOCRM_API_KEY` / `ESPOCRM_BASE_URL`, redeploy, Retry all |
| `chatwoot_unconfigured` | Chatwoot env missing | set the `CHATWOOT_*` names, redeploy, Retry all |
| `crm_503`, `crm_http_*` | EspoCRM down / error | retries on its own; check the VPS if it persists |
| `chatwoot_auth`, `crm_auth` | token refused (6 h breaker) | rotate the token (section 8), redeploy, Retry all |
| `cw_ambiguous` | 3+ Chatwoot contacts (or 2 without the admin token / with different identifiers) match one person | merge the duplicates by hand in Chatwoot, then Retry the row |
| `cw_unprocessable` | Chatwoot rejected the contact after the phone-less retry | read the contact in Chatwoot, fix the data, Retry |
| `identity_erasing` | the person is being erased | nothing — the row resumes or drops when erasure finishes |
| `booking_unmapped` | a booking value has no EspoCRM mapping (enum) | add the mapping in `lib/customer-mapping.ts`, deploy, Retry |
| `erasure_unverified` | the verify pass still found a record after erasure | open the erasure log row, remove the record by hand, Retry |
| `erasure_not_confirmed` | erase row without a confirmed request | nothing (forged / stale) |
| `deadline` | invocation passed 45 s, rescheduled itself | nothing |
| `source_missing`, `abandoned_checkout`, `no_email` | skipped by design | nothing |
| `digest_failed` | the daily digest email failed (sweep still ran) | check Resend + `MANAGER_EMAIL` |

## 5. Backfill (one-time, re-runnable)

```sql
select public.crm_identity_report();            -- counts only, review first
select public.crm_backfill_identity_pass();     -- links the whole history to identities (idempotent)
select public.crm_backfill_enqueue('bf2', 5);   -- new tag each run: bf, bf2, bf3 …; 5 s stagger
```

The tag must match `^bf[0-9]{0,3}$`; a repeated tag enqueues nothing. Audit afterwards:
`node infra/espocrm/backfill.mjs --audit` (duplicates=0), `node infra/espocrm/inspect.mjs count CBooking`,
`node infra/chatwoot/inspect.mjs --contacts-count`.

## 6. Identities (/admin/identities)

- **Mark number as shared** for any desk / agency / hotel number before it causes a merge. A shared number never
  matches and is never stored on a person. There is no unmark.
- **Split contact** undoes one phone merge: the email moves to a new person with its bookings, the number becomes
  shared, and both people re-sync to EspoCRM and Chatwoot. Chatwoot conversations stay with the original contact
  (Chatwoot merges cannot be undone).
- Phones without a country code (e.g. 9-digit Czech numbers) are kept on the booking but never used for matching.

## 7. Erasure (/admin/erasure, GDPR-01)

1. Verify the requester's identity **outside the site** (reply from the booking email, or a call to the booked number).
2. Search by email (or an un-shared phone) → **Preview erasure** → check bookings / upcoming trips / account.
3. **Erase this person…** → tick the identity check, type the email, (acknowledge upcoming trips), **Erase permanently**.
4. Follow the log (refreshes every 10 s) until Completed + Verified Yes. On Failed, open /admin/outbox.

The saga keeps booking reference, dates, vehicle class and amounts (accounting, 10 years) and blanks names, email,
phone, addresses, notes and flight. The audit keeps only a hash reference.

Manual checklist after every erasure (not automated):
- EspoCRM: Email, Task and stream records that quote the person (search by name / email); delete them.
- Hostinger mailbox: archive threads with the person.
- Encrypted backups keep data up to 6 months, then roll off — no action, mention it in the reply.
- Stripe (customer / payment records) and Resend (email logs): delete or redact per their dashboards if requested.

## 8. Credentials and blast radius

| Credential | Rotate | Blast radius |
|---|---|---|
| `CHATWOOT_API_TOKEN` / `CHATWOOT_ADMIN_API_TOKEN` (model A: one administrator token) | Chatwoot → Profile → Access token → reset; update Vercel + `~/.config/prestigo/chatwoot-api.env`; redeploy | reads every conversation, can change settings and delete contacts |
| `ESPOCRM_API_KEY` (Sync writer) | EspoCRM → API users → regenerate; update Vercel; redeploy | create/update Contacts, CBookings, Leads; delete Contacts and Leads |
| `ERASURE_HMAC_KEY` | only when leaked; generate `openssl rand -hex 32`, set, redeploy | old audit references no longer match new hashes (history stays readable) |

Use an owner-run script with hidden input for secrets; never paste values into chat or the repo.

## 9. Residual risks

- Long-running write transactions hold the global identity lock; resolver rows then wait (no data loss).
- `next_trip` / `trip_count` in Chatwoot refresh only when the person changes; a past trip stays "next" until the next sync.
- After a split, the other person's Chatwoot/EspoCRM contact may still hold the moved email until its own sync runs.

## 10. Drills

D1/D2 commands are in [lead-capture.md](lead-capture.md) (EspoCRM app container stop/start over SSH).

### Drill log

| Date (UTC) | Drill | Stop | Change | First code | Start | Delivered | Counts |
|---|---|---|---|---|---|---|---|
| 2026-10-20 | EspoCRM outage (D1/D2), smoke booking flight_number → DRILL1 | 23:26:04 (probe 502) | 23:26:11 | `crm_502` on sync.espo (attempt 1); sync.chatwoot sent 23:28:34 during the outage | 23:29:05 (probe 401) | sync.espo sent 23:29:08 (attempt 2) | CBooking for the booking = 1, flightNumber=DRILL1 = 1 |
