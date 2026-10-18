# Phase 82: Site ↔ CRM/Chatwoot Sync Foundation - Research

**Researched:** 2026-10-18
**Domain:** Durable outbox sync (Supabase → EspoCRM + Chatwoot), cross-system identity resolution, GDPR erasure saga, admin observability, privacy policy
**Confidence:** MEDIUM-HIGH (the outbox, EspoCRM and repo facts are read from source this session; EspoCRM erase/soft-delete semantics and a few API shapes are LOW and flagged `[ASSUMED]`)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Carried forward (locked in earlier phases — do not re-decide)
- Supabase is the source of truth for bookings/customers; CRM and Chatwoot are downstream views (PROJECT.md v4.0).
- CBooking idempotency key = `supabaseBookingId` (unique index live), one CBooking per `bookings` row; Contact key = trimmed lower-cased email (Phase 80 D-06/D-07, `infra/espocrm/README.md` "Naming interface").
- Field ownership: sync owns every CBooking field; on an existing Contact the sync never overwrites `accountId`, `title`, `description` or names, and writes `phoneNumber` only when empty; sync never writes Accounts (README "Field ownership matrix").
- Phase 80 backfill (`infra/espocrm/backfill.mjs`) already loads CBooking + Contacts; continuous sync must update the same records, never create a second copy (Phase 80 D-06). Its legacy phone guessing (+420 for bare 9 digits) is backfill-only and must never enter `lib/phone.ts` or the live flow.
- Abandoned online checkouts (`status='unpaid' AND booking_source='online' AND payment_link_id IS NULL`) are not CBookings (Phase 80 D-08/D-21); they are Leads (Phase 81).
- Form inquiries are kept until an erasure request (Phase 81 D-14); abandoned-checkout Leads are deleted 90 days after Dead (D-15); no IP/user-agent stored (D-17).
- Visitor-facing flows (booking, payment, forms, signup) must never depend on outbox/VPS success (Phase 81 D-18, PROJECT "VPS independence").
- Phase 81 Lead dispatch (`lead.inquiry`, `lead.booking`, `lead.purge`) stays as is; Phase 82 adds new event types beside it.

#### Chatwoot contact (SYNC-01/02/04)
- **D-01:** Every customer gets a Chatwoot contact up front: everyone who booked (backfill + live) or signed up, even if they never wrote. When they first write, the operator already sees their history.
- **D-02:** Synced contact attributes shown to the operator: next upcoming trip (date/time, route, reference, status); counters (total trips, last trip date, repeat-customer flag); total spent in EUR; links to the EspoCRM Contact and to the site admin bookings list for that customer. Full per-booking history stays for the Phase 84 Dashboard App.
- **D-03:** Operator edits win for identity fields: the site fills a Chatwoot contact's name/phone only when empty, never overwrites them. The synced attributes from D-02 are always overwritten from the site (site-owned).

#### Contact de-duplication (SYNC-03)
- **D-04:** Same normalized email = same person, merged automatically. A match on E.164 phone alone (phone not shared) also merges automatically, but the link is marked "merged by phone" so it is easy to find and undo.
- **D-05:** Shared phone detection = automatic + manual list: a phone seen with ≥ 2 different emails automatically becomes "shared" and is never used for merging again; the owner can also mark a number as shared by hand (e.g. an agency desk).
- **D-06:** The identity links live in Supabase. A new site admin page lists phone-based merges and shared numbers and offers "split"; a split propagates to EspoCRM and Chatwoot through the outbox. No split/merge done inside EspoCRM is read back in this phase. — **Reversibility:** costly — the identity table becomes the key every later sync, backfill and erasure event resolves through.

#### GDPR erasure (GDPR-01)
- **D-07:** Erasure is started only by the owner from the site admin, after verifying the requester's identity out of band, with an explicit confirmation step. No customer self-service button in this phase.
- **D-08:** Bookings are anonymised, not deleted: name, email, phone, notes/special requests and addresses are wiped; date, amount, vehicle class, reference and invoice data stay (Czech accounting retention up to 10 years) for bookkeeping and statistics. — **Reversibility:** one-way — wiped personal data cannot be restored.
- **D-09:** Chatwoot: delete the contact together with its conversations. EspoCRM: delete the Contact and its Leads; anonymise its CBookings the same way as D-08. The audit record stores only a hash of the email, the date and what was deleted/anonymised in each system (no plain PII). — **Reversibility:** one-way — deleted conversations and Contacts are gone.
- **D-10:** The customer's site account is deleted (auth user + profile) and their `inquiries` rows are removed. A later booking with the same email starts from scratch.

#### Outbox health (SYNC-05)
- **D-11:** A daily email digest to the owner, sent only when there are problems (failed or stuck events): counts and a link to the admin page, no personal data in the email.
- **D-12:** The admin outbox page offers retry per event and a "retry all failed" action (for recovery after a VPS outage).

#### Privacy policy (GDPR-02)
- **D-13:** Retention stated in the policy: Chatwoot conversations are kept until an erasure request (no automatic cleanup); forms until an erasure request; abandoned checkouts 90 days; bookings/invoices up to 10 years (anonymised on erasure).
- **D-14:** WhatsApp and Telegram are mentioned generically as channels customers can use to write to us (processors Meta / Telegram), without WhatsApp Cloud API details. The text is extended when Phase 78 (backlog 999.9) resumes. This closes the Phase 78 D-06 "defer-82" privacy item for now.

### Claude's Discretion
- Event type names, payload shape (ids-only, as in Phase 81), fan-out (one outbox row per target system vs one per event), ordering and coalescing of rapid status changes.
- Backfill order and batching for Chatwoot (rate limits), and how it reuses `infra/espocrm/backfill.mjs`.
- Exact "admin edit" coverage: which `bookings` columns trigger a resync.
- Erasure UX details (search by email/phone, preview of what will be removed, warning when the person has an upcoming trip).
- Layout of the outbox page and the identity/split page in the existing admin design.
- Whether the Phase 81 Lead is refreshed on a booking edit (open item from 81-11 runbook) — fold in only if it falls out of the booking-edit trigger naturally.

