# Phase 85: Statistics - Context

**Gathered:** 2026-10-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the existing `/admin/stats` page so the owner can see how inquiries turn into paid bookings
(by source/channel, for a chosen period), the repeat-customer rate with the top repeat customers, and
B2B revenue and bookings per corporate Account (STAT-01, STAT-02, STAT-03). Read-only internal dashboard.
Data comes from Supabase only. No new tracking of the visitor journey, no conversation-quality metrics
(response time etc.), no exports.

</domain>

<decisions>
## Implementation Decisions

### Carried forward (locked in earlier phases — do not re-decide)
- Supabase is the single source of truth for `bookings` / `customer_profiles`; CRM and Chatwoot are
  downstream views (PROJECT.md v4.0).
- Person identity = `contact_identities` + `identity_emails` / `identity_phones`: same normalized email =
  same person; E.164 phone merges only when not shared (82 D-04/D-05/D-06).
- One open chat Lead per person; a later paid site booking by the same person sets the chat Lead to
  Converted with `chat_leads.converted_booking_id` (83 D-02, D-05). Empty conversations and known customers
  create no chat Lead (83 D-01, D-03, D-06).
- Abandoned online checkout = `identity_is_abandoned(status, booking_source, payment_link_id)`
  (`status='unpaid' AND booking_source='online' AND payment_link_id IS NULL`) (80 D-08/D-21).
- Manual bookings carry `bookings.lead_channel` (whatsapp/phone/email/partner/other, NULL = unknown;
  migration 066) specifically so this phase can show conversion by channel (81 D-08).
- Erased customers' bookings are anonymised, not deleted: amount, date, vehicle class and reference stay
  (82 D-08). Stats must keep working on anonymised rows (they count as revenue but no longer link to a person).
- Internal admin tool: showing amounts is fine; amounts always come from booking data, never typed `€`
  constants (CLAUDE.md pre-commit guard; 84 D-06).
- Admin API auth guard pattern (`getAdminUser()` → 401/403) as in `app/api/admin/stats/route.ts`.

### Conversion: inquiries → bookings (STAT-01)
- **D-01:** An "inquiry" (top of the funnel) is any of three lead kinds: a chat Lead (`chat_leads` row),
  a site form inquiry (`inquiries` row: contact / corporate / multiday_quote), and an abandoned online
  checkout. Chatwoot conversations by existing customers that created no chat Lead are not inquiries.
- **D-02:** A "booking" (bottom of the funnel) is a paid/confirmed booking: status not `unpaid` and not
  `cancelled`. Cancelled-after-payment bookings do not count.
- **D-03:** An inquiry is converted when the same person (resolved through the identity tables) has a
  qualifying booking (D-02) created within 90 days after the inquiry. For chat Leads the explicit
  `converted_booking_id` also counts. An abandoned checkout converts when the same person pays any booking
  within the window (including the same row being reconciled to paid). Each inquiry converts at most once;
  one booking may close several inquiries of the same person.
- **D-04:** Chat channel must be stored in Supabase: add a channel column (web widget / WhatsApp / email /
  Telegram / other, derived from the Chatwoot conversation/inbox) to the chat registry
  (`chat_leads` and/or `chat_conversations`, migration 081), written by the Phase 83 intake
  (`lib/chat-intake.ts`) when the row is created, plus a one-time backfill of the existing rows from the
  Chatwoot API. The stats page reads only Supabase and never calls Chatwoot/EspoCRM at render time.
  — **Reversibility:** costly — new column + intake change + backfill script; removing it later means a
  migration and dropping the per-channel rows.
- **D-05:** Conversion table rows = source/channel: Chat · Web widget, Chat · WhatsApp, Chat · Email,
  Chat · Telegram, Form · contact, Form · corporate, Form · multiday quote, Abandoned checkout. Columns:
  inquiries, converted, conversion %, revenue (EUR) of the converting bookings.
- **D-06:** Bookings that arrive with no recorded inquiry are shown as separate "direct" rows without a
  conversion %: manual bookings split by `lead_channel` (WhatsApp / phone / email / partner / unknown) and
  GNet. Columns: bookings and revenue only. Direct online bookings (paid with no prior abandoned row/inquiry)
  are their own "Online · direct" row.

