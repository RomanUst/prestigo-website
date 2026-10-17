# Phase 81: Lead Capture (Site Forms → Supabase + EspoCRM) - Context

**Gathered:** 2026-10-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Every lead signal the site produces is persisted in Supabase and reaches EspoCRM as a Lead through a durable
outbox, with zero regression to today's email-only behaviour if storage or the VPS fails:

- Contact form, corporate form and multi-day quote form submissions → new `inquiries` table → EspoCRM Lead
  (LEAD-01/02/03).
- Every booking (all sources) → one EspoCRM Lead per booking whose status follows the booking; abandoned/unpaid
  checkouts are covered by this path (LEAD-04, LEAD-06).
- Outbox core: `integration_outbox` + `lib/outbox.ts` (single insert path) + QStash-invoked dispatcher + sweep
  safety net + thin EspoCRM client + basic email/phone normalization. Leads are its first event types; Phase 82
  extends the same outbox (LEAD-05, success criterion 7).

Not in this phase: Contact/Booking continuous sync and Lead→Contact conversion (Phase 82, SYNC-01), cross-system
contact de-dup / `crm_identity_map` merge logic (Phase 82, SYNC-03), outbox health admin page (Phase 82,
SYNC-04), GDPR erasure propagation and privacy-policy rewrite (Phase 82, GDPR-01/02), Chatwoot writes, inbound
webhooks (Phase 83), stats (Phase 85).

</domain>

<decisions>
## Implementation Decisions

### Abandoned checkouts and the calculator (LEAD-04)
- **D-01:** The "calculator email captures" part of LEAD-04 is struck. The `/calculator` page and its email
  capture were removed on 2026-05-04 (commit `c91be108`); nothing writes `quote_leads` any more. Update
  REQUIREMENTS.md LEAD-04 wording accordingly. `quote_leads` table and its purge in `reminder-24h` are left
  untouched in this phase.
- **D-02:** An unpaid checkout becomes a Lead immediately, at the moment the `unpaid` booking row is created at the
  payment step (`app/api/create-payment-intent`), not after an abandonment timer. It then follows the booking via
  LEAD-06 (paid → Converted).
- **D-03:** An unpaid checkout counts as abandoned (Lead → Dead) once its pickup time has passed while still
  unpaid. Until then the lead stays live so the owner can call or send a payment link.
- **D-04:** No notification and no EspoCRM Task for abandoned-checkout leads — they only appear in the Leads list.
  Existing form emails stay exactly as they are.

### Booking leads (LEAD-06)
- **D-05:** One Lead per booking (not per customer). A repeat customer gets a new Lead for every booking. Keyed
  idempotently by the Supabase booking id (same key philosophy as Phase 80 D-07). — **Reversibility:** costly —
  Phase 85 conversion stats and Phase 82 linking build on one-lead-per-booking.
- **D-06:** Status mapping booking → Lead:
  `unpaid` → New; `pending` (quote request awaiting price) → In Process;
  `confirmed` / `assigned` / `en_route` / `on_location` / `completed` → Converted;
  `cancelled` → Dead (including a cancellation after payment — a cancelled paid booking moves the Lead back to
  Dead); `unpaid` past pickup time → Dead (D-03).
- **D-07:** ALL bookings become Leads: online site bookings (incl. round-trip and multi-day), quote requests,
  bookings created manually in the site admin (from WhatsApp, phone, email, etc.) and GNet bookings.
- **D-08:** Lead source: website bookings → "Website booking"; GNet → "GNet"; manual admin bookings → the channel
  picked in a new **"Channel" field in the admin manual-booking form** (WhatsApp / Phone / Email / Partner /
  Other). The channel is stored on the booking in Supabase and used as the Lead source, so Phase 85 can show
  conversion by channel. — **Reversibility:** costly — adds a `bookings` column via migration that stats will read.
- **D-09:** When a Lead becomes Converted, Phase 81 only updates the Lead (status + booking reference + admin deep
  link from Phase 80 D-18). It does NOT create a Contact/Booking or run EspoCRM lead conversion — that is Phase 82
  continuous sync, which must link to these Leads without duplicates.