### Deferred Ideas (OUT OF SCOPE)
- Customer self-service "delete my account and data" in the account area (rejected for now, D-07).
- Automatic retention cleanup of Chatwoot conversations (rejected, D-13).
- WhatsApp Cloud API specifics in the privacy policy — with Phase 78 (backlog 999.9).
- Reading merges/splits done inside EspoCRM back into the site — CRM→site direction, Phase 83 or later.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SYNC-01 | Every booking create, payment, status change and admin edit reflected in EspoCRM (Contact + Booking) and on the Chatwoot contact within minutes via durable outbox + QStash, idempotent | Section "Event catalog and key design" (bucketed keys, trigger column list), "Dispatcher extension", Pitfalls 1, 2, 3, 9 |
| SYNC-02 | Every customer account signup creates/updates the matching Contact in EspoCRM and Chatwoot | `customer_profiles` AFTER INSERT/UPDATE trigger (covers password signup, OAuth/magic-link callback and admin-created accounts); `sync.signup` event |
| SYNC-03 | De-dup across site, Chatwoot, EspoCRM by normalized email OR E.164 phone; shared phones flagged and excluded; admin can split | "Identity model", "Resolution algorithm", Open Question 1 (D-04 vs D-05 interplay), Chatwoot unique-phone constraint (Pitfall 5) |
| SYNC-04 | One-time backfill of every past customer and booking into EspoCRM and Chatwoot | "Backfill design" (identity pass in chronological order, then staggered outbox enqueue; reuses live handlers) |
| SYNC-05 | Admin sees outbox health (pending/failed, last error) and can retry | "Outbox health and retry" (new RPCs, page, digest in the existing daily sweep) |
| GDPR-01 | Single erasure request removes/anonymises the person in Supabase, Chatwoot, EspoCRM via outbox with audit record | "Erasure saga" (Supabase-last ordering, freeze flag, audit table, role change), Pitfalls 6, 7, 10 |
| GDPR-02 | Privacy policy (all locales) names Chatwoot/EspoCRM processing, VPS host/region, channels, retention periods, chat widget | "Privacy policy delta" (content/pages/*/privacy.json, existing text conflicts with D-13) |
</phase_requirements>

## Summary

Phase 82 extends the Phase 81 outbox; it does not need a new pipeline. The outbox primitives (`integration_outbox`, `outbox_enqueue/claim/complete/reschedule`, QStash publish with dedup ids, backoff, 6 h auth breaker, daily sweep, pg_net kick) are generic and already in production since 2026-10-18. What is Lead-specific is (a) the idempotency-key grammar (`parseOutboxKey` knows only three `lead.*` shapes), (b) the dispatcher body `lib/lead-sync.ts`, and (c) the kick route, which rejects every key that is not `lead.booking`. Three things make Phase 82 non-trivial and must shape the plans: the outbox key is a **unique** index, so a one-shot key per booking can never carry a *second* edit; the identity table (D-06) is the key every later sync/erasure resolves through, so its schema and locking are the highest-risk piece; and erasure touches three systems plus several Supabase tables that hold PII outside `bookings` (audit log, email log, GNet payload, driver notes).

Recommended architecture: a **time-bucketed idempotency key** (`sync.booking:<id>:<epoch/90>`) removes the "second edit is dropped" problem with no schema change to the outbox and provably loses no update; a **resolver hop** (the dispatcher resolves the booking/user to an identity row under one global advisory lock, reading the booking itself to avoid TOCTOU) then fans out **person-aggregate** rows (`sync.espo`, `sync.chatwoot`) so the existing per-aggregate claim mutex serialises every write for one person, including erasure. Every handler is state-convergent ("make the CRM equal the current Supabase state of this person"), so late, duplicate, out-of-order and split/merge events all converge. The backfill is the same handlers fed by an SQL enqueue function after a single chronological identity pass, so there is exactly one mapping implementation.

Four findings the user must see before planning (details in Open Questions): (1) D-04 and D-05 interact so that the *first* phone-only merge for a number necessarily happens and then flips the number to "shared"; (2) the existing privacy text says booking records are kept 5 years and contact-form data 12 months, which contradicts D-13 (10 years / until erasure); (3) **EspoCRM `DELETE` is a soft delete** and Chatwoot's contact delete needs an **administrator** token and refuses an online contact, so "delete" needs a scrub-then-delete step in EspoCRM and a dedicated admin-role Chatwoot credential on Vercel; (4) the GNet placeholder email `noreply@gnet.local` would merge every GNet booking into one "person" under D-04 unless excluded, and Phase 80 already created `gnet.local` Contacts.

**Primary recommendation:** Add migration 069 (identity tables + resolver RPCs + `bookings.anonymised_at` + gated booking/profile sync triggers), extend the dispatcher with `sync.booking|signup` (resolver hop) → `sync.espo` / `sync.chatwoot` (person aggregate) and `erase.person`, keep all CRM/Chatwoot network code in allowlisted `lib/` files, and run the backfill as an SQL-enqueued replay of those same handlers after a one-time chronological identity pass.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Capture booking/profile change | Database (triggers) | — | Only a DB trigger sees every writer (checkout, Stripe webhook, admin, GNet, SQL) without touching call sites; Phase 81 precedent (067) |
| Identity resolution & split | Database (SECURITY DEFINER RPCs, one global advisory lock) | API (admin split route) | Needs transactional race-safety; PostgREST cannot hold a lock across calls |
| Delivery to EspoCRM / Chatwoot | API / Backend (QStash-invoked dispatcher, Vercel) | — | Visitor paths must never depend on the VPS (D-18); isolation guard allows CRM code only on the async path |
| Retry/backoff/lease | Database (outbox RPCs) + API (dispatcher) | — | Existing 064 semantics |
| Outbox health page, identity/split page, erasure page | Frontend Server (admin pages under `app/(internal)/admin/(dashboard)/`) | API (`/api/admin/*`, Origin-strict CSRF) | Existing admin pattern |
| Daily health digest | API (existing daily sweep cron) | Email (Resend) | Sweep already runs 04:00 UTC; Hobby-compatible once-a-day cadence |
| Erasure execution | API (dispatcher saga) | Database (final anonymise RPC), VPS systems | Ordered multi-system saga, resumable through outbox retries |
| Chatwoot attribute definitions | Config-as-code (`infra/chatwoot/*.json` + `sync.mjs`) | — | Git is source of truth (Phase 77 D-18) |
| EspoCRM role change (Contact delete) | Config-as-code (`infra/espocrm/roles.json` + `sync.mjs --only roles`, `verify-acl.mjs`) | — | Phase 81 plan 81-03/81-11 precedent |
| Privacy policy | CDN / Static (`content/pages/<locale>/privacy.json`, `force-static` page) | — | Page content model since Phase 71 |

## Standard Stack

No new runtime packages are needed. Everything is already in the repo.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/supabase-js | ^2.101.0 `[VERIFIED: package.json]` | service-role client, RPC calls, `auth.admin.deleteUser/getUserById` | Already the DB layer; `app/api/admin/accounts/route.ts` already uses `auth.admin.*` |
| @upstash/qstash | ^2.10.1 `[VERIFIED: package.json]` | publish + `Receiver` signature verify | Phase 81 dispatcher; QStash EU region in prod |
| zod | ^4.3.6 `[VERIFIED: package.json]` | admin route body validation (400/422 two-step rule) | Project standard |
| resend | ^6.9.4 `[VERIFIED: package.json]` | daily digest email | Already used by `lib/email.ts` (`MANAGER_EMAIL` recipient) |
| vitest | ^4.1.1 `[VERIFIED: package.json]` | tests (`// @vitest-environment node` for infra/API) | Project standard |
| next | ^16.2.3, react 19.2.3 `[VERIFIED: package.json]` | admin pages / routes | Project standard |

### Supporting (existing in-repo modules to reuse, not packages)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `lib/outbox.ts`, `lib/outbox-store.ts`, `lib/outbox-backoff.ts` | publish, store, backoff | Extend `parseOutboxKey` + `OutboxEventType`; add store methods |
| `lib/lead-sync.ts` | dispatcher + failure classification | Keep as the router; delegate new event types to handler modules |
| `lib/espocrm-client.ts` | hardened EspoCRM client (`get/post/put/del`, header arg on post only) | Reuse as is; `put`/`del` have no header argument (see Pitfall 11) |
| `lib/lead-mapping.ts` | `normalizeLeadEmail`, `leadPhone`, `splitName`, `adminLink`, `bookingLeadAmountEur`, `diffSyncOwned` | Reuse for identity/Contact mapping |
| `lib/phone.ts` | `normalizePhone` (strict E.164, never guesses) | Only phone normaliser allowed in the live flow |
| `infra/chatwoot/lib/client.mjs` | Chatwoot client with `api-access-token` hyphen header, `redirect:'error'`, timeout | **Port to TypeScript** as `lib/chatwoot-client.ts` (infra code is not importable from `lib/`) |
| `infra/espocrm/lib/booking-map.mjs` | CBooking/Contact mapping | **Port to TypeScript** with a parity test (tests may import both) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Time-bucketed unique key | New `outbox_touch` RPC that re-arms a single mutable row | Needs a "dirty while processing" bit to be correct; bucketed keys need no outbox schema change |
| Resolve identity in the booking trigger | Resolve in dispatcher (recommended) | Trigger-side resolution puts complex logic in every booking write and silent-loss on swallowed errors (D-18) |
| Two systems in one outbox row | One row per system (recommended) | Same VPS hosts both, so failures correlate, but per-system rows give separate health/last_error and independent retry |
| Chatwoot `contact_merge` automatically for all duplicates | Auto-merge only ≤ 2 candidates matched by the identity's own keys; else skip with code | Merge destroys the mergee and moves conversations; it cannot be undone by a "split" |
| Import `infra/espocrm/backfill.mjs` | Replay through live handlers | Backfill script's legacy phone guessing must never enter the live flow (locked) |

**Installation:** none.

## Package Legitimacy Audit

No external packages are installed or added by this phase (all work reuses packages already in `package.json`). `gsd-tools query package-legitimacy check` was therefore not run.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 WRITERS (checkout, Stripe webhook, admin create/PATCH/cancel, GNet, SQL)        SIGNUP (password action, /auth/callback upsert, admin POST accounts)
        │ INSERT / UPDATE OF <sync columns>                                              │ INSERT / UPDATE OF full_name, phone
        ▼                                                                                ▼
 bookings AFTER trigger  enqueue_booking_sync()                          customer_profiles AFTER trigger  enqueue_profile_sync()
   gate: integration_config 'crm_sync_start'; exception-safe; IS DISTINCT FROM check; skip anonymised
   key  sync.booking:<id>:<floor(epoch/90)>   avail = now()+90s            key  sync.signup:<user_id>:<bucket>
        │  (+ pg_net kick → /api/integrations/kick → QStash delayed 90s)              │
        └────────────────────────────┬─────────────────────────────────────────────────┘
                                     ▼
                         integration_outbox (ids only, unique key, 064)
                                     │  QStash (EU) → POST /api/integrations/dispatch (signature verified)
                                     ▼
                  dispatchOutboxKey (lib/lead-sync.ts router; claim lease 120 s)
   lead.*  ───────────────► existing Phase 81 Lead handlers (unchanged)
   sync.booking / sync.signup ► RESOLVER HOP
        identity_resolve_booking(booking_id) / identity_resolve_user(user_id)    (SQL, ONE global advisory lock,
        reads the source row itself; returns identity_id[old,new]; skips anonymised / erasing / placeholder email)
        │ enqueue (aggregate = person) for new AND old identity:
        ├──────────────► sync.espo:<identity>:<bucket>       ─► EspoCRM: ensure Contact (emails, phone-if-empty)
        │                                                        upsert ALL of the person's CBookings (diff PUT)
        └──────────────► sync.chatwoot:<identity>:<bucket>   ─► Chatwoot: find/create/merge contact, fill name/phone
                                                                 if empty, overwrite synced attributes (D-02)
   erase.person:<requestId>  (aggregate = identity) ─► SAGA: freeze → Chatwoot delete → EspoCRM scrub+delete
                                                         → Supabase anonymise/delete (LAST) → verify pass → audit
                                     │
   outbox failures ─► admin page /admin/outbox (health RPC, retry one / retry all failed)
   daily sweep 04:00 UTC ─► re-publish due keys ─► digest email only if failed/stuck > 0 (no PII)
```

### Recommended Project Structure
```
supabase/migrations/
├── 069_identity_and_sync_triggers.sql   # identity tables, resolver/split RPCs, bookings.anonymised_at, sync triggers (gated)
├── 070_outbox_admin.sql                 # outbox_health(), outbox_retry(key), outbox_retry_failed(limit)
└── 071_erasure.sql                      # erasure_requests audit table + erasure RPCs (anonymise tx)
lib/
├── identity.ts                  # normalise + RPC wrappers (no CRM import)
├── identity-store.ts            # reads/writes for admin pages (no CRM import)
├── customer-mapping.ts          # PURE: booking row → CBooking/Contact draft (TS port of booking-map.mjs)
├── chatwoot-mapping.ts          # PURE: person summary → Chatwoot contact draft + attributes
├── chatwoot-client.ts           # ALLOWLISTED: TS port of infra/chatwoot/lib/client.mjs
├── crm-sync.ts                  # ALLOWLISTED: sync.espo handler
├── chatwoot-sync.ts             # ALLOWLISTED: sync.chatwoot handler
├── erasure.ts                   # ALLOWLISTED: erase.person saga
├── outbox-digest.ts             # no CRM import: digest counts + Resend
app/api/admin/outbox/…           # health, retry, retry-all      (no CRM import)
app/api/admin/identities/…       # list, mark-shared, split      (no CRM import)
app/api/admin/erasure/…          # preview, confirm              (Supabase-only preview)
app/(internal)/admin/(dashboard)/{outbox,identities,erasure}/page.tsx
infra/chatwoot/custom-attributes.json   # + contact attribute definitions
infra/espocrm/roles.json                # Sync writer: Contact delete → yes
tests/helpers/fake-chatwoot.ts          # NEW fake (modelled on fake-espocrm.ts)
```

### Pattern 1: Time-bucketed idempotency key (solves "second edit dropped")
**What:** `integration_outbox_key_idx` is unique and `outbox_enqueue` does `ON CONFLICT DO NOTHING`, so a key that was already `sent` silently swallows every later enqueue `[VERIFIED: supabase/migrations/064_integration_outbox.sql:40-41,120]`. Put a 90-second bucket in the key:

```sql
-- Source: pattern derived from 067_bookings_lead_outbox.sql (key shape, 90 s delay, kick)
v_bucket := (extract(epoch FROM now())::bigint / 90);
v_key    := 'sync.booking:' || NEW.id::text || ':' || v_bucket::text;   -- <= 120 chars (64 here)
PERFORM public.outbox_enqueue('sync.booking', 'booking', NEW.id, v_key, now() + interval '90 seconds');
```
**Why no update is lost (proof):** the row for bucket *b* gets `available_at = t0 + 90 s` where *t0* is the first write in the bucket. Every other write in that bucket happens before the bucket ends, i.e. before `t0 + 90 s`, and the dispatcher reads the *current* row only after `available_at`. A write in the next bucket creates a new row. `outbox_claim` rejects early claims (`available_at <= now()`), and `deferOrFinish` re-publishes with the remaining delay.
**When to use:** every `sync.*` trigger and the backfill (`:bf`). Bookings have no `updated_at` column in the typed schema `[VERIFIED: types/database.types.ts:17-69]`, so epoch buckets (not a row version) are the key discriminator.

### Pattern 2: Resolver hop, then person-aggregate fan-out
**What:** `outbox_claim` serialises claims per `(aggregate_type, aggregate_id)` with `pg_advisory_xact_lock(hashtextextended(v_type || ':' || v_id::text, 0))` `[VERIFIED: 064_integration_outbox.sql:148]`. Booking rows are aggregate `booking`, so two bookings of one person would run concurrently and could both create the Contact. Resolve the person first, then enqueue rows whose aggregate is the **identity id**; the existing mutex then serialises Contact creation, Chatwoot create/merge, splits and erasure for that person.

**Resolver RPC contract (recommended):**
- `identity_resolve_booking(p_booking_id uuid) → table(identity_id uuid, previous_identity_id uuid)`; `identity_resolve_user(p_user_id uuid)` likewise. They take **one global** `pg_advisory_xact_lock` (volume is tiny; correctness over throughput), read the booking/user row *inside* the function (never accept email/phone from the caller: TOCTOU with erasure), apply the rules below and return both the new and the previously mapped identity so both get a refresh.
- Returns no identity when: booking not found, `anonymised_at IS NOT NULL`, abandoned-checkout predicate true, placeholder email (see Pitfall 4) with no usable phone, identity `erasing_at/erased`.

### Pattern 3: State-convergent handlers (already the Phase 81 rule)
`deliverBooking` rebuilds the Lead from the CURRENT row `[VERIFIED: lib/lead-sync.ts:156-159 "The event key only says 'something changed': the Lead is built from the CURRENT booking row"]`. Keep that rule: `sync.espo` reads identity + all bookings of the person from Supabase, then diffs against the CRM. A split, a typo fix of `client_email`, a payment and a cancel are all the same operation.

### Identity model (D-04/D-05/D-06) — recommended schema
```
contact_identities(id uuid pk, created_at, erasing_at timestamptz, espo_contact_id text, chatwoot_contact_id bigint, user_id uuid null)
identity_emails  (email text pk /*normalised*/, identity_id fk, basis text check in ('email','phone','signup','split'), created_at)
identity_phones  (identity_id fk, phone text /*E.164*/, first_seen, primary key (identity_id, phone))
phone_flags      (phone text pk, shared boolean, source text check in ('auto','manual','split'), created_at, note text)
booking_identity (booking_id uuid pk, identity_id fk)   -- last resolved owner, for split UI, erasure scope, "old identity" refresh
```
RLS deny-all, `REVOKE ALL … FROM anon, authenticated`, every function `SET search_path = ''`, EXECUTE revoked from PUBLIC/anon/authenticated and granted to `service_role` only `[VERIFIED: 064 pattern, lines 233-244]`. A row in `identity_emails` with `basis='phone'` **is** the "merged by phone" marker the admin page lists.

### Resolution algorithm (inputs: normalised email `e`, E.164 phone `p` or null)
1. `e` in `identity_emails` → identity `I` (email match always wins). Record `p` on `I` if `p` is not shared. If `p` is in a *different* identity's phones and not shared → mark `p` shared (`source='auto'`), no merge (two existing identities collide).
2. `e` new, `p` not null, `p` not shared, `p` belongs to exactly one identity `J` → add `e` to `J` with `basis='phone'`; now `p` is seen with ≥ 2 emails → set `phone_flags(p, shared=true, source='auto')` (**see Open Question 1**: this is the one phone-merge a number can ever cause).
3. Otherwise create a new identity for `e` (+ `p` when not shared).
4. If `p` is shared (auto/manual/split), it is never used to match and is not written to Chatwoot (Pitfall 5) — it is still copied to the EspoCRM Contact only when that Contact's phone is empty (existing rule).
5. Email normalisation = `normalizeLeadEmail` (trim, lower-case, requires `@`, rejects `@gnet.local`) plus reject `@erased.invalid`; phone = `normalizePhone` only.

**Split (admin):** `identity_split(p_email, p_actor)` in one transaction: move `p_email` (and the bookings resolved through it) into a new identity, mark the pivot phone `shared` (`source='split'`), write an audit row, enqueue `sync.espo` + `sync.chatwoot` for **both** identities with key suffix `split<id>`. Espo side removes only the email the split names from the old Contact (never rewrites operator-added emails); the new identity gets a new Contact and its CBookings are re-pointed by the normal convergent upsert. A Chatwoot split cannot move past conversations (limitation to document).

### Anti-Patterns to Avoid
- **One-shot key per booking for edits:** `lead.booking:<id>:<group>` style drops the second edit forever (documented in the 81 runbook "Known limitation"). Use buckets.
- **Writing to Chatwoot/EspoCRM from any admin route:** the isolation guard flags every importer transitively; keep admin routes Supabase-only and let the outbox do the network work.
- **Putting a currency token in `infra/chatwoot/*.json|md`:** the pre-commit gate rejects it (Pitfall 8).
- **Importing `infra/**/*.mjs` from `lib/`:** `infra/espocrm/README.md` states nothing under `app/`, `components/`, `lib/` imports from `infra/espocrm`; port + parity-test instead.
- **Anonymising `bookings` before the CRM steps:** the dispatcher needs the plaintext identifiers to find the CRM records; Supabase must be the last step.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Delivery/retry/lease/dedup | A new queue | Phase 81 `integration_outbox` + QStash + dispatcher | Already live, drilled (VPS-down drill 2026-10-18) |
| Per-person serialisation | App-level locks | `outbox_claim` aggregate mutex with `aggregate_type='person'` | Already race-tested; PostgREST cannot hold locks |
| Phone parsing | New regex | `lib/phone.ts normalizePhone` | Handles Unicode digits, trunk zeros; never guesses a country (locked) |
| Email normalisation | New function | `normalizeLeadEmail` | Already rejects the GNet placeholder |
| Booking amount in EUR | Re-derive | `bookingLeadAmountEur` / `amountEur` semantics | Round-trip outbound row carries the combined total; summing both legs double counts |
| Chatwoot HTTP client | New fetch wrapper | Port `infra/chatwoot/lib/client.mjs` (hyphen header `api-access-token`, `redirect:'error'`, timeout, redaction) | Live finding: underscore headers are dropped by the proxy `[VERIFIED: infra/chatwoot/README.md "The reverse proxy in front of Chatwoot drops request headers that contain an underscore"]` |
| Admin auth/CSRF | New guard | `getAdminUser()` order 401→403, `/api/admin` is Origin-strict in middleware `[VERIFIED: middleware.ts:9-29]` | Project pattern |
| Owner email | New mail client | `lib/email.ts` Resend pattern (`MANAGER_EMAIL`) | Existing |
| Hashing the audit key | Plain SHA-256 | `createHmac('sha256', key)` (as `lib/chatwoot-identity.ts` does for the widget) | A bare hash of an email is dictionary-reversible |

**Key insight:** every hard problem here (idempotency, retries, serialisation, auth) already has a tested primitive in the repo. The new risk is almost entirely in **identity semantics** and **erasure completeness**, not in plumbing.

## Runtime State Inventory

> Not a rename phase, but erasure and the new sync create/delete runtime state, so the inventory below is the PII/state map the erasure saga must cover. Items with `?` need a live schema/inventory check by the orchestrator (subagents have no Supabase MCP; `types/database.types.ts` is stale — e.g. it lacks `payment_link_id`, `paid_at`, `invoice_number`, `anonymised_at`).

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (Supabase) | `bookings` (client_first/last_name, client_email, client_phone, flight_number, special_requests, operator_notes, origin/destination address + lat/lng) `[VERIFIED: types/database.types.ts:19-68]`; `booking_edit_audit_log.old_value/new_value` (text, carries edited name/email/phone/address) `[VERIFIED: 055_booking_edit_audit_log.sql:24-33]`; `email_log.recipient` `[VERIFIED: types/database.types.ts:479-500]`; `gnet_bookings.raw_payload jsonb` `[VERIFIED: 039_gnet_bookings.sql:21-30]`; `driver_assignments.trip_note` ?; `inquiries` (email, name, phone, company, payload) `[VERIFIED: 065_inquiries.sql:15-25]`; `customer_profiles` (full_name, phone, ico, vat_id, billing_address); `saved_passengers` (cascade on auth user); `quote_leads` (email, ip, user_agent; dead table); `auth.users` | Anonymise bookings (+ scrub audit log, email_log, gnet payload, trip_note); delete inquiries/quote_leads by email; delete auth user (cascades profile/passengers; `bookings.user_id` is `ON DELETE SET NULL` `[VERIFIED: 045_bookings_user_id.sql:8-11]`) |
| Live service config | EspoCRM Contact (+ additional emails), CBooking (`passengerName`, `flightNumber`, `pickup`, `dropoff` are PII), Lead (phone/email/name/description) in the VPS; Chatwoot contact + conversations + attachments; Google Calendar event per accepted booking (names/phones) | Contact: scrub fields then DELETE (soft delete, Pitfall 6); Leads: scrub then DELETE (role already allows); CBooking: converge via mapper (blank PII) ; Chatwoot: DELETE contact (admin token); Calendar: the anonymising UPDATE of `client_*` fires `bookings_gcal_sync` for accepted statuses `[VERIFIED: 063_bookings_gcal_sync_trigger.sql:88-98]` so the event is rewritten with blanks (verify live) |
| OS-registered state | None for this phase — verified by absence: no new cron added beyond the existing `0 4 * * *` sweep `[VERIFIED: vercel.json:17-19]` | none |
| Secrets/env vars | New Vercel env: `CHATWOOT_BASE_URL` (already referenced by Phase 77 docs), `CHATWOOT_ACCOUNT_ID`, a Chatwoot API token (admin role for delete), an audit-hash key; existing `ESPOCRM_*`, `QSTASH_*`, `OUTBOX_KICK_SECRET`, `CRON_SECRET`, `MANAGER_EMAIL`, `RESEND_API_KEY` | Owner-run secret scripts (Phase 81 precedent); never read `.env.local` |
| Build artifacts / external copies | Hostinger mailbox archive (info@/bookings@), Backblaze restic snapshots `--keep-daily 7 --keep-weekly 4 --keep-monthly 6` `[VERIFIED: infra/vps/runbooks/backup-restore.md:44-45]`, Stripe, Resend logs, GA, EspoCRM `Email`/`Task`/stream records related to the Contact (Sync writer role has no `Email`/`Task` access `[VERIFIED: infra/espocrm/roles.json:36-47]`) | Cannot be erased by the saga: state them in the policy and the erasure runbook (Open Question 6) |

## Event catalog and key design (recommended; Claude's-discretion area)

| Event type | Aggregate | Key | Written by | Delivered to |
|------------|-----------|-----|------------|--------------|
| `sync.booking` | booking | `sync.booking:<bookingId>:<bucket90s>` (`:bf` for backfill, `:split<n>`/`:retry` as needed) | booking trigger / backfill fn | resolver hop |
| `sync.signup` | user (uuid) | `sync.signup:<userId>:<bucket90s>` | `customer_profiles` trigger / backfill fn | resolver hop |
| `sync.espo` | person (identity id) | `sync.espo:<identityId>:<bucket>` | resolver hop, split RPC | EspoCRM |
| `sync.chatwoot` | person | `sync.chatwoot:<identityId>:<bucket>` | resolver hop, split RPC | Chatwoot |
| `erase.person` | person | `erase.person:<erasureRequestId>` | erasure confirm route | saga |

All keys are ≤ 120 chars (`CHECK (char_length(idempotency_key) BETWEEN 1 AND 120)` `[VERIFIED: 064:28]`). Required code edits: `OutboxEventType` currently is `'lead.inquiry' | 'lead.booking' | 'lead.purge'` `[VERIFIED: lib/outbox.ts:9]` and `deliver()` fails anything else terminally with `unsupported_event` `[VERIFIED: lib/lead-sync.ts:133-134]`; the kick route returns 400 for any key but `lead.booking` `[VERIFIED: app/api/integrations/kick/route.ts:49]` (`if (parseOutboxKey(parsed.data.key)?.eventType !== 'lead.booking') {`) and must also accept `sync.booking` and `sync.signup`.

**Trigger column list ("admin edit coverage", discretion):** `UPDATE OF` the columns the CBooking mapper reads — `status, leg, booking_reference, pickup_utc, pickup_date, pickup_time, origin_address, destination_address, trip_type, vehicle_class, amount_eur, amount_czk, payment_intent_id, payment_link_id, invoice_number, paid_at, booking_source, client_first_name, client_last_name, client_email, client_phone, flight_number, driver_id, user_id` — plus an `IS DISTINCT FROM OLD` guard in the body, because `UPDATE OF` fires when a column merely appears in the SET list (the admin PATCH sets many). Mirror the existing 063 column list as the base `[VERIFIED: 063_bookings_gcal_sync_trigger.sql:90-97]`. Leave `bookings_lead_outbox` (067) untouched; the Phase 81 Lead refresh on edit is **not** folded in (it would need a versioned `lead.booking` key and a `parseOutboxKey` change — the 81 runbook's "proper fix" — and does not fall out of this trigger naturally; recommend deferring).

**Gating:** add `integration_config` key `crm_sync_start` (absent ⇒ no enqueue) exactly like `lead_capture_start`, so the orchestrator controls go-live after the identity backfill and shared-phone seeding. Set it **before** the backfill enqueue so no write falls in a gap (the backfill is idempotent).

## Dispatcher extension

- Keep `lib/lead-sync.ts` as router (tests import `dispatchOutboxKey` from it); move nothing. Add `deliver()` branches for `sync.booking|signup`, `sync.espo`, `sync.chatwoot`, `erase.person`, each in its own allowlisted module.
- Reuse failure semantics: `retryLater` (transient, backoff 60/300/900/3600/10800/21600/43200/86400 s, terminal at 30 attempts `[VERIFIED: lib/outbox-backoff.ts:4,7]`), `breaker` (`AUTH_BREAKER_SECONDS = 21_600`), `failed` terminal for permanent errors with the `ALERT` log line.
- **Chatwoot error classification** (new `classifyChatwootError`): network/timeout/429/5xx → transient; 401/403 → auth breaker; 404 on a cached id → forget id and re-find; 422 on POST/PUT → permanent *after relaxation* (retry without `phone_number`, then without `email`, then name-only — mirrors `createLead`'s 400 ladder `[VERIFIED: lib/lead-sync.ts:328-355]`); **422 on DELETE → transient** (contact is online, Chatwoot refuses) `[CITED: raw.githubusercontent.com/chatwoot/chatwoot/v4.18.0/app/controllers/api/v1/accounts/contacts_controller.rb — destroy "refuses to delete a contact that is currently online and returns a 422"]`.
- Add an overall deadline (~50 s of the 60 s `maxDuration` `[VERIFIED: app/api/integrations/dispatch/route.ts "export const maxDuration = 60"]`); on expiry reschedule instead of letting the platform kill the invocation (the `SiteEspoClient` already caps each call at 10 s).
- `sync.espo` Contact create: look up by **each** identity email first; if none, POST with header `X-Skip-Duplicate-Check: true` (our identity authority already decided "different person"; EspoCRM's check also matches first+last name `[VERIFIED: infra/espocrm/README.md "Duplicate Contacts during the backfill"]`). The Phase 80 backfill avoided the bypass header for itself; the live Lead path already uses it `[VERIFIED: lib/lead-sync.ts:318 SKIP_DUPLICATE_CHECK]`. `SiteEspoClient.put` and `.del` take no header argument — extend the interface only if needed.
- `phoneNumber`: write only when the Contact's phone is empty and the number is normalised and not shared; on a 400 retry without it (one live Contact already has a phone EspoCRM's validator rejects `[CITED: 80-12-SUMMARY.md:74]`).
- CBooking set for a person: one list call `where type=in attribute=supabaseBookingId` for the person's non-abandoned booking ids, then POST missing / PUT diff via `diffSyncOwned`-style comparison. CBooking `contactId`/`accountId` handling mirrors backfill (`accountId` copied from the Contact when set).

## Chatwoot contact sync (D-01..D-03)

Facts `[CITED: raw.githubusercontent.com/chatwoot/chatwoot/v4.18.0/app/models/contact.rb]` (deployed image is `chatwoot/chatwoot:v4.18.0-ce` `[VERIFIED: infra/vps/chatwoot/compose.yml image lines]`):
- email unique per account, case-insensitive; **phone_number unique per account**; identifier unique per account; phone format `/\A\+[1-9]\d{1,14}\z/`.
- `has_many :conversations, dependent: :destroy_async` (contact deletion removes conversations asynchronously).
- Update merges `custom_attributes` shallowly (`@contact.custom_attributes.merge(...)`) `[CITED: …/contacts_controller.rb]` — send only the keys you own.
- `destroy?` policy: `@account_user.administrator?`; `update?/create?/search?/filter?` open to any user `[CITED: …/app/policies/contact_policy.rb]`.
- `ContactIdentifyAction` (what the widget does for a signed-in user, Phase 77 D-05) looks up identifier → email → phone; it merges an email-matched contact into the identified one unless that contact holds a *different* non-blank identifier `[CITED: …/app/actions/contact_identify_action.rb]`. Result: a Chatwoot contact pre-created from a booking **by email, without an identifier**, is adopted when the customer later chats while signed in — which is exactly D-01's goal. Never set `identifier` from the sync unless it equals the Supabase user id.
- `contact_merge` (`base_contact_id`, `mergee_contact_id`) reassigns conversations/messages/inboxes/notes, merges attributes (base wins on conflicts), and **destroys the mergee** `[CITED: …/contact_merge_action.rb]`.
- Search is `ILIKE %q%` partial and rate-limited at 100/min (`RATE_LIMIT_CONTACT_SEARCH`); global per-IP limit 3000/min `[CITED: …/config/initializers/rack_attack.rb]`. Prefer `POST /contacts/filter` (exact `equal_to`; phone values are normalised to a leading `+`, other strings lower-cased `[CITED: …/contacts/filter_service.rb]`) — the request shape `{ "payload": [{ "attribute_key": "email", "filter_operator": "equal_to", "values": ["…"], "query_operator": null }] }` is `[ASSUMED]` from training and must be probed live (Wave 0).

Find order for an identity: cached `chatwoot_contact_id` (GET; 404 ⇒ forget) → `identifier` = user id (when the identity has an account) → each identity email (exact filter) → each non-shared phone (exact filter). Distinct hits: 0 ⇒ create; 1 ⇒ adopt; 2 ⇒ auto-merge only if both matched through this identity's own keys, base preference identifier > email > older; ≥ 3 or any other ambiguity ⇒ skip with code `cw_ambiguous` (visible on the health page). Name/phone are filled only when empty (D-03). Synced attributes (D-02) always overwrite.

**Attribute definitions:** add them to `infra/chatwoot/custom-attributes.json` under `contact` and apply with `node infra/chatwoot/sync.mjs`. Two constraints found: `tests/chatwoot-config.test.ts` asserts the contact keys equal exactly `["site_locale"]` and that every `display_type` is `"text"` or `"link"` `[VERIFIED: tests/chatwoot-config.test.ts:361-368]` (update both deliberately, or stay with text/link), and the commit gate rejects currency tokens (Pitfall 8). Suggested keys: `next_trip` (text), `trip_count` (text), `last_trip_date` (text), `repeat_customer` (text), `lifetime_value` (text; **no unit word in JSON**), `crm_contact_url` (link), `admin_bookings_url` (link). Build the CRM link from `ESPOCRM_BASE_URL` (via the config object), never from a `crm.rideprestigo.com` literal (isolation guard flags the literal `[VERIFIED: tests/infra-vps-isolation-guard.test.ts:30 VPS_HOST_RE]`).

**Counters:** count non-return legs as trips; total spent = sum of per-booking `bookingLeadAmountEur` over paid/active non-return rows excluding `cancelled` and abandoned checkouts (the admin accounts API also excludes cancelled `[VERIFIED: app/api/admin/accounts/route.ts "Cancelled bookings are excluded from both the trip count and revenue"]`); "upcoming" uses `pickup_utc >= now()` and status not cancelled.

## Backfill design (SYNC-04)

Facts: Phase 80 already loaded Espo with 56 CBookings and 29 Contacts (`rows=56 … contacts create=29 … bookings create=56`) `[CITED: 80-12-SUMMARY.md:63]`; the data set is tiny, so Chatwoot rate limits are not a constraint (global 3000/min). Phase 80's Contact phone logic guessed `+420` for bare 9-digit numbers (7 of 29 Contacts had no usable phone, 2 were prefixed) `[CITED: 80-12-SUMMARY.md:72]`.

Recommended sequence (all orchestrator/owner-run, in this order):
1. **Owner seeds `phone_flags` with known agency/hotel desk phones** (TravelExpress, TLTGO, Traveltime named in CONTEXT) *before* any identity resolution, so their first guest is not wrongly merged.
2. **Identity pass:** one SQL function iterates bookings (`created_at` ascending, excluding abandoned checkouts and placeholder emails) and signups, calling the same resolver, inside one transaction. Chronological order makes "first seen wins" deterministic (outbox delivery order is not). Add a read-only report function (counts only: identities, phone merges, auto-shared phones, unparseable phones, placeholder-email rows) and have the owner review it before step 4.
3. Set `crm_sync_start`.
4. **Enqueue** `sync.booking:<id>:bf` and `sync.signup:<userId>:bf` with `available_at = now() + n * 5 s` (stagger ⇒ no two rows of one person within seconds; handlers are convergent anyway). Re-run uses a new tag (`bf2`).
5. Verify with a read-only script (counts only): Supabase distinct persons = Espo Contacts with ≥ 1 CBooking… = Chatwoot contacts created by the sync; `infra/espocrm/backfill.mjs --audit` still reports `duplicates=0`.

`infra/espocrm/backfill.mjs` is **not** reused for the new behaviour; its `--audit` and `inspect.mjs count` stay as post-checks. Legacy phones: the live path uses `normalizePhone` only, so Chatwoot contacts for legacy customers whose stored phone has no country code will have no phone (Open Question 5).

## Outbox health and retry (SYNC-05, D-11, D-12)

- Page `/admin/outbox` (English admin, no i18n): counts by status and event type, oldest pending age, last 100 non-`sent` rows (key, type, status, attempts, `last_error` code, `available_at`) — the row data is ids and codes only `[VERIFIED: 064 header comment "nothing here ever holds an email, name, phone or message"]`; for booking aggregates optionally join `booking_reference` (not PII).
- New RPCs (all `SECURITY DEFINER`, `search_path=''`, service_role only, re-REVOKE after any DROP+CREATE): `outbox_health()` (jsonb counts), `outbox_retry(p_key)` (status `failed`|`pending` ⇒ `pending`, `attempts=0`, `available_at=now()`; **keep `last_error`** until success), `outbox_retry_failed(p_limit)` returning keys. The existing `outbox_reschedule` only accepts `processing` rows, so it cannot be reused `[VERIFIED: 064:219-226 "AND status = 'processing'"]`. The route then calls `publishOutboxDispatch(key, { dedupSuffix: 'r' + epoch })` in batches of 10 (as the sweep does `[VERIFIED: app/api/cron/outbox-sweep/route.ts PUBLISH_BATCH = 10]`).
- Digest (D-11): in the existing sweep (daily 04:00 UTC), count failed (terminal), stuck (`pending` with `available_at` older than ~6 h, or `processing` with lease expired), and repeatedly retrying rows; compute **before** the re-publish step, send one Resend email to `MANAGER_EMAIL` only when any count > 0: counts + link to `/admin/outbox`, no keys, no ids. Reuse the sweep's `step()` error isolation so a digest failure never blocks the re-publish. The sweep already logs `[outbox-sweep] ALERT failed_last_25h=<n>` `[VERIFIED: sweep route line 67]`.

## Erasure saga (GDPR-01, D-07..D-10)

**Flow:** `POST /api/admin/erasure/preview {email|phone}` (Supabase-only; returns counts: bookings, upcoming trips warning, has account, inquiries, leads-by-ref) creates an `erasure_requests` row `status='previewed'` holding **ids only** (identity id, booking ids, user id) + HMAC of the normalised email + `expires_at`. `POST …/confirm {requestId, confirmEmail}` re-derives the HMAC from the typed email, compares timing-safe, sets `confirmed`, sets the identity's `erasing_at` (freeze: resolver and handlers skip/defer a frozen identity), enqueues `erase.person:<requestId>`, publishes.

**Saga (dispatcher, each step idempotent and recorded in `erasure_requests.steps`):**
1. Load identifiers from Supabase (identity emails/phones, user id, booking ids/refs) — still intact because Supabase is last.
2. **Chatwoot:** find contact(s) by cached id/identifier/emails/phones; `DELETE /contacts/:id` with the admin credential; 422 "online" ⇒ retry later; verify 404.
3. **EspoCRM:** for the Contact(s) and Leads (by `emailAddress`, and by `cSupabaseRef` for the person's inquiry ids and booking ids — Phase 81 Leads are keyed `inquiry:<uuid>` / `booking:<uuid>` `[VERIFIED: lib/lead-mapping.ts:149-157]`): **PUT blank PII, then DELETE** (Pitfall 6). CBookings are anonymised by letting the mapper emit blanks for anonymised rows (`passengerName`, `flightNumber`, `pickup`, `dropoff` = `''`, `contactId` = null); keep `name` (reference), `pickupAt`, `amount`, `vehicleClass`, `status`, `adminLink`.
4. **Supabase (one transaction, under the global identity lock):** anonymise bookings (`client_first_name`, `client_last_name`, `client_email`, `client_phone`, `special_requests`, `operator_notes`, addresses, lat/lng, `flight_number`, `user_id`; set `anonymised_at`), scrub `booking_edit_audit_log` values, `email_log.recipient`, `gnet_bookings.raw_payload`, `driver_assignments.trip_note`; delete `inquiries` and `quote_leads` rows by normalised email; delete identity rows; then `auth.admin.deleteUser`. Placeholder values must satisfy live NOT NULL/CHECK constraints (Open Question 7) — e.g. a unique non-routable email such as `erased-<bookingId>@erased.invalid` so nothing re-links.
5. **Verify pass:** repeat the Chatwoot/EspoCRM lookups; any survivor ⇒ delete again. Write counts to the audit row (`completed_at`, per-system counts, `verified` boolean).
6. The anonymising `UPDATE` fires the new sync trigger and the gcal trigger: the sync trigger must early-return when `NEW.anonymised_at IS NOT NULL`, and `identity_resolve_booking` returns nothing for anonymised rows (otherwise the erased person is re-created from the placeholder).

**Audit record (no PII):** `erasure_requests(id, requested_by uuid, email_hmac text, requested_at, confirmed_at, completed_at, status, steps jsonb, counts jsonb)`. HMAC key from a dedicated Vercel secret (owner-run script); plain SHA-256 is reversible by dictionary. The dispatcher must re-read the request row and require `status='confirmed'`; the key alone never authorises an erasure.

**Credentials:** erasing needs (a) EspoCRM `Contact` delete — today the Sync writer has `"Contact": { "create": "yes", "read": "all", "edit": "all", "delete": "no" }` `[VERIFIED: infra/espocrm/roles.json:40]`; change to `delete: yes`, apply with `node infra/espocrm/sync.mjs --only roles`, prove with `verify-acl.mjs` (Phase 81 81-11 precedent); (b) a Chatwoot **administrator** token (destroy is admin-only), stored as a sensitive Vercel secret by an owner-run script. Recommend a dedicated Chatwoot user for the site (not the owner's token), and treat its blast radius as "can read every conversation" in the security register.

## Privacy policy delta (GDPR-02, D-13, D-14)

Content lives in `content/pages/<locale>/privacy.json` (loaded by `getPageContent('privacy', locale)`, page is `force-static`) `[VERIFIED: app/[locale]/privacy/page.tsx:3,53; lib/page-content.ts]`, not in `messages/*.json`. Phase 77 already added Chatwoot, Hostinger (Germany), Backblaze (US) and Telegram providers, the section-5 transfer sentence and the `cw_conversation / cw_user_*` cookie entry `[VERIFIED: content/pages/en/privacy.json sections 4,5,7 as read]`, and froze those units via `.planning/phases/77-…/freeze/77-05.freeze`. Remaining delta:
- **Name EspoCRM** (self-hosted, same Hostinger Germany server) and Meta (WhatsApp, generic mention only per D-14); add the CRM/inbox data categories to section 2 (messages via chat/email/Telegram/WhatsApp, account profile, CRM contact record) and the legal basis to section 3.
- **Section 6 conflicts with D-13:** current text — "Booking records: 5 years …", "Contact form submissions: 12 months after your enquiry has been resolved" `[VERIFIED: content/pages/en/privacy.json section6 as read]` — must become: chat/email conversations until an erasure request; forms until an erasure request; abandoned checkouts 90 days; bookings/invoices up to 10 years (anonymised on erasure). The "10 years vs 5 years" figure is a legal claim `[ASSUMED]`, flagged for owner confirmation (Open Question 2).
- **Backups:** erased people persist in encrypted backups until rotation (7 daily / 4 weekly / 6 monthly) `[VERIFIED: backup-restore.md:44-45]` — disclose.
- **Rights section:** how to request erasure (email), that identity is verified first, what is removed vs retained (anonymised accounting data), systems covered.
- Bump `hero.lastUpdated`. Translate by hand in-session into ru/es/fr/ar/hi/zh (the Translate workflow is disabled; never run `scripts/i18n-translate.mjs --dry-run` on the tree), and add a `.freeze` file for the edited units like 77-05 did. `ar` is RTL; check the existing page for direction handling when adding list items.

## Common Pitfalls

### Pitfall 1: One-shot unique key swallows later edits
**What goes wrong:** `outbox_enqueue` returns false on conflict; a `sent` row blocks all future events with that key.
**Why:** unique index `integration_outbox_key_idx` + `ON CONFLICT DO NOTHING` `[VERIFIED: 064:40-41,120]`.
**How to avoid:** bucketed keys (Pattern 1); test with: edit, dispatch, edit again ⇒ second row exists.
**Warning signs:** CRM stops reflecting edits after the first sync; `enqueue` returns `false` in logs.

### Pitfall 2: Two bookings of one person create two Contacts
**What goes wrong:** booking-aggregate rows run concurrently; EspoCRM has no uniqueness on Contact email (only an API-level duplicate check).
**How to avoid:** resolver hop + person-aggregate rows (Pattern 2); lookup-before-write; on 409 re-lookup then converge; stagger backfill.

### Pitfall 3: Trigger fires on unchanged values or aborts a booking write
**What goes wrong:** `UPDATE OF` fires when a column is merely in the SET list; any exception in a trigger aborts the booking.
**How to avoid:** `IS DISTINCT FROM` guard; whole body in an exception block that only `RAISE WARNING`s, kick in a nested block (067 pattern `[VERIFIED: 067:100-150]`); never read the CRM from the trigger.

### Pitfall 4: GNet placeholder identity
**What goes wrong:** GNet bookings store `client_email: firstPassenger?.email || 'noreply@gnet.local'` and `client_phone: firstPassenger?.phoneNumber || 'unknown'` `[VERIFIED: app/api/gnet/farmin/route.ts:374-375]`. Under "same email = same person" every placeholder GNet booking becomes one person.
**How to avoid:** the identity normaliser rejects `@gnet.local`; a placeholder-email booking gets a CBooking with **no Contact link** and no Chatwoot contact. Phase 80's backfill used a looser email regex, and the candidate scan shows two `gnet.local` bookers `[CITED: 80-12-SUMMARY.md:92]`: check `inspect.mjs`/a Contact search for `@gnet.local` Contacts and decide cleanup (do not auto-delete).

### Pitfall 5: Chatwoot phone numbers are unique per account
**What goes wrong:** writing a shared hotel-desk phone to a second Chatwoot contact returns 422 "has already been taken" `[CITED: …/app/models/contact.rb]`; a naive retry loop fails permanently.
**How to avoid:** never write a shared phone to Chatwoot; apply the 422 relaxation ladder; the pre-create phone lookup is part of "find".

### Pitfall 6: EspoCRM DELETE is a soft delete
**What goes wrong:** deleted records keep `deleted = 1` in the database until a clean-up job removes them (default period reported as 3 months, configurable via `cleanupDeletedRecordsPeriod`) `[CITED: forum.espocrm.com/forum/developer-help/99998 and /41460; LOW — forum posts]`. A DELETE alone does not satisfy erasure.
**How to avoid:** PUT blank PII first (Contact: clear `emailAddressData`/phone, set `lastName` to a neutral value since it is required; Lead likewise), then DELETE; consider `POST /api/v1/DataPrivacy/action/erase` (`entityType`, `fieldList`, `id`) `[CITED: forum.espocrm.com/forum/developer-help/41460 — 2018 post, version-unverified, LOW]`. Ask the owner whether to also shorten `cleanupDeletedRecordsPeriod` in Settings via `infra/espocrm/settings.json`.

### Pitfall 7: Erasure races with sync and resurrects the person
**How to avoid:** `erasing_at` freeze flag; resolver RPC reads the booking itself under the global lock and returns nothing for anonymised rows; erase aggregate = identity so it shares the claim mutex with `sync.espo/chatwoot`; final verify pass; document the residual window.

### Pitfall 8: Currency tokens in `infra/chatwoot`
**What goes wrong:** `.husky/pre-commit` runs `scripts/qa/chatwoot_price_gate.mjs` on staged `infra/chatwoot/*.json|md` and fails on `/€|\b(?:eur|euros?|czk|kc|koruna|koruny|korun)\b|kč|…/iu` `[VERIFIED: scripts/qa/chatwoot_price_gate.mjs:22-23]`. A display name "Total spent (EUR)" or a doc line in `infra/chatwoot/README.md` mentioning EUR blocks the commit. Key `lifetime_value` is safe; `total_spent_eur` is too (underscore is a word character, no `\b`), but a "EUR" display name is not.
**Also:** the repo hook rejects `€` followed by 2+ digits in `app/` and `components/` — render amounts from numbers with the string `'EUR'` assembled in code outside those dirs, never a `€NN` literal.

### Pitfall 9: "Within minutes" vs the 90 s delay and Hobby cron
The kick route publishes with `KICK_DELAY_SECONDS = 90` `[VERIFIED: kick route]`; typical latency ≈ 2 min. Cron is daily only (all four crons are once-a-day `[VERIFIED: vercel.json]`), so the sweep is a daily safety net, not a latency tool. Do not add a sub-daily cron.

### Pitfall 10: Account-linked data not reachable by email
A signed-in customer's bookings carry `user_id`; guests carry only `client_email`. The admin account views match `user_id.eq.<id>,client_email.ilike.<email>` `[VERIFIED: app/api/admin/accounts/[id]/route.ts orFilter]`. The erasure scope and the identity's booking set must union both (and phone-merged emails), not just the email.

### Pitfall 11: Client interface gaps
`SiteEspoClient.put/del` accept no extra headers and `del` ignores 404 only if the caller handles it (`deliverPurge` pattern `[VERIFIED: lib/lead-sync.ts:212-219]`); the Espo duplicate-check bypass is only available on `post`. The dispatcher's 4xx ladder must be written per call.

### Pitfall 12: Admin split cannot undo a Chatwoot merge
Document it; that is why auto-merge in Chatwoot is limited to ≤ 2 candidates matched through the identity's own keys.

### Pitfall 13: Unverified signup email
`signUpWithPassword` upserts the profile right after `auth.signUp`, before email confirmation `[VERIFIED: app/[locale]/login/actions.ts "In production with email confirmation, data.session may be null here"]`. A signup trigger will create a CRM/Chatwoot contact for an unconfirmed address. Acceptable for "signup creates the Contact", but never grant customer-facing access from identity links, and prefer name-from-profile only after it is non-empty.

## Code Examples

### Pure reference model for identity resolution (parity-tested against the SQL)
```typescript
// Source: design for this phase; mirrors the booking_lead_status() <-> BOOKING_LEAD_STATUS parity
// pattern of 067 / tests/outbox-migrations.test.ts
export type Basis = 'email' | 'phone' | 'signup' | 'split'
export function resolve(
  state: { emails: Map<string, string>; phones: Map<string, Set<string>>; shared: Set<string> },
  e: string, p: string | null,
): { identity: string; mergedByPhone: boolean; flaggedShared: boolean } { /* rules 1-3 above */ }
```
Run the same table of fixtures through this model and through the SQL (orchestrator smoke inside `BEGIN … ROLLBACK`, `SMOKE_OK_82_xx` marker as in Phase 81).

### Parity test for the TS mapper (tests may import infra code)
```typescript
// Source: pattern of tests/espocrm-booking-map.test.ts (pinned enums) — new file
import { rowToBooking } from '../infra/espocrm/lib/booking-map.mjs'
import { buildCBookingDraft } from '@/lib/customer-mapping'
it.each(fixtureRows)('TS mapper equals the Phase 80 mapper for %s', (row) => {
  expect(buildCBookingDraft(row)).toEqual(rowToBooking(row)) // minus contactId/accountId
})
```

### Chatwoot find-by-email (shape ASSUMED, probe in Wave 0)
```typescript
// POST /api/v1/accounts/{id}/contacts/filter
const body = { payload: [{ attribute_key: 'email', filter_operator: 'equal_to', values: [email], query_operator: null }] }
```

### Admin route guard order (existing pattern)
```typescript
// Source: app/api/admin/accounts/route.ts
const { error } = await getAdminUser()
if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Lead-only outbox keys (`lead.*`) | Generic event types + bucketed keys | Phase 82 | `parseOutboxKey`, kick route, sweep unaffected otherwise |
| Per-booking one-shot Lead refresh | Convergent per-person sync | Phase 82 | Lead refresh on edit stays deferred |
| Backfill via workstation export files | Backfill = SQL-enqueued replay of live handlers | Phase 82 (recommended) | No PII export files, one mapper |

