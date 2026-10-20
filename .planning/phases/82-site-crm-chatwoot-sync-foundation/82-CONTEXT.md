# Phase 82: Site ↔ CRM/Chatwoot Sync Foundation - Context

**Gathered:** 2026-10-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the Phase 81 outbox (`integration_outbox` + QStash + `/api/integrations/dispatch`) so that every
booking event (create, payment, status change, admin edit) and every customer account signup reaches
EspoCRM (Contact + CBooking) and Chatwoot (contact) within minutes, idempotently. Contacts are
de-duplicated across site, Chatwoot and EspoCRM by normalized email OR E.164 phone, with shared phones
excluded from auto-merge and an admin split. A one-time backfill puts every past customer and booking
into EspoCRM and Chatwoot. An admin page shows outbox health with retry. A single admin-triggered
erasure request removes/anonymises a person in Supabase, Chatwoot and EspoCRM via the outbox with an
audit record, and the privacy policy (7 locales) describes Chatwoot/EspoCRM processing.

Requirements: SYNC-01..05, GDPR-01, GDPR-02. Supabase stays the single source of truth; no write path
from CRM/Chatwoot back to the site in this phase (that is Phase 83).

</domain>

<decisions>
## Implementation Decisions

### Carried forward (locked in earlier phases — do not re-decide)
- Supabase is the source of truth for bookings/customers; CRM and Chatwoot are downstream views (PROJECT.md v4.0).
- CBooking idempotency key = `supabaseBookingId` (unique index live), one CBooking per `bookings` row; Contact key = trimmed lower-cased email (Phase 80 D-06/D-07, `infra/espocrm/README.md` "Naming interface").
- Field ownership: sync owns every CBooking field; on an existing Contact the sync never overwrites `accountId`, `title`, `description` or names, and writes `phoneNumber` only when empty; sync never writes Accounts (README "Field ownership matrix").
- Phase 80 backfill (`infra/espocrm/backfill.mjs`) already loads CBooking + Contacts; continuous sync must update the same records, never create a second copy (Phase 80 D-06). Its legacy phone guessing (+420 for bare 9 digits) is backfill-only and must never enter `lib/phone.ts` or the live flow.
- Abandoned online checkouts (`status='unpaid' AND booking_source='online' AND payment_link_id IS NULL`) are not CBookings (Phase 80 D-08/D-21); they are Leads (Phase 81).
- Form inquiries are kept until an erasure request (Phase 81 D-14); abandoned-checkout Leads are deleted 90 days after Dead (D-15); no IP/user-agent stored (D-17).
- Visitor-facing flows (booking, payment, forms, signup) must never depend on outbox/VPS success (Phase 81 D-18, PROJECT "VPS independence").
- Phase 81 Lead dispatch (`lead.inquiry`, `lead.booking`, `lead.purge`) stays as is; Phase 82 adds new event types beside it.

### Chatwoot contact (SYNC-01/02/04)
- **D-01:** Every customer gets a Chatwoot contact up front: everyone who booked (backfill + live) or signed up, even if they never wrote. When they first write, the operator already sees their history.
- **D-02:** Synced contact attributes shown to the operator: next upcoming trip (date/time, route, reference, status); counters (total trips, last trip date, repeat-customer flag); total spent in EUR; links to the EspoCRM Contact and to the site admin bookings list for that customer. Full per-booking history stays for the Phase 84 Dashboard App.
- **D-03:** Operator edits win for identity fields: the site fills a Chatwoot contact's name/phone only when empty, never overwrites them. The synced attributes from D-02 are always overwritten from the site (site-owned).

### Contact de-duplication (SYNC-03)
- **D-04:** Same normalized email = same person, merged automatically. A match on E.164 phone alone (phone not shared) also merges automatically, but the link is marked "merged by phone" so it is easy to find and undo.
- **D-05:** Shared phone detection = automatic + manual list: a phone seen with ≥ 2 different emails automatically becomes "shared" and is never used for merging again; the owner can also mark a number as shared by hand (e.g. an agency desk).
- **D-06:** The identity links live in Supabase. A new site admin page lists phone-based merges and shared numbers and offers "split"; a split propagates to EspoCRM and Chatwoot through the outbox. No split/merge done inside EspoCRM is read back in this phase. — **Reversibility:** costly — the identity table becomes the key every later sync, backfill and erasure event resolves through.

### GDPR erasure (GDPR-01)
- **D-07:** Erasure is started only by the owner from the site admin, after verifying the requester's identity out of band, with an explicit confirmation step. No customer self-service button in this phase.
- **D-08:** Bookings are anonymised, not deleted: name, email, phone, notes/special requests and addresses are wiped; date, amount, vehicle class, reference and invoice data stay (Czech accounting retention up to 10 years) for bookkeeping and statistics. — **Reversibility:** one-way — wiped personal data cannot be restored.
- **D-09:** Chatwoot: delete the contact together with its conversations. EspoCRM: delete the Contact and its Leads; anonymise its CBookings the same way as D-08. The audit record stores only a hash of the email, the date and what was deleted/anonymised in each system (no plain PII). — **Reversibility:** one-way — deleted conversations and Contacts are gone.
- **D-10:** The customer's site account is deleted (auth user + profile) and their `inquiries` rows are removed. A later booking with the same email starts from scratch.

### Outbox health (SYNC-05)
- **D-11:** A daily email digest to the owner, sent only when there are problems (failed or stuck events): counts and a link to the admin page, no personal data in the email.
- **D-12:** The admin outbox page offers retry per event and a "retry all failed" action (for recovery after a VPS outage).

