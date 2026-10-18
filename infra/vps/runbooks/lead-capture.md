# Lead Capture: Site Forms and Bookings to EspoCRM (Phase 81)

## What it does

Every website enquiry and every booking becomes a Lead in EspoCRM (`https://crm.rideprestigo.com`),
assigned to the owner. Nothing the customer sees depends on the CRM: the forms and the checkout answer
the same way whether the CRM is up or down, and anything queued while it is down is delivered later,
exactly once.

```
contact / corporate / multi-day forms ──> public.inquiries ──┐  (AFTER INSERT trigger)
                                                              ├──> public.integration_outbox (ids only, no PII)
bookings (any writer, any source) ──> bookings_lead_outbox ──┘        │
                                       (trigger, migration 067)        │
                                                                       ├─ forms: publish right after the response
                                                                       ├─ bookings: kick ~90 s later
                                                                       │   (pg_net -> /api/integrations/kick)
                                                                       └─ daily sweep re-publishes anything due
                                                                                      │
                                       QStash (EU) ──> POST /api/integrations/dispatch (signature checked)
                                                                                      │
                                                         EspoCRM Lead upsert keyed on cSupabaseRef
```

- **Forms** (`/api/contact`, `/api/corporate-contact`, `/api/submit-multiday-quote`) store each submission in
  `public.inquiries`. Storage is best effort: if it fails, the customer still gets the same response.
- **Bookings** are captured by one trigger on `public.bookings`, whatever wrote them: checkout, Stripe webhook,
  quote, admin, GNet or SQL. The Lead status follows the booking: New (unpaid), In Process (pending quote),
  Converted (confirmed and later), Dead (cancelled, or unpaid past pickup). Return legs never become a Lead
  of their own.
- **Delivery** goes through `public.integration_outbox`. The dispatcher re-reads the source row at delivery
  time, so the outbox holds only ids and short codes, never a name, email or phone.
- **Daily sweep** `GET /api/cron/outbox-sweep` runs at 04:00 UTC (`vercel.json`). It marks unpaid bookings
  past pickup as Dead, queues the 90-day purge of abandoned online-checkout Leads, and re-publishes every row
  that is due.
- Each Lead is unique on `cSupabaseRef` (`inquiry:<uuid>` or `booking:<uuid>`). A unique index in the CRM
  (plan 81-08) is the last guard against duplicates.

## Configuration

Vercel, project `prestigo-site`, environment Production:

| Name | What it is |
|------|------------|
| `ESPOCRM_BASE_URL` | `https://crm.rideprestigo.com` (https only) |
| `ESPOCRM_API_KEY` | API key of the `prestigo-sync` CRM user (Sync writer role) |
| `ESPOCRM_LEAD_ASSIGNEE_ID` | EspoCRM user id new Leads are assigned to (the owner, `prestigo-admin`) |
| `OUTBOX_KICK_SECRET` | Bearer secret of `/api/integrations/kick`; must equal the Vault secret below |
| `QSTASH_URL` | `https://qstash-eu-central-1.upstash.io` (the account is in the EU region) |
| `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | Upstash Console -> QStash (EU) |
| `CRON_SECRET` | Bearer secret Vercel Cron sends to `/api/cron/outbox-sweep` |
| `NEXT_PUBLIC_SITE_URL` | `https://rideprestigo.com`, **no trailing newline or slash** |

Supabase Vault (read by the bookings trigger through `public.outbox_kick`):

| Vault name | Value |
|------------|-------|
| `outbox_kick_url` | `https://rideprestigo.com/api/integrations/kick` |
| `outbox_kick_secret` | same value as `OUTBOX_KICK_SECRET` in Vercel |

`public.integration_config`, key `lead_capture_start`: the go-live instant. Bookings created before it never
become Leads (D-21, forward-only).

A change to any Vercel variable takes effect only on the next deployment: run
`vercel redeploy <current production URL> --target production` after editing one.

## Switches

- **Pause booking capture** (forms keep working):
  `delete from public.integration_config where key = 'lead_capture_start';`
  Turn it back on with `insert into public.integration_config (key, value) values ('lead_capture_start', now()::text);`.
  This is forward-only: bookings made while it was off are not captured.
- **Pause all delivery to the CRM**: remove `ESPOCRM_API_KEY` in Vercel and redeploy. Rows keep queueing and
  wait with code `crm_unconfigured` (6 h cycles). Add the key back, redeploy, and they are delivered.
- **Stop the bookings kick only**: delete the Vault secret `outbox_kick_url`. Bookings are then delivered by
  the daily sweep instead of after ~90 s.

## Outbox status and codes

`status`: `pending` (waiting or scheduled for a retry), `processing` (claimed, lease running), `sent`,
`skipped` (nothing to do), `failed` (gave up).

| `last_error` | Meaning | What to do |
|--------------|---------|------------|
| `crm_unreachable` | Network error or timeout talking to the CRM | Nothing: it retries with backoff (60 s, 300 s, 900 s, 1 h, 3 h, 6 h, 12 h, 24 h) |
| `crm_auth` | CRM answered 401 or 403 | Check the API key and the Sync writer role; the 6 h breaker holds further calls |
| `crm_unconfigured` | `ESPOCRM_*` missing in Vercel | Set them and redeploy |
| `crm_<status>` | Any other CRM 4xx (for example `crm_400`) | The row is failed; look at the Lead mapping for that source |
| `db_error` | Supabase read or RPC failed | Retries; check Supabase status |
| `source_missing` | The inquiry or booking no longer exists | Nothing (skipped) |
| `return_leg` | Return leg of a round trip | Nothing (the outbound row owns the Lead) |
| `before_capture_start` | Booking created before `lead_capture_start` | Nothing (D-21) |
| `unmapped_status` | Booking status with no Lead status | Check `booking_lead_status()` in migration 067 |
| `purge_not_eligible`, `purge_lead_not_dead` | 90-day purge re-check said no | Nothing (skipped) |
| `unsupported_event` | Unknown event type | Code bug: report it |