**Deprecated/outdated:**
- `.planning/codebase/*.md` (dated 2026-03-20) describes a static site with no database; ignore it. `types/database.types.ts` is also stale (no `payment_link_*`, `paid_at`, `invoice_number`, `lead_channel`); read live schema, not the types file.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | EspoCRM DELETE is a soft delete cleaned up by a job (default ≈ 3 months) | Pitfall 6, Erasure | If hard delete, the scrub step is harmless; if soft and not scrubbed, erasure is incomplete |
| A2 | `POST /api/v1/DataPrivacy/action/erase` exists with `entityType`, `fieldList`, `id` in the deployed EspoCRM 10.0.8 | Pitfall 6 | Use manual PUT-blank instead; probe in Wave 0 |
| A3 | Chatwoot `POST /contacts/filter` body shape `{payload:[{attribute_key, filter_operator, values, query_operator}]}` | Chatwoot section | Wrong shape ⇒ lookups fail; probe live first |
| A4 | EspoCRM `where` type `in` with an array works on `/CBooking` list and `emailAddressData` PUT replaces the whole list | Dispatcher | Fall back to one GET per booking and read-modify-write for emails |
| A5 | Czech accounting/VAT retention "up to 10 years" (D-08/D-13) vs current policy "5 years" | Privacy | Wrong legal period in a public policy; owner/legal confirmation needed |
| A6 | `bookings.client_*` are NOT NULL with no extra CHECKs, so anonymisation needs placeholder strings | Erasure | Anonymise UPDATE fails at runtime; orchestrator must query `information_schema` and constraints first |
| A7 | `driver_assignments.trip_note` and other columns not in the stale types file may hold PII | Runtime State | Missed PII; run a live column inventory (`*email*`, `*phone*`, `*name*`, `*note*`) |
| A8 | A Chatwoot administrator token is acceptable on Vercel (blast radius: all conversations) | Erasure | Owner may prefer a manual erase for Chatwoot |
| A9 | The anonymising booking UPDATE rewrites the Google Calendar event with blanks for accepted statuses | Runtime State | Calendar keeps PII; verify live |
| A10 | QStash free plan allows ~1000 messages/day (soft limit) `[CITED: upstash.com/pricing/qstash.md via search result]`; this phase publishes ≈ 3–4 messages per booking event | Pitfall 9 | Backfill + live traffic still far below; recheck if volume grows |
| A11 | `ERASURE` audit hashing needs a new Vercel secret created by an owner-run script | Erasure | Alternative: plain SHA-256 (weaker) |
| A12 | The site is on Vercel Hobby (cron daily only) — from `vercel.json` all daily and project memory | Pitfall 9 | If Pro, sub-daily digests possible, but not needed |