### B2B per Account (STAT-03)
- **D-07:** "Account" = a site corporate account: `customer_profiles.account_type = 'corporate'`
  (the `/admin/accounts` list), bookings linked through `bookings.user_id`. EspoCRM Accounts are not read in
  this phase; there is no hotel/agency/corporate segment field yet.
- **D-08:** Per Account, for the chosen period: bookings, revenue (EUR), average booking value, last trip
  date; sorted by revenue; each row links to `/admin/accounts/[id]`. Above the table: total B2B revenue and
  its share of all revenue in the period.

### Repeat customers (STAT-02)
- **D-09:** Repeat customer = one identity (82 identity tables, email + non-shared phone) with 2 or more
  qualifying bookings (D-02) over all time. The two legs of one round-trip order count as one booking.
- **D-10:** Repeat-customer rate for a period = share of customers who had a qualifying trip in the period
  and whose all-time history has 2+ bookings. Show next to it the share of the period's revenue that came
  from repeat customers.
- **D-11:** Top repeat customers: top 10 by all-time revenue. Columns: name, email, trips, revenue (EUR),
  first and last trip date. Each row links to `/admin/bookings?search=<email>`.
- **D-12:** GNet bookings are excluded from repeat-customer stats (partner's passengers, not ours). They
  still count in overall revenue and in the GNet direct row (D-06).

### Period, currency and page layout
- **D-13:** Period selector: presets (last 30 days, last 90 days, this month, this year, all time) plus a
  custom date range. The period lives in the URL (`?from=YYYY-MM-DD&to=YYYY-MM-DD`) so a link can be shared.
  Default: last 90 days.
- **D-14:** Date semantics: the funnel counts inquiries created in the period (`created_at` of the
  inquiry/chat Lead/abandoned row) and follows each one 90 days forward (D-03). B2B and repeat-customer
  revenue count trips in the period by `pickup_date`, same as the existing stats.
- **D-15:** New blocks show amounts in EUR (`amount_eur`). The existing Overview charts stay in CZK as they are.
- **D-16:** `/admin/stats` becomes tabbed: Overview (existing KPIs and charts unchanged) · Conversion ·
  Customers · B2B. The period selector applies to the three new tabs.
- **D-17:** Visual language: existing admin dark theme, `KPICard`, `StatsChart`, table styles from other
  admin tables. English UI, no next-intl (internal tool).

### Resolved after research (owner, 2026-10-31)
- **D-18:** (refines D-02, research O-1) A qualifying booking = status in the five paid statuses
  `confirmed, assigned, en_route, on_location, completed` (same set the CRM uses for "Converted");
  `pending` does not count. Live: 0 pending rows today.
- **D-19:** (refines D-07, research O-2) B2B bookings of an Account = `bookings.user_id` = the account's user
  OR `client_email` matches the account user's email — same attribution as `/admin/accounts`.
- **D-20:** (research O-4) Each abandoned online checkout row is one inquiry (no per-person/day dedup in v1).
- **D-21:** (research O-5) An explicit `chat_leads.converted_booking_id` counts as converted regardless of
  the 90-day window, as long as the booking is a qualifying trip (D-18). Identity-match conversion keeps the
  90-day window (D-03). D-03's "same row reconciled to paid" clause is vacuous (research O-3) — implement as
  "a different paid row of the same person".

### Claude's Discretion
- Whether aggregation runs as Postgres RPC/SQL view(s) or in the route handler (data volume is tiny:
  ~80 bookings, ~10 chat Leads, ~4 form inquiries) — prefer SQL that stays correct as volume grows.
- How round-trip legs are grouped into one booking (use whatever order/group key the schema already has).
- Exact channel mapping from Chatwoot inbox/channel types and where the column lives (`chat_leads` vs
  `chat_conversations`); how the backfill script is run (owner-run script vs MCP).
- Empty states, loading skeletons, small-number caveats (e.g. show "n/a" instead of % when inquiries = 0).
- Whether to show a tiny trend/sparkline per row — optional, not required.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and roadmap
- `.planning/ROADMAP.md` §"Phase 85: Statistics" — goal and success criteria
- `.planning/REQUIREMENTS.md` — STAT-01, STAT-02, STAT-03
- `.planning/ROADMAP.md` Backlog 999.11 — WR-03 "lost conversion Note → Phase 85 counts": conversion must be
  computed from Supabase (`chat_leads.converted_booking_id` + identity match), not from EspoCRM Notes

### Prior phase decisions this phase relies on
- `.planning/phases/82-site-crm-chatwoot-sync-foundation/82-CONTEXT.md` — identity model (D-04..D-06), erasure anonymisation (D-08)
- `.planning/phases/83-crm-chatwoot-site-webhooks/83-CONTEXT.md` — chat Lead rules (D-01..D-07)
- `.planning/phases/81-lead-capture-site-forms-supabase-espocrm/` — inquiries, `lead_channel`, abandoned-checkout Leads
- `.planning/phases/84-chatwoot-dashboard-app/84-CONTEXT.md` — EUR amounts and admin visual language (D-06, D-07)

### Schema
- `supabase/migrations/065_inquiries.sql` — `inquiries` table
- `supabase/migrations/066_bookings_lead_channel.sql` — `bookings.lead_channel`
- `supabase/migrations/069_identity_core_sync_triggers.sql` — identity tables, `identity_is_abandoned()`
- `supabase/migrations/078_chat_registry.sql` — `chat_leads`, `chat_conversations`
- `supabase/migrations/080_panel_bookings.sql` — latest migration (next = 081); per-person booking aggregation used by the panel

### Codebase
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/(internal)/admin/(dashboard)/stats/page.tsx` + `app/api/admin/stats/route.ts`: existing stats page/API
  (client component fetching JSON) — becomes the Overview tab.
- `components/admin/KPICard.tsx`, `components/admin/StatsChart.tsx` (`RevenueBarChart`, `GroupedBarChart`).
- `app/(internal)/admin/(dashboard)/accounts/` + `app/api/admin/accounts/route.ts` (`AdminAccount` type):
  corporate accounts list and detail links.
- `supabase/migrations/080_panel_bookings.sql`: SQL that aggregates bookings per identity, skipping abandoned
  rows — a model for the repeat-customer query.
- `lib/chat-intake.ts`, `lib/chat-io.ts` (already reads `meta.channel`), `lib/chat-resolve.ts`
  (`conversation.channel`, inbox name): where the chat channel is available to persist.

### Established Patterns
- Admin API: `getAdminUser()` guard, service-role Supabase client, JSON response.
- Migrations: numbered, idempotent (`IF NOT EXISTS`), applied live by the orchestrator via Supabase MCP
  before the code that uses them is deployed; SECURITY DEFINER functions must REVOKE FROM PUBLIC, anon,
  authenticated (memory: function PUBLIC EXECUTE grant gotcha).
- Admin pages use inline styles with CSS vars (`--offwhite`, `--warmgrey`, `--copper`, fonts cormorant/montserrat).

### Integration Points
- `/admin/stats` page (tabs), `/api/admin/stats` (new endpoints or query params for period/tab).
- Phase 83 chat intake → write channel on chat registry rows.
- Links out to `/admin/accounts/[id]` and `/admin/bookings?search=<email>`.

</code_context>

<specifics>
## Specific Ideas

- Current data (2026-10-31): 80 bookings (51 live), sources manual 42 / online 32 / GNet 6; `lead_channel`
  set on 9; 4 form inquiries; 9 chat Leads; 20 chat conversations; 22 customer profiles (8 corporate);
  9 of 30 distinct emails are repeat. Numbers are small — the UI must not mislead with large % on tiny n
  (show counts next to every %).

</specifics>

<deferred>
## Deferred Ideas

- EspoCRM Accounts (hotel/agency/corporate) as the B2B dimension, or a segment field on site corporate accounts.
- Conversation metrics: response time, conversations per channel/agent (PROJECT.md mentions them; not in STAT-01..03).
- CSV export of stats tables.
- Debtors / unpaid invoices per Account.

</deferred>

---

*Phase: 85-statistics*
*Context gathered: 2026-10-31*
