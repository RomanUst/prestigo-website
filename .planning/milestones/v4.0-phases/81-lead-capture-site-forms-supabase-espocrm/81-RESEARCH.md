# Phase 81: Lead Capture (Site Forms → Supabase + EspoCRM) - Research

**Researched:** 2026-10-18
**Domain:** Durable Supabase outbox + QStash dispatcher + thin EspoCRM REST client; Lead model in EspoCRM 10.0.8; trigger-based capture of booking state; best-effort form persistence
**Confidence:** HIGH on repo facts and EspoCRM mechanics (read from the 10.0.8 tag cloned this session), MEDIUM on QStash plan limits and Postgres trigger/pg_net behaviour (docs and precedent migration 063, not exercised live), LOW on a few EspoCRM UI-level behaviours flagged `[ASSUMED]`

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Abandoned checkouts and the calculator (LEAD-04)**
- **D-01:** The "calculator email captures" part of LEAD-04 is struck. The `/calculator` page and its email capture were removed on 2026-05-04 (commit `c91be108`); nothing writes `quote_leads` any more. Update REQUIREMENTS.md LEAD-04 wording accordingly. `quote_leads` table and its purge in `reminder-24h` are left untouched in this phase.
- **D-02:** An unpaid checkout becomes a Lead immediately, at the moment the `unpaid` booking row is created at the payment step (`app/api/create-payment-intent`), not after an abandonment timer. It then follows the booking via LEAD-06 (paid → Converted).
- **D-03:** An unpaid checkout counts as abandoned (Lead → Dead) once its pickup time has passed while still unpaid. Until then the lead stays live so the owner can call or send a payment link.
- **D-04:** No notification and no EspoCRM Task for abandoned-checkout leads — they only appear in the Leads list. Existing form emails stay exactly as they are.

**Booking leads (LEAD-06)**
- **D-05:** One Lead per booking (not per customer). A repeat customer gets a new Lead for every booking. Keyed idempotently by the Supabase booking id (same key philosophy as Phase 80 D-07). — **Reversibility:** costly — Phase 85 conversion stats and Phase 82 linking build on one-lead-per-booking.
- **D-06:** Status mapping booking → Lead: `unpaid` → New; `pending` (quote request awaiting price) → In Process; `confirmed` / `assigned` / `en_route` / `on_location` / `completed` → Converted; `cancelled` → Dead (including a cancellation after payment — a cancelled paid booking moves the Lead back to Dead); `unpaid` past pickup time → Dead (D-03).
- **D-07:** ALL bookings become Leads: online site bookings (incl. round-trip and multi-day), quote requests, bookings created manually in the site admin (from WhatsApp, phone, email, etc.) and GNet bookings.
- **D-08:** Lead source: website bookings → "Website booking"; GNet → "GNet"; manual admin bookings → the channel picked in a new **"Channel" field in the admin manual-booking form** (WhatsApp / Phone / Email / Partner / Other). The channel is stored on the booking in Supabase and used as the Lead source, so Phase 85 can show conversion by channel. — **Reversibility:** costly — adds a `bookings` column via migration that stats will read.
- **D-09:** When a Lead becomes Converted, Phase 81 only updates the Lead (status + booking reference + admin deep link from Phase 80 D-18). It does NOT create a Contact/Booking or run EspoCRM lead conversion — that is Phase 82 continuous sync, which must link to these Leads without duplicates.

**Lead content and repeats (LEAD-01/02/03)**
- **D-10:** One Lead per form submission. A repeated submission from the same email creates a new Lead (no merge into an open lead).
- **D-11:** If a Contact with the same normalized email already exists in EspoCRM (e.g. from the Phase 80 backfill), the Lead is still created, visibly marked as an existing customer and pointing to that Contact. No merging — full de-dup is Phase 82.
- **D-12:** Corporate-form leads carry the company name as text only (Lead account name). No automatic Account creation or linking, even on an exact match — the owner decides at conversion (consistent with Phase 80 D-14: nothing is created in the CRM without owner confirmation).
- **D-13:** All new Leads are assigned to the owner's EspoCRM user. Re-assignment to operators happens manually once they exist.

**Retention and consent**
- **D-14:** Form inquiries (`inquiries` rows and their Leads) are kept indefinitely until an erasure request (erasure propagation is Phase 82). `inquiries` is a new table — never reuse `quote_leads` (30-day purge).
- **D-15:** Abandoned-checkout Leads (Dead via D-03) are deleted from EspoCRM 90 days after becoming Dead. The `unpaid` booking row in Supabase stays as today (admin recovery queue).
- **D-16:** Contact, corporate and multi-day quote forms get a short notice line under the submit button, no checkbox: "We store your request to reply to it — Privacy Policy" (link). New EN strings need real translations in all 7 locales (CLAUDE.md rule; translate in-session, the i18n workflow is disabled).
- **D-17:** Do not store IP address or user-agent with inquiries (data minimization; rate limit + honeypot already protect the forms).

**No-regression guarantee (LEAD-05, success criteria 5 and 7)**
- **D-18:** The customer response and the existing email path must not depend on the `inquiries` insert, the outbox insert, QStash or the VPS. A storage failure is logged and the submission still returns success with emails sent. With the VPS offline, events queue in the outbox and are delivered exactly once when it is back.

### Claude's Discretion
- Outbox schema, dispatcher and sweep design (research `.planning/research/ARCHITECTURE.md` Pattern 1 is the starting point: explicit insert via `lib/outbox.ts`, `after()` QStash publish, idempotency key unique index, claim-after-side-effect).
- Where the time-based jobs run (Dead-after-pickup transition, 90-day deletion, outbox sweep): piggy-back on an existing daily cron or add one — check the Vercel cron limit first (`lib/purge-quote-leads.ts` notes the Hobby cap of 2; `vercel.json` currently lists 3).
- Exact Lead source values for forms (e.g. "Contact form", "Corporate form", "Multi-day quote") and how the "existing customer" mark and itinerary are modelled (custom field vs description). Multi-day itinerary as readable day-by-day text + quote reference is fine.
- Channel field details: required for new manual bookings; existing manual bookings default to "Other" / unknown.
- No historical backfill of past bookings or inquiries as Leads — forward-only from deploy (forms were never stored; past bookings already exist as CBooking from Phase 80).
- Adding Lead permissions to the `prestigo-sync` "Sync writer" role (`infra/espocrm/roles.json`) and any Lead field/enum config via the Phase 80 config-as-code sync.

### Deferred Ideas (OUT OF SCOPE)
- Removing the dead `quote_leads` table and its purge from `reminder-24h` — cleanup, not chosen for this phase.
- Historical backfill of past bookings as Leads — not planned; revisit only if Phase 85 stats need it.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LEAD-01 | Contact-form submission stored in `inquiries` + email + Lead in EspoCRM | `inquiries` table + AFTER INSERT trigger → outbox (Pattern 1); best-effort store in route (Pattern 5); Lead model (Pattern 6) |
| LEAD-02 | Corporate-form submission stored + Lead with company | Same path; `accountName` = company text only (D-12); honeypot returns before any store |
| LEAD-03 | Multi-day quote stored + Lead with itinerary | `payload` jsonb keeps day list + `quoteReference`; itinerary rendered to description text by pure mapper |
| LEAD-04 | Abandoned/unpaid checkouts become Leads (calculator part struck, D-01) | `bookings` AFTER INSERT/UPDATE OF status trigger covers the `unpaid` row created in `create-payment-intent` and every later status change (Pattern 1); Dead-after-pickup + 90-day purge by set-based sweep (Pattern 7); REQUIREMENTS.md wording task |
| LEAD-05 | Storage failure never breaks the submission or the email | Never-throwing store helper, exception-safe triggers, `after()` publish guarded for non-request context (Pitfalls 1, 2, 6) |
| LEAD-06 | Every booking (all sources) is a Lead whose status follows the booking | One trigger on `bookings` (a code-path hook would need >12 sites); state-convergent dispatcher maps D-06; `lead_channel` column for D-08 (Patterns 1, 2, 6) |
</phase_requirements>

## Summary

The phase has two halves with very different risk. The **site half** (three form routes, an `inquiries` table, the D-16 notice, the admin Channel field) is small and mostly mechanical, but it must not regress today's email-only behaviour: every new call is best-effort and wrapped so nothing it does can throw into the request path. The **outbox half** (`integration_outbox`, a QStash-invoked dispatcher, a sweep, a thin EspoCRM client) is the durable core Phase 82 will extend, and its two hardest problems are (a) catching *every* booking write and (b) making delivery exactly-once while the VPS is down, retried and raced.