## Open Questions

1. **D-04 vs D-05: does the first phone-only merge for a number get created, or suppressed?**
   - What we know: D-04 merges a new email into the owner of a non-shared phone; D-05 flags a phone "seen with ≥ 2 different emails" as shared. The merge itself creates the second email on that phone.
   - What's unclear: for a hotel desk, the second guest is merged into the first guest (one wrong merge per desk) before the number flips to shared.
   - Recommendation: implement literally (merge once, then flag shared, list on the identity page for split) **and** have the owner seed known desk phones first (backfill step 1). Ask the owner whether to add a guard (e.g. no auto phone-merge when last names differ).

2. **Retention periods in the privacy policy** — current text says 5 years / 12 months; D-13 says up to 10 years / until erasure. Confirm the legal basis for "10 years" with the owner (Czech accounting vs VAT-document retention).

3. **Chatwoot and EspoCRM credentials for erasure** — admin-role Chatwoot token on Vercel; widen Sync writer to `Contact: delete yes`. Alternative: a separate `prestigo-erase` EspoCRM API user (its own role) and a separate Chatwoot admin user used only by `erase.person`. Recommendation: widen Sync writer (smallest change) + dedicated Chatwoot admin user; owner decides.

4. **Abandoned checkouts and D-01** — D-01 says "everyone who booked". Recommend abandoned online checkouts (Leads, not CBookings) get **no** Chatwoot contact until a qualifying booking or signup exists.

