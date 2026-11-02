# Phase 83: CRM/Chatwoot → Site Webhooks - Context

**Gathered:** 2026-10-26
**Status:** Ready for planning

<domain>
## Phase Boundary

First write path in the CRM/Chatwoot → site direction. Chatwoot and EspoCRM push events to the site via
HMAC-verified inbound webhooks. The receivers verify, dedup and enqueue into the existing Phase 81/82 outbox;
the dispatcher does the work:

- A new Chatwoot conversation from an unknown person creates a Lead (and a Contact when an email/phone is
  known) in EspoCRM, with the channel as lead source (HOOK-01).
- A resolved conversation writes a summary entry + Chatwoot link to the Contact's (or Lead's) history in
  EspoCRM (HOOK-02).
- Owner edits to an EspoCRM Contact propagate to the Chatwoot contact (the narrow EspoCRM webhook use).
- Inbound webhooks are verified (HMAC over raw body, timestamp replay window, delivery dedup) and structurally
  cannot write `bookings` / `customer_profiles` (HOOK-03).
- Site → CRM → webhook → site echo loops cannot occur (origin tagging / fingerprinting) (HOOK-04).

Requirements: HOOK-01..04. Not in this phase: Chatwoot Dashboard App / per-booking history in Chatwoot
(Phase 84), statistics (Phase 85), reading merges/splits done inside EspoCRM back into the site, WhatsApp/IG/FB
channels (Phases 78/79, backlog).

</domain>

<decisions>
## Implementation Decisions

### Carried forward (locked in earlier phases — do not re-decide)
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

### When a conversation becomes a Lead (HOOK-01)
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

### Resolved-conversation history (HOOK-02)
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

### EspoCRM webhook and Chatwoot contact updates
- **D-12:** Chatwoot `contact_updated`: when the operator adds an email/phone to a Chatwoot contact, the site
  creates or finds the EspoCRM Contact (identity rules above) and links the open chat Lead. On an existing
  Contact only empty fields are filled (README field ownership).
- **D-13:** EspoCRM webhook scope = Contact edits only (name, phone, company/account name) → pushed to the linked
  Chatwoot contact. Bookings, site profiles and identity merge/split are untouched. No Lead-status or merge
  events are consumed in this phase.
- **D-14:** For EspoCRM → Chatwoot, a human edit in EspoCRM wins and overwrites the Chatwoot field (a deliberate
  correction). Changes made by the sync user `prestigo-sync` are ignored — this is also an echo-loop guard
  (HOOK-04). This is a narrow exception to 82 D-03, which still governs site → Chatwoot writes.

### What inbound webhooks may write in Supabase (HOOK-03)
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

### Planning-time decisions (2026-10-26, after 83-RESEARCH.md open questions)
- **D-18:** D-07 header filter replaced: Chatwoot drops `Precedence`/`List-Unsubscribe`, so spam skip = Chatwoot
  `auto_reply` flag + no-reply sender pattern + own-domain sender pattern + manual `no-lead` label. Record the
  deviation from D-07 in the plan and the runbook.
- **D-19:** EspoCRM webhooks carry no timestamp/delivery id; HOOK-03's replay window is "N/A by protocol,
  compensated" for EspoCRM: HMAC `Signature` + per-item content-hash dedup (30 days) + handlers re-read current
  state + narrow event surface + `skipOwn`. Chatwoot keeps the real timestamp window + `X-Chatwoot-Delivery` dedup.
- **D-20:** Duplicate guard vs Phase 81 Leads: skip own-domain senders; if the email already has an open non-chat
  Lead created in the last 7 days, append the conversation reference to that Lead instead of creating a chat Lead
  (deliberate deviation from D-02's "chat Lead only" wording). Also subscribe `conversation_updated` (needed for
  the `no-lead` label), filtered in the receiver.
