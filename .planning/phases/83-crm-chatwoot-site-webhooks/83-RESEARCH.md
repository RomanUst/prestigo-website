# Phase 83: CRM/Chatwoot → Site Webhooks - Research

**Researched:** 2026-10-26
**Domain:** Inbound webhook receivers (Chatwoot v4.18.0-ce, EspoCRM 10.0.8) → Supabase outbox → CRM/Chatwoot writes; HMAC verification; echo-loop prevention
**Confidence:** HIGH on signing mechanics and echo-suppression primitives (read from the pinned upstream source), MEDIUM on live payload shapes (source-derived, not yet captured from the running instances)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Carried forward (locked in earlier phases — do not re-decide)
- Supabase is the single source of truth for `bookings` / `customer_profiles`; CRM/Chatwoot never write them
  (PROJECT.md v4.0, ARCHITECTURE.md "isolation by omission").
- Contact key = trimmed lower-cased email; E.164 phone merges only when the phone is not shared; shared phones
  never merge (82 D-04/D-05). Identity links live in Supabase `contact_identities` + `identity_emails` /
  `identity_phones` (82 D-06).
- Field ownership on existing EspoCRM Contacts: sync never overwrites `accountId`, `title`, `description` or
  names; `phoneNumber` only when empty; sync never writes Accounts (`infra/espocrm/README.md`).
- Every site customer already has a Chatwoot contact (82 D-01); site fills Chatwoot identity fields only when
  empty (82 D-03).
- One Lead per booking for site bookings (81 D-05); all new Leads assigned to the owner (81 D-13); nothing
  created in the CRM that requires owner confirmation (no Accounts) (80 D-14).
- Visitor flows never depend on outbox/VPS (81 D-18). Outbox rows carry ids only, never PII (Phase 81).
- Website widget pre-chat requires email (77 D-04). Channel labels `ch-email`, `ch-web`, `ch-telegram` (77 D-20).
- Erasure covers Supabase + Chatwoot + EspoCRM via the outbox (82 D-07..D-10).

#### When a conversation becomes a Lead (HOOK-01)
- **D-01:** "Unknown" = no site booking and no site account: the email/phone resolves to no identity in the
  site identity tables and to no existing EspoCRM Contact. Customers synced by Phase 82 never produce a chat
  Lead.
- **D-02:** One open chat Lead per person. While that Lead is not Converted/Dead, further conversations from the
  same person append to it (reference + link) instead of creating a new Lead. After it closes, a new
  conversation creates a new Lead. — **Reversibility:** costly — Phase 85 chat-conversion stats count on one
  open Lead per person.
- **D-03:** The Lead is created on the customer's first incoming message, not on `conversation_created` and not
  on the operator's first reply. Empty conversations (widget opened, nothing written) create nothing. The first
  message goes into the Lead description (truncated).
- **D-04:** No email and no phone (e.g. Telegram gives only a name/handle): create the Lead without a Contact
  (name, channel, Chatwoot conversation link). The Contact is created/linked once an email or phone appears
  (see D-12). Never create a Contact keyed on a name only.
- **D-05:** When the same email/phone later gets a paid site booking, the open chat Lead is automatically set to
  Converted and linked to that booking (reference + admin link). The booking's own Phase 81 Lead stays as is.
- **D-06:** A known customer starting a conversation creates nothing in the CRM at start; only the resolution
  entry (D-08) is written.
- **D-07:** Spam / non-target mail: automatic filter skips Lead creation for auto-replies, no-reply senders and
  bulk mail (mail headers such as `Auto-Submitted`, `Precedence: bulk/list`, `List-Unsubscribe`, no-reply
  addresses). A Chatwoot label `no-lead` (added via the Phase 77 config-as-code) moves an already created chat
  Lead to Dead.

#### Resolved-conversation history (HOOK-02)
- **D-08:** On resolve, write one history entry: channel/inbox, opened and resolved dates, message count, topic
  labels, the customer's first message (truncated) and a link to the conversation in Chatwoot. No full
  transcript is copied into the CRM (the conversation stays in Chatwoot; minimal PII duplication).
- **D-09:** Human summary comes from the operator's private note: if the conversation has a private note marked
  as the summary (e.g. starting with "Итог:" / "Summary:"), its text becomes the summary in the entry. No note →
  no summary line. No AI summarisation (no API spend, no new processor).
- **D-10:** Every resolve is its own history entry (idempotency key = conversation id + resolve moment), so a
  reopened-and-resolved-again conversation adds a second episode, while a re-delivered webhook adds nothing.
- **D-11:** If the person has no Contact yet (Lead only, D-04), the entry goes on the Lead's history; once a
  Contact exists, new entries go to the Contact.

#### EspoCRM webhook and Chatwoot contact updates
- **D-12:** Chatwoot `contact_updated`: when the operator adds an email/phone to a Chatwoot contact, the site
  creates or finds the EspoCRM Contact (identity rules above) and links the open chat Lead. On an existing
  Contact only empty fields are filled (README field ownership).
- **D-13:** EspoCRM webhook scope = Contact edits only (name, phone, company/account name) → pushed to the linked
  Chatwoot contact. Bookings, site profiles and identity merge/split are untouched. No Lead-status or merge
  events are consumed in this phase.
- **D-14:** For EspoCRM → Chatwoot, a human edit in EspoCRM wins and overwrites the Chatwoot field (a deliberate
  correction). Changes made by the sync user `prestigo-sync` are ignored — this is also an echo-loop guard
  (HOOK-04). This is a narrow exception to 82 D-03, which still governs site → Chatwoot writes.

#### What inbound webhooks may write in Supabase (HOOK-03)
- **D-15:** Receivers only verify (HMAC over the raw body, timestamp window, delivery dedup) and enqueue an
  outbox event; the existing dispatcher performs the CRM/Chatwoot calls with its retries, backoff, health page and
  digest. No CRM calls inline in the webhook request.
- **D-16:** A chat stranger with an email/phone is registered in the site identity tables like any other person
  (email/phone + Chatwoot/EspoCRM ids), so the Phase 82 merge rules, the split page and GDPR erasure cover them,
  and a later booking links to the same identity. — **Reversibility:** costly — identity table gains a new
  origin (schema `basis` CHECK currently allows only email/phone/signup/split) that erasure and merge logic
  must handle.
- **D-17:** Allowed Supabase writes from the inbound path: webhook delivery/dedup records, outbox rows, identity
  tables (D-16), and whatever chat-Lead/conversation mapping the planner needs. Never `bookings`,
  `customer_profiles` or `auth.users` — enforced structurally (receivers/handlers cannot import booking/profile
  write helpers; guard test like the Phase 76 isolation guard).

### Claude's Discretion
- Exact header names, HMAC scheme per system (Chatwoot v4.18.0-ce signature support must be confirmed against the
  pinned version; EspoCRM 10.0.8 `X-Signature`), replay window length, dedup storage and its retention.