5. **Legacy phones in Chatwoot** — customers whose stored phone has no country code get no Chatwoot phone (live path never guesses). Report the count from the identity dry-run and accept, or let the owner approve a one-time Chatwoot-only guess (not recommended; locked rule says never in the live flow).

6. **Residual PII outside the saga** — EspoCRM `Email`, `Task`, stream/notes tied to the Contact, Hostinger mailbox archive, backups, Stripe, Resend. D-09 covers Contact/Leads/CBookings only. Recommend: state limits in the policy and an erasure runbook with a manual checklist; optionally extend the saga to related `Email`/`Task` if the Sync writer is granted access.

7. **Live schema facts needed from the orchestrator before writing 069/071** — exact `bookings` columns and constraints (NOT NULL, CHECK, unique, triggers), whether `bookings.updated_at` exists, `driver_assignments.trip_note`, any further tables with PII, and whether `integration_outbox` has grown. Run via Supabase MCP (subagents have none).

8. **Existing `gnet.local` Contacts in EspoCRM** — count them (`inspect.mjs`) and decide cleanup; sync must not re-link them.

## Environment Availability

Not probed from this session (read-only research; production calls are orchestrator/owner territory). Status per Phase 81 go-live record.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase (prod) | all | ✓ (live 2026-10-18) | — | — |
| QStash EU + signing keys in Vercel | dispatch | ✓ `[CITED: 81-11-SUMMARY.md Task 1]` | — | daily sweep re-arm |
| EspoCRM `crm.rideprestigo.com`, API key `ESPOCRM_*` | sync.espo, erasure | ✓ `[CITED: 81-11-SUMMARY.md]` | 10.0.8 `[CITED: infra/espocrm/README.md "Token header semantics (EspoCRM 10.0.8)"]` | outbox retries |
| Chatwoot `chat.rideprestigo.com` | sync.chatwoot, erasure | ✓ | v4.18.0-ce `[VERIFIED: compose.yml]` | outbox retries |
| Chatwoot API token + account id **in Vercel** | sync.chatwoot | ✗ (not yet) | — | owner-run secret script; none until set (`chatwoot_unconfigured` ⇒ breaker like `crm_unconfigured`) |
| Audit-hash secret in Vercel | erasure | ✗ (not yet) | — | owner-run script |
| Node (local scripts) | verification scripts | ✓ | v24.14.1 | — |