- **D-21:** No reconcile job in Phase 83: Chatwoot account webhooks are at-most-once; document the limitation and
  manual recovery in the runbook and add a backlog item for a reconcile job.

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` — Phase 83 section (goal, 4 success criteria, security note)
- `.planning/REQUIREMENTS.md` — HOOK-01..04
- `.planning/PROJECT.md` — v4.0 decisions (source of truth, VPS independence, secrets)

### Architecture research
- `.planning/research/ARCHITECTURE.md` — webhook receivers (`app/api/webhooks/{chatwoot,espocrm}`), Anti-Pattern 2
  (Chatwoot webhooks are signed: `X-Chatwoot-Signature` over `"{timestamp}.{raw_body}"`), EspoCRM `X-Signature`,
  "isolation by omission" boundary to `bookings` / `customer_profiles`
- `.planning/research/PITFALLS.md` — idempotency, echo loops, VPS-down

### Outbox and identity (extend, don't fork)
- `.planning/phases/82-site-crm-chatwoot-sync-foundation/82-CONTEXT.md` — D-01..D-14 identity, Chatwoot attributes,
  erasure
- `.planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-CONTEXT.md` — Lead model, D-05/D-13/D-18/D-21
- `supabase/migrations/064_integration_outbox.sql`, `069_identity_core_sync_triggers.sql`,
  `072_identity_phone_rules.sql`, `073_identity_admin.sql`, `075_erasure.sql`
- `lib/outbox.ts`, `lib/outbox-store.ts`, `lib/identity.ts`, `lib/identity-store.ts`, `lib/sync-resolve.ts`,
  `lib/crm-sync.ts`, `lib/chatwoot-sync.ts`, `lib/lead-sync.ts`, `lib/lead-mapping.ts`,
  `app/api/integrations/dispatch/route.ts`
- `infra/vps/runbooks/lead-capture.md` — outbox/dispatcher runbook

### Systems
- `infra/espocrm/README.md` — naming interface, field ownership matrix, phone rules, PII rules
- `infra/chatwoot/README.md`, `infra/chatwoot/custom-attributes.json`, `infra/chatwoot/automation-rules.json`
- `infra/vps/chatwoot/compose.yml` (Chatwoot v4.18.0-ce), `infra/vps/espocrm/compose.yml` (EspoCRM 10.0.8)
- `lib/chatwoot-client.ts`, `lib/espocrm-client.ts`
- `.planning/phases/77-chatwoot-deployment-core-channels/77-CONTEXT.md` — D-04 pre-chat email, D-10 inboxes,
  D-20 labels
- `.planning/phases/80-espocrm-deployment-core-entities/80-CONTEXT.md` — D-07 keys, D-14, D-17 service identities

### Patterns and rules
- `app/api/webhooks/stripe/route.ts` — raw-body `.text()` verification, event-id dedup, claim-after-side-effect
- `tests/infra-vps-isolation-guard.test.ts` — model for a structural "cannot write bookings/profiles" guard
- `CLAUDE.md` — `security:` commit prefix, no secrets, i18n rules

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Outbox (`integration_outbox`, enqueue/claim/complete/reschedule RPCs, QStash publish, backoff, 6 h auth breaker,
  sweep, admin health page + daily digest) — new inbound event types plug into the same dispatcher.
- Identity layer (`contact_identities`, `identity_emails`, `identity_phones`, `phone_flags`, `lib/identity*.ts`,
  `lib/sync-resolve.ts`) — resolve "unknown vs known" (D-01) and register strangers (D-16).
- `lib/lead-sync.ts` / `lib/lead-mapping.ts` — EspoCRM Lead create/update; `lib/chatwoot-client.ts` /
  `lib/espocrm-client.ts` — API clients.
- Stripe webhook route — the verification and dedup discipline to mirror.

### Established Patterns
- Ids-only outbox payloads; side-effect-first, claim-after.
- Deny-all RLS service-role tables; SECURITY DEFINER RPCs re-REVOKE from PUBLIC/anon/authenticated after
  DROP+CREATE.
- Admin API guard order / 400 vs 422 parse; security work → tests + `security:` commit.
- Config-as-code for Chatwoot (labels, automation) and EspoCRM (fields, enums, roles) — `no-lead` label and new
  Lead source values go there.

### Integration Points
- New receivers `app/api/webhooks/chatwoot` and `app/api/webhooks/espocrm`; `middleware.ts` matcher/CSP
  unaffected for API routes but check next-intl does not intercept them.
- Chatwoot account webhook (events: `message_created`, `conversation_status_changed`, `contact_updated`) and
  EspoCRM webhook (`Contact.update`) registration.
- Booking sync trigger (Phase 82) → hook for D-05 chat-Lead conversion.
- `prestigo-sync` EspoCRM API user and site Chatwoot API token — actor ids used for echo suppression (D-14).

</code_context>

<specifics>
## Specific Ideas

- The summary private note convention lets the owner write one line ("Итог: перенёс подачу на 14:00") right
  before resolving, and it lands in the CRM.
- `no-lead` is the one-click way to kill a Lead created from a supplier or newsletter mail.

</specifics>

<deferred>
## Deferred Ideas

- AI-generated conversation summaries (rejected for now: API credits empty, new processor in privacy policy).
- Full transcript copies in the CRM (rejected: PII duplication).
- Reading EspoCRM merges/splits and Lead status changes back into the site (rejected for this phase; 82 D-06 keeps
  split/merge on the site admin page).
- Notifications about new chat Leads (not discussed; Chatwoot already notifies about the conversation).

</deferred>

---

*Phase: 83-crm-chatwoot-site-webhooks*
*Context gathered: 2026-10-26*