A row that fails 30 times stops (`failed`). Log lines carry only the key, the outcome and the code.
`[outbox] publish failed code=publish_error status=<n>` means QStash refused the publish: `status=401` is a
wrong `QSTASH_TOKEN` or the wrong region in `QSTASH_URL`.

## Inspecting the outbox (read-only SQL)

```sql
-- What is waiting or failing, oldest first
select idempotency_key, status, attempts, last_error, available_at, updated_at
  from public.integration_outbox
 where status in ('pending', 'processing', 'failed')
 order by available_at
 limit 50;

-- Counts by status and code
select status, last_error, count(*) from public.integration_outbox group by 1, 2 order by 3 desc;

-- Is capture on, and since when?
select value from public.integration_config where key = 'lead_capture_start';
```

Check a Lead without printing personal data: `node infra/espocrm/lead-smoke.mjs show inquiry:<uuid>` or
`show booking:<uuid>`. It prints counts, status, source and booleans only.

## Re-arming stuck rows

Rows retry by themselves: wait for the backoff or for the 04:00 UTC sweep. To retry now, after fixing the
cause, clear the wait and let the next sweep (or a new form submission's publish) pick it up:

```sql
update public.integration_outbox
   set available_at = now(), last_error = null
 where status = 'pending' and last_error = 'crm_auth';
```

Never set `status` by hand to `sent`: the dispatcher's claim is the only way a row reaches `sent`.

## Rotating secrets

- **CRM API key**: generate a new key for `prestigo-sync` (Phase 80 runbook `app-deploy.md`), update
  `~/.config/prestigo/espocrm-sync.env` and `ESPOCRM_API_KEY` in Vercel, redeploy.
- **Kick secret**: generate one value (`openssl rand -hex 32`) and set it in BOTH places, Vault
  `outbox_kick_secret` (`vault.update_secret`) and Vercel `OUTBOX_KICK_SECRET`, then redeploy. Until both
  match, kicks get 401 and bookings fall back to the daily sweep (nothing is lost).
- **QStash**: rotate in Upstash Console -> QStash (EU), set the three `QSTASH_*` values in Vercel, redeploy.

## VPS-down drill

Proves that forms keep working while the CRM is down, leads queue, and they arrive exactly once after
recovery. It needs the owner's approval for exactly these two commands; nothing else runs on the VPS.

1. Probe: `curl -s -o /dev/null -w '%{http_code}' https://crm.rideprestigo.com/api/v1/App/user` returns 401.
2. D1 stop: `ssh prestigo-vps 'cd /opt/prestigo/espocrm && sudo docker compose stop app'`. The probe now returns
   000, 502 or 503. UptimeRobot reports "EspoCRM login" down: expected.
3. Submit the contact form with email `lead-smoke+81-11@rideprestigo.com`: it must answer `{"ok":true}`.
   Insert one unpaid online booking with the same email through the Supabase SQL editor.
4. Within ~4 minutes both outbox rows show `status = pending`, `attempts >= 1`, `last_error` starting `crm_`.
5. D2 start: `ssh prestigo-vps 'cd /opt/prestigo/espocrm && sudo docker compose start app'`. The probe returns 401.
   If the CRM is not back within 5 minutes, stop and fix the CRM first (the outbox keeps every lead).
6. Within ~25 minutes both rows are `sent`, and `lead-smoke.mjs show` prints `count=1` for each.
7. Clean up: delete the outbox rows, then `lead-smoke.mjs delete <ref>` for each ref, then the smoke
   inquiry and booking rows. Add a row to the log below.

### Drill log

| Date (UTC) | CRM stopped | Form submitted | First failure code | CRM started | Delivered | Leads per ref |
|------------|-------------|----------------|--------------------|-------------|-----------|---------------|
| 2026-10-18 | 15:20:00 (probe 502) | 15:20:13 `{"ok":true}`; booking inserted 15:20:18 | `crm_502` (form: 2 attempts, booking: 1 attempt while down) | 15:23:01 (probe 401 at 15:23:13) | form 15:26:26, booking 15:28:03 (3rd attempt each) | 1 and 1 |

## Go-live record (2026-10-18)

- `lead_capture_start` = `2026-10-18 12:04:03 UTC`.
- Live smokes, all cleaned up afterwards:
  - contact form: Lead New / Contact form;
  - corporate form: Lead New / Corporate form, account name set;
  - multi-day quote: Lead New / Multi-day quote;
  - unpaid booking: Lead New / Website booking, delivered ~95 s after insert through the kick, then Dead
    after cancel (same Lead).
- None of the 67 bookings created before go-live was queued.
- Found and fixed during go-live:
  - `NEXT_PUBLIC_SITE_URL` in Vercel ended with a newline, so every QStash signature failed (401); the value
    was fixed and publish/verify now trim it (PR #65).
  - QStash was never configured in production; the EU-region `QSTASH_*` values were added.
  - The Sync writer role could not assign Leads to the owner (EspoCRM 403); it now has assignment permission
    and read-only `User` (PR #67).
- Known: right after a deploy the first form submission can hit the 3 s storage timeout
  (`[inquiries] store failed code=timeout`) although the row is written; that row is delivered by the next
  sweep instead of immediately.