- Echo-loop mechanism details (origin tag / fingerprint of last outbound write, ignoring `prestigo-sync` actor,
  ignoring Chatwoot contact updates caused by the site's own API token).
- Lead source values per channel (e.g. "Website chat", "Email info@", "Email bookings@", "Telegram") and how the
  enum is extended via `infra/espocrm` config-as-code.
- EspoCRM history entry type (Stream Note vs activity) and its formatting; truncation length of the first message.
- New outbox event type names/key format alongside `sync.*` / `lead.*`; webhook route paths
  (`app/api/webhooks/chatwoot`, `app/api/webhooks/espocrm` per ARCHITECTURE.md).
- Registering webhooks in Chatwoot/EspoCRM (config-as-code script vs runbook step) and secret storage
  (Vercel env + `~/.config/prestigo`, never committed).
- Whether conversations that existed before go-live are processed: default forward-only (as 81 D-21).
- How "paid booking with the same email/phone" (D-05) is detected — hook into the existing booking sync trigger.

### Deferred Ideas (OUT OF SCOPE)
- AI-generated conversation summaries (rejected for now: API credits empty, new processor in privacy policy).
- Full transcript copies in the CRM (rejected: PII duplication).
- Reading EspoCRM merges/splits and Lead status changes back into the site (rejected for this phase; 82 D-06 keeps
  split/merge on the site admin page).
- Notifications about new chat Leads (not discussed; Chatwoot already notifies about the conversation).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HOOK-01 | New Chatwoot conversation from an unknown person creates/updates a Contact and Lead in EspoCRM (channel as lead source) | Chatwoot `message_created` payload shape + intake handler design; Lead source enum extension; identity classification rules (D-01/D-16); D-07 filter limits (header data not available) |
| HOOK-02 | Resolved conversation → summary/transcript link written to the Contact's history in EspoCRM | `conversation_status_changed` handling; Chatwoot messages API paging for private-note summary + count; EspoCRM Stream Note (`POST /Note`) with the existing Sync writer role |
| HOOK-03 | Inbound webhooks verified (HMAC over raw body, timestamp replay window, delivery dedup) and structurally cannot write `bookings`/`customer_profiles` | Exact Chatwoot and EspoCRM signing schemes (verified from source), replay/dedup design per system (EspoCRM has no timestamp or delivery id), three-layer structural barrier |
| HOOK-04 | Site → CRM → webhook → site echo loops cannot occur (origin tagging/fingerprinting on outbound writes) | EspoCRM native `skipOwn` (only effective when the webhook is created by `prestigo-sync`), Chatwoot has no actor in `contact_updated` so a state fingerprint attribute is required, loop fuse, simulation harness |
</phase_requirements>

## Summary

Both upstreams can be verified, and the pinned versions' behaviour was read from source, not recalled. **Chatwoot v4.18.0-ce signs account-level webhooks** with `X-Chatwoot-Signature: sha256=<hex HMAC-SHA256(secret, "<X-Chatwoot-Timestamp>.<raw body>")>`, adds `X-Chatwoot-Timestamp` (unix seconds, stamped at send time) and `X-Chatwoot-Delivery` (random UUID per job). The secret is generated server-side (`has_secure_token`), cannot be chosen through the API, and is returned by the webhook create/list API to an administrator token. **Chatwoot never retries a failed account-webhook delivery** (errors are logged and swallowed, 5 s timeout), so delivery is at-most-once. **EspoCRM 10.0.8 sends two headers**: `Signature` = base64(`<webhookId>:<hex HMAC-SHA256(body, secretKey)>`) and the legacy `X-Signature` (binary-hash variant, removed in v11). It has **no timestamp and no delivery id**, batches events into a JSON **array** (cron job, default every 5 minutes), retries only some status codes up to 4 times at 10-minute spacing, and **deletes the webhook if the receiver answers 410**. The CONTEXT/ARCHITECTURE references to `X-Signature` are stale: verify `Signature`.

Echo-loop prevention cannot rely on actor ids in payloads: neither the Chatwoot `contact_updated` payload nor the EspoCRM update payload carries the actor (EspoCRM's webhook manager explicitly strips `modifiedAt`/`modifiedBy`). Two native/primitive mechanisms exist and must be combined: (1) EspoCRM's per-webhook `skipOwn` flag drops events caused by the webhook owner at the source, but **only when the webhook is created by the `prestigo-sync` API user itself** (admin-created webhooks have `skipOwn` forced to false), which needs the `Webhook` scope added to the Sync writer role; (2) for Chatwoot, an origin **fingerprint attribute written in the same PUT as every site write** (`custom_attributes.site_sync_fp` = hash of name/email/phone/identifier after the write), compared by the receiver against the payload's own state, so site-originated events are dropped before they touch the outbox. Asymmetric field ownership (name/phone flow only Espo→Chatwoot; email/phone fill-empty flow only Chatwoot→Espo), state-convergent handlers (re-read, diff, write only differences) and a per-entity loop fuse make a loop structurally bounded; a vitest simulation harness proves it.

The existing outbox/dispatcher is reused as designed (ids-only rows, claim-after-side-effect, QStash). The hard constraints to plan around: `integration_outbox.aggregate_id` is `uuid NOT NULL` and Chatwoot ids are integers (derive a deterministic uuid and carry the integer in the key tag); `parseOutboxKey` is the single key gate (new event types must be added or the dispatcher answers `unknown_key` and the admin retry route 422s); the Phase 76 VPS isolation guard will flag every new file that names a `CHATWOOT_*`/`ESPOCRM_*` env var or imports a flagged file, so allowlist entries with honest reasons are part of the work; and D-01 (unknown person) collides with D-16 (strangers become identities), so "unknown" must be defined by *no bookings/account*, not by *no identity*.

**Primary recommendation:** Build two thin, signature-first receivers (`app/api/webhooks/chatwoot`, `app/api/webhooks/espocrm`) that verify → filter/echo-drop → call one atomic `webhook_ingest` Supabase RPC (dedup + fuse + `outbox_enqueue`) → 200; add five `hook.*` outbox event types handled by new dispatcher modules that always re-read the source system (payloads are hints, never data); register the EspoCRM webhook as `prestigo-sync` with `skipOwn=true`; write a `site_sync_fp` fingerprint on every site → Chatwoot contact write.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Webhook authentication (HMAC, replay window) | API / Backend (Next route handler, Node runtime) | — | Needs `node:crypto` and raw bytes; must run before any parsing or DB access |
| Delivery dedup, loop fuse, enqueue | Database / Storage (one SECURITY DEFINER RPC) | API / Backend | Atomic in one transaction; the outbox is already the only durable queue |
| Lead/Contact/Note creation in EspoCRM | API / Backend (QStash-invoked dispatcher handlers) | — | D-15: no CRM calls inline in the webhook request; reuses retries/backoff/breaker |
| Person classification (customer vs stranger) and identity registration | Database / Storage (identity RPCs, global advisory lock) | API / Backend | The identity resolver lives in Postgres (069/072); lock + merge rules must not be re-implemented in TS |
| Echo suppression | EspoCRM (native `skipOwn`) + API / Backend (fingerprint in receiver and dispatcher) | Database (fuse counter) | Each system exposes a different primitive; no single tier can do it alone |
| Structural "cannot write bookings/customer_profiles" | API / Backend (import-graph guard test) | Database (migration text test, runtime Proxy test) | "Isolation by omission": a grant-level barrier is not available because supabase-js uses `service_role` |
| Webhook registration and secret provisioning | Owner workstation (infra scripts, `~/.config/prestigo`) | Vercel env | Secrets never in git; Chatwoot generates its secret, Espo returns it once at create |
| Operator-facing summary convention (`Итог:` note) | Chatwoot (operator UX) | API / Backend (parsing) | No new UI; parsing only |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:crypto` (built-in) | Node v24.14.1 on this machine | `createHmac('sha256')`, `timingSafeEqual` | No dependency; the same primitive the Stripe/QStash/kick routes already use. Never hand-roll compare. |
| zod | ^4.3.6 | Loose payload schemas (`z.looseObject`/passthrough; Chatwoot payloads are large and evolving) | Already the repo's validation library (dispatch/kick routes) |
| @upstash/qstash | ^2.10.1 | Delayed publish of the outbox key to `/api/integrations/dispatch` | Existing `publishOutboxDispatch` |
| @supabase/supabase-js | ^2.101.0 | RPC calls through `createSupabaseServiceClient` | Existing pattern (`lib/identity-store.ts`) |
| next | ^16.2.3 | Route handlers, `after()` for post-response publish | Existing (`lib/outbox.ts`) |
| vitest | ^4.1.1 | Unit, route, harness and migration-text tests | Existing, `// @vitest-environment node` per file |

[VERIFIED: package.json read this session — next ^16.2.3, vitest ^4.1.1, zod ^4.3.6, @upstash/qstash ^2.10.1, @supabase/supabase-js ^2.101.0]

### Supporting
| Item | Purpose | When to Use |
|------|---------|-------------|
| `lib/outbox.ts` (`parseOutboxKey`, `enqueueOutboxEvent`, `publishOutboxDispatch`, `syncBucketKey`) | Key grammar, bucketed keys, publish | Extend the grammar; reuse bucket helper for contact events |
| `lib/identity-store.ts` pattern | One RPC wrapper per Supabase domain, every error → `OutboxStoreError('db_error')` | New `lib/webhook-store.ts` and `lib/chat-store.ts` copy this shape |
| `lib/dispatch-outcomes.ts` (`skip`, `breaker`, `retryLater`) | Handler outcomes | All new handlers |
| `tests/helpers/fake-chatwoot.ts`, `fake-espocrm.ts` | In-memory upstream fakes | Extend (conversations/messages/labels, Note, Webhook, Lead lookups) for handler and loop-harness tests |
| `infra/chatwoot/sync.mjs`, `infra/espocrm/sync.mjs` | Config-as-code | Add `no-lead` label, `webhooks` resource, Lead source values, `Webhook` role scope |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| One deterministic uuid + integer in the key tag | A `chat_refs` id-mapping table | Table adds a DB round trip in the receiver and a table to erase; the deterministic uuid only exists for the `outbox_claim` mutex |
| EspoCRM Stream Note (`POST /Note`) | `Call`/`Meeting` with status Held (shows in the "History" panel) | Call needs new role scopes and reminder semantics; Note needs nothing beyond the existing Sync writer role (Note scope has `"acl": false`; create allowed when the user can stream the parent) |
| Shared secret in URL | HMAC headers | HMAC is available on both pinned versions; a URL secret leaks via logs |
| Dispatcher-time `modifiedById` check as the only Espo actor test | Source-side `skipOwn` | `modifiedBy` is read minutes after the event (queue ≤5 min): a human edit followed by a sync write would be wrongly ignored |

**Installation:** none. No new npm packages. [VERIFIED: design uses only built-ins and installed dependencies]

**Version verification:** Chatwoot `chatwoot/chatwoot:v4.18.0-ce` [VERIFIED: infra/vps/chatwoot/compose.yml:56 `image: chatwoot/chatwoot:v4.18.0-ce`]; EspoCRM `espocrm/espocrm:10.0.8` [VERIFIED: STATE.md Phase 76-04 decision "espocrm/espocrm:10.0.8"]. All upstream behaviour below was read at those exact tags.

## Package Legitimacy Audit

No external packages are installed by this phase (HMAC via `node:crypto`; everything else already in `package.json`).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — | — | — | — | — | — | none installed |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Chatwoot (VPS, v4.18.0-ce)                              EspoCRM (VPS, 10.0.8)
 account webhook, SIGNED, no retry, 5 s timeout          webhook "Contact.update", skipOwn=true, owner=prestigo-sync
 events: message_created, conversation_status_changed,   cron "Process Webhook Queue" (~5 min), batched JSON ARRAY
         conversation_updated, contact_updated           headers: Signature (+ legacy X-Signature), no timestamp
        │ POST (X-Chatwoot-Signature/Timestamp/Delivery)         │ POST (Signature = b64("<webhookId>:<hex>"))
        ▼                                                         ▼
 /api/webhooks/chatwoot (Node runtime)                    /api/webhooks/espocrm (Node runtime)
  1 size cap → read raw bytes (arrayBuffer)                1 size cap → raw bytes
  2 secrets configured? else 401 (fail closed)             2 secrets configured? else 401
  3 HMAC("<ts>.<raw>") timingSafeEqual, |now-ts| ≤ 300s    3 decode Signature, check webhookId, HMAC(raw) timingSafeEqual
  4 JSON.parse → zod loose schema (400 on garbage)         4 JSON.parse → array of items (max 50)
  5 relevance filter (event/type/private/status)           5 per item: id + canonical-JSON hash as delivery id
  6 ECHO DROP: contact_updated whose fingerprint matches   6 (no actor in payload: skipOwn already dropped our own writes)
  7 chat_hooks_start gate (forward-only)                   7 identity lookup by espo_contact_id happens inside the RPC
        │ one RPC per event                                      │
        ▼                                                         ▼
 webhook_ingest(...)  — ONE transaction (SECURITY DEFINER, service_role only)
   a insert webhook_deliveries(source, delivery_id)  ON CONFLICT → 'duplicate'
   b loop fuse: >N deliveries for same entity_key in 10 min → 'fused' (+ ALERT log in TS)
   c outbox_enqueue(event_type, aggregate_type, aggregate_id, key, available_at)   (existing RPC, idempotent)
        │ 200 {received:true}   then after(): publishOutboxDispatch(key, {delaySeconds, dedupSuffix:'w'})
        ▼
 QStash ──► /api/integrations/dispatch ──► dispatchOutboxKey ──► claim ──► NEW hook.* branch
        ┌────────────────────┬────────────────────────┬──────────────────────┬────────────────────────┐
        ▼                    ▼                        ▼                      ▼                        ▼
 hook.chat_intake      hook.chat_resolve        hook.chat_label        hook.chat_contact        hook.espo_contact
 (HOOK-01, D-01..07)   (HOOK-02, D-08..11)      (D-07 no-lead→Dead)    (D-12 add email/phone)   (D-13/14 Espo→Chatwoot)
 re-read Chatwoot      re-read Chatwoot         re-read labels         re-read Chatwoot contact  re-read Espo Contact
 classify person       ensureIntake first       Lead → Dead            identity RPC + Espo       diff vs Chatwoot, PUT
 identity RPC (D-16)   count/summary via API    (Espo PUT)             Contact + link Lead       + site_sync_fp
 Espo Lead/Contact     Espo Note on Contact/Lead
        └──────── all writes go to EspoCRM as prestigo-sync / Chatwoot via site token; never bookings/customer_profiles ───────┘
 Site → Chatwoot writes (Phase 82 sync.chatwoot, handlers above) stamp custom_attributes.site_sync_fp = fp(name,email,phone,identifier)
 so the resulting contact_updated webhook is recognised as ours at step 6.
```

### Recommended Project Structure

```
app/api/webhooks/
├── chatwoot/route.ts            # thin: verify → filter → ingest → 200 (+ after() publish)
└── espocrm/route.ts             # thin: verify → per-item ingest → 200 (never 410)
lib/
├── webhook-verify.ts            # PURE: verifyChatwootSignature, verifyEspoSignature, safeEqual (no env names)
├── webhook-store.ts             # Supabase RPC wrapper: ingest(), purgeDeliveries(), lookups (no CRM import)
├── sync-origin.ts               # PURE: contactFingerprint(), deterministic uuid, echo predicates
├── chat-payload.ts              # PURE: zod loose schemas + relevance filters for Chatwoot events
├── chat-classify.ts             # PURE: D-07 non-target-mail filter, source mapping, name cleaning
├── chat-intake.ts               # dispatcher handler (allowlisted in the VPS guard)
├── chat-resolve.ts              # dispatcher handler
├── chat-contact.ts              # dispatcher handler: contact_updated + no-lead label
├── espo-contact-hook.ts         # dispatcher handler: Espo→Chatwoot
└── chat-store.ts                # Supabase RPC wrapper for chat_leads + identity chat RPCs
supabase/migrations/076_inbound_webhooks.sql   # next free number (075 is the latest)
infra/chatwoot/   labels.json (+no-lead), sync.mjs (+webhooks resource), inspect.mjs (+--print webhook-secret), webhook-probe.mjs
infra/espocrm/    enums.json (+Lead source values), roles.json (+"Webhook": true), webhook.mjs (create/list/probe as prestigo-sync)
infra/vps/runbooks/inbound-webhooks.md         # go-live, rotation, replay/loss recovery
tests/            webhook-verify, webhooks-chatwoot-route, webhooks-espocrm-route, webhook-ingest-migration,
                  webhook-isolation-guard, chat-intake, chat-resolve, chat-contact, espo-contact-hook,
                  webhook-echo-loop, sync-origin (+ updates to outbox, infra-vps-isolation-guard, espocrm-*, chatwoot-*)
```

Suggested wave order: (1) migration 076 + store + migration-text tests (orchestrator applies it; executors have no Supabase MCP); (2) `webhook-verify` + both receivers + route tests + guard allowlist; (3) outbox grammar/labels/dispatch branch; (4) intake/resolve/label handlers + config-as-code; (5) contact + Espo→Chatwoot handlers + fingerprint in `chatwoot-sync.ts` + echo harness; (6) D-05 conversion hook in `crm-sync.ts` + erasure extension; (7) infra registration scripts, runbook, owner go-live checkpoint.

### Pattern 1: Signature-first receiver, thin by design
**What:** Verify before parsing; never touch Supabase until the signature passed; do only one RPC; respond 200 for every business outcome (duplicate, ignored, fused) so neither sender retries. **Why thin:** Chatwoot's timeout is 5 s and a failed delivery is lost for good.
**Example:**
```typescript
// Source: Chatwoot v4.18.0 lib/webhooks/trigger.rb:54-63 (signed string "<ts>.<body>"), self-tested this session.
import { createHmac, timingSafeEqual } from 'node:crypto'

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8'), bb = Buffer.from(b, 'utf8')
  return ba.length === bb.length && timingSafeEqual(ba, bb) // timingSafeEqual THROWS on unequal length
}

export function verifyChatwoot(i: { rawBody: Buffer; signature: string | null; timestamp: string | null; secrets: string[]; nowSec: number; windowSec?: number }): 'ok' | 'malformed' | 'stale' | 'bad_signature' {
  if (!i.signature || !i.timestamp || !/^\d{9,12}$/.test(i.timestamp)) return 'malformed'
  if (Math.abs(i.nowSec - Number(i.timestamp)) > (i.windowSec ?? 300)) return 'stale'
  const ok = i.secrets.some((s) => {
    const expected = 'sha256=' + createHmac('sha256', s).update(Buffer.concat([Buffer.from(`${i.timestamp}.`), i.rawBody])).digest('hex')
    return safeEqual(expected, i.signature as string)
  })
  return ok ? 'ok' : 'bad_signature'
}

// Source: EspoCRM 10.0.8 application/Espo/Core/Webhook/Sender.php:104-110
// base64_encode("$webhookId:$hash") with $hash = hash_hmac('sha256', $payload, $secretKey)  (hex)
export function verifyEspo(i: { rawBody: Buffer; signature: string | null; secrets: string[]; expectedWebhookId?: string }): 'ok' | 'malformed' | 'wrong_webhook' | 'bad_signature' {
  if (!i.signature) return 'malformed'
  const decoded = Buffer.from(i.signature, 'base64').toString('utf8')
  const sep = decoded.indexOf(':')
  if (sep < 1) return 'malformed'
  const webhookId = decoded.slice(0, sep), hex = decoded.slice(sep + 1)
  if (i.expectedWebhookId && webhookId !== i.expectedWebhookId) return 'wrong_webhook'
  return i.secrets.some((s) => safeEqual(createHmac('sha256', s).update(i.rawBody).digest('hex'), hex)) ? 'ok' : 'bad_signature'
}
```
Use the raw **bytes** (`Buffer.from(await request.arrayBuffer())`), not `.text()`: no decode/re-encode drift. (The Stripe route uses `.text()`; either works for valid UTF-8, bytes are stricter.) `Headers.get` is case-insensitive. Accept a comma-separated list or a `*_PREVIOUS` env as a second secret so rotation has no gap.

### Pattern 2: Payload is a hint; the dispatcher re-reads the source
**What:** The outbox row holds ids only. Every handler GETs the conversation/contact/messages (Chatwoot) or the Contact (Espo) at delivery time and converges on current state. **Why:** it is the Phase 81/82 design, it makes replays harmless (important because EspoCRM gives no timestamp), it keeps PII out of `integration_outbox`, and it sidesteps the fact that Chatwoot builds webhook payloads at *job* time from reloaded records (payload `status` can be newer than the event).
**Key grammar (extend `parseOutboxKey`; tag regex stays `[a-z0-9]{1,24}`, total key ≤ 120):**

| event_type | key | aggregate (type, id) | produced by |
|---|---|---|---|
| `hook.chat_intake` | `hook.chat_intake:<convUuid>:c<convId>` | (`chat_conversation`, derived uuid) | `message_created`, `message_type` incoming, `private` false (one row per conversation: later messages hit `ON CONFLICT`) |
| `hook.chat_resolve` | `hook.chat_resolve:<convUuid>:c<convId>r<epochSec>` | same | `conversation_status_changed` with `status` resolved; `epochSec` = `floor(updated_at)` (D-10 resolve moment) |
| `hook.chat_label` | `hook.chat_label:<convUuid>:c<convId>` | same | `conversation_updated` whose `labels` contain `no-lead` |
| `hook.chat_contact` | `hook.chat_contact:<contactUuid>:c<contactId>b<bucket>` | (`chat_contact`, derived uuid) | `contact_updated` whose changed keys include `email` or `phone_number` and that is not an echo |
| `hook.espo_contact` | `hook.espo_contact:<identityUuid>:b<bucket>` | (`person`, identity id) | Espo `Contact.update` item; aggregate resolved inside the ingest RPC from `contact_identities.espo_contact_id` (shares the person mutex with `sync.espo`/`sync.chatwoot`) |

`<convUuid>` = deterministic uuid (sha1 of `chatwoot:conversation:<displayId>`, v5-style via `node:crypto`), used only as the `outbox_claim` mutex key; the integer id travels in the key tag and the handler parses it. This avoids a mapping table and a receiver-side DB lookup. `bucket` = `floor(epochSec/30)` like `syncBucketKey`.
[VERIFIED: supabase/migrations/064_integration_outbox.sql:27-28 `aggregate_id    uuid        NOT NULL,` / `idempotency_key text        NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 120),` and lib/outbox.ts:26 `const SYNC_KEY = new RegExp(\`^(sync\\.(?:booking|signup|espo|chatwoot)):(${UUID}):([a-z0-9]{1,24})$\`)`]