### Privacy policy (GDPR-02)
- **D-13:** Retention stated in the policy: Chatwoot conversations are kept until an erasure request (no automatic cleanup); forms until an erasure request; abandoned checkouts 90 days; bookings/invoices up to 10 years (anonymised on erasure).
- **D-14:** WhatsApp and Telegram are mentioned generically as channels customers can use to write to us (processors Meta / Telegram), without WhatsApp Cloud API details. The text is extended when Phase 78 (backlog 999.9) resumes. This closes the Phase 78 D-06 "defer-82" privacy item for now.

### Claude's Discretion
- Event type names, payload shape (ids-only, as in Phase 81), fan-out (one outbox row per target system vs one per event), ordering and coalescing of rapid status changes.
- Backfill order and batching for Chatwoot (rate limits), and how it reuses `infra/espocrm/backfill.mjs`.
- Exact "admin edit" coverage: which `bookings` columns trigger a resync.
- Erasure UX details (search by email/phone, preview of what will be removed, warning when the person has an upcoming trip).
- Layout of the outbox page and the identity/split page in the existing admin design.
- Whether the Phase 81 Lead is refreshed on a booking edit (open item from 81-11 runbook) — fold in only if it falls out of the booking-edit trigger naturally.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` — Phase 82 section (goal, 5 success criteria, security note)
- `.planning/REQUIREMENTS.md` — SYNC-01..05, GDPR-01, GDPR-02
- `.planning/PROJECT.md` — v4.0 decisions (source of truth, VPS independence, secrets)

### Outbox built in Phase 81 (extend, don't fork)
- `.planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-CONTEXT.md` — D-14..D-22 retention, no-regression, forward-only
- `.planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-11-SUMMARY.md` — go-live facts (QStash EU, kick secret in Vault, lead_capture_start, deviations found live)
- `infra/vps/runbooks/lead-capture.md` — operational runbook for the outbox/dispatcher
- `supabase/migrations/064_integration_outbox.sql`, `067_bookings_lead_outbox.sql`, `068_outbox_sweep.sql`
- `lib/outbox.ts`, `lib/outbox-store.ts`, `lib/outbox-backoff.ts`, `lib/lead-sync.ts`, `app/api/integrations/dispatch/route.ts`, `app/api/integrations/kick/route.ts`, `app/api/cron/outbox-sweep/route.ts`

### EspoCRM model (Phase 80)
- `.planning/phases/80-espocrm-deployment-core-entities/80-CONTEXT.md` — D-06..D-10, D-17, D-19, D-21
- `infra/espocrm/README.md` — naming interface, field ownership matrix, phone rules, duplicate Contacts, PII rules
- `infra/espocrm/backfill.mjs`, `infra/espocrm/lib/booking-map.mjs`, `lib/espocrm-client.ts`

### Chatwoot (Phase 77)
- `.planning/phases/77-chatwoot-deployment-core-channels/77-CONTEXT.md` — D-04/D-05 identity, D-13 no mail import (backfill gives contacts)
- `infra/chatwoot/README.md`, `infra/chatwoot/custom-attributes.json`, `lib/chatwoot-identity.ts`

### Project rules
- `CLAUDE.md` — `security:` commit prefix for identity/erasure work, i18n for all 7 locales, no prices in content
- `.planning/phases/78-whatsapp-cloud-api-channel-coexistence/78-06-SUMMARY.md` — WhatsApp/Meta privacy disclosure deferred to 82 (handled by D-14)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `integration_outbox` + `outbox_enqueue/claim/complete/reschedule` RPCs, ids-only keys, QStash publish with dedup ids, backoff and 6 h auth breaker: new event types plug into the same dispatcher.
- Daily `outbox-sweep` cron already re-publishes due/lease-expired rows — a natural home for the D-11 digest check.
- `enqueue_booking_lead()` trigger (067) already fires on every booking write — booking sync can hang off the same trigger pattern.
- `infra/espocrm/backfill.mjs` (CBooking + Contacts, `--dry-run/--audit/--relink`) and `infra/chatwoot/sync.mjs` client.
- `lib/phone.ts` E.164 normalisation; `app/api/admin/accounts/route.ts` already calls `supabase.auth.admin.deleteUser`.

### Established Patterns
- Admin API guard order, 400 vs 422 two-step parse, CSRF, sanitisation (memory: API route patterns).
- SECURITY DEFINER RPCs must re-REVOKE from PUBLIC/anon/authenticated after DROP+CREATE.
- No Supabase client created during render; outbox isolation guard forbids CRM calls from visitor request paths.

### Integration Points
- `bookings` writes from webhooks, admin create/edit, payment flows → trigger → outbox.
- Customer signup (auth callback / profile creation) → outbox.
- New admin pages under `app/(internal)/admin/(dashboard)/` (outbox health, identities/split, erasure).
- `app/[locale]/privacy` content in 7 locales.

</code_context>

<specifics>
## Specific Ideas

- Shared-number example from the owner's world: agency/hotel desks such as TravelExpress, TLTGO, Traveltime book for many guests with one phone.
- "Retry all failed" exists so that after a VPS outage the owner fixes everything in one click.

</specifics>

<deferred>
## Deferred Ideas

- Customer self-service "delete my account and data" in the account area (rejected for now, D-07).
- Automatic retention cleanup of Chatwoot conversations (rejected, D-13).
- WhatsApp Cloud API specifics in the privacy policy — with Phase 78 (backlog 999.9).
- Reading merges/splits done inside EspoCRM back into the site — CRM→site direction, Phase 83 or later.

</deferred>

---

*Phase: 82-site-crm-chatwoot-sync-foundation*
*Context gathered: 2026-10-18*