The decisive finding for (a): `bookings` is written from more than a dozen places (nine `.update({ status: ... })` sites in the Stripe webhook alone, plus admin POST/PATCH/cancel/assign/payment-link, GNet, submit-quote, create-payment-intent capture), and the repo already has a precedent for hooking the table instead of the call sites (`063_bookings_gcal_sync_trigger.sql`: AFTER INSERT/UPDATE trigger, SECURITY DEFINER, Vault secrets, pg_net). The ARCHITECTURE.md recommendation ("explicit insert, not trigger") was written before that precedent and before the write-path count was known. **Use an exception-safe AFTER trigger on `bookings` and on `inquiries` that inserts the outbox row in the same transaction**; keep `lib/outbox.ts` as the single TypeScript entry for publishing, sweeping and non-table events. For (b): make the outbox **PII-free and state-convergent** (the row carries only ids; the dispatcher re-reads the source row and drives the Lead to the state that row implies, so order and duplicates stop mattering), claim rows with a lease through an RPC, retry with an explicit backoff that the dispatcher itself schedules (QStash default is only 3 retries over ~33 minutes), and let a daily Vercel cron re-arm anything left behind.

Three repo facts the plan must respect: the VPS isolation guard (`tests/infra-vps-isolation-guard.test.ts`) flags any file under `app/ lib/ components/ i18n/` containing an `ESPOCRM_*` env name or a `crm.rideprestigo.com` literal **and every file that imports it**, so the EspoCRM client, the dispatch logic and the dispatch route need allowlist entries and the form routes / `lib/outbox.ts` must never import them. The Vercel cron cap quoted in `lib/purge-quote-leads.ts` ("Hobby caps at 2") is stale: all plans now allow 100 cron jobs, but Hobby still runs them only once per day with ±59 min precision. And no new npm package is needed (`lib/phone.ts` `normalizePhone` already returns strict E.164).

**Primary recommendation:** Triggers on `bookings` + `inquiries` insert PII-free rows into `integration_outbox`; a QStash-signed `/api/integrations/dispatch` claims a row via lease RPC, re-reads the source, upserts the Lead by `cSupabaseRef` (with `X-Skip-Duplicate-Check: true` on create), and on VPS failure reschedules itself with backoff; a daily `/api/cron/outbox-sweep` re-arms stragglers and runs the set-based Dead-after-pickup and 90-day purge enqueues.

## Project Constraints (from CLAUDE.md)