### Lead content and repeats (LEAD-01/02/03)
- **D-10:** One Lead per form submission. A repeated submission from the same email creates a new Lead (no merge
  into an open lead).
- **D-11:** If a Contact with the same normalized email already exists in EspoCRM (e.g. from the Phase 80
  backfill), the Lead is still created, visibly marked as an existing customer and pointing to that Contact. No
  merging — full de-dup is Phase 82.
- **D-12:** Corporate-form leads carry the company name as text only (Lead account name). No automatic Account
  creation or linking, even on an exact match — the owner decides at conversion (consistent with Phase 80 D-14:
  nothing is created in the CRM without owner confirmation).
- **D-13:** All new Leads are assigned to the owner's EspoCRM user. Re-assignment to operators happens manually
  once they exist.

### Retention and consent
- **D-14:** Form inquiries (`inquiries` rows and their Leads) are kept indefinitely until an erasure request
  (erasure propagation is Phase 82). `inquiries` is a new table — never reuse `quote_leads` (30-day purge).
- **D-15:** Abandoned-checkout Leads (Dead via D-03) are deleted from EspoCRM 90 days after becoming Dead. The
  `unpaid` booking row in Supabase stays as today (admin recovery queue).
- **D-16:** Contact, corporate and multi-day quote forms get a short notice line under the submit button, no
  checkbox: "We store your request to reply to it — Privacy Policy" (link). New EN strings need real translations
  in all 7 locales (CLAUDE.md rule; translate in-session, the i18n workflow is disabled).
- **D-17:** Do not store IP address or user-agent with inquiries (data minimization; rate limit + honeypot already
  protect the forms).

### No-regression guarantee (LEAD-05, success criteria 5 and 7)
- **D-18:** The customer response and the existing email path must not depend on the `inquiries` insert, the outbox
  insert, QStash or the VPS. A storage failure is logged and the submission still returns success with emails
  sent. With the VPS offline, events queue in the outbox and are delivered exactly once when it is back.

### Claude's Discretion
- Outbox schema, dispatcher and sweep design (research `.planning/research/ARCHITECTURE.md` Pattern 1 is the
  starting point: explicit insert via `lib/outbox.ts`, `after()` QStash publish, idempotency key unique index,
  claim-after-side-effect).
- Where the time-based jobs run (Dead-after-pickup transition, 90-day deletion, outbox sweep): piggy-back on an
  existing daily cron or add one — check the Vercel cron limit first (`lib/purge-quote-leads.ts` notes the Hobby
  cap of 2; `vercel.json` currently lists 3).
- Exact Lead source values for forms (e.g. "Contact form", "Corporate form", "Multi-day quote") and how the
  "existing customer" mark and itinerary are modelled (custom field vs description). Multi-day itinerary as
  readable day-by-day text + quote reference is fine.
- Channel field details: required for new manual bookings; existing manual bookings default to "Other" /
  unknown.
- No historical backfill of past bookings or inquiries as Leads — forward-only from deploy (forms were never
  stored; past bookings already exist as CBooking from Phase 80).
- Adding Lead permissions to the `prestigo-sync` "Sync writer" role (`infra/espocrm/roles.json`) and any Lead
  field/enum config via the Phase 80 config-as-code sync.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope
- `.planning/ROADMAP.md` §"Phase 81: Lead Capture (Site Forms → Supabase + EspoCRM)" — goal and 7 success criteria
- `.planning/REQUIREMENTS.md` — LEAD-01..06 (LEAD-04 wording to update per D-01); SYNC-01..05 / GDPR-01..02 as
  boundaries with Phase 82
- `.planning/PROJECT.md` §Constraints ("v4.0 VPS independence", "Secrets") and §Key Decisions (integration in repo,
  no n8n)

### Architecture research
- `.planning/research/ARCHITECTURE.md` — outbox + QStash pattern, `integration_outbox` schema sketch, dispatcher,
  sweep, `inquiries` table, Anti-Pattern 4 (do not reuse `quote_leads`), EspoCRM API-user least privilege