**Missing dependencies with no fallback:** none blocks planning; the two Vercel secrets block go-live of Chatwoot sync and erasure.

## Validation Architecture

> `workflow.nyquist_validation` is not set to false in `.planning/config.json` (file holds only `workflow._auto_chain_active` and `use_worktrees`), so this section applies.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.1 (jsdom default; API/infra tests use `// @vitest-environment node`) `[CITED: 81-VALIDATION.md]` |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/outbox*.test.ts tests/lead-*.test.ts tests/identity*.test.ts tests/crm-sync*.test.ts tests/chatwoot-*.test.ts tests/erasure*.test.ts tests/infra-vps-isolation-guard.test.ts` |
| Full suite command | `npx vitest run` (~90 s) then `npx tsc --noEmit` (baseline 8 old errors in `tests/`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-01 | trigger SQL: bucketed key, gate, IS DISTINCT guard, exception-safe, REVOKE lines, column list | SQL-text unit | `npx vitest run tests/crm-sync-migrations.test.ts` | ❌ Wave 0 |
| SYNC-01 | bucket proof: two writes in one bucket ⇒ one row; next bucket ⇒ new row; row never available before the later write | unit (pure helper + SQL text) | `npx vitest run tests/crm-sync-migrations.test.ts` | ❌ Wave 0 |
| SYNC-01 | `parseOutboxKey` new shapes; kick route accepts `sync.*`, rejects others | unit | `npx vitest run tests/outbox.test.ts tests/integrations-kick.test.ts` | ✅ (extend) |
| SYNC-01 | `sync.espo`: create Contact + CBooking once; retry/duplicate delivery ⇒ still one; 409 lookup; phone 400 ladder; CRM down ⇒ pending + backoff | unit (fake EspoCRM) | `npx vitest run tests/crm-sync.test.ts` | ❌ Wave 0 |
| SYNC-01 | status change / payment / admin edit each reach CBooking (diff PUT) | unit | same | ❌ Wave 0 |
| SYNC-01 | TS mapper parity with `infra/espocrm/lib/booking-map.mjs` | parity | `npx vitest run tests/customer-mapping-parity.test.ts` | ❌ Wave 0 |
| SYNC-02 | profile insert (all 3 signup paths) ⇒ `sync.signup`; Contact + Chatwoot created | unit + SQL text | `npx vitest run tests/crm-sync.test.ts tests/chatwoot-sync.test.ts` | ❌ Wave 0 |
| SYNC-03 | resolution rules (email wins, phone merge once, shared excluded, manual shared, placeholder rejected) — reference model + SQL text | unit | `npx vitest run tests/identity.test.ts` | ❌ Wave 0 |
| SYNC-03 | SQL resolver smoke on live DB inside rollback | live (MCP, orchestrator) | `SMOKE_OK_82_xx` marker | ❌ manual-orchestrator |
| SYNC-03 | split: propagates to both identities, removes only the split email in Espo | unit (fake) + admin route test | `npx vitest run tests/identity-admin.test.ts` | ❌ Wave 0 |
| SYNC-03 | Chatwoot: phone-taken 422 ladder, ambiguity skip, name/phone only when empty, attributes overwritten | unit (fake Chatwoot) | `npx vitest run tests/chatwoot-sync.test.ts` | ❌ Wave 0 |
| SYNC-04 | identity backfill order/report; enqueue fn idempotent; re-run with new tag | SQL text + unit | `npx vitest run tests/crm-backfill.test.ts` | ❌ Wave 0 |
| SYNC-04 | live count equality Supabase vs Espo vs Chatwoot | live script (counts only) | owner/orchestrator run | ❌ manual |
| SYNC-05 | health RPC/route/page auth (401/403), retry one / all, attempts reset, published | unit | `npx vitest run tests/outbox-admin.test.ts` | ❌ Wave 0 |
| SYNC-05 | digest only when problems, no PII in body, sweep still re-publishes if digest throws | unit | `npx vitest run tests/outbox-sweep.test.ts` | ✅ (extend) |
| GDPR-01 | saga order (Chatwoot → Espo → Supabase last), resumable after each step, 422-online retry, scrub-before-delete, verify pass, audit row has hash + counts only | unit (fakes) | `npx vitest run tests/erasure.test.ts` | ❌ Wave 0 |
| GDPR-01 | no resurrection: sync/resolver skip anonymised + erasing; trigger early-return | unit + SQL text | `npx vitest run tests/erasure.test.ts tests/crm-sync-migrations.test.ts` | ❌ Wave 0 |
| GDPR-01 | admin preview/confirm: Origin-strict CSRF, 401/403, typed-email confirmation, HMAC compare timing-safe | unit | `npx vitest run tests/admin-erasure.test.ts` | ❌ Wave 0 |
| GDPR-01 | roles.json Contact delete + verify-acl | unit + live | `npx vitest run tests/espocrm-roles.test.ts` + `node infra/espocrm/verify-acl.mjs` | ✅ (extend) |
| GDPR-02 | privacy.json: 7 locales contain EspoCRM, Chatwoot, Hostinger/Germany, channels, 90 days / until-erasure / 10 years, chat cookie; `lastUpdated` bumped; en vs locale key parity | unit | `npx vitest run tests/privacy-content.test.ts tests/i18n-completeness.test.ts` | ❌ Wave 0 (new) / ✅ |
| all | isolation guard: new CRM files allowlisted with async reason; no admin route imports them | unit | `npx vitest run tests/infra-vps-isolation-guard.test.ts` | ✅ (extend allowlist) |
| all | Chatwoot attribute JSON passes price gate; config test updated | unit | `npx vitest run tests/chatwoot-config.test.ts` | ✅ (update) |

### Sampling Rate
- **Per task commit:** quick run command + `npx eslint --quiet <changed files>`
- **Per wave merge:** `npx vitest run` + `npx tsc --noEmit`
- **Phase gate:** full suite green; `node infra/espocrm/sync.mjs --dry-run` and `node infra/chatwoot/sync.mjs --dry-run` show `create=0 update=0` after apply; live smokes below.

### Wave 0 Gaps
- [ ] `tests/helpers/fake-chatwoot.ts` — contacts CRUD with 422 uniqueness (email ci, phone, identifier), filter, merge, delete (+ "online" 422), custom_attributes shallow merge, rate-limit hook
- [ ] extend `tests/helpers/fake-espocrm.ts` through its `extraRoutes` hook (header rule: extend only across waves) — `in` where, `emailAddressData`, `DELETE`, soft-delete mode flag, role-governed 403 for Contact delete
- [ ] test files listed in the map above
- [ ] live probes (orchestrator/owner): Chatwoot filter payload; Espo `DataPrivacy/action/erase`; Espo `in` where; schema/constraint dump of `bookings` and PII column inventory
- [ ] live rollback smokes per migration (`SMOKE_OK_82_xx`): 069 (resolver rules + trigger enqueue + `crm_sync_start` gate), 070 (retry RPCs), 071 (anonymise tx on a synthetic booking)

### Manual-only verifications (justified)
- VPS-down drill for the new events (reuse the two owner-approved D1/D2 commands from `infra/vps/runbooks/lead-capture.md`): queued sync events deliver exactly once after recovery.
- Live erasure of a synthetic person across the three systems, then the verify pass; Hostinger mailbox / backups are documented, not testable.
- Privacy page visual check of `ar` (RTL) after text additions.

## Security Domain

`security_enforcement` is absent from config ⇒ enabled. Commit identity-matching and erasure work with the `security:` prefix (CLAUDE.md).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (admin) | `getAdminUser()` (`is_admin` in `app_metadata`), 401 before 403 |
| V3 Session Management | yes (admin) | Supabase session cookies; no new session logic |
| V4 Access Control | yes | RLS deny-all + `REVOKE` on all new tables; RPC EXECUTE only to `service_role`; Origin-strict CSRF on `/api/admin` `[VERIFIED: middleware.ts:9-29]` |
| V5 Input Validation | yes | zod two-step (400 malformed / 422 semantic), `enforceMaxBody`, uuid/regex on keys, email/phone normalisation |
| V6 Cryptography | yes | HMAC-SHA256 for the audit email hash (no bare hash), `timingSafeEqual` for secrets (existing pattern in kick/sweep routes), QStash `Receiver` signature |
| V7 Error handling/logging | yes | codes only; never log email/phone/name/response bodies; `last_error` CHECK `^[a-z0-9_]{1,40}$` |
| V8 Data protection | yes | erasure saga, ids-only outbox, no PII in digest email |
| V13 API | yes | signed dispatch route, per-call timeouts, `redirect:'error'` on CRM/Chatwoot fetch |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Identity mis-merge exposes one customer's history under another's Contact/Chatwoot contact | Information Disclosure / Tampering | merge-by-phone marked + admin split; shared-phone list; shared phone never written to Chatwoot; identity links never grant customer-facing access (customer RLS stays `user_id`-only) |
| Attacker books/signs up with a victim's email or phone to graft data | Spoofing | email = key already (accepted); phone-merge limited to once per number then shared; operators-only visibility |
| Forged or replayed erase event | Tampering / EoP | dispatch route accepts QStash-signed only; handler re-reads `erasure_requests.status='confirmed'` + admin id; typed-email confirmation with HMAC compare |
| Erasure resurrected by an in-flight sync | Tampering | freeze flag, resolver skips anonymised, shared claim mutex, verify pass |
| PII in outbox, logs, digest, audit | Information Disclosure | ids-only keys, code-only logs, count-only digest, HMAC-only audit |
| Over-privileged service credentials (Chatwoot admin token, Espo Contact delete) | Elevation of Privilege | dedicated users, owner-run secret scripts, documented blast radius, rotation notes in runbook |
| SECURITY DEFINER default PUBLIC EXECUTE after DROP+CREATE | EoP | re-run `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` for every function in every migration; SQL-text test asserts one REVOKE line per function (064 test pattern) |
| SSRF/redirect to leak API key | Information Disclosure | https-only base URL, `redirect:'error'`, no key in error text (existing client) |
| Poisoned CRM fields / injection via customer text | Tampering | existing `sanitizeText`/length caps; never build `where` clauses from unescaped values (`encodeURIComponent`) |

## Sources

### Primary (HIGH confidence — read this session)
- Repo: `supabase/migrations/{044,045,055,063,064,065,067,068}*.sql`, `types/database.types.ts`, `lib/{outbox,outbox-store,outbox-backoff,lead-sync,lead-mapping,espocrm-client,chatwoot-identity,phone,supabase}.ts`, `app/api/integrations/{dispatch,kick}/route.ts`, `app/api/cron/outbox-sweep/route.ts`, `app/api/admin/{accounts,accounts/[id],settings,bookings}/route.ts`, `app/api/gnet/farmin/route.ts`, `app/auth/callback/route.ts`, `app/[locale]/login/actions.ts`, `infra/espocrm/{README.md,backfill.mjs,roles.json,lib/booking-map.mjs}`, `infra/chatwoot/{README.md,custom-attributes.json,lib/client.mjs}`, `infra/vps/runbooks/{lead-capture,backup-restore}.md`, `infra/vps/chatwoot/compose.yml`, `tests/infra-vps-isolation-guard.test.ts`, `tests/chatwoot-config.test.ts`, `middleware.ts`, `.husky/pre-commit`, `scripts/qa/chatwoot_price_gate.mjs`, `vercel.json`, `content/pages/en/privacy.json`, `.planning/phases/{77,80,81}-*` context/summary/validation/security docs.
- Chatwoot v4.18.0 source on GitHub raw: `app/controllers/api/v1/accounts/contacts_controller.rb`, `app/models/contact.rb`, `app/policies/contact_policy.rb`, `app/actions/contact_merge_action.rb`, `app/actions/contact_identify_action.rb`, `app/services/contacts/filter_service.rb`, `config/initializers/rack_attack.rb` (summaries via WebFetch; quoted fragments only).

### Secondary (MEDIUM confidence)
- Upstash QStash pricing (search results): free plan 1,000 messages/day, soft limit, 429 on sustained excess.
- EspoCRM data-privacy user guide (docs.espocrm.com/user-guide/data-privacy/): erase is a record-level action on fields flagged as personal data; requires Data Privacy permission and edit access.

### Tertiary (LOW confidence — marked `[ASSUMED]`/forum)
- forum.espocrm.com threads (erase endpoint 2018; soft delete + `cleanupDeletedRecordsPeriod`).
- Training-knowledge shapes: Chatwoot filter payload, EspoCRM `in` where type and `emailAddressData` semantics.

The `gsd-tools research-plan` / `classify-confidence` seam and MCP doc providers (Context7 etc.) were not used: they were not available in this session; WebSearch/WebFetch and direct source reads were used instead, with confidence assigned manually.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; versions read from `package.json`.
- Architecture (outbox extension, bucketed keys, person-aggregate serialisation): HIGH for the primitives (read from SQL/TS), MEDIUM for the exact function signatures (design proposal).
- Identity semantics: MEDIUM — locked decisions interact (Open Question 1).
- Chatwoot behaviour: MEDIUM-HIGH (source-fetched for v4.18.0); filter payload shape LOW.
- EspoCRM erase/soft-delete: LOW-MEDIUM (forum-level evidence) — needs a live probe.
- Pitfalls: HIGH for repo-derived ones (Pitfalls 1, 3, 4, 8, 11, 13), MEDIUM for external-system ones.

**Research date:** 2026-10-18
**Valid until:** 2026-11-17 for repo facts (phases 83/84 may touch the same files); 30 days for Chatwoot v4.18.0 behaviour (pinned image; re-check after any upgrade per `infra/vps/runbooks/upgrade.md`).