### Pattern 3: Person classification (resolves the D-01 / D-16 collision)
D-16 registers strangers as identities, so "has an identity" cannot mean "known". Define, in one pure+RPC function used by intake:
- **customer**: identity exists AND (`user_id IS NOT NULL` OR it has `booking_identity` rows) → D-06: no Lead, resolution entry only (on the identity's `espo_contact_id`).
- **known contact**: no such identity but an EspoCRM Contact with that email exists that was *not* created by the chat path (owner-made B2B contact) → same as customer.
- **chat-origin**: identity whose emails carry the new `basis = 'chat'`, no bookings/account → Lead path (D-02: append to open chat Lead or create the next one).
- **stranger**: nothing found → register identity (email present) via a new `identity_resolve_chat(email, phone)` that takes the **same global advisory lock** as the other resolvers (`pg_advisory_xact_lock(hashtextextended('identity', 0))`) and calls `identity_resolve_core(email, phone, 'chat', NULL)`; then Lead (+ Contact when email known).
- No email (Telegram) or phone-only: Lead without Contact (D-04). Phone-only cannot create an identity at all: core rule 1 returns `no_identity` when the email is unusable, and Contact key is the email (see Assumption A10).
New migration items: relax the CHECK to include `'chat'`; `identity_by_chatwoot_contact`, `identity_by_espo_contact`; an attach-email RPC for D-12 on an existing identity that does NOT go through core rule 4 (core rule 4 auto-flags the phone *shared* as a side effect of a phone merge, which would be wrong for an operator-asserted same person).
[VERIFIED: supabase/migrations/069_identity_core_sync_triggers.sql:65 `basis       text        NOT NULL CHECK (basis IN ('email', 'phone', 'signup', 'split')),`; 072_identity_phone_rules.sql:159-164 `-- Rule 1: a phone alone never creates or extends an identity.` … `RETURN QUERY SELECT NULL::uuid, 'no_identity'::text;`; 072:282-285 `-- The merge itself makes the number "seen with two emails": shared from now on.`]

### Pattern 4: Echo-loop prevention (HOOK-04), four layers
1. **EspoCRM source-side `skipOwn`.** Create the webhook *as `prestigo-sync`* (X-Api-Key from `~/.config/prestigo/espocrm-sync.env`) with `{ event: 'Contact.update', url, skipOwn: true }`. EspoCRM then never queues events caused by that user. Requires `"Webhook": true` in the Sync writer role.
   [VERIFIED: EspoCRM 10.0.8 Core/Webhook/Queue.php createItem: `if ($webhook->skipOwn() && $webhook->getUserId() && $eventItem->getUserId() === $webhook->getUserId()) { return; }`; RecordHooks/Webhook/BeforeSave.php: `if ($entity->skipOwn() && !$entity->getUserId()) { $entity->setSkipOwn(false); }`; Record/Webhook/DefaultsPopulator.php: `if ($this->user->isApi()) { $entity->set('userId', $this->user->getId()); }`; scopes/Webhook.json `"acl": "boolean"`]
2. **Chatwoot fingerprint (origin tag on the record).** Every site → Chatwoot contact write (Phase 82 `chatwoot-sync.ts` create/update, plus the new handlers) includes `custom_attributes.site_sync_fp = sha256(name|email|phone|identifier of the contact AFTER the write)[:16]` in the same PUT/POST. `contact_updated` payloads carry the contact's current fields and `custom_attributes`, so the receiver recomputes and compares: equal → site-originated state → drop before ingest (zero outbox churn). An operator edit changes a field, the fingerprint mismatches, the event passes. Chatwoot merges `custom_attributes` shallowly server-side, so other attributes are untouched.
   [VERIFIED: Chatwoot v4.18.0 app/models/contact.rb `contact.webhook_data` carries `custom_attributes`, `email`, `identifier`, `name`, `phone_number`; contacts_controller.rb `contact_custom_attributes` → `@contact.custom_attributes.merge(permitted_params[:custom_attributes])`; WebhookListener#contact_updated payload = `contact.webhook_data.merge(event:, changed_attributes:)` with no actor]
3. **State-convergent handlers + asymmetric ownership.** Every handler reads current state, diffs, and writes only a difference (no diff → no request → no upstream event). Name/phone/company flow only Espo → Chatwoot; email/phone *fill-empty* flows only Chatwoot → Espo; empty Espo values are never pushed. A loop would need both directions to keep changing the same field.
4. **Loop fuse.** `webhook_ingest` counts deliveries for the same `entity_key` in the last 10 minutes; above a small threshold (suggest 20) it returns `fused`, the TS logs one `ALERT` line, and the row is not enqueued. Bounds any unforeseen loop mode.
**Proof (success criterion 4):** a vitest harness wires `fake-chatwoot` + `fake-espocrm` to the real receivers and handlers, makes the fakes emit signed webhooks on each write (Chatwoot: always, no actor; Espo: always except when the actor is the webhook owner), starts from (a) a site-origin write, (b) an operator Espo edit, (c) an operator Chatwoot edit, runs to quiescence and asserts a fixed small number of upstream writes and zero pending outbox rows.

### Pattern 5: Structural barrier (HOOK-03), three layers
No grant-level barrier exists (supabase-js uses `service_role`, which owns every table), so enforce by omission, mechanically:
1. **Import-graph guard test** (model: `tests/infra-vps-isolation-guard.test.ts`, which already has a resolver, a reverse import graph and a BFS): for both receiver routes and every `hook.*` handler module, assert the transitive import closure contains no `saveBooking`/`buildBookingRow*`/`reconcile*`/`captureUnpaidBooking`/`saveRoundTripBookings` import and that the only symbol imported from `@/lib/supabase` is `createSupabaseServiceClient`; assert no file in the closure contains `.from('bookings')`, `.from('customer_profiles')`, `auth.admin` or `.auth.` writes. `lib/supabase.ts` exports both the factory and the booking writers, so the check must be per named import.
2. **Migration-text test** (model: `tests/crm-sync-migrations.test.ts`): the new functions' bodies contain no `INSERT/UPDATE/DELETE` on `bookings`, `customer_profiles` or `auth.users`; every new function has the `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` line and a `GRANT … TO service_role`; every new table has RLS enabled with deny-all policies.
3. **Runtime tripwire test:** run receivers + all handlers over fixtures with a Supabase client double whose `.from()`/`.rpc()` throws on those table names or any non-allowlisted RPC name; the run must complete.
[VERIFIED: tests/infra-vps-isolation-guard.test.ts read this session — `extractImportSpecifiers`, `resolveSpecifier`, BFS in `findVpsViolations`]

### Anti-Patterns to Avoid
- **Trusting payload content** for state (replayed/forged-but-validly-signed items, job-time reload skew): always re-read.
- **Answering 410** to EspoCRM for any reason (it deletes the webhook). **Answering 401 for business conditions** (Espo retries 401 four times).
- **Creating the EspoCRM webhook as the admin** (`prestigo-config`): `skipOwn` is silently forced off.
- **Using `modifiedById` read at dispatch time as the sole actor check**: stale by up to the queue delay.
- **Calling the CRM or Chatwoot from the receiver** (D-15) or importing a client into the route (guard + latency).
- **Reading `request.json()` first** or comparing signatures with `===`.
- **Writing the Contact name from the identity path:** `buildContactDraft` falls back to the email local part for a person with no profile/booking, so a chat stranger's Contact must be created with the Chatwoot name *before* any `sync.espo` row runs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC compare | `===` or custom loop | `crypto.timingSafeEqual` after a length check | Timing leak; `timingSafeEqual` throws on unequal lengths |
| Webhook delivery queue / retries | A second queue | `integration_outbox` + QStash dispatcher | Backoff, auth breaker, health page, digest, sweep already exist |
| Person matching / merge | TS email/phone matching | Postgres `identity_resolve_core` via a new RPC under the global lock | The lock and the shared-phone rules live there (069/072) |
| Dedup store | In-memory/Redis | `webhook_deliveries` unique key inside the ingest RPC | Serverless instances share nothing; atomic with the enqueue |
| Lead idempotency | "find then create" without a key | `cSupabaseRef` unique index + 409 converge (existing `upsertLead` pattern) | Phase 81 already solved the race |
| Phone validation | New regex | `lib/phone.ts` `normalizePhone` / `E164_RE` | One phone rule for the whole project |
| Name splitting / sanitising | New helpers | `splitName`, `sanitizeText` from `lib/customer-mapping.ts` | Same output as the booking path |
| Chatwoot/Espo HTTP | `fetch` in handlers | `createSiteChatwootClient` / `createSiteEspoClient` | Hardened (https-only, no redirects, timeout, poisoning, PII-free errors) |
| Raw-body size guard | custom | `enforceMaxBody` + post-read byte check | Existing helper |

**Key insight:** every hard part of this phase (queueing, idempotency, identity, retries, clients) already exists; the new code is verification, a classification policy, three small handlers and the loop-proof harness.

## Common Pitfalls

### Pitfall 1: Chatwoot account webhooks are at-most-once
**What goes wrong:** If Vercel/Supabase is briefly down or slow (> 5 s), the event is lost; Chatwoot does not retry. **Why:** `Webhooks::Trigger#execute` rescues every error into `handle_failure` (log warning); retry exists only for agent-bot 429/500. **Avoid:** keep the receiver to verify + one RPC; return 500 only when the RPC failed (nothing retries, but logs show it); document the limitation and a manual recovery in the runbook; optionally add a later reconcile (list resolved conversations) — not required by the success criteria. **Warning sign:** a resolved conversation with no history entry.
[VERIFIED: Chatwoot v4.18.0 lib/webhooks/trigger.rb:26-37 `rescue StandardError => e` → `handle_failure(e)`; `handle_failure` only logs; retry only `retryable_agent_bot_error?`]

### Pitfall 2: EspoCRM header, replay and delivery-id assumptions are wrong
**What goes wrong:** Verifying `X-Signature` (legacy, binary-hash variant, gone in v11); expecting a timestamp or delivery id (none exists). **How to avoid:** verify `Signature` only (no fallback to the legacy header: same HMAC, different encoding, no security gain). Replay/dedup substitute for Espo: per-item dedup key = SHA-256 of canonical JSON of the item (+ source), kept 30 days, plus state-convergent handlers (a replay re-reads the current Contact and changes nothing), plus the narrow event surface. This is a **requirement-interpretation gap** for HOOK-03's "timestamp replay window" on the EspoCRM side: it can be satisfied literally only for Chatwoot (see Open Question 2).
[VERIFIED: EspoCRM 10.0.8 Sender.php:157-163 `->withHeader('Signature', $signature)` and `->withHeader('X-Signature', $legacySignature)`; Manager.php `$skipAttributeList` contains `Field::MODIFIED_AT`, `Field::MODIFIED_BY`]

### Pitfall 3: EspoCRM queue semantics
Batching: payload is always an array (up to `webhookBatchSize` = 50); handle N items per request and ingest each. Latency: "Process Webhook Queue" runs about every 5 minutes. Retry: 0/401/403/404/405/408/500/503 retried up to 4 attempts, 10 minutes apart; **410 removes the webhook**; other 4xx fail immediately. Answer 200 for everything handled/ignored/duplicate, 503 when the store is down (gets a retry), 401 only for a bad/missing signature.
[VERIFIED: Queue.php `send()`: `if ($code >= 200 && $code < 400) … else if ($code === 410) { $this->dropWebhook($webhook); } else if (in_array($code, [0, 401, 403, 404, 405, 408, 500, 503])) { $this->failQueueItemList($itemList);`; MAX_ATTEMPT_NUMBER = 4, FAIL_ATTEMPT_PERIOD = '10 minutes'] [CITED: docs.espocrm.com/administration/webhooks — "Process Webhook Queue … runs every 5 minutes by default"]

### Pitfall 4: `skipOwn` only works if the webhook is owned by the API user
Admin-created webhooks have no `userId`, so `skipOwn` is reset to false and sync writes would come back as events. Add `"Webhook": true` to the Sync writer role, create the webhook with the `prestigo-sync` key, and extend `verify-acl.mjs`/`tests/espocrm-roles.test.ts`. The webhook then also evaluates ACL as `prestigo-sync` (Contact read = all, already granted).

### Pitfall 5: Chatwoot payloads are built at job time; `changed_attributes` is unreliable for status events
`EventDispatcherJob` is queued with record references and the listener builds `conversation.webhook_data` when it runs, so `status` can be newer than the event. `conversation_status_changed` passes `status_change` as `changed_attributes`; after-commit semantics suggest that may be empty. Decide "resolved" from payload `status` + a live re-read, never from `changed_attributes`; take the resolve moment from payload `updated_at`. Capture real payloads once (probe, Pitfall 12) before pinning fixtures. [ASSUMED] — see A1.

### Pitfall 6: D-07's header filter is not implementable from Chatwoot data
Chatwoot persists only `auto_reply` (`Auto-Submitted` not `no`, or `X-Autoreply: yes`) and a fixed header subset (`x-original-from`, `x-original-sender`, `x-forwarded-for`). `Precedence: bulk/list` and `List-Unsubscribe` are discarded at ingest. Implementable filter: `content_attributes.email.auto_reply === true` OR sender local-part matches a no-reply/bounce pattern OR sender domain is Prestigo's own domain (own notification mail lands in Chatwoot) — plus the manual `no-lead` label. Needs user acknowledgement (Open Question 1).
[VERIFIED: Chatwoot v4.18.0 app/presenters/mail_presenter.rb:144-152 `headers_data` and :168-198 `auto_reply?` = `auto_submitted? || x_auto_reply?`]

### Pitfall 7: Auto-generated Chatwoot contact names
A contact with no name gets `Haikunator.haikunate(1000)` (for example `autumn-dew-482`). Do not put that into a Lead name: detect `^[a-z]+-[a-z]+-\d+$` and fall back to the email local part (same fallback `buildChatwootContactDraft` uses). [VERIFIED: Chatwoot v4.18.0 app/builders/contact_inbox_with_contact_builder.rb `name = contact_attributes[:name] || ::Haikunator.haikunate(1000)`]

### Pitfall 8: Own mail and duplicate Leads
Mail from Prestigo's own addresses (booking alerts, Espo reminders, Resend digests) can land in the Chatwoot `info@`/`bookings@` inboxes; contact-form notifications sent to `MANAGER_EMAIL` may also arrive there, creating a chat Lead next to the Phase 81 inquiry Lead for the same person. Filter own-domain senders; consider appending to a recent open non-chat Lead for the same email (Open Question 4).

### Pitfall 9: Outbox and guard plumbing is easy to forget
- `parseOutboxKey` is the only gate (`lib/lead-sync.ts:101` `if (!parseOutboxKey(key)) return { outcome: 'unknown_key' }`; admin retry returns 422 `invalid_key`). Add the grammar, `outboxEventLabel` cases and error hints (`lib/outbox-labels.ts`), and the dispatch branch with its own config gate (Chatwoot + EspoCRM) using the `breaker` outcome.
- The Phase 76 guard flags any file naming `CHATWOOT_*`/`ESPOCRM_*` (`VPS_ENV_RE`) and, by BFS, every importer. The receivers name their secret env vars, and every handler imports a client: add allowlist entries (each ≥ 20-char reason naming the async mechanism). Do **not** dodge the regex by renaming env vars.
- `middleware.ts`: `/api` is non-localized and `/api/webhooks/*` is not in `CSRF_PROTECTED_PREFIXES` (server-to-server, same as Stripe); add a test pinning that so a future prefix edit cannot break it.

### Pitfall 10: Migration traps
Next number is **076**. `DROP + CREATE` of a SECURITY DEFINER function re-grants PUBLIC EXECUTE: every function gets `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` and `GRANT … TO service_role`, re-run after any replace. Changing the `identity_emails.basis` CHECK needs the live constraint name (default `identity_emails_basis_check`, not confirmed — A6); executors have no Supabase MCP, so the orchestrator applies and smokes the migration. Capture is off until go-live: gate on a new `integration_config` key (suggest `chat_hooks_start`, fail-closed when absent, mirroring `lead_capture_start`/`crm_sync_start`) so conversations from before go-live are ignored (forward-only).

### Pitfall 11: Erasure must learn about chat data
`lib/erasure.ts` finds Leads by request email plus inquiry/booking refs (`findEspoLeads`). A Telegram Lead has no email and its ref is new. Extend the erasure scope with chat Lead refs/ids (from `chat_leads`), scrub-then-delete the history **Notes** parented on the Contact/Lead (EspoCRM's stream `afterRemove` only unfollows users; whether Notes disappear with the parent is not established — A8), delete the new tables' rows (`ON DELETE CASCADE` from the identity where possible), and keep the Chatwoot contact deletion (cascades conversations).
[VERIFIED: lib/erasure.ts:329-340 `async function findEspoLeads(ctx: Ctx)` iterates request emails then `ctx.req.inquiryIds.map(leadRefForInquiry)`, `ctx.req.bookingIds.map(leadRefForBooking)`; EspoCRM Tools/Stream/HookProcessor.php afterRemove → `unfollowAllUsersFromEntity` only]

### Pitfall 12: Race and ordering between handlers
A quick resolve can arrive before intake finished: `chat-resolve` must start with an idempotent `ensureIntake()` (same code path as intake) rather than assume a Lead exists. Concurrent conversations from one person: serialize Lead selection with an advisory-lock RPC (`chat_lead_reserve(person_key, conversation)`), keep `cSupabaseRef` unique (per Lead, e.g. `chat:<firstConversationUuid>`), converge on 409 as `upsertLead` does. Unique index on `cSupabaseRef` must exist (`overlay.mjs --entity Lead`, already live per the README).

### Pitfall 13: Webhook registration and the secret
Chatwoot generates the webhook secret; the API only accepts `inbox_id, name, url, subscriptions` and returns `secret` to an administrator token. There is no rotate endpoint in the controller: rotation = delete + recreate the webhook (new secret), so support current + previous secret in the verifier. Register the exact canonical URL `https://rideprestigo.com/api/webhooks/chatwoot` (apex = `NEXT_PUBLIC_SITE_URL`); do not rely on an apex→www redirect (A13). EspoCRM returns `{id, secretKey}` once at create; keep `ESPOCRM_WEBHOOK_ID` as an extra check. Pipe both into Vercel with `--sensitive` (existing HMAC-token pattern in `infra/chatwoot/README.md`); add the names (empty values) to `infra/vps/env/chatwoot-integration.env.example` so the pre-commit secret gate covers them.
[VERIFIED: Chatwoot v4.18.0 webhooks_controller.rb `params.require(:webhook).permit(:inbox_id, :name, :url, subscriptions: [])`; `_webhook.json.jbuilder` `json.secret webhook.secret`; webhook_policy.rb administrator-only; webhook.rb `ALLOWED_WEBHOOK_EVENTS = %w[conversation_status_changed conversation_updated conversation_created contact_created contact_updated message_created message_updated webwidget_triggered inbox_created inbox_updated conversation_typing_on conversation_typing_off]`]

### Pitfall 14: `conversation_updated` is noisy and is needed for `no-lead`
CONTEXT lists three Chatwoot events; D-07's label rule needs a fourth, `conversation_updated` (fires on label, team, assignee, status, priority and custom-attribute changes). Filter in the receiver to payloads whose `labels` include `no-lead`; ingest keyed once per conversation. Also note `message_created` fires for every message (outgoing, private, template): filter in the receiver before any DB call.
[VERIFIED: Chatwoot v4.18.0 conversation.rb `list_of_keys` includes `label_list`; MessageFilterHelpers `webhook_sendable?` = `incoming? || outgoing? || template?`]

## Code Examples

### Chatwoot event facts the handlers rely on
```typescript
// Source: Chatwoot v4.18.0 app/models/message.rb:181-200 (webhook_data), conversation presenter webhook_data
// message_created payload (keys used): message_type: 'incoming'|'outgoing'|... (enum STRING), private: boolean,
//   content, content_attributes (email: {from, subject, auto_reply, ...}), sender (Contact.webhook_data for incoming:
//   id, name, email, phone_number, identifier, custom_attributes), inbox: {id, name},
//   conversation: { id: <display id>, inbox_id, channel: 'Channel::WebWidget'|'Channel::Email'|'Channel::Telegram'|...,
//   status, labels: string[], meta.sender (contact), created_at, updated_at (float), additional_attributes }
// Tolerate message_type as int (0 incoming, 1 outgoing, 2 activity, 3 template) as well as the string.
```

### Conversation facts via API (dispatcher side)
```typescript
// Source: Chatwoot v4.18.0 message_finder.rb + messages/index.json.jbuilder + _message.json.jbuilder
// GET /conversations/{displayId}                -> { id, inbox_id, status, labels[], created_at, meta:{ channel, sender } }
// GET /conversations/{displayId}/messages?after=<id>   -> up to 100 messages ASC by created_at with id > after
//    payload[]: { id, content, message_type (INT: 0 in,1 out,2 activity,3 template), private, content_attributes, sender, created_at }
// Page with after=<last id> (cap ~20 pages); message count = items with message_type !== 2 && private !== true;
// summary = LAST private note (private && message_type===1) whose trimmed text starts with /^(итог|summary)\s*[:：-]/i.
// Dashboard link (A2): `${baseUrl}/app/accounts/${accountId}/conversations/${displayId}`
```

### Fingerprint and deterministic aggregate uuid (pure, `lib/sync-origin.ts`)
```typescript
import { createHash } from 'node:crypto'

/** Origin tag for site → Chatwoot writes: hash of the identity fields the site is allowed to touch. */
export function contactFingerprint(c: { name?: string | null; email?: string | null; phone_number?: string | null; identifier?: string | null }): string {
  const norm = (v?: string | null) => (v ?? '').trim().toLowerCase()
  return createHash('sha256').update([c.name, c.email, c.phone_number, c.identifier].map(norm).join('\u0001')).digest('hex').slice(0, 16)
}

/** Deterministic uuid (v5-style) so an integer Chatwoot id can be an outbox aggregate_id. */
export function aggregateUuid(kind: 'conversation' | 'contact', id: number): string {
  const h = createHash('sha1').update(`prestigo:chatwoot:${kind}:${id}`).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}
```

### Ingest RPC outline (migration 076; all objects deny-all + service_role only)
```sql
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  source      text        NOT NULL CHECK (source IN ('chatwoot', 'espocrm')),
  delivery_id text        NOT NULL CHECK (char_length(delivery_id) BETWEEN 8 AND 128),
  entity_key  text        NOT NULL CHECK (char_length(entity_key) BETWEEN 1 AND 80),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, delivery_id)
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_entity_idx ON public.webhook_deliveries (source, entity_key, received_at);
-- RLS on, REVOKE ALL FROM anon, authenticated, deny-all policies (064/069 shape).

CREATE OR REPLACE FUNCTION public.webhook_ingest(
  p_source text, p_delivery_id text, p_entity_key text, p_fuse_limit integer,
  p_event_type text, p_aggregate_type text, p_aggregate_id uuid, p_key text, p_available_at timestamptz
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rows integer; v_recent integer;
BEGIN
  INSERT INTO public.webhook_deliveries (source, delivery_id, entity_key)
  VALUES (p_source, p_delivery_id, p_entity_key) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RETURN 'duplicate'; END IF;
  SELECT count(*) INTO v_recent FROM public.webhook_deliveries d
   WHERE d.source = p_source AND d.entity_key = p_entity_key AND d.received_at > now() - interval '10 minutes';
  IF v_recent > p_fuse_limit THEN RETURN 'fused'; END IF;
  RETURN CASE WHEN public.outbox_enqueue(p_event_type, p_aggregate_type, p_aggregate_id, p_key, p_available_at)
              THEN 'queued' ELSE 'exists' END;
END; $$;
REVOKE EXECUTE ON FUNCTION public.webhook_ingest(text, text, text, integer, text, text, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.webhook_ingest(text, text, text, integer, text, text, uuid, text, timestamptz) TO service_role;
```
Purge old rows in the existing daily sweep (`app/api/cron/outbox-sweep/route.ts`) as an isolated `step()`: Chatwoot rows > 7 days, EspoCRM rows > 30 days. For `hook.espo_contact` the aggregate id is resolved inside a sibling RPC from `contact_identities.espo_contact_id` (no identity → `unlinked`, nothing enqueued).

### EspoCRM history entry (Stream Note) and Lead source values
```typescript
// POST /Note (existing "Sync writer" role is enough: Note scope has "acl": false, create is allowed when the user can stream the parent)
await crm.post('/Note', { type: 'Post', parentType: contactId ? 'Contact' : 'Lead', parentId: targetId, post: formatResolveNote(...) })
// Lead.source additions in infra/espocrm/enums.json (retire: []): "Website chat", "Telegram"; reuse existing "Email" and "WhatsApp".
// Open Lead statuses (D-02) = New, Assigned, In Process; closed = Converted, Recycled, Dead.
// Source: EspoCRM 10.0.8 Crm/entityDefs/Lead.json status options + "notActualOptions": ["Converted","Recycled","Dead"]
```
A Post Note only touches the parent's `streamUpdatedAt`, which EspoCRM's webhook manager skips, so posting history never fires `Contact.update`.
[VERIFIED: EspoCRM 10.0.8 Hooks/Note/StreamUpdatedAt.php; Core/Webhook/Manager.php `$skipAttributeList` includes `Field::STREAM_UPDATED_AT`; infra/espocrm/enums.json Lead.source values `"Website booking","GNet","Contact form","Corporate form","Multi-day quote","WhatsApp","Phone","Email","Partner","Other"`]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Assuming Chatwoot webhooks are unsigned (initial milestone framing) | Account-level webhooks signed with a per-webhook secret and timestamp header | present in v4.18.0 | HMAC + replay window possible for Chatwoot only |
| EspoCRM `X-Signature` | `Signature` (hex inside base64); legacy header kept until v11 | EspoCRM 9.0 | Verify `Signature` |
| EspoCRM actor filtering by reading `modifiedBy` | Webhook `skipOwn` | EspoCRM 9.2 | Native echo suppression |
| API-inbox/agent-bot webhooks | Unsigned (only account-level signed); upstream issue #13809 open | 2026 | Use an account-level webhook only |

**Deprecated/outdated in the planning docs:** ARCHITECTURE.md/CONTEXT.md "EspoCRM `X-Signature`"; PITFALLS.md warns about a `secret`/`hmac_token` mismatch (#13809), which concerns API-inbox/agent-bot webhooks, not the account-level path read here. Both signing paths must still be smoke-tested live (Assumptions A11/A14).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `conversation_status_changed` `changed_attributes` may be empty/unusable; payload `status` and `updated_at` are the reliable fields | Pitfall 5 | Resolve moment/key logic would need the changed-attributes path |
| A2 | Chatwoot dashboard conversation URL is `/app/accounts/<accountId>/conversations/<displayId>` (only `/app/accounts/<number>/` is evidenced in repo docs) | Code Examples | Dead link in every history entry |
| A3 | `additional_attributes.company_name` is the Chatwoot contact company field and merges server-side | D-13 mapping | Company edits pushed to the wrong field |
| A4 | An undefined contact custom attribute key (`site_sync_fp`) is accepted by the API and not shown in the operator sidebar | Pattern 4 | Fingerprint rejected or visible clutter (then define it in `custom-attributes.json`) |
| A5 | `POST /Note` with camelCase `type/parentType/parentId/post` works for an API user with the Sync writer role (ACL source says yes; a forum report mentions parent fields lost when sent snake_case) | Code Examples | HOOK-02 write path fails; fallback Call/Meeting "Held" needs role changes |
| A6 | The live constraint name is `identity_emails_basis_check` | Pitfall 10 | Migration fails or leaves the old CHECK |
| A7 | EspoCRM `Contact.update` item uses attribute names `firstName`, `lastName`, `phoneNumber`, `accountId`, `accountName` | espo-contact-hook | Relevance filter misses edits (handlers re-read anyway, so only the filter is affected) |
| A8 | EspoCRM does not delete Stream Notes when the parent Contact/Lead is deleted | Pitfall 11 | PII left in the CRM after erasure |
| A9 | `MANAGER_EMAIL` or another site notification target is (or may become) a Chatwoot-connected mailbox | Pitfall 8 | Duplicate Leads from own mail; no effect if not connected (env not readable) |
| A10 | A phone-only chat person gets a Lead without a Contact (identity rule 1, Contact key is email) | Pattern 3 | Owner expects a Contact for phone-only people (relevant only once WhatsApp returns) |
| A11 | A Vercel cold start + one Supabase RPC stays within Chatwoot's 5 s webhook timeout | Pitfall 1 | Intermittent lost events (needs a live latency probe) |
| A12 | The instance's "Process Webhook Queue" job uses the default 5-minute schedule | Pitfall 3 | Espo→Chatwoot latency differs from the doc (config not inspected) |
| A13 | `https://rideprestigo.com` (apex) is the canonical host with no redirect on POST | Pitfall 13 | Chatwoot's SafeFetch POST to a redirecting host fails |
| A14 | `message_type` arrives as the enum string in webhooks and as an int in API message objects (both read from source, not captured live) | Code Examples | Filter mismatch; mitigated by tolerating both |

## Open Questions

1. **D-07 header filter (needs user acknowledgement).**
   - Known: Chatwoot keeps only `auto_reply` and a few headers; `Precedence`/`List-Unsubscribe` are unavailable.
   - Unclear: whether the owner accepts "auto_reply flag + no-reply/own-domain sender pattern + manual `no-lead`" in place of the full header list.
   - Recommendation: accept; record the deviation in the plan and runbook.
2. **HOOK-03 "timestamp replay window" for EspoCRM.**
   - Known: no timestamp or delivery id exists in EspoCRM 10.0.8.
   - Unclear: acceptance of the compensating controls (HMAC + per-item content-hash dedup 30 days + state-convergent re-read + narrow event surface + `skipOwn`).
   - Recommendation: accept and state it in VERIFICATION as "N/A by protocol, compensated".
3. **Fourth Chatwoot event.** `conversation_updated` is required for the `no-lead` label rule though CONTEXT names three events. Recommendation: subscribe and filter in the receiver.
4. **Duplicates with Phase 81 inquiry Leads and own mail.** Recommendation: skip own-domain senders; when the email already has an open non-chat Lead created in the last 7 days, append the conversation reference there instead of creating a chat Lead (deviation from D-02's "chat Lead only" wording, so confirm).
5. **At-most-once Chatwoot delivery.** Recommendation: no reconcile job in Phase 83 (not in the success criteria); log it as a known limitation with a backlog item, document the manual recovery.
6. **Fuse threshold and retention values** (suggested 20 deliveries / 10 min; 7 and 30 days). Planner may tune.
7. **Identity attach for D-12 on an existing identity** needs its own RPC (not core rule 4). Planner to specify whether a conflicting email owned by another identity is skipped with a logged code or raised for an admin.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node / npm / npx | tests, scripts | ✓ | v24.14.1 / 11.11.0 | — |
| vitest (npx) | validation | ✓ (devDependency ^4.1.1) | — | — |
| Vercel CLI | provisioning secrets | ✓ | 50.37.3 | Vercel dashboard |
| gh | PR flow | ✓ | 2.88.1 | — |
| curl | probes | ✓ | 8.7.1 | — |
| Supabase CLI / psql | migrations | ✗ | — | Orchestrator applies migrations via Supabase MCP (executors have none) |
| `~/.config/prestigo/{chatwoot-api,espocrm-sync,espocrm-config}.env` | registration scripts | ✓ (files present; contents never read) | — | — |
| Live Chatwoot/EspoCRM (VPS) | registration, probe, UAT | not probed (VPS SSH is blocked in auto mode; owner-run scripts) | v4.18.0-ce / 10.0.8 | Unit + harness tests cover everything except live smoke |

**Missing dependencies with no fallback:** none. **Missing with fallback:** Supabase CLI/psql (use orchestrator MCP).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.1 (jsdom default; each new file starts with `// @vitest-environment node`) |
| Config file | `vitest.config.ts` (alias `@` → repo root, setup `tests/setup.ts`) |
| Quick run command | `npx vitest run tests/webhook-verify.test.ts tests/webhooks-chatwoot-route.test.ts tests/webhooks-espocrm-route.test.ts tests/sync-origin.test.ts` |
| Full suite command | `npx vitest run` (~90 s; `vitest related` crashes here, grep `tests/` instead) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HOOK-01 | Stranger with email → identity (`basis chat`) + Contact (Chatwoot name) + Lead with channel source; no email → Lead only; customer/known contact → nothing; one open chat Lead per person, append vs new after close; empty conversation → nothing; auto_reply/no-reply/own-domain/`no-lead` → no Lead; haikunator name fallback | unit (fakes) | `npx vitest run tests/chat-intake.test.ts tests/chat-classify.test.ts` | ❌ Wave 0 |
| HOOK-01 | `hook.*` keys parse/round-trip; dispatcher routes them; unconfigured → breaker | unit | `npx vitest run tests/outbox.test.ts tests/integrations-dispatch.test.ts tests/lead-sync.test.ts` | ✅ (extend) |
| HOOK-01 | Lead source enum + Webhook role scope + `no-lead` label in config-as-code | unit | `npx vitest run tests/espocrm-enums.test.ts tests/espocrm-roles.test.ts tests/chatwoot-config.test.ts` | ✅ (extend) |
| HOOK-02 | Note content (channel, dates, count, topic labels, truncated first message, link); private `Итог:`/`Summary:` note picked (last one); no note → no line; resolve ×2 → two entries, redelivery → one; target = Contact if exists else Lead; resolve-before-intake ensures intake | unit (fakes) | `npx vitest run tests/chat-resolve.test.ts` | ❌ Wave 0 |
| HOOK-03 | Chatwoot: valid, tampered body, wrong secret, stale/future timestamp, missing headers, malformed ts, two-secret rotation, length-mismatch (no throw) | unit | `npx vitest run tests/webhook-verify.test.ts` | ❌ Wave 0 |
| HOOK-03 | EspoCRM `Signature`: valid, wrong webhook id, tamper, legacy-only header rejected, array payload, per-item dedup, never 410 | unit | `npx vitest run tests/webhooks-espocrm-route.test.ts` | ❌ Wave 0 |
| HOOK-03 | Route behaviour: fail-closed without secret, 413 oversize, 400 bad JSON after valid sig, 200 for duplicate/ignored/fused, no CSRF/Origin requirement | route test | `npx vitest run tests/webhooks-chatwoot-route.test.ts tests/middleware-csrf-forms.test.ts` | ❌ / ✅ (extend) |
| HOOK-03 | Migration 076 text: deny-all RLS, REVOKE/GRANT lines per function, no write verbs on bookings/customer_profiles/auth.users, ingest atomicity | migration text | `npx vitest run tests/webhook-ingest-migration.test.ts` | ❌ Wave 0 |
| HOOK-03 | Structural barrier: import-closure guard + runtime tripwire client; VPS guard allowlist entries valid | guard | `npx vitest run tests/webhook-isolation-guard.test.ts tests/infra-vps-isolation-guard.test.ts` | ❌ / ✅ (extend) |
| HOOK-04 | Fingerprint determinism + case/whitespace normalisation; receiver drops fingerprint-matching `contact_updated`, passes an operator edit | unit | `npx vitest run tests/sync-origin.test.ts tests/webhooks-chatwoot-route.test.ts` | ❌ Wave 0 |
| HOOK-04 | `chatwoot-sync.ts` create/update writes `site_sync_fp` of the post-write state | unit | `npx vitest run tests/chatwoot-contact-sync.test.ts tests/chatwoot-mapping.test.ts` | ✅ (extend; mapping test pins the 7 owned keys, keep `site_sync_fp` out of that list or update the pin) |
| HOOK-04 | Loop harness: site write, operator Espo edit, operator Chatwoot edit all quiesce with bounded writes and zero pending rows; fuse trips on a forced loop | simulation | `npx vitest run tests/webhook-echo-loop.test.ts` | ❌ Wave 0 |
| HOOK-04 | Espo webhook created as `prestigo-sync` with `skipOwn: true` (script unit test with fake) | unit | `npx vitest run tests/espocrm-webhook-script.test.ts` | ❌ Wave 0 |
| D-05 / erasure | Paid booking converts the open chat Lead once; erasure scrubs chat Leads/Notes/rows | unit | `npx vitest run tests/crm-sync.test.ts tests/erasure.test.ts` | ✅ (extend) |
| Live contract | Real signature round trip, real payload shapes, Note API, skipOwn behaviour | manual-only (needs VPS) | owner-run `node infra/chatwoot/webhook-probe.mjs`, `node infra/espocrm/webhook.mjs --probe` | ❌ Wave 0 (documented UAT) |

### Sampling Rate
- **Per task commit:** the quick command plus the test file(s) of the touched module (`grep -rlE "[/'\"]<basename>['\"]" tests/`).
- **Per wave merge:** `npx vitest run` and `npx tsc --noEmit` (baseline: 8 old errors in `tests/` only), `npx eslint --quiet <files>`.
- **Phase gate:** full suite green and the `verify` skill in `pre-pr` mode before `/gsd-verify-work`; security work commits use the `security:` prefix.

### Wave 0 Gaps
- [ ] `tests/webhook-verify.test.ts`, `tests/webhooks-chatwoot-route.test.ts`, `tests/webhooks-espocrm-route.test.ts` (HOOK-03)
- [ ] `tests/webhook-ingest-migration.test.ts`, `tests/webhook-isolation-guard.test.ts` (HOOK-03)
- [ ] `tests/sync-origin.test.ts`, `tests/webhook-echo-loop.test.ts`, `tests/espocrm-webhook-script.test.ts` (HOOK-04)
- [ ] `tests/chat-intake.test.ts`, `tests/chat-classify.test.ts`, `tests/chat-resolve.test.ts`, `tests/chat-contact.test.ts`, `tests/espo-contact-hook.test.ts` (HOOK-01/02, D-12..14)
- [ ] Extend `tests/helpers/fake-chatwoot.ts` (conversations, messages paging, labels, inboxes, webhook-emitting writes) and `tests/helpers/fake-espocrm.ts` (Note, Webhook CRUD with `skipOwn`, Lead search by `cSupabaseRef`, Contact with `accountName`)
- [ ] Signed-fixture builder in tests (compute HMAC in the test with obviously fake secrets; never paste real secrets)
- [ ] Framework install: none

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no user sessions) | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | Structural barrier: import-closure + migration-text + runtime tripwire; service-role-only RPCs with REVOKE from PUBLIC/anon/authenticated |
| V5 Input Validation | yes | zod loose schemas after signature check; strict size caps; sanitize text going into Lead/Note (strip control chars, truncate, plain text only) |
| V6 Cryptography | yes | `node:crypto` HMAC-SHA256, `timingSafeEqual`, secrets in Vercel env (sensitive); never hand-rolled |
| V7 Logging | yes | Payload-free log lines (key, outcome, code), never names/emails/phones/bodies (existing convention) |
| V8 Data Protection | yes | Ids-only outbox; dedup table holds hashes/ids only; first message truncated; no transcript copy |
| V13 API / Web service | yes | Webhook auth + replay window (Chatwoot), content-hash dedup (Espo), idempotent handlers, fail-closed when unconfigured |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged webhook creating Leads/contacts | Spoofing | HMAC over raw bytes; 401 before parsing; fail-closed without secret; never trust payload (re-read) |
| Replay of a captured signed request | Tampering/Repudiation | Chatwoot: 300 s timestamp window + delivery-id dedup; Espo: content-hash dedup + state re-read + narrow surface |
| Timing side channel on signature compare | Information disclosure | `timingSafeEqual` with prior length check |
| Oversized/slow body DoS | DoS | `enforceMaxBody` + post-read byte cap (1 MiB; Chatwoot email payloads carry full bodies); Vercel 4.5 MB platform cap |
| Echo/feedback loop write storm | DoS | Fingerprint, `skipOwn`, convergent handlers, loop fuse, simulation test |
| Attacker mail/chat floods creating Leads | DoS / Spam | D-07 filter, `no-lead` label, fuse per entity, owner-assigned Leads only |
| Stored injection via first message / summary into EspoCRM | Tampering | Plain text only, control-char strip, length caps; never HTML; link built from config, never from payload URLs |
| Inbound path writing bookings/profiles | Elevation of privilege | Three-layer structural barrier (HOOK-03) |
| Webhook deleted by a 410 | Denial of service | Never return 410 |
| Secret leak | Information disclosure | Names only in `*.env.example` (pre-commit gate), `--sensitive` Vercel env, two-secret rotation, never printed by scripts |

## Project Constraints (from CLAUDE.md)

- Security work (auth, CSRF, validation, rate limits, here webhook verification and echo prevention): run tests, commit with the `security:` prefix.
- No secrets or `.env*` files in commits (pre-commit enforces); never read `.env.local`. New secret names go into `infra/vps/env/chatwoot-integration.env.example` with empty values.
- No hard-coded `€` prices in `app/` or `components/`; `infra/chatwoot` JSON/MD is also price-gated (labels, canned text must stay price-free).
- `middleware.ts` matcher must exclude every static/metadata extension; do not change it for this phase (the new routes are under `/api`, which already runs the middleware and is non-localized).
- New EN strings in `messages/en.json` need real translations in all locales: this phase adds no customer-facing strings (admin/CRM literals are English like every admin surface).
- Tests: `npx vitest run [files]`; `vitest related` crashes (grep `tests/`); type check `npx tsc --noEmit` (8 old baseline errors in `tests/`); lint `npx eslint --quiet <files>`; full gate = the `verify` skill.
- Golden-HTML/JSON-LD snapshot tests normalize `priceValidUntil` (not touched here).
- Brand spelling Prestigo / rideprestigo.com; never run `scripts/i18n-translate.mjs --dry-run`.
- Vercel Preview deploys always fail (missing Supabase env): webhooks target production only.

## Sources

### Primary (HIGH confidence)
- Chatwoot v4.18.0 source (raw.githubusercontent.com/chatwoot/chatwoot/v4.18.0/…): `lib/webhooks/trigger.rb`, `app/models/webhook.rb`, `app/models/concerns/webhook_secretable.rb`, `app/listeners/webhook_listener.rb`, `app/controllers/api/v1/accounts/webhooks_controller.rb`, `app/views/api/v1/accounts/webhooks/_webhook.json.jbuilder`, `app/policies/webhook_policy.rb`, `app/models/message.rb`, `app/models/conversation.rb`, `app/models/contact.rb`, `app/presenters/conversations/event_data_presenter.rb`, `app/presenters/mail_presenter.rb`, `app/models/concerns/message_filter_helpers.rb`, `app/finders/message_finder.rb`, `app/controllers/api/v1/accounts/conversations/messages_controller.rb`, `app/controllers/api/v1/accounts/contacts_controller.rb`, `app/views/api/v1/models/_message.json.jbuilder`, `lib/safe_fetch.rb`
- EspoCRM 10.0.8 source (raw.githubusercontent.com/espocrm/espocrm/10.0.8/…): `application/Espo/Core/Webhook/{Sender,Queue,Manager}.php`, `Hooks/Common/Webhook.php`, `Classes/RecordHooks/Webhook/BeforeSave.php`, `Classes/Record/Webhook/DefaultsPopulator.php`, `Classes/Acl/Webhook/AccessChecker.php`, `Classes/Acl/Note/AccessChecker.php`, `Hooks/Note/StreamUpdatedAt.php`, `Tools/Stream/HookProcessor.php`, `Resources/metadata/scopes/{Webhook,Note}.json`, `Modules/Crm/Resources/metadata/{scopes,entityDefs}/Lead.json`
- EspoCRM Webhooks documentation: https://docs.espocrm.com/administration/webhooks/ (create endpoint, `skipOwn`, event names, `Signature` header, retry/410 behaviour, config parameters)
- Repo files read this session: `lib/outbox.ts`, `lib/outbox-store.ts`, `lib/lead-sync.ts`, `lib/crm-sync.ts`, `lib/chatwoot-sync.ts`, `lib/chatwoot-mapping.ts`, `lib/identity-store.ts`, `lib/sync-resolve.ts`, `lib/chatwoot-client.ts`, `lib/espocrm-client.ts`, `lib/dispatch-outcomes.ts`, `lib/request-guards.ts`, `lib/outbox-labels.ts`, `lib/erasure.ts` (excerpts), `lib/customer-mapping.ts` (excerpts), `lib/lead-mapping.ts` (head), `app/api/integrations/{dispatch,kick}/route.ts`, `app/api/cron/outbox-sweep/route.ts`, `app/api/webhooks/stripe/route.ts` (head), `middleware.ts`, `supabase/migrations/064,069,072,075` (relevant parts), `tests/infra-vps-isolation-guard.test.ts`, `tests/crm-sync-migrations.test.ts` (head), `infra/espocrm/{README.md,roles.json,enums.json,fields.json,entities.json}`, `infra/chatwoot/{README.md,labels.json,inboxes.json,automation-rules.json,custom-attributes.json}`, `infra/vps/chatwoot/compose.yml`, `infra/vps/env/chatwoot-integration.env.example`, `.planning/research/{ARCHITECTURE,PITFALLS}.md` (webhook sections)

### Secondary (MEDIUM confidence)
- Chatwoot issue #13809 (https://github.com/chatwoot/chatwoot/issues/13809): open; confirms signed string is `timestamp.body`, only account-level webhooks are signed, API-inbox/agent-bot webhooks are not.

### Tertiary (LOW confidence)
- EspoCRM forum thread 37286 (note creation through the API; parent fields lost with snake_case): anecdotal, drives Assumption A5 and the live smoke.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; versions read from `package.json`.
- Signing, retry, `skipOwn`, queue semantics: HIGH — read from the pinned source and the official docs; the two HMAC helpers were self-tested in this session against the exact formulas.
- Architecture (outbox integration, structural guard, ingest RPC): HIGH for constraints (read from code/migrations), MEDIUM for the exact handler decomposition (planner discretion).
- Payload shapes and Chatwoot job-time behaviour: MEDIUM — derived from source, no live capture yet (hence the mandatory Wave 0 probe/contract capture).
- Pitfalls: HIGH for the verified ones, flagged `[ASSUMED]` where not.

**Research date:** 2026-10-26
**Valid until:** 2026-11-25 (stable pinned versions; re-check only if Chatwoot or EspoCRM is upgraded under the INFRA-04 runbook)