- Never read `.env.local`; no secrets or `.env*` in commits (pre-commit enforces). EspoCRM key for the site goes into Vercel env by the owner; the local `~/.config/prestigo/espocrm-sync.env` is for infra scripts only.
- No hard-coded `€` prices in `app/` or `components/`. Lead amount comes from `bookings.amount_eur`; the mapper lives in `lib/`.
- `middleware.ts` matcher must exclude static extensions (untouched; new routes are under `/api`, which the matcher always runs through).
- New EN strings in `messages/en.json` need real translations in all other locales; never run `scripts/i18n-translate.mjs --dry-run` on the repo tree. Precedent: commit `084b18a0` (Phase 77-05) added a namespace to all 7 catalogs plus `tests/chat-launcher-i18n.test.ts`.
- Security work (validation, outbox integrity, auth on new routes): run tests, commit with `security:` prefix.
- Tests: `npx vitest run [files]`; `vitest related` crashes (grep `tests/` instead); types `npx tsc --noEmit` (8 old errors in `tests/`); lint `npx eslint --quiet <files>`; full gate = `verify` skill.
- Vercel Preview deploys always fail (missing Supabase env): do not attempt Preview verification of the outbox; production and the Supabase MCP are the verification surfaces.
- Memory-recorded: DROP+CREATE of a SECURITY DEFINER RPC re-grants PUBLIC EXECUTE → re-REVOKE from `PUBLIC, anon, authenticated`; migration next number is **064** (063 = gcal trigger) `[VERIFIED: ls supabase/migrations → last file 063_bookings_gcal_sync_trigger.sql]`; Stripe/Supabase live actions are run via MCP or user-run scripts; SSH to the VPS needs owner allow-rules.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Persist form submissions | API / Backend (route, service-role client) | Database (`inquiries`, RLS deny-all) | Durable write before any CRM concern; D-18 forbids coupling to the response |
| Capture booking state changes | Database (AFTER trigger on `bookings`) | API (none) | Only a DB hook sees every writer (webhook, admin, GNet, SQL via MCP) |
| Queue + retry state | Database (`integration_outbox`, claim RPC) | QStash (delivery) | Postgres is the only store that survives QStash/VPS loss; QStash is just a pusher |
| Deliver to EspoCRM | API (QStash-invoked dispatcher, allowlisted) | VPS (EspoCRM) | Must be off the synchronous request path (isolation guard) |
| Time-based transitions (Dead after pickup, 90-day purge, re-arm) | API (daily Vercel cron) | Database (set-based enqueue RPC) | No request triggers them; Hobby = daily only |
| Lead model, enums, ACL | EspoCRM (config-as-code in `infra/espocrm/`) | Git JSON = source of truth | Same sync tool as Phase 80; `prestigo-sync` role gains Lead |
| Consent notice | Browser (3 form components) | i18n catalogs (7 locales) | D-16 copy + link, no checkbox |
| Channel capture (D-08) | Browser admin form → API → `bookings.lead_channel` | Database column | Stats in Phase 85 read the column |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@upstash/qstash` | 2.10.1 installed `[VERIFIED: node_modules/@upstash/qstash/package.json]` | Publish dispatch messages, verify signatures (`Receiver`), optional Schedules | Already used by `lib/qstash.ts` and `reminder-2h` |
| `@supabase/supabase-js` | ^2.101.0 `[VERIFIED: package.json:25]` | Service-role client, `.rpc()` for claim/enqueue | Existing `createSupabaseServiceClient()` |
| `next` (`after`) | 16.2.3 installed `[VERIFIED: node_modules/next/package.json]` | Post-response QStash publish | `after` already imported in 4 routes |
| `zod` | ^4.3.6 `[VERIFIED: package.json:48]` | Form schemas, dispatcher body, `lead_channel` enum | Existing route guard pattern |
| `lib/phone.ts` `normalizePhone` | repo | E.164 (strict, no guessing) | `export function normalizePhone(raw: string \| null \| undefined): string \| null` (`lib/phone.ts:67`); no libphonenumber-js needed |
| Node `fetch` | Node v24.14.1 `[VERIFIED: node --version]` | Thin EspoCRM client | Mirrors `infra/espocrm/lib/client.mjs` (redirect `error`, timeouts, redaction) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^4.1.1 `[VERIFIED: package.json:75]` | All tests | `tests/helpers/fake-espocrm.ts` (497 lines) already models API-key auth, `where equals`, `duplicateCheck`, `extraRoutes` |
| `infra/espocrm/sync.mjs` + JSON | repo (Phase 80) | Lead fields, enums, roles, link | `fields.json`/`enums.json`/`roles.json`/`entities.json` extended, not forked |
| `infra/espocrm/overlay.mjs` | repo (Phase 80) | Unique index on `Lead.cSupabaseRef` | Generalise `KEY_FIELD`/overlay path (hard-coded to `CBooking` today) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| AFTER triggers enqueue outbox rows | Explicit `enqueueOutboxEvent()` at each write site (ARCHITECTURE.md Pattern 1) | Needs hooks at >12 sites and misses SQL-side edits; a forgotten site silently loses leads. Keep the explicit TS function only for non-table events |
| Event-snapshot payload in outbox | Id-only rows + re-read at dispatch | Snapshots copy PII into a table Phase 82 erasure must then scrub, and go stale/out of order; re-read converges on current state |
| Daily Vercel cron only | QStash Schedule every 5-10 min calling the sweep | Faster safety net, but needs a human console step and consumes the 1,000 msg/day free quota (a 10-min schedule = 144/day); optional |
| Reuse `infra/espocrm/lib/client.mjs` | New `lib/espocrm-client.ts` | The infra client reads files from `~/.config`, does a token exchange and is `.mjs` outside the Next bundle; the site needs API-key only + env vars |
| `libphonenumber-js` (ARCHITECTURE.md) | existing `normalizePhone` | Project already rejects numbers without a country code; adding a dependency buys nothing for Phase 81 |

**Installation:** none. No new packages.

**Version verification:** `@upstash/qstash` 2.10.1 and `next` 16.2.3 read from `node_modules/*/package.json` this session; no registry install is proposed.

## Package Legitimacy Audit

No external packages are installed in this phase (QStash, Supabase, zod, vitest, next are existing dependencies). The `package-legitimacy` seam was not run because there is nothing new to check. If the planner adds any dev dependency (for example a Postgres test harness such as an in-process Postgres), it must go through the legitimacy gate and a `checkpoint:human-verify` first; the design below does not need one.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none new) | - | - | - | - | - | - |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 Browser ─ POST /api/contact | /api/corporate-contact | /api/submit-multiday-quote
    │      (guards: size → rate limit → zod → [honeypot] unchanged)
    ▼
 route ──► storeInquiry()  never throws, own 3 s timeout ──► Supabase `inquiries` INSERT ─┐
    │         (client is built INSIDE the try)                                            │ AFTER INSERT trigger
    ├──► existing email send (unchanged order/behaviour)                                  ▼  (exception-safe)
    ▼                                                                          integration_outbox row  (ids only, PII-free)
 response 200/ok  ◄── never depends on the store ─────────────────────────────┐          │
    │ after(): publishOutboxDispatch(key)  (QStash publish, try/catch, may no-op)          │
                                                                                           │
 Stripe webhook / create-payment-intent / admin / GNet / submit-quote ... any bookings write
    └─► `bookings` AFTER INSERT | UPDATE OF status trigger (exception-safe) ──────────────┤
          maps booking.status → lead status in SQL; emits only when it changes;           │
          skips rows older than lead_capture_start; available_at = now()+90 s               │
          └─► pg_net kick (Vault url+secret) ─► /api/integrations/kick ─► QStash publish ──┤
                                                                                           ▼
                                   QStash ─ signed POST ─► /api/integrations/dispatch   (allowlisted, VPS-aware)
                                        1 verify Upstash-Signature over raw body
                                        2 outbox_claim(key, lease)  (atomic; one in-flight per aggregate)
                                        3 re-read inquiry|booking (service role); gone → status `skipped`
                                        4 map → desired Lead state (pure fn, tested)
                                        5 GET /Lead by cSupabaseRef ─► POST (create, X-Skip-Duplicate-Check) | PUT (sync-owned fields only)
                                           GET /Contact by normalized email ─► existing-customer flag + link
                                        6 ok → outbox_complete(sent)   VPS down/5xx/timeout → attempts++, next_attempt_at=backoff,
                                          republish with delay, return 200   4xx → failed (code only, no PII)   401/403 → breaker, 6 h
                                                                                           │
 Vercel cron daily ─► /api/cron/outbox-sweep (CRON_SECRET) ─► re-arm pending/stale-lease rows (publish)
                         ├─ RPC: enqueue Dead for `unpaid` past pickup (set-based, anti-join on key)
                         └─ RPC: enqueue 90-day purge for online `unpaid` past pickup + 90 d
```

### Recommended Project Structure
```
supabase/migrations/
├── 064_integration_outbox.sql        # outbox, integration_config, outbox_* RPCs, grants/RLS
├── 065_inquiries.sql                 # inquiries + AFTER INSERT trigger
└── 066_bookings_lead_channel_trigger.sql  # bookings.lead_channel, booking_lead_status(), trigger, pg_net kick
lib/
├── outbox.ts                 # single TS entry: publishOutboxDispatch(), enqueueOutboxEvent() (RPC), sweep helpers. NO EspoCRM import
├── outbox-backoff.ts         # pure: nextAttemptDelay(attempts), isTerminal(attempts)
├── inquiries.ts              # storeInquiry(kind, data): Promise<void> — never throws
├── lead-mapping.ts           # pure: bookingLeadStatus(), leadSourceFor(), buildLeadFromBooking/Inquiry(), splitName(), itineraryText()
├── espocrm-client.ts         # ALLOWLISTED. API-key client, only file with ESPOCRM_* names
└── lead-sync.ts              # ALLOWLISTED. dispatchOutboxKey(): claim → read → map → upsert → complete
app/api/integrations/
├── dispatch/route.ts         # ALLOWLISTED. QStash Receiver, calls lead-sync
└── kick/route.ts             # Bearer secret (pg_net), calls lib/outbox.publishOutboxDispatch only
app/api/cron/outbox-sweep/route.ts   # CRON_SECRET guard (copy of reminder-24h guard), imports lib/outbox only
infra/espocrm/{fields,enums,roles,entities}.json   # + Lead fields, source values, Sync writer Lead scope, Lead→Contact link
infra/espocrm/overlay.mjs (+ overlay/Lead.entityDefs.json)   # generalised for Lead.cSupabaseRef unique index
components/admin/ManualBookingForm.tsx, app/api/admin/bookings/route.ts   # Channel (D-08)
components/ContactForm.tsx, app/[locale]/corporate/CorporateForm.tsx, components/booking/MultiDayForm.tsx  # D-16 notice
```

### Pattern 1: Transactional enqueue by AFTER trigger (PII-free, exception-safe)
**What:** `AFTER INSERT` on `inquiries`; `AFTER INSERT OR UPDATE OF status` on `bookings` (with `WHEN`/early-return so only a *lead-status change* enqueues). The function maps `bookings.status` to a lead status in SQL (`booking_lead_status()`), skips rows with `created_at < lead_capture_start`, and calls `outbox_enqueue(event_type, aggregate_type, aggregate_id, key, available_at)` which does `INSERT … ON CONFLICT (idempotency_key) DO NOTHING`.
**Why trigger:** 063 is the repo precedent (`CREATE TRIGGER bookings_gcal_sync AFTER INSERT OR UPDATE OF status, … ON public.bookings … EXECUTE FUNCTION public.notify_booking_gcal_sync()`), and the writer count is high (grep: nine `update({ status: … })` sites in `app/api/webhooks/stripe/route.ts` alone, plus `app/api/admin/bookings/**`, `app/api/gnet/farmin`, `lib/supabase.ts` capture/reconcile helpers).
**Non-negotiable:** the whole body sits in a `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING … END;` sub-block. A trigger that raises aborts the *booking* write, which would turn a lead-capture bug into a lost booking (violates D-18 / LEAD-05).
**Keys:** `lead.inquiry:{inquiry_id}`; `lead.booking:{booking_id}:{new|in_process|converted|dead}`; `lead.purge:{booking_id}`. Booking statuses never cycle (`VALID_TRANSITIONS` is acyclic), so per-lead-status keys cannot be wrongly suppressed.
**Kick:** after enqueue, a second exception-guarded block calls pg_net to `/api/integrations/kick` using Vault secrets (`outbox_kick_url`, `outbox_kick_secret`), exactly as `gcal_sync_post` reads `vault.decrypted_secrets`; missing secrets = no-op (sweep still delivers).

### Pattern 2: State-convergent dispatcher (re-read, don't replay)
**What:** The outbox row says "something about aggregate X changed". The dispatcher reads X now and computes the *desired* Lead (status via D-06 from the current booking status, plus D-03: `unpaid` and `pickup_utc < now()` → Dead), then upserts. Applying `new` after `converted` is harmless because both compute from the current row.
**Rules:**
1. Lookup: `GET /Lead?where[0][type]=equals&where[0][attribute]=cSupabaseRef&where[0][value]=booking:<uuid>&select=id,status&maxSize=2`. Found → `PUT` only sync-owned fields (status, `opportunityAmount`, `cBookingReference`, `cAdminLink`, existing-customer fields when unset); skip the PUT when nothing differs. Not found → `POST` with header `X-Skip-Duplicate-Check: true` (D-10: same email must create a new Lead; without the header EspoCRM answers 409).
2. `description`, `assignedUserId` and names are written **only on create** (owner edits and manual re-assignment survive; mirrors the Phase 80 field-ownership matrix).
3. Existing customer (D-11): `GET /Contact?where[0][type]=equals&where[0][attribute]=emailAddress&where[0][value]=<normalized>&select=id&maxSize=1`; hit → set `cExistingCustomer=true` and link `cExistingContactId`. Never block on this lookup: failure → create without the mark and retry the mark on the next sync.
4. Placeholder identities are not identities: `client_email` ending `@gnet.local` and `client_phone` that `normalizePhone` rejects (`'unknown'`) are omitted from the Lead and never used for the Contact match.
5. Source row missing (GNet inserts then deletes duplicates, `app/api/gnet/farmin/route.ts:455,461,485`): outbox row → `skipped` (`source_missing`), no Lead.
6. Purge event: re-read; delete only if the booking is still `unpaid`, `booking_source = 'online'` and pickup older than 90 days; `404` from EspoCRM = success.

### Pattern 3: Lease claim + per-aggregate mutex (RPC)
`outbox_claim(p_key text, p_lease_seconds int)` runs one `UPDATE … SET status='processing', lease_until=now()+…, attempts=attempts+1 … WHERE idempotency_key=p_key AND available_at<=now() AND (status='pending' OR (status='processing' AND lease_until<now())) AND NOT EXISTS (other row, same aggregate, status='processing' AND lease_until>now()) RETURNING *`. No row returned → respond `200 {deferred|already_done}`. This is *claim-before-side-effect with a lease* (the ARCHITECTURE.md text says claim-after); it is required because two rows for one booking (`new`, `converted` within the 90 s settle window) can otherwise run concurrently and both create the Lead. Completion is `outbox_complete(p_key, p_status, p_error_code)` guarded by `status='processing'`. The EspoCRM unique index (Pattern 6) is defence in depth, not the primary guard.

### Pattern 4: VPS-down behaviour (success criterion 7)
- Transient (network error, timeout, 5xx, 429): `attempts` already incremented by the claim; set `status='pending'`, `available_at = now() + backoff(attempts)`, publish a delayed QStash message (`delay` seconds) and **return 200** so QStash does not also retry. Backoff `[60, 300, 900, 3600, 10800, 21600, 43200, 86400]` seconds then 86400 repeating; terminal `failed` after 30 attempts (≈ 4 weeks). QStash free max delay is 7 days `[CITED: upstash.com/pricing/qstash]`, so the 24 h cap is safe.
- Why not rely on QStash retries: default is 3 retries with delay `min(86400, e^(2.5n))` s ≈ 12 s, 2.5 min, 30 min `[CITED: upstash.com/docs/qstash/features/retry]`; a multi-hour VPS outage exhausts them and the DLQ keeps messages only 3 days on the free plan `[CITED: upstash.com/pricing/qstash]`. The outbox row is the source of truth; QStash is the pusher.
- Permanent (4xx other than 401/403/404-on-PUT/409): `failed` with a short code (`crm_400`), never the response body (may contain PII).
- Auth failure (401/403): EspoCRM bans an IP after repeated failed logins (Phase 80 README: "Never retry after a 401"). Treat as a circuit breaker: leave the row `pending` with `available_at = now() + 6 h`, store `crm_auth`, and do not touch other rows in that invocation.
- Safety net: daily sweep re-publishes rows `pending` with `available_at <= now()` and rows `processing` with an expired lease.

### Pattern 5: Form routes (LEAD-05)
Keep the guard order (size → rate limit → zod → honeypot) and the email calls exactly as they are. Add one call: `await storeInquiry('contact', parsed.data)` (or `Promise.all` with the email so latency is max, not sum). `storeInquiry` builds the Supabase client **inside** its own `try`, races a 3 s timeout, logs a PII-free line (`[inquiries] store failed code=…`) and returns. Then `after(() => publishOutboxDispatch(key))` in a `try/catch`: outside a request scope `after()` throws in unit tests (existing tests mock `next/server` `after` as `(fn) => { try { void fn() } catch {} }`, `tests/webhooks-stripe.test.ts:19`), so the helper must tolerate that. Corporate keeps the honeypot early-return *before* any store. Do not store IP/UA (D-17).

### Pattern 6: EspoCRM Lead model (config-as-code, Phase 80 sync)
- **Source enum** (`Lead.source`, stock values `"", Call, Email, Existing Customer, Partner, Public Relations, Web Site, Campaign, Other`): merge in `Website booking`, `GNet`, `Contact form`, `Corporate form`, `Multi-day quote`, `WhatsApp`, `Phone`. D-08 channel → source: WhatsApp→`WhatsApp`, Phone→`Phone`, Email→`Email`, Partner→`Partner`, Other (and null)→`Other`. `enums.json` entry with empty `retire` (merge never deletes).
- **Custom Lead fields** (stock scope → names get the lowercase `c` prefix, `FieldManager::create` adds it): `cSupabaseRef` varchar(80) required (`booking:<uuid>` | `inquiry:<uuid>`, idempotency key, Phase 82 joins on it), `cBookingReference` varchar, `cAdminLink` url (reuse `buildAdminLink` format `https://rideprestigo.com/admin/bookings?search=<ref>`, `infra/espocrm/lib/booking-map.mjs:215-217`), `cExistingCustomer` bool, link `existingContact` Lead→Contact many-to-one (both sides stock → both get the `c` prefix) `[ASSUMED: confirm resulting names with sync --dry-run + fake]`.
- **Stock fields used:** `firstName`, `lastName`, `emailAddress`, `phoneNumber`, `accountName`, `description`, `status`, `source`, `assignedUser`, `opportunityAmount` (+ `opportunityAmountCurrency` `EUR`).
- **Name rule:** mirror Phase 80 (`infra/espocrm/lib/booking-map.mjs:277-279`): `lastName = last || first || emailLocalPart`. Contact form `name` is one field: split at the first space; single token → lastName.
- **Roles:** add to `Sync writer`: `"Lead": { "create": "yes", "read": "all", "edit": "all", "delete": "all" }` (delete needed for D-15). `Contact` read is already present. Dispatcher: `"Lead": false`; Sales manager: full Lead (D-15 does not name Leads; confirm with owner, Open Question 6).
- **Unique index (recommended, owner-approved VPS step like D-19):** `custom/Espo/Custom/Resources/metadata/entityDefs/Lead.json` with `indexes.cSupabaseRefDeleteId` unique on `["cSupabaseRef","deleteId"]` and `"deleteId": true`, applied with the generalised `overlay.mjs` (`merge`/`precheck`/`rebuild`/`probe-unique`). `[ASSUMED]` that adding `deleteId` to the stock `lead` table rebuilds cleanly; `probe-unique` is the live check.
- **Assignee:** `assignedUserId` = owner's EspoCRM user id from a Vercel env var; add an `inspect.mjs` subcommand (admin identity) that prints the id. API-user assignment is not blocked by the assignment permission (`Core/Acl/AssignmentChecker/Helper.php:94`: `if ($assignmentPermission === Table::LEVEL_NO && !$user->isApi())`).
- **Lists:** the stock "Actual" primary filter hides Converted/Recycled/Dead (`notActualOptions` in `Lead.json:56`), which keeps the Leads list usable although every booking is a Lead (D-07).

### Pattern 7: Time-based jobs on one daily cron
New `vercel.json` entry `/api/cron/outbox-sweep` (limit is 100 per project on every plan, Hobby = once per day `[CITED: vercel.com/docs/cron-jobs/usage-and-pricing]`; the "cap of 2" comment in `lib/purge-quote-leads.ts` is outdated; `reminder-24h` needs no change). The route (CRON_SECRET guard copied from `reminder-24h/route.ts:11-21`, timing-safe) does: (1) republish due `pending` and stale `processing` rows; (2) `outbox_enqueue_expired_unpaid()` — one set-based `INSERT … SELECT` of key `lead.booking:{id}:dead` for `status='unpaid' AND pickup_utc < now() AND created_at >= lead_capture_start` with `NOT EXISTS` on the key; (3) `outbox_enqueue_abandoned_purge()` — key `lead.purge:{id}` for `booking_source='online' AND status='unpaid' AND pickup_utc < now() - interval '90 days'`. Dead may therefore lag pickup by up to ~25 h; acceptable for a CRM status (D-03 states no latency).

### Anti-Patterns to Avoid
- **Hooking only some write sites** — the first forgotten path silently drops leads. Use the trigger.
- **Letting the trigger raise** — aborts the booking INSERT/UPDATE.
- **PII in `integration_outbox` or `last_error`** — copy of PII defeats Phase 82 erasure; store ids and error *codes* only.
- **Importing `lib/lead-sync.ts` / `lib/espocrm-client.ts` from a route that runs on a user request** — fails `tests/infra-vps-isolation-guard.test.ts` by BFS over importers.
- **Relying on EspoCRM email duplicate detection for idempotency** — D-10 requires duplicates by email; idempotency is `cSupabaseRef`.
- **Retrying on 401** — IP ban risk.
- **Re-asserting Lead status on unrelated events** — owner moves (Recycled, In Process) must survive; only write `status` when the desired lead status changes.
- **Reusing `quote_leads`** — Anti-Pattern 4 in ARCHITECTURE.md; D-14.

## Verified Values (in-repo and source-of-truth quotes)

| Value | Source (read this session) | Verbatim |
|-------|---------------------------|----------|
| Booking statuses | `supabase/migrations/053_unpaid_booking_status.sql:21-29` `[VERIFIED]` | `CHECK (status IN (` … `'unpaid',` `'pending',` `'confirmed',` `'completed',` `'cancelled',` `'assigned',` `'en_route',` `'on_location'` `))` |
| `booking_source` | `supabase/migrations/039_gnet_bookings.sql:17` `[VERIFIED]` | `CHECK (booking_source IN ('online', 'manual', 'gnet'));` |
| Status graph is acyclic | `lib/booking-transitions.ts:11-20` `[VERIFIED]` | `unpaid:      ['confirmed', 'cancelled'],` `pending:     ['confirmed', 'cancelled'],` `confirmed:   ['assigned', 'completed', 'cancelled'],` … `completed:   [],` `cancelled:   [],` |
| Existing bookings trigger precedent | `supabase/migrations/063_bookings_gcal_sync_trigger.sql:88-96` `[VERIFIED]` | `CREATE TRIGGER bookings_gcal_sync` `AFTER INSERT OR UPDATE OF` `status, pickup_utc, …` `ON public.bookings` `FOR EACH ROW` `EXECUTE FUNCTION public.notify_booking_gcal_sync();` |
| Revoke pattern | `063_bookings_gcal_sync_trigger.sql` (REVOKE lines) `[VERIFIED]` | `REVOKE EXECUTE ON FUNCTION public.gcal_sync_post(uuid) FROM PUBLIC, anon, authenticated;` |
| `lead` status enum | espocrm@10.0.8 `Modules/Crm/Resources/metadata/entityDefs/Lead.json:29-56` `[VERIFIED]` | `"New", "Assigned", "In Process", "Converted", "Recycled", "Dead"`, `"default": "New"`, `"notActualOptions": ["Converted", "Recycled", "Dead"]` |
| `lead` source enum | same file `:59-70` `[VERIFIED]` | `"", "Call", "Email", "Existing Customer", "Partner", "Public Relations", "Web Site", "Campaign", "Other"` |
| Lead scope flags | `Modules/Crm/Resources/metadata/scopes/Lead.json` `[VERIFIED]` | `"statusFieldLocked": true,` `"duplicateCheckFieldList": ["name", "emailAddress"]` (`statusFieldLocked` only strips `statusField` in Entity Manager: `Tools/EntityManager/EntityManager.php:390`; it does not block API status writes) |
| Skip duplicate header | `Core/Record/CreateParamsFetcher.php:42-44` `[VERIFIED]` | `$request->hasHeader('X-Skip-Duplicate-Check') ?` `strtolower($request->getHeader('X-Skip-Duplicate-Check') ?? '') === 'true' :` |
| Converted sets `convertedAt` | `Modules/Crm/Hooks/Lead/ConvertedAt.php` `[VERIFIED]` | `if ($entity->getStatus() !== Lead::STATUS_CONVERTED) { return; }` then `setValueObject('convertedAt', DateTime::createNow())` (a plain `PUT status=Converted` works, no conversion action needed: D-09) |
| Assignment mail/notification defaults | `Resources/defaults/config.php:177-179` `[VERIFIED]` | `'assignmentEmailNotifications' => false,` `'assignmentEmailNotificationsEntityList' => ['Lead', 'Opportunity', 'Task', 'Case'],` `'assignmentNotificationsEntityList' => ['Meeting', 'Call', 'Email'],` (live instance values not read: check, Open Question 4) |
| Sync writer today | `infra/espocrm/roles.json:35-41` `[VERIFIED]` | `"name": "Sync writer"` … `"Account"`, `"Contact"`, `"CBooking"` (no `Lead`), `"assignTo": ["prestigo-sync"]` |
| Vercel crons now | `vercel.json` `[VERIFIED]` | `/api/cron/flight-refresh` `0 5 * * *`; `/api/cron/reminder-24h` `0 6 * * *`; `/api/cron/indexnow` `0 7 * * *` |
| Isolation guard regexes | `tests/infra-vps-isolation-guard.test.ts:30,34` `[VERIFIED]` | `/\b(?:chat|crm)\.rideprestigo\.com\b/i` and `/(?:CHATWOOT|ESPOCRM)_[A-Z0-9_]+/`; allowlist `const VPS_ASYNC_ALLOWLIST: AllowlistEntry[] = [` at `:88` (reason ≥ 20 chars) |
| QStash SDK options | `node_modules/@upstash/qstash/client-CsM1dTnz.d.ts:2178,2204,2265` `[VERIFIED]` | `deduplicationId?: string;` `retries?: number;` (`@default 3`) `flowControl?: FlowControl;`; `class Schedules { create(request: CreateScheduleRequest) … }` at `:1316` |
| GNet placeholders | `app/api/gnet/farmin/route.ts:426-427` `[VERIFIED]` | `client_email:        firstPassenger?.email \|\| 'noreply@gnet.local',` `client_phone:        firstPassenger?.phoneNumber \|\| 'unknown',` |
| Unpaid row creation (D-02 hook) | `app/api/create-payment-intent/route.ts:391` `[VERIFIED]` | `if (bookingData.attemptId) {` → `captureUnpaidBooking(...)` / else `saveBooking(unpaidRow)` |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Message delivery + signature check | Custom queue/HMAC | QStash `publishJSON` + `Receiver.verify` (pattern in `reminder-2h/route.ts:12-39`) | Existing, tested pattern; read body as text before verify |
| Capturing all booking writes | Per-call hooks | AFTER trigger (063 precedent) | One definition, covers SQL-side edits |
| Phone normalization | libphonenumber or regex | `lib/phone.ts` `normalizePhone` | Already strict E.164, Unicode-digit aware |
| EspoCRM schema (fields/enums/roles/link) | Raw SQL/UI clicks | `infra/espocrm/sync.mjs` JSON specs with merge-safe enums | Idempotent, tested, `create=0 update=0` on rerun |
| Unique-index on Lead | SQL on MariaDB | `overlay.mjs` generalised | Same mechanism as `CBooking`, no raw SQL |
| Cron auth | New scheme | `CRON_SECRET` timing-safe check from `reminder-24h` | Fail-closed, SEC-14 |
| Rate limiting forms | New limiter | existing `checkRateLimit` calls | Unchanged by this phase |
| Idempotent upsert across systems | Email-based matching | `cSupabaseRef` lookup | D-10 allows duplicate emails |

**Key insight:** every behaviour in D-01..D-18 is a combination of existing primitives; the only genuinely new code is the SQL (outbox + triggers + RPCs), the pure Lead mapper, the dispatcher control flow and a ~100-line API-key client.

## Common Pitfalls

### Pitfall 1: A trigger failure aborts the booking
**What goes wrong:** the outbox insert (missing table in an environment, permission, constraint) raises inside an AFTER trigger and the original `bookings` INSERT/UPDATE rolls back; the customer paid but the webhook cannot reconcile.
**How to avoid:** exception sub-block in every trigger function; migration test asserts `EXCEPTION WHEN OTHERS` is present in each trigger function body. Apply migrations in order (064 before 066).
**Warning signs:** `WARNING: enqueue_booking_lead failed` in Supabase logs.

### Pitfall 2: Storage failure leaks into the response
**What goes wrong:** `createSupabaseServiceClient()` throws on missing env *at construction*; if it is outside the `try`, existing route tests (which mock only rate-limit and email) and any env-less environment fail with 500.
**How to avoid:** `storeInquiry` constructs inside `try`; a unit test makes the Supabase mock throw and asserts status 200 + email mock called once. Existing tests `tests/corporate-contact.test.ts`, `tests/submit-multiday-quote.test.ts`, `tests/contact-form.test.tsx` stay green because the helper never throws.

### Pitfall 3: Concurrent dispatch creates two Leads
**What goes wrong:** `new` and `converted` rows for one booking become due together (payment within the 90 s settle window); two invocations both see "no Lead" and both POST.
**How to avoid:** lease claim with per-aggregate mutex (Pattern 3) + optional unique index. Test: two concurrent `dispatch` calls against the fake produce one Lead.

### Pitfall 4: Forward-only breaks on old bookings
**What goes wrong:** "no historical backfill" (CONTEXT) is violated by status changes on pre-deploy bookings: `confirmed → cancelled` on an old booking emits `dead` and the dispatcher would create a Dead Lead; an old `unpaid` later paid creates a Converted Lead.
**How to avoid:** `integration_config('lead_capture_start')` seeded `now()` by the migration; trigger and set-based RPCs ignore `bookings.created_at < lead_capture_start`. Decide explicitly (Open Question 3) whether a pre-deploy `unpaid` that is paid later should become a Lead (default: no).

### Pitfall 5: GNet duplicates create ghost Leads
`app/api/gnet/farmin/route.ts` inserts a booking, then deletes it on a duplicate `transaction_id` (lines 455-500). Placeholder identity `noreply@gnet.local` / `'unknown'` must not become the Lead's email/phone or an "existing customer" match. **How to avoid:** `available_at = now() + 90 s` settle delay; dispatcher `skipped` on missing source; placeholder filter (Pattern 2 rule 4).

### Pitfall 6: `after()` outside a request
Unit tests call route handlers with a plain `Request`; real `after` throws there. **How to avoid:** `publishOutboxDispatch` is called inside `try { after(...) } catch { /* publish skipped; sweep will re-arm */ }` or the test mocks `next/server` like the existing ones.

### Pitfall 7: Isolation guard fails the build
Any `ESPOCRM_*` token or `crm.rideprestigo.com` literal outside allowlisted files, or an import of an allowlisted file from a non-allowlisted one, fails `has zero violations on the real tree`. **How to avoid:** env names live only in `lib/espocrm-client.ts`; allowlist `lib/espocrm-client.ts`, `lib/lead-sync.ts`, `app/api/integrations/dispatch/route.ts` with reasons naming "QStash-invoked outbox dispatcher, never on a request path"; `lib/outbox.ts`, `lib/inquiries.ts`, the form routes, `kick` and `outbox-sweep` import none of them. Do not use env names matching `CHATWOOT_`/`ESPOCRM_` outside the allowlist, and do not read them in `lib/outbox.ts`.

### Pitfall 8: Retry storms and EspoCRM IP ban
Wrong/rotated API key → every dispatch is a failed login → ban of the Vercel egress IP (shared with other tenants). **How to avoid:** the 401/403 breaker (Pattern 4); one 401 per invocation at most; `redirect: 'error'`; 10 s timeout per request.

### Pitfall 9: PII in logs / errors
EspoCRM 409 bodies include duplicate records; query strings hold emails. **How to avoid:** log `status` + code only; client redacts and truncates like `infra/espocrm/lib/client.mjs`; `last_error` holds a code (`crm_unreachable`, `crm_400`, `crm_auth`, `source_missing`).

### Pitfall 10: Round-trip and quote rows
A round trip is two `bookings` rows (`leg` outbound/return, `linked_booking_id`), each with its own booking reference; D-05 keys by booking id so the literal result is two Leads per round trip. Phase 85 must dedupe via `linked_booking_id` (mention it in the Lead description). See Open Question 1.

### Pitfall 11: Capture retries mutate the unpaid row
`captureUnpaidBooking` updates the same row in place on every checkout retry (new `booking_reference`, amounts). No new insert → no new Lead, but the Lead's reference/amount go stale until the next lead-status change. Acceptable; `Converted` re-reads and refreshes the sync-owned fields.

### Pitfall 12: Existing tests and new required admin field
Making `channel` required on `manualBookingSchema` (`app/api/admin/bookings/route.ts:871`) breaks fixtures in `tests/admin-bookings*.test.ts`; update fixtures in the same plan. The admin UI is English-only (labels such as `BOOKING STATUS` are literals), so the Channel label needs no i18n.

### Pitfall 13: Assignment/stream notifications (D-04)
`assignmentEmailNotifications` defaults to false and Lead is not in `assignmentNotificationsEntityList`, but an assigned user follows the record and may see in-app stream notifications for status changes `[ASSUMED]`. Verify the live Settings values and watch the bell after the first batch; mitigation is a per-user preference, not code.

## Code Examples

### Outbox core (migration 064, sketch)
```sql
-- Source: pattern from 063_bookings_gcal_sync_trigger.sql + this research
create table public.integration_outbox (
  id              uuid primary key default gen_random_uuid(),
  event_type      text not null,                      -- lead.inquiry | lead.booking | lead.purge
  aggregate_type  text not null,                      -- inquiry | booking
  aggregate_id    uuid not null,
  idempotency_key text not null,
  status          text not null default 'pending'
                  check (status in ('pending','processing','sent','skipped','failed')),
  attempts        int  not null default 0,
  available_at    timestamptz not null default now(),
  lease_until     timestamptz,
  last_error      text,                               -- short code only, never a body
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create unique index integration_outbox_key_idx on public.integration_outbox (idempotency_key);
create index integration_outbox_due_idx on public.integration_outbox (available_at) where status in ('pending','processing');
create index integration_outbox_agg_idx on public.integration_outbox (aggregate_type, aggregate_id);
alter table public.integration_outbox enable row level security;   -- no policy = deny-all; service role bypasses
create table public.integration_config (key text primary key, value text not null);
alter table public.integration_config enable row level security;
insert into public.integration_config values ('lead_capture_start', now()::text);
-- every SECURITY DEFINER fn: set search_path = '' ; then
-- revoke execute on function public.outbox_claim(text,int), ... from public, anon, authenticated;
-- grant execute on function ... to service_role;
```

### Booking trigger (migration 066, sketch)
```sql
create or replace function public.booking_lead_status(p_status text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_status = 'unpaid'  then 'new'
    when p_status = 'pending' then 'in_process'
    when p_status in ('confirmed','assigned','en_route','on_location','completed') then 'converted'
    when p_status = 'cancelled' then 'dead' end $$;

create or replace function public.enqueue_booking_lead() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_new text; v_start timestamptz;
begin
  begin                                              -- NEVER let this abort the booking write
    v_new := public.booking_lead_status(NEW.status);
    if v_new is null then return NEW; end if;
    if TG_OP = 'UPDATE' and v_new is not distinct from public.booking_lead_status(OLD.status) then return NEW; end if;
    select value::timestamptz into v_start from public.integration_config where key = 'lead_capture_start';
    if v_start is not null and NEW.created_at < v_start then return NEW; end if;
    perform public.outbox_enqueue('lead.booking','booking',NEW.id,
            'lead.booking:'||NEW.id||':'||v_new, now() + interval '90 seconds');
  exception when others then
    raise warning 'enqueue_booking_lead failed: %', sqlerrm;
  end;
  return NEW;
end $$;

create trigger bookings_lead_outbox after insert or update of status on public.bookings
  for each row execute function public.enqueue_booking_lead();
```
The TS mapper `bookingLeadStatus()` must equal this SQL; pin both with a parity test that parses the migration file (Validation Architecture).

### Never-throwing store (route side)
```ts
// lib/inquiries.ts — no EspoCRM import
export async function storeInquiry(kind: 'contact'|'corporate'|'multiday_quote', data: InquiryInput): Promise<string | null> {
  try {
    const supabase = createSupabaseServiceClient()                    // constructed inside the try (Pitfall 2)
    const res = await Promise.race([
      supabase.from('inquiries').insert([toRow(kind, data)]).select('id').single(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
    ])
    if (res.error) throw new Error(res.error.code ?? 'insert_failed')
    return res.data.id                                                // key = `lead.inquiry:${id}`
  } catch (e) {
    console.error('[inquiries] store failed', e instanceof Error ? e.message : 'unknown')   // no payload
    return null
  }
}
```

### QStash-signed dispatcher skeleton
```ts
// app/api/integrations/dispatch/route.ts  (allowlisted)
const body = z.object({ key: z.string().min(1).max(120) }).strict()
export const maxDuration = 60
export async function POST(request: Request) {
  const sizeError = enforceMaxBody(request, 1024); if (sizeError) return sizeError
  const raw = await request.text()                                    // text BEFORE verify (reminder-2h pattern)
  const ok = await getReceiver().verify({ signature: request.headers.get('Upstash-Signature') ?? '', body: raw }).catch(() => false)
  if (!ok) return new Response('Unauthorized', { status: 401 })
  const parsed = body.safeParse(JSON.parse(raw)); if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  return NextResponse.json(await dispatchOutboxKey(parsed.data.key))  // always 200 for business outcomes
}
```

### Create vs update (Lead upsert, headers)
```ts
// Source: espocrm@10.0.8 Core/Record/CreateParamsFetcher.php:42-44
await crm.post('/Lead', payload, { 'X-Skip-Duplicate-Check': 'true' })        // D-10: same email → new Lead
await crm.put(`/Lead/${id}`, syncOwnedFieldsOnly(desired))                      // never description/assignee/names
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| "Hobby caps cron jobs at 2" (`lib/purge-quote-leads.ts`) | 100 cron jobs per project on every plan; Hobby = daily only, ±59 min | Vercel changelog "Cron jobs now support 100 per project on every plan" | A dedicated sweep cron is allowed; sub-daily frequency still needs Pro or a QStash Schedule |
| Explicit outbox insert at call sites (ARCHITECTURE.md, 2026-09-27) | AFTER trigger enqueue (repo precedent 063, 2026-10) | This research | Coverage of every writer |
| Claim-after-side-effect (Stripe webhook idiom) | Lease claim + convergent upsert | This research | Safe under concurrent delivery |

**Deprecated/outdated:** the `.planning/codebase/` snapshot; the comment in `lib/purge-quote-leads.ts` about the cron cap (comment only, file otherwise untouched per D-01).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vercel project is on the Hobby plan (daily cron only) | Pattern 7 | If Pro, the sweep can run every few minutes; design still correct |
| A2 | `GET /Contact?where[0][type]=equals&where[0][attribute]=emailAddress&where[0][value]=…` returns exact email matches | Pattern 2 | Existing-customer mark silently never set; verify with a live probe (cited only from forum.espocrm.com thread 79743) |
| A3 | Adding `deleteId` + unique index via custom `entityDefs/Lead.json` rebuilds cleanly on the stock `lead` table | Pattern 6 | Rebuild error on the VPS; fall back to mutex-only (still correct) |
| A4 | Both sides of a Lead→Contact custom link get the `c` prefix (`cExistingContact` / `cExistingLeads`) | Pattern 6 | Wrong field name in payload; check via sync dry-run and live `GET /Metadata` |
| A5 | Live EspoCRM `assignmentEmailNotifications` is still the default `false`; assignment of a Lead to the owner sends no email | Pitfall 13 | Owner gets one email per lead; flip in Settings |
| A6 | Assigned-user auto-follow does not flood the bell with status-change notifications | Pitfall 13 | Notification noise (D-04 intent); per-user preference |
| A7 | pg_net request is queued at COMMIT (no call when the transaction aborts), as 063 relies on | Pattern 1 | Kick for rows that never committed; harmless (dispatcher finds no row) |
| A8 | QStash free quota (1,000 msgs/day, max delay 7 d, DLQ 3 d) applies to this account | Pattern 4 | Backoff messages throttled; sweep still re-arms |
| A9 | Lead `source` custom values can be merged through the Phase 80 enum sync despite `customizationOptionsReferenceDisabled` | Pattern 6 | Use field-manager PUT directly; test with the fake first |
| A10 | `opportunityAmount`/`opportunityAmountCurrency` accept EUR on Lead with `defaultCurrency` EUR (Phase 80 `settings.json`) | Pattern 6 | Amount missing; put amount into description instead |

## Open Questions

1. **Round trips: two Leads or one?**
   - Known: D-05 keys by booking id; a round trip is two rows with two references (`leg`, `linked_booking_id`).
   - Unclear: owner expectation and Phase 85 counting.
   - Recommendation: literal D-05 (two Leads, each mentions its linked reference); Phase 85 dedupes by `linked_booking_id`. Cheap to switch (dispatcher-level `skipped` for `leg='return'`).
2. **Which unpaid Leads are deleted at 90 days (D-15)?**
   - Known: D-03/D-15 speak of "unpaid checkout"; manual admin bookings and payment-link bookings are also `unpaid`.
   - Recommendation: purge only `booking_source='online'` (true checkout abandonment, matches the Phase 80 abandoned predicate); manual/payment-link unpaid go Dead at pickup but stay. Confirm with owner.
3. **Pre-deploy bookings that change state after deploy** — default: ignored (forward-only, `lead_capture_start`). Confirm the owner does not want an old unpaid that finally pays to appear as a Converted Lead.
4. **Live EspoCRM notification settings** (A5/A6) — read `GET /Settings` keys with the admin identity in Wave 0; decide mitigation.
5. **Unique index on Lead** — one more owner-approved VPS step (SSH blocked in auto mode); recommended, not blocking.
6. **Lead ACL for Dispatcher / Sales manager** — D-15 predates Leads. Recommend Dispatcher no Lead access, Sales manager full; confirm.
7. **Hobby vs Pro** (A1) and whether to add a 10-minute QStash Schedule on the sweep for faster recovery.
8. **Vercel env + Vault provisioning** — owner/MCP checkpoints: Vercel `ESPOCRM_*`, `OUTBOX_KICK_SECRET`, `LEAD_ASSIGNEE_ID`; Supabase Vault `outbox_kick_url`, `outbox_kick_secret`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | tests, infra scripts | ✓ | v24.14.1 | - |
| EspoCRM `crm.rideprestigo.com` | dispatcher, live UAT, sync run | ✓ (root URL answered HTTP 200 this session; no credentialed call made) | 10.0.8 | - |
| `~/.config/prestigo/espocrm-{config,sync}.env` | `sync.mjs`, `inspect.mjs`, overlay | present directory (6 files; contents not read) | - | Owner creates if missing |
| Supabase (remote) via MCP `apply_migration` / `execute_sql` | migrations 064-066, Vault secrets, rolled-back smoke tests | session tool per memory; not probed here | - | Owner-run SQL |
| QStash token + signing keys (Vercel env) | publish + verify | used by existing reminders (presumed set) | SDK 2.10.1 | - |
| Vercel env write access (CLI) | `ESPOCRM_*`, secrets | not probed | - | Owner adds in dashboard |
| SSH `prestigo-vps` | Lead unique-index overlay, VPS-down UAT (stop/start container) | configured per memory; blocked in auto mode | - | Owner runs prepared commands |
| Postgres test harness for SQL | trigger/RPC tests | ✗ (no local Postgres) | - | Structural SQL tests + live rolled-back smoke via Supabase MCP |

**Missing dependencies with no fallback:** none blocking planning.
**Missing dependencies with fallback:** SQL execution tests (structural + live smoke), SSH steps (owner commands).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.1 `[VERIFIED: package.json:75]`; default env jsdom (`vitest.config.ts`), API/infra tests use `// @vitest-environment node` |
| Config file | `vitest.config.ts` (globals, `@` alias, `tests/setup.ts`) |
| Quick run command | `npx vitest run tests/outbox*.test.ts tests/lead-*.test.ts tests/inquir*.test.ts tests/espocrm-*.test.ts tests/infra-vps-isolation-guard.test.ts` |
| Full suite command | `npx vitest run` (~90 s) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LEAD-01 | contact route stores inquiry (mocked store called with kind+data, no IP/UA) and still emails | unit | `npx vitest run tests/inquiry-routes.test.ts -t contact` | ❌ Wave 0 |
| LEAD-02 | corporate stores with company; honeypot hit stores nothing | unit | `… -t corporate` | ❌ Wave 0 |
| LEAD-03 | multi-day stores payload + quoteReference; itinerary text renders day-by-day | unit | `… -t multiday` / `tests/lead-mapping.test.ts` | ❌ Wave 0 |
| LEAD-04 | `bookingLeadStatus` table = D-06; expired-unpaid → Dead; purge only online unpaid > 90 d | unit | `npx vitest run tests/lead-mapping.test.ts` | ❌ Wave 0 |
| LEAD-04/06 | migration 066: trigger body has exception guard, cutoff guard, mapping parity with TS, REVOKE/RLS present | unit (SQL text) | `npx vitest run tests/outbox-migrations.test.ts` | ❌ Wave 0 |
| LEAD-05 | store throws/times out → route returns 200 and email mock called once; `after` throwing is swallowed | unit | `npx vitest run tests/inquiry-routes.test.ts -t failure` | ❌ Wave 0 |
| LEAD-06 | Lead source per booking source/channel; GNet placeholders dropped; existing-customer mark; sync-owned fields only on update | unit | `npx vitest run tests/lead-mapping.test.ts tests/lead-sync.test.ts` | ❌ Wave 0 |
| Success 7 | VPS down (fake `stallPaths`/network error) → row pending, attempts++, delayed publish, HTTP 200; recovery → exactly one Lead; two concurrent dispatches → one Lead; 401 → breaker, no second call | unit (fake EspoCRM) | `npx vitest run tests/lead-sync.test.ts -t "vps down\|concurrent\|auth"` | ❌ Wave 0 |
| All | dispatcher rejects bad/missing signature (401), oversize body, malformed key | unit | `npx vitest run tests/integrations-dispatch.test.ts` | ❌ Wave 0 |
| All | espocrm-client: `X-Api-Key`, `redirect:'error'`, timeout, redaction, header passthrough | unit | `npx vitest run tests/espocrm-site-client.test.ts` | ❌ Wave 0 |
| All | isolation guard still green with new allowlist; forbidden-import fixture (outbox.ts importing client) fails | unit | `npx vitest run tests/infra-vps-isolation-guard.test.ts` | ✅ (extend) |
| CRM config | Lead fields/source enum/link/role present in JSON; second sync run `create=0 update=0` against fake; Dispatcher has no Lead | unit | `npx vitest run tests/espocrm-sync.test.ts tests/espocrm-roles.test.ts tests/espocrm-enums.test.ts` | ✅ (extend) |
| D-16 | 3 notice keys in 7 catalogs, key-tree parity, non-EN leaves differ, link present | unit | `npx vitest run tests/inquiry-notice-i18n.test.ts` (clone of `tests/chat-launcher-i18n.test.ts`) | ❌ Wave 0 |
| D-08 | admin POST requires `channel`, stores `lead_channel`; form renders select | unit | `npx vitest run tests/admin-bookings.test.ts tests/ManualBookingForm*.test.tsx` | ✅ (extend) |
| Success 1-4,6 live | real submit/booking → Lead visible with right source/status; paid → Converted; cancel → Dead | manual UAT + Supabase MCP + `inspect.mjs` | owner checklist | manual |
| Success 7 live | stop EspoCRM container, submit forms + create a booking, see pending rows, start container, exactly one Lead each | manual UAT (SSH, owner) | runbook steps | manual |
| SQL behaviour | trigger + RPC semantics against real Postgres: run inside one `execute_sql` `BEGIN … ROLLBACK` smoke script | live smoke | Supabase MCP | manual |

### Sampling Rate
- **Per task commit:** the quick run command above (≈ seconds); `npx eslint --quiet <changed files>`.
- **Per wave merge:** `npx vitest run` + `npx tsc --noEmit` (baseline 8 old errors in `tests/` only) + the `verify` skill; isolation guard must pass.
- **Phase gate:** full suite green, sync `create=0 update=0`, live UAT items, then `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/helpers/fake-espocrm.ts` — extend only via `extraRoutes` or in a wave that no other plan extends: Lead `where equals` on `cSupabaseRef`/`emailAddress`, 409 on same email unless `X-Skip-Duplicate-Check`
- [ ] `tests/inquiry-routes.test.ts`, `tests/lead-mapping.test.ts`, `tests/lead-sync.test.ts`, `tests/integrations-dispatch.test.ts`, `tests/espocrm-site-client.test.ts`, `tests/outbox-migrations.test.ts`, `tests/inquiry-notice-i18n.test.ts`
- [ ] Update existing fixtures: `tests/admin-bookings*.test.ts` (channel), isolation guard allowlist entries
- [ ] No framework install needed

## Security Domain

`security_enforcement` is absent from `.planning/config.json` (keys present: `workflow._auto_chain_active`, `workflow.use_worktrees`), so this section applies. Commit security-relevant work with the `security:` prefix.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | QStash `Receiver.verify` on dispatch; Bearer secret (timing-safe) on `kick`; `CRON_SECRET` timing-safe on sweep; EspoCRM API key in Vercel env only |
| V3 Session Management | no | server-to-server only |
| V4 Access Control | yes | Outbox/inquiries tables RLS deny-all + service role; RPCs `REVOKE … FROM PUBLIC, anon, authenticated`; Sync writer least privilege (Lead added, Dispatcher no Lead) |
| V5 Input Validation | yes | zod `.strict()` on dispatch body (`key` ≤ 120), existing `safeString`/`safeEmail` on forms, `channel` enum, size guards |
| V6 Cryptography | yes | No custom crypto; HMAC/signature via QStash SDK; secrets via env/Vault |
| V8 Data Protection | yes | PII-free outbox, no IP/UA (D-17), redacted logs, `email_normalized` index for Phase 82 erasure |
| V14 Configuration | yes | No secrets in repo; env names confined to the allowlisted client file |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged dispatch call creating junk Leads | Spoofing | Signature check before JSON parse; reject unknown keys; dispatcher only acts on existing outbox rows |
| Forged `kick` call (DoS on QStash quota) | DoS | Bearer secret, constant-time compare, publish is idempotent (`deduplicationId`) |
| API key leak | Information Disclosure | Vercel env only; redact in errors; rotate via `POST /UserSecurity/apiKey/generate`; Sync writer can delete Leads (D-15) so rotate on suspicion |
| 409/err body with PII in logs | Information Disclosure | status+code logging only |
| Form flooding → CRM spam | DoS | Existing rate limits + honeypot unchanged; outbox is bounded by inquiries rate |
| SQL trigger privilege abuse | Elevation | `SECURITY DEFINER` + `set search_path = ''` + REVOKE (063 pattern); no dynamic SQL |
| IP ban of Vercel egress by repeated 401 | DoS | Breaker (Pattern 4) |
| Duplicate/ghost Leads | Tampering | Lease claim + `cSupabaseRef` lookup + unique index |

## Sources

### Primary (HIGH confidence)
- Repo files read this session: `81-CONTEXT.md`, `REQUIREMENTS.md`, `.planning/research/ARCHITECTURE.md`, `.planning/phases/80-…/80-RESEARCH.md` and `80-CONTEXT.md`, `app/api/{contact,corporate-contact,submit-multiday-quote,create-payment-intent,submit-quote,gnet/farmin,cron/reminder-2h,cron/reminder-24h}/route.ts`, `app/api/admin/bookings/route.ts` (grep), `lib/{qstash,phone,booking-transitions,supabase,purge-quote-leads}.ts`, `vercel.json`, `middleware.ts` (matcher), `tests/infra-vps-isolation-guard.test.ts`, `tests/helpers/fake-espocrm.ts`, `infra/espocrm/{README.md,roles.json,enums.json,entities.json,settings.json,overlay.mjs,lib/client.mjs,lib/crm-read.mjs}`, migrations 038, 039, 053, 055, 056, 057, 063.
- espocrm/espocrm tag `10.0.8`, shallow-cloned and grepped this session: `Modules/Crm/Resources/metadata/{entityDefs,scopes}/Lead.json`, `Core/Record/CreateParamsFetcher.php`, `Modules/Crm/Hooks/Lead/ConvertedAt.php`, `Core/Acl/AssignmentChecker/Helper.php`, `Resources/defaults/config.php`, `Tools/EntityManager/EntityManager.php`.
- `node_modules/@upstash/qstash/client-CsM1dTnz.d.ts` (SDK 2.10.1 types).
- Context7 MCP was not available in this session; library behaviour was taken from installed type definitions and official pages below.

### Secondary (MEDIUM confidence)
- [Upstash QStash retry docs](https://upstash.com/docs/qstash/features/retry) (default 3 retries, backoff formula, `Upstash-NonRetryable-Error`).
- [Upstash QStash pricing/limits](https://upstash.com/pricing/qstash) (free: 1,000 msgs/day, max delay 7 days, DLQ 3 days, 10 schedules).
- [Vercel cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) (100 cron jobs on all plans; Hobby once per day, ±59 min).
- [EspoCRM forum thread 79743](https://forum.espocrm.com/forum/developer-help/79743-api-request-in-powershell-with-where-filtering) (bracketed `where` form for `emailAddress equals`).

### Tertiary (LOW confidence)
- None relied on; open items are in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all primitives already in the repo.
- Architecture: HIGH for trigger coverage, guard constraints, EspoCRM Lead mechanics (source-read); MEDIUM for lease/backoff behaviour and pg_net kick (design, not yet executed).
- Pitfalls: HIGH for repo-derived ones (1-12); MEDIUM-LOW for EspoCRM notification behaviour (13).

**Research date:** 2026-10-18
**Valid until:** 2026-11-17 (EspoCRM pinned at 10.0.8; QStash/Vercel limits are plan-dependent, re-check if either plan changes)