- `.planning/research/PITFALLS.md` — idempotency, VPS-down, GDPR pitfalls
- `.planning/research/SUMMARY.md` — v4.0 overview

### Prior phase decisions
- `.planning/phases/80-espocrm-deployment-core-entities/80-CONTEXT.md` — D-07 idempotency keys, D-08/D-21
  abandoned-checkout definition, D-14 no auto-creation without owner, D-17 service identities
  (`prestigo-sync` API user, `~/.config/prestigo/espocrm-*.env`, never retry on 401), D-18 admin deep link
- `.planning/phases/80-espocrm-deployment-core-entities/80-RESEARCH.md` — EspoCRM 10.0.8 API mechanics and quirks
- `.planning/phases/76-vps-infrastructure/76-CONTEXT.md` — VPS reachability, backups

### EspoCRM config-as-code
- `infra/espocrm/README.md`, `infra/espocrm/sync.mjs`, `infra/espocrm/roles.json`, `infra/espocrm/enums.json`,
  `infra/espocrm/fields.json`, `infra/espocrm/lib/client.mjs`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/api/contact/route.ts`, `app/api/corporate-contact/route.ts`, `app/api/submit-multiday-quote/route.ts` —
  the three form routes to extend (zod `.strict()` schemas, rate limit, `safeString`/`safeEmail`, honeypot on
  corporate).
- `app/api/create-payment-intent/route.ts` (~L400) — where `unpaid` rows are created (D-02 hook point);
  `app/api/webhooks/stripe/route.ts` — paid reconciliation (Converted); `app/api/submit-quote/route.ts` —
  `pending` quote rows; `app/api/admin/bookings/route.ts` — manual create / status changes / cancel;
  `app/api/gnet/farmin` — GNet bookings.
- `lib/qstash.ts` (`scheduleQStashReminder`, lazy client) and `app/api/cron/reminder-2h/route.ts` (`Receiver`
  signature verification) — reuse for outbox publish and dispatcher verification.
- `lib/phone.ts` `normalizePhone` — already E.164 normalization; reuse instead of adding libphonenumber-js unless
  research shows a gap.
- `lib/booking-transitions.ts` — canonical booking status vocabulary for the D-06 mapping.
- `components/admin/ManualBookingForm.tsx` — where the D-08 Channel field goes.
- `infra/espocrm/lib/client.mjs` — EspoCRM API client pattern (credentials read inside, never printed).

### Established Patterns
- Fire-and-forget side effects via `after()`; synchronous durable write first.
- Service-role-only tables with deny-all RLS (e.g. `quote_leads`, `booking_edit_audit_log`).
- `booking_source` CHECK values: `online`, `manual`, `gnet`.
- Next migration number: 064 (063 = gcal sync trigger).
- Security-relevant work (validation, outbox integrity) → run tests, commit with `security:` prefix.

### Integration Points
- EspoCRM REST API at `crm.rideprestigo.com` via the `prestigo-sync` API user (needs Lead scope added).
- Vercel runtime env for EspoCRM API key (site side) — distinct from the local `~/.config/prestigo` files used by
  infra scripts.
- Daily cron (`/api/cron/reminder-24h`) as a possible host for time-based jobs.

</code_context>

<specifics>
## Specific Ideas

- Lead per booking lets Phase 85 compute honest inquiry→booking conversion by source and channel.
- The admin Channel field (WhatsApp / Phone / Email / Partner / Other) is the owner's way to see which channels
  bring manual bookings.
- Consent notice is one quiet line — must not hurt form conversion.

</specifics>

<deferred>
## Deferred Ideas

- Removing the dead `quote_leads` table and its purge from `reminder-24h` — cleanup, not chosen for this phase.
- Historical backfill of past bookings as Leads — not planned; revisit only if Phase 85 stats need it.

</deferred>

---

*Phase: 81-lead-capture-site-forms-supabase-espocrm*
*Context gathered: 2026-10-17*
