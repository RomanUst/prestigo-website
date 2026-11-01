# Phase 85: Statistics - Research

**Researched:** 2026-10-31
**Domain:** Postgres aggregation (Supabase RPC) + Next.js 16 App Router admin dashboard (client page, tabs, URL-driven period) + Chatwoot channel capture
**Confidence:** HIGH on schema, identity rules, existing code seams (all read this session); MEDIUM on live data shape (the Supabase MCP was NOT available to this research session, so no live SELECT was run; see Open Questions O-6)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carried forward (locked in earlier phases, do not re-decide)**
- Supabase is the single source of truth for `bookings` / `customer_profiles`; CRM and Chatwoot are downstream views (PROJECT.md v4.0).
- Person identity = `contact_identities` + `identity_emails` / `identity_phones`: same normalized email = same person; E.164 phone merges only when not shared (82 D-04/D-05/D-06).
- One open chat Lead per person; a later paid site booking by the same person sets the chat Lead to Converted with `chat_leads.converted_booking_id` (83 D-02, D-05). Empty conversations and known customers create no chat Lead (83 D-01, D-03, D-06).
- Abandoned online checkout = `identity_is_abandoned(status, booking_source, payment_link_id)` (`status='unpaid' AND booking_source='online' AND payment_link_id IS NULL`) (80 D-08/D-21).
- Manual bookings carry `bookings.lead_channel` (whatsapp/phone/email/partner/other, NULL = unknown; migration 066) specifically so this phase can show conversion by channel (81 D-08).
- Erased customers' bookings are anonymised, not deleted: amount, date, vehicle class and reference stay (82 D-08). Stats must keep working on anonymised rows (they count as revenue but no longer link to a person).
- Internal admin tool: showing amounts is fine; amounts always come from booking data, never typed `€` constants (CLAUDE.md pre-commit guard; 84 D-06).
- Admin API auth guard pattern (`getAdminUser()` -> 401/403) as in `app/api/admin/stats/route.ts`.

**Conversion: inquiries -> bookings (STAT-01)**
- **D-01:** An "inquiry" (top of the funnel) is any of three lead kinds: a chat Lead (`chat_leads` row), a site form inquiry (`inquiries` row: contact / corporate / multiday_quote), and an abandoned online checkout. Chatwoot conversations by existing customers that created no chat Lead are not inquiries.
- **D-02:** A "booking" (bottom of the funnel) is a paid/confirmed booking: status not `unpaid` and not `cancelled`. Cancelled-after-payment bookings do not count.
- **D-03:** An inquiry is converted when the same person (resolved through the identity tables) has a qualifying booking (D-02) created within 90 days after the inquiry. For chat Leads the explicit `converted_booking_id` also counts. An abandoned checkout converts when the same person pays any booking within the window (including the same row being reconciled to paid). Each inquiry converts at most once; one booking may close several inquiries of the same person.
- **D-04:** Chat channel must be stored in Supabase: add a channel column (web widget / WhatsApp / email / Telegram / other, derived from the Chatwoot conversation/inbox) to the chat registry (`chat_leads` and/or `chat_conversations`, migration 081), written by the Phase 83 intake (`lib/chat-intake.ts`) when the row is created, plus a one-time backfill of the existing rows from the Chatwoot API. The stats page reads only Supabase and never calls Chatwoot/EspoCRM at render time. - **Reversibility:** costly (new column + intake change + backfill script; removing it later means a migration and dropping the per-channel rows).
- **D-05:** Conversion table rows = source/channel: Chat - Web widget, Chat - WhatsApp, Chat - Email, Chat - Telegram, Form - contact, Form - corporate, Form - multiday quote, Abandoned checkout. Columns: inquiries, converted, conversion %, revenue (EUR) of the converting bookings.
- **D-06:** Bookings that arrive with no recorded inquiry are shown as separate "direct" rows without a conversion %: manual bookings split by `lead_channel` (WhatsApp / phone / email / partner / unknown) and GNet. Columns: bookings and revenue only. Direct online bookings (paid with no prior abandoned row/inquiry) are their own "Online - direct" row.

**B2B per Account (STAT-03)**
- **D-07:** "Account" = a site corporate account: `customer_profiles.account_type = 'corporate'` (the `/admin/accounts` list), bookings linked through `bookings.user_id`. EspoCRM Accounts are not read in this phase; there is no hotel/agency/corporate segment field yet.
- **D-08:** Per Account, for the chosen period: bookings, revenue (EUR), average booking value, last trip date; sorted by revenue; each row links to `/admin/accounts/[id]`. Above the table: total B2B revenue and its share of all revenue in the period.

**Repeat customers (STAT-02)**
- **D-09:** Repeat customer = one identity (82 identity tables, email + non-shared phone) with 2 or more qualifying bookings (D-02) over all time. The two legs of one round-trip order count as one booking.
- **D-10:** Repeat-customer rate for a period = share of customers who had a qualifying trip in the period and whose all-time history has 2+ bookings. Show next to it the share of the period's revenue that came from repeat customers.
- **D-11:** Top repeat customers: top 10 by all-time revenue. Columns: name, email, trips, revenue (EUR), first and last trip date. Each row links to `/admin/bookings?search=<email>`.
- **D-12:** GNet bookings are excluded from repeat-customer stats (partner's passengers, not ours). They still count in overall revenue and in the GNet direct row (D-06).

**Period, currency and page layout**
- **D-13:** Period selector: presets (last 30 days, last 90 days, this month, this year, all time) plus a custom date range. The period lives in the URL (`?from=YYYY-MM-DD&to=YYYY-MM-DD`) so a link can be shared. Default: last 90 days.
- **D-14:** Date semantics: the funnel counts inquiries created in the period (`created_at` of the inquiry/chat Lead/abandoned row) and follows each one 90 days forward (D-03). B2B and repeat-customer revenue count trips in the period by `pickup_date`, same as the existing stats.
- **D-15:** New blocks show amounts in EUR (`amount_eur`). The existing Overview charts stay in CZK as they are.
- **D-16:** `/admin/stats` becomes tabbed: Overview (existing KPIs and charts unchanged) - Conversion - Customers - B2B. The period selector applies to the three new tabs.
- **D-17:** Visual language: existing admin dark theme, `KPICard`, `StatsChart`, table styles from other admin tables. English UI, no next-intl (internal tool).

### Claude's Discretion
- Whether aggregation runs as Postgres RPC/SQL view(s) or in the route handler (data volume is tiny: ~80 bookings, ~10 chat Leads, ~4 form inquiries) - prefer SQL that stays correct as volume grows.
- How round-trip legs are grouped into one booking (use whatever order/group key the schema already has).
- Exact channel mapping from Chatwoot inbox/channel types and where the column lives (`chat_leads` vs `chat_conversations`); how the backfill script is run (owner-run script vs MCP).
- Empty states, loading skeletons, small-number caveats (e.g. show "n/a" instead of % when inquiries = 0).
- Whether to show a tiny trend/sparkline per row - optional, not required.

### Deferred Ideas (OUT OF SCOPE)
- EspoCRM Accounts (hotel/agency/corporate) as the B2B dimension, or a segment field on site corporate accounts.
- Conversation metrics: response time, conversations per channel/agent (PROJECT.md mentions them; not in STAT-01..03).
- CSV export of stats tables.
- Debtors / unpaid invoices per Account.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STAT-01 | `/admin/stats` shows inquiries -> bookings conversion by source/channel for a chosen period | `stats_conversion` RPC (section "SQL design"), `chat_leads.channel` column + `chat_channel_bucket()` + backfill procedure, funnel LATERAL-match pattern, direct-row reverse-existence rule |
| STAT-02 | `/admin/stats` shows repeat-customer rate and a list of top repeat customers | `stats_customers` RPC, person key (`booking_identity` or normalized email), one-trip-per-order rule (`leg IS DISTINCT FROM 'return'`), GNet exclusion, deep-link fix for `?search=<email>` |
| STAT-03 | `/admin/stats` shows B2B revenue and bookings per Account | `stats_b2b` RPC on `customer_profiles.account_type = 'corporate'`, link to `/admin/accounts/[id]`, group-payment zero-amount caveat |
</phase_requirements>

## Summary

Everything the three tabs need already lives in Supabase. The identity layer (069/072/077) gives one stable person key for bookings (`booking_identity`), form inquiries and abandoned checkouts (`identity_emails` by normalized email), and chat leads (`chat_leads.identity_id`, or a non-shared single-owner phone). The only genuinely missing datum is the chat channel: `chat_leads` and `chat_conversations` store no channel at all (read in 078). The channel is available in the intake at the single `reserveLead` call site (`s.conversation.channel`, the raw Chatwoot class such as `Channel::WebWidget`), and the repo already maps those strings in `leadSourceForChannel` (`lib/chat-classify.ts:53-66`).

Recommended design: migration 081 adds `chat_leads.channel` (bucket text with CHECK), an IMMUTABLE helper `chat_channel_bucket(raw)`, re-creates `chat_lead_reserve` with a trailing `p_channel text DEFAULT NULL` (DROP the old 5-arg function first, then re-REVOKE), and adds four service-role-only `STABLE SECURITY DEFINER` functions: an internal `stats_trips()` (one row per paid order, shared by the other three) and `stats_conversion(date,date)`, `stats_customers(date,date)`, `stats_b2b(date,date)` returning `jsonb`. Three thin admin GET routes (`/api/admin/stats/conversion|customers|b2b`) call them through the service-role client after `getAdminUser()` and zod validation of `from`/`to`. The existing `/api/admin/stats` route and the Overview content stay untouched; the page becomes a tab shell whose period lives in the URL (read after mount, precedent: `BookingsTable`/admin login).

Three findings the planner must act on that are NOT in CONTEXT: (1) the `?search=<email>` deep link that D-11 relies on is silently ignored by `BookingsTable` today (its regex is `/^[A-Za-z0-9-]{1,40}$/`), so a small fix plus test is required; (2) the "same row reconciled to paid" clause of D-03 can never fire, because a reconciled row stops satisfying `identity_is_abandoned`; (3) D-02's literal "not unpaid and not cancelled" would count `pending` rows (unpriced quotes and not-yet-accepted GNet bookings) as revenue, while every other revenue surface in the repo (panel, CRM lead conversion) uses the five paid statuses.

**Primary recommendation:** One migration `081_stats.sql` (channel column + 4 stats functions, all REVOKEd from PUBLIC/anon/authenticated and GRANTed to service_role), three thin routes sharing `lib/admin-stats.ts`, a tab-shell `stats/page.tsx` with the old content moved verbatim into an Overview component, and an owner-run read-only backfill script in `infra/chatwoot/` whose output the orchestrator applies via MCP.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Funnel / repeat / B2B aggregation | Database (SECURITY DEFINER RPC) | API route (arg validation, shaping) | Identity resolution and the 90-day forward join must be set-based and match the CRM sync; same reason `panel_bookings` lives in SQL (080 header) |
| Period parsing, presets, Prague date boundaries | API route + shared `lib/` helper | Browser (preset buttons resolve to concrete dates) | Server must validate; presets are a UI convenience |
| Chat channel capture | Backend lib (`chat-intake` -> `chat-store` -> RPC) | Database (bucket CHECK + helper) | Value exists only at intake time; mapping lives in SQL so intake and backfill share one definition |
| Chat channel backfill | Owner Mac script (reads Chatwoot) | Orchestrator (applies SQL via Supabase MCP) | Agent cannot read `.env.local`; Chatwoot token lives in `~/.config/prestigo/chatwoot-api.env` |
| Tab shell, period selector, tables | Browser (client component) | - | Matches existing admin pages (client components fetching JSON) |
| Auth | API route (`getAdminUser`) + dashboard layout redirect | - | Existing pattern; no middleware/i18n involvement for `/admin` |

## Standard Stack

No new packages. Everything below is already installed. [VERIFIED: package.json]

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^16.2.3 | App Router, route handlers | existing |
| react | 19.2.3 | client page | existing |
| @supabase/supabase-js | ^2.101.0 | `.rpc()` through `createSupabaseServiceClient()` | existing admin pattern |
| zod | ^4.3.6 | validate `from`/`to` query params | existing admin routes |
| recharts | ^3.8.1 | optional bar chart reuse via `StatsChart.tsx` | existing (not required for the new tabs; tables are the primary UI) |
| vitest | ^4.1.1 | tests | existing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQL RPCs | SQL in route handler / JS aggregation | JS aggregation duplicates identity rules and drifts from the CRM sync; volume is tiny now but the rules (not the volume) are the risk |
| One combined `admin_stats` RPC | Three RPCs | Combined forces every tab to compute all blocks; per-tab RPC matches lazy tab loading |
| Channel on `chat_conversations` | Channel on `chat_leads` (recommended) | The funnel counts Leads, one per person; a Lead's source is the creating conversation's channel. A conversation-level column also needs `chat_conversation_record` changes in 6 `record()` call sites for no STAT benefit |

**Installation:** none.

## Package Legitimacy Audit

No external packages are added by this phase. Audit not applicable. **Packages removed due to SLOP:** none. **Packages flagged SUS:** none.

## Architecture Patterns

### System Architecture Diagram

```
Browser /admin/stats?from&to           (tab shell, client component)
   |  tab = Overview            -> GET /api/admin/stats              (UNCHANGED)
   |  tab = Conversion          -> GET /api/admin/stats/conversion?from&to
   |  tab = Customers           -> GET /api/admin/stats/customers?from&to
   |  tab = B2B                 -> GET /api/admin/stats/b2b?from&to
   v
Route handler: getAdminUser() -> 401/403 -> zod(from,to) -> 400 -> createSupabaseServiceClient().rpc(...) -> 500 generic
   v
Postgres (SECURITY DEFINER, search_path '', service_role only)
   stats_trips()  one row per paid ORDER (non-return leg, 5 paid statuses),
                  person key = booking_identity.identity_id | 'e:'||normalized email
        ^  used by
   stats_conversion(from,to)  inquiries UNION (inquiries, chat_leads, abandoned bookings)
                              -> LATERAL first qualifying trip within 90d (or converted_booking_id)
                              + direct rows (trips with NO inquiry in the 90d before)
   stats_customers(from,to)   group trips by person key (non-GNet, non-anonymised) -> repeat rate, revenue share, top 10
   stats_b2b(from,to)         customer_profiles(corporate) JOIN trips ON user_id, pickup_date in period
   reads: bookings, booking_identity, identity_emails, identity_phones, phone_flags,
          inquiries, chat_leads, customer_profiles
Chat channel write path (new):
   Chatwoot webhook -> chat-intake leadFor() -> chat-store.reserveLead(+channel raw)
        -> rpc chat_lead_reserve(..., p_channel) -> chat_leads.channel = chat_channel_bucket(p_channel)
One-time backfill: owner runs infra/chatwoot/channel-backfill.mjs (GET /conversations/<id>) -> prints SQL -> orchestrator applies via MCP
```

### Recommended Project Structure
```
supabase/migrations/081_stats.sql                      # channel column + helper + reserve re-create + 4 stats functions
.planning/phases/85-statistics/85-0N-smoke.sql         # rolled-back live smoke (precedent: 84-01-smoke.sql)
lib/admin-stats.ts                                     # period schema (zod), preset helpers (Prague), RPC callers, response types
app/api/admin/stats/conversion/route.ts                # GET
app/api/admin/stats/customers/route.ts                 # GET
app/api/admin/stats/b2b/route.ts                       # GET
app/api/admin/stats/route.ts                           # UNCHANGED (Overview)
app/(internal)/admin/(dashboard)/stats/page.tsx        # tab shell + period selector
components/admin/stats/OverviewTab.tsx                 # current page body moved verbatim
components/admin/stats/ConversionTab.tsx | CustomersTab.tsx | B2BTab.tsx | PeriodSelector.tsx | StatsTable.tsx
infra/chatwoot/channel-backfill.mjs                    # owner-run, read-only, prints SQL
lib/chat-store.ts, lib/chat-intake.ts                  # pass the raw channel to reserveLead
components/admin/BookingsTable.tsx                     # widen readBookingDeepLink to accept an email
```

### Pattern 1: Verified table facts (read this session)

**bookings** [VERIFIED: .planning/phases/82-site-crm-chatwoot-sync-foundation/82-LIVE-SCHEMA.md, live snapshot 2026-10-19]:
- `created_at timestamptz NOT NULL`, `pickup_date text NOT NULL`, `pickup_time text NOT NULL`, `amount_czk integer NOT NULL`, `amount_eur integer NULL`, `outbound_amount_czk integer NULL`, `return_amount_czk integer NULL`, `trip_type text`, `user_id uuid NULL` (FK auth.users ON DELETE SET NULL), `leg text NOT NULL DEFAULT 'outbound'`, `linked_booking_id uuid` (never populated, see below), `payment_intent_id text`, `payment_link_id text`, `paid_at timestamptz`, `lead_channel text`, `anonymised_at timestamptz` (added in 069 line 48).
- CHECKs, verbatim: `bookings_booking_source_check CHECK ((booking_source = ANY (ARRAY['online'::text, 'manual'::text, 'gnet'::text])))`; `bookings_status_check ... ARRAY['unpaid', 'pending', 'confirmed', 'completed', 'cancelled', 'assigned', 'en_route', 'on_location']`; `bookings_leg_check CHECK ((leg = ANY (ARRAY['outbound'::text, 'return'::text])))`; `bookings_lead_channel_check ... ARRAY['whatsapp', 'phone', 'email', 'partner', 'other']` (NULL allowed); `bookings_payment_intent_id_leg_key UNIQUE (payment_intent_id, leg)`.
- **pickup_date is TEXT** (`YYYY-MM-DD`). Compare as text against `to_char(p_from, 'YYYY-MM-DD')`; do NOT cast the column (the 080 test `never casts pickup text columns` pins that rule: `expect(body).not.toMatch(/pickup_date\s*::/)`).

**Round-trip grouping** [VERIFIED: lib/supabase.ts:351-440, 080_panel_bookings.sql:160-175]: a round trip is two `bookings` rows sharing `payment_intent_id`, distinguished by `leg` (`'outbound'` / `'return'`), both with `trip_type = 'round_trip'`. `linked_booking_id` is NOT populated (`app/api/admin/bookings/[id]/payment-link/route.ts:92` comment: "linked_booking_id is never populated"). Rule used by the panel and the CRM: one trip = a row with `b.leg IS DISTINCT FROM 'return'`. The checkout total sits on the OUTBOUND row's `amount_eur`; the return row has `amount_eur: null` (supabase.ts return-row builder). Fallback for a round trip saved via the `create_round_trip_bookings` RPC without `amount_eur` (verbatim from 080:162-170):

```sql
COALESCE(
  b.amount_eur,
  CASE
    WHEN b.trip_type = 'round_trip'
     AND (b.outbound_amount_czk IS NOT NULL OR b.return_amount_czk IS NOT NULL)
    THEN round((COALESCE(b.outbound_amount_czk, 0) + COALESCE(b.return_amount_czk, 0)) * 0.04)::integer
  END
)
```
`CZK_TO_EUR_RATE = 0.04` [VERIFIED: lib/currency.ts:3]. Recommended extra last fallback for a non-round-trip row with NULL `amount_eur`: `round(b.amount_czk * 0.04)::integer` (document it; it is not in the panel).

**Paid statuses already used elsewhere** [VERIFIED: lib/lead-mapping.ts:51-60, 080:174]: `confirmed, assigned, en_route, on_location, completed` map to 'converted'; `pending` -> 'in_process' ("quote" in `lib/panel-bookings.ts:110`); `unpaid` -> 'new'; `cancelled` -> 'dead'. The CRM's chat-lead conversion (`lib/crm-sync.ts:150-165`) only counts those five. `pending` arises from `submit-quote` (unpriced quote, `lib/supabase.ts:79-82`) and GNet farm-in (`app/api/gnet/farmin/route.ts:410`: `status: 'pending'`).

**inquiries** [VERIFIED: 065_inquiries.sql:15-25]: `id uuid`, `kind text CHECK (kind IN ('contact', 'corporate', 'multiday_quote'))`, `email text NOT NULL`, `email_normalized text GENERATED ALWAYS AS (lower(btrim(email))) STORED`, `phone`, `created_at timestamptz`. Indexed on `email_normalized` and `created_at`. Erasure DELETES a person's inquiries (075:396-398), so no anonymised inquiries exist.

**chat_leads** [VERIFIED: 078_chat_registry.sql:28-44]: `id uuid`, `lead_ref text UNIQUE` (`chat:<uuid>` where uuid = `aggregateUuid('conversation', id)`, a SHA-1 hash, NOT invertible), `person_key text` (`i:<identity uuid>` or `c:<chatwoot contact id>`), `identity_id uuid NULL`, `chatwoot_contact_id bigint`, `phone text NULL` (E.164, only while no identity), `open boolean`, `closed_reason` CHECK `('converted', 'dead', 'closed_in_crm')`, `converted_booking_id uuid NULL` (no FK), `created_at`, `closed_at`. **No channel column.**
**chat_conversations** [078:55-67]: `conversation_id bigint PK`, `chat_lead_id uuid`, `identity_id`, `outcome` CHECK `('lead_created', 'lead_appended', 'lead_adopted', 'customer', 'known_contact', 'filtered', 'no_lead_label')`, `created_at`. No channel either. Erasure deletes both tables' rows for the person (078 chat_erase), so chat leads of erased people vanish from the funnel (acceptable, document).
`converted_booking_id` is set only by `chat_lead_close(..., 'converted', booking_id)` from `convertChatLeads` (`lib/crm-sync.ts:203`), with the rule "paid booking created_at >= lead created_at". A lead closed `closed_in_crm` or `dead` has NULL `converted_booking_id`.

**identity tables** [VERIFIED: 069:51-98]: `contact_identities(id, user_id UNIQUE, erasing_at, ...)`, `identity_emails(email PK lower-case, identity_id, basis IN ('email','phone','signup','split'), via_phone)`, `identity_phones(identity_id, phone, PK (identity_id, phone))`, `phone_flags(phone PK, shared boolean)`, `booking_identity(booking_id PK, identity_id)`. `identity_normalize_email` returns NULL for `@gnet.local` and `@erased.invalid` (069:148-149). `identity_is_abandoned` verbatim: `p_status = 'unpaid' AND p_source = 'online' AND p_payment_link_id IS NULL`. The resolver deletes the `booking_identity` row for abandoned and anonymised bookings (069:284-294), so **abandoned rows never have an identity link**.
Shared-phone rule, verbatim from `panel_bookings` (080:68-91): a phone flagged `shared` is never used; a phone resolves only when `count(DISTINCT p.identity_id) = 1` in `identity_phones`; email always wins.

**customer_profiles** [VERIFIED: 044_customer_profiles.sql:7-13 + live schema]: `account_type TEXT CHECK (account_type IN ('personal', 'corporate'))`, `company_name`, `full_name`, `user_id UNIQUE`. Emails live in `auth.users` only.

### Pattern 2: `stats_trips()` internal helper (one row per paid order)

```sql
-- Source: modelled on 080_panel_bookings.sql (counter rules) + 069 helpers. Adjust names in the plan.
CREATE OR REPLACE FUNCTION public.stats_trips()
RETURNS TABLE (
  booking_id     uuid,
  person_key     text,        -- identity uuid text, else 'e:'||normalized email, else NULL (anonymised/GNet placeholder)
  user_id        uuid,
  booking_source text,
  lead_channel   text,
  created_at     timestamptz,
  pickup_date    text,
  amount_eur     integer,
  anonymised     boolean,
  client_name    text,        -- only for the top-10 list; consider joining later instead (PII)
  client_email   text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT b.id,
         COALESCE(bi.identity_id::text, 'e:' || public.identity_normalize_email(b.client_email)),
         b.user_id, b.booking_source, b.lead_channel, b.created_at, b.pickup_date,
         COALESCE(b.amount_eur, CASE WHEN b.trip_type = 'round_trip' AND (...) THEN round((...)*0.04)::integer
                                     ELSE round(b.amount_czk * 0.04)::integer END),
         b.anonymised_at IS NOT NULL,
         btrim(b.client_first_name || ' ' || b.client_last_name),
         b.client_email
    FROM public.bookings b
    LEFT JOIN public.booking_identity bi ON bi.booking_id = b.id
   WHERE b.leg IS DISTINCT FROM 'return'
     AND b.status IN ('confirmed', 'assigned', 'en_route', 'on_location', 'completed');
$$;
REVOKE EXECUTE ON FUNCTION public.stats_trips() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.stats_trips() TO service_role;
```
Notes: `'e:' || NULL` is NULL, so anonymised/GNet-placeholder rows get a NULL person key and never match an inquiry or group as a "customer". The `'e:'` fallback keeps the funnel correct for a booking whose identity link has not been written yet (the outbox sync is asynchronous). The qualifying-status list MUST live in exactly one place (this function) and be pinned by a static test.

### Pattern 3: Funnel in SQL (each inquiry converts at most once, 90-day forward window)

```sql
-- Period: lo/hi in Prague local midnights (date -> timestamp -> timestamptz).
-- v_lo := (p_from::timestamp AT TIME ZONE 'Europe/Prague');         NULL p_from => '-infinity'::timestamptz
-- v_hi := ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Prague');      exclusive upper bound
WITH inq AS (
  SELECT 'form_' || i.kind AS src, i.id::text AS ref, i.created_at,
         COALESCE(ie.identity_id::text, 'e:' || i.email_normalized) AS pkey,
         NULL::uuid AS explicit_booking
    FROM public.inquiries i
    LEFT JOIN public.identity_emails ie ON ie.email = i.email_normalized
   WHERE i.created_at >= v_lo AND i.created_at < v_hi
  UNION ALL
  SELECT 'chat_' || COALESCE(l.channel, 'other'), l.id::text, l.created_at,
         COALESCE(l.identity_id::text, <phone-resolved identity text or NULL>),
         CASE WHEN l.closed_reason = 'converted' THEN l.converted_booking_id END
    FROM public.chat_leads l
   WHERE l.created_at >= v_lo AND l.created_at < v_hi
  UNION ALL
  SELECT 'abandoned', b.id::text, b.created_at,
         COALESCE(ie.identity_id::text, 'e:' || public.identity_normalize_email(b.client_email)),
         NULL::uuid
    FROM public.bookings b
    LEFT JOIN public.identity_emails ie ON ie.email = public.identity_normalize_email(b.client_email)
   WHERE public.identity_is_abandoned(b.status, b.booking_source, b.payment_link_id)
     AND b.leg IS DISTINCT FROM 'return'          -- one abandoned ORDER, not two legs
     AND b.anonymised_at IS NULL
     AND b.created_at >= v_lo AND b.created_at < v_hi
), matched AS (
  SELECT q.*, m.booking_id, m.amount_eur
    FROM inq q
    LEFT JOIN LATERAL (
      SELECT t.booking_id, t.amount_eur
        FROM public.stats_trips() t
       WHERE t.booking_id = q.explicit_booking
          OR (q.pkey IS NOT NULL AND t.person_key = q.pkey
              AND t.created_at >= q.created_at
              AND t.created_at <= q.created_at + interval '90 days')
       ORDER BY (t.booking_id = q.explicit_booking) DESC NULLS LAST, t.created_at
       LIMIT 1                                       -- "each inquiry converts at most once"
    ) m ON true
)
SELECT src, count(*) AS inquiries, count(booking_id) AS converted,
       count(*) FILTER (WHERE booking_id IS NULL AND created_at + interval '90 days' > now()) AS window_open,
       COALESCE(sum(amount_eur), 0) AS revenue_eur
  FROM matched GROUP BY src;
```
Key correctness points:
- `LIMIT 1` inside the LATERAL is what enforces "converts at most once"; a booking can still appear for several inquiries (allowed by D-03). **Do not sum `revenue_eur` across rows for a grand total** (double count); compute the total row with `count(DISTINCT booking_id)` / `sum` over distinct bookings.
- **Right-censoring:** an inquiry younger than 90 days with no booking yet is not "lost" yet. Return `window_open` per row and show it as a footnote ("N inquiries still inside the 90-day window"), otherwise conversion is understated for the default last-90-days preset.
- The forward join looks past the period end (a booking after `p_to` can convert an inquiry inside the period). That is intended by D-14.
- The "same row reconciled to paid" clause of D-03 cannot occur: reconcile sets `status='confirmed'`, so the row no longer satisfies `identity_is_abandoned` and is simply a paid booking (an "Online - direct" trip). Only a DIFFERENT paid row of the same person converts an abandoned checkout. Tell the user in the plan notes (O-3).
- Chat-lead person key: `l.identity_id`, else a phone resolution identical to `panel_bookings` (not shared in `phone_flags`, exactly one owner in `identity_phones`), else NULL (then only `converted_booking_id` can convert it). The explicit id should still require the booking to be a currently qualifying trip (a booking cancelled after conversion must not count, D-02); the LATERAL does that automatically because it selects from `stats_trips()`.
- Chat-lead channel NULL (not backfilled / unknown) renders as `chat_other`.

**Direct rows (D-06)** use the reverse test, independent of which trip an inquiry happened to pick: a trip created in the period is "direct" when NO inquiry of the same person (any of the 3 kinds, any date) exists in `[trip.created_at - 90 days, trip.created_at]` and it is not a chat lead's `converted_booking_id`. Direct trips split into: `manual` by `lead_channel` (whatsapp, phone, email, partner, other, NULL -> "unknown"), `gnet`, and `online` -> "Online - direct". Window for "bookings in period" = booking `created_at` (D-14 is silent; matches the funnel's clock). This gives a reconciling invariant for a test: every paid trip in the period is either direct or linked to at least one inquiry.

### Pattern 4: Repeat customers (D-09..D-12)

- Population: `stats_trips()` rows with `booking_source <> 'gnet'` AND `NOT anonymised` AND `person_key IS NOT NULL`. GNet must be excluded EXPLICITLY by `booking_source`: GNet rows can carry the passenger's real email (`firstPassenger?.email || 'noreply@gnet.local'`, gnet/farmin/route.ts:422) and therefore a real identity.
- All-time trips per `person_key` (`count(*)` over non-return rows, so a round trip counts once) -> repeat when `>= 2`.
- Period rate = `count(person_key with >=1 trip whose pickup_date in period AND all-time trips >= 2) / count(person_key with >=1 trip whose pickup_date in period)`. Period filter on text: `t.pickup_date >= to_char(p_from,'YYYY-MM-DD') AND t.pickup_date <= to_char(p_to,'YYYY-MM-DD')`. Return the raw counts (numerator, denominator) so the UI prints "3 of 12" next to the %.
- Revenue share = repeat customers' period revenue / period revenue of the SAME population (non-GNet, non-anonymised). State this denominator in a UI footnote (O-7).
- Top 10: all-time per person, `ORDER BY revenue DESC, trips DESC, last_trip DESC LIMIT 10`; name/email from that person's newest trip (`(array_agg(client_email ORDER BY created_at DESC))[1]`); `first_trip = min(pickup_date)`, `last_trip = max(pickup_date)` (text min/max is safe for ISO dates). Only persons with `trips >= 2`.
- Spot-check expectation from CONTEXT: "9 of 30 distinct emails are repeat" is all-time over all sources; the GNet exclusion and identity merging will change that number, so do not assert it in tests.

### Pattern 5: B2B per Account (D-07, D-08)

```sql
SELECT cp.user_id, cp.company_name, cp.full_name,
       count(*) AS bookings, sum(t.amount_eur) AS revenue_eur,
       round(avg(t.amount_eur))::integer AS avg_eur, max(t.pickup_date) AS last_trip
  FROM public.customer_profiles cp
  JOIN public.stats_trips() t ON t.user_id = cp.user_id
 WHERE cp.account_type = 'corporate'
   AND t.pickup_date >= <from text> AND t.pickup_date <= <to text>
 GROUP BY cp.user_id, cp.company_name, cp.full_name
 ORDER BY revenue_eur DESC;
```
Plus a totals object: `b2b_revenue_eur`, `all_revenue_eur` (ALL paid trips in the period, all sources, incl. GNet, by `pickup_date`) and the derived share computed from those two integers (return both so the UI/tests can verify). Accounts with no qualifying trip in the period are omitted; also return `accounts_total` (count of corporate profiles) for the empty state.
Caveats the UI must tolerate: (a) anonymised bookings have `user_id = NULL` (075:376), so an erased corporate user's history leaves the table; (b) `/admin/accounts` and the account detail page also attribute GUEST bookings to an account by `client_email` match (accounts/route.ts "matching the admin detail view"), so a user_id-only join can show fewer trips than the account page (O-2); (c) group-payment bookings carry per-row amounts of 0 (`app/api/webhooks/stripe/route.ts:462` "Per-row amounts are 0 on these bookings"), so their revenue is understated: show a per-account "bookings without amount" count (`count(*) FILTER (WHERE amount_eur IS NULL OR amount_eur = 0)`) as a quiet footnote rather than hiding the gap.

### Pattern 6: Chat channel capture

Verified seam: `ChatConversation.channel` is the raw Chatwoot class (`lib/chat-io.ts:36-38`: "Chatwoot channel class, e.g. `Channel::WebWidget`"), parsed as `str(meta.channel) ?? str(res.channel)` (chat-io.ts:122). Existing mapping, verbatim (`lib/chat-classify.ts:53-66`): `Channel::WebWidget`, `Channel::Email`, `Channel::Telegram`, `Channel::Whatsapp`, anything else -> other. The inbox config confirms the four production inboxes: web widget, `Channel::Email` x2 (info@, bookings@), `Channel::Telegram`, `Channel::Whatsapp` (`infra/chatwoot/inboxes.json`). [CITED: chatwoot docs list `Channel::Api` etc. as additional classes; unknown classes fall to 'other']

Single write site: `leadFor()` in `lib/chat-intake.ts:466-481` calls `chat.reserveLead({...})` once (inside a `reserve` closure also re-called in the retry loop). `s.conversation.channel` is in scope. Add `channel: s.conversation.channel` to that input, `ChatStore.reserveLead` input type (`lib/chat-store.ts:61-67`) and the RPC call (`chat-store.ts:229-237`: add `p_channel`).

Migration side (081):
```sql
ALTER TABLE public.chat_leads ADD COLUMN IF NOT EXISTS channel text;
ALTER TABLE public.chat_leads DROP CONSTRAINT IF EXISTS chat_leads_channel_check;
ALTER TABLE public.chat_leads ADD CONSTRAINT chat_leads_channel_check
  CHECK (channel IS NULL OR channel IN ('web', 'whatsapp', 'email', 'telegram', 'other'));

CREATE OR REPLACE FUNCTION public.chat_channel_bucket(p_raw text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_raw
    WHEN 'Channel::WebWidget' THEN 'web'  WHEN 'Channel::Whatsapp' THEN 'whatsapp'
    WHEN 'Channel::Email' THEN 'email'    WHEN 'Channel::Telegram' THEN 'telegram'
    WHEN NULL THEN NULL  ELSE 'other' END;   -- NULL in => NULL out (unknown), anything else 'other'
$$;
-- (write the NULL case as: CASE WHEN p_raw IS NULL THEN NULL WHEN ... END)

DROP FUNCTION IF EXISTS public.chat_lead_reserve(text, uuid, bigint, text, text);   -- old 5-arg
CREATE OR REPLACE FUNCTION public.chat_lead_reserve(p_person_key text, p_identity_id uuid,
  p_chatwoot_contact_id bigint, p_phone text, p_lead_ref text, p_channel text DEFAULT NULL) ... -- body of 078:122-174,
  -- INSERT adds channel = public.chat_channel_bucket(p_channel); existing-row paths unchanged
REVOKE EXECUTE ON FUNCTION public.chat_lead_reserve(text, uuid, bigint, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_lead_reserve(text, uuid, bigint, text, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.chat_channel_bucket(text) FROM PUBLIC, anon, authenticated;  -- + GRANT service_role
```
Why this shape: DROP of the old signature is mandatory (two overloads make PostgREST named-arg calls ambiguous), and DROP+CREATE re-grants PUBLIC EXECUTE, hence the explicit REVOKE on the NEW 6-arg signature (memory `project_function_public_execute_grant`; 078 header says the same). `DEFAULT NULL` keeps an already-deployed intake (old code, 5 named args) working during the migrate-then-deploy window. Passing the RAW Chatwoot class and bucketing in SQL gives the intake and the backfill one mapping; a static test must pin that the four class strings in SQL equal those in `leadSourceForChannel`.

Existing tests that must change with the signature: `tests/chat-store.test.ts` (rpc arg shape for `chat_lead_reserve`) and the fake `ChatStore.reserveLead` in `tests/chat-intake.test.ts`; any 078 migration test that greps the 5-arg REVOKE stays valid (078 file is untouched). [ASSUMED: exact assertions in those two tests; the planner/executor must read them]

**Backfill** (existing 9 chat leads, 20 conversations): the agent cannot read `.env.local`, and the Chatwoot token is in the owner's `~/.config/prestigo/chatwoot-api.env` (read by `infra/chatwoot/lib/client.mjs`, `loadChatwootConfig`). Recommended procedure, no secret ever reaches the agent:
1. Orchestrator (Supabase MCP, read-only): `SELECT l.id AS lead_id, l.lead_ref, c.conversation_id FROM chat_leads l JOIN chat_conversations c ON c.chat_lead_id = l.id ORDER BY l.created_at` -> list of (lead, conversation ids). The creating conversation of a lead is the one whose `aggregateUuid('conversation', id)` equals the suffix of `lead_ref` (lib/sync-origin.ts:59-65, SHA-1 of `prestigo:chatwoot:conversation:<id>`); the script computes it, falling back to the earliest conversation.
2. Owner runs `node infra/chatwoot/channel-backfill.mjs` (new, modelled on `infra/chatwoot/inspect.mjs`: GET-only, token via `loadChatwootConfig`, never argv, prints no names/emails/bodies). It takes conversation ids on stdin (JSON), calls `GET /conversations/<id>` and reads `meta.channel`, and prints `UPDATE public.chat_leads SET channel = public.chat_channel_bucket('<raw>') WHERE id = '<lead uuid>' AND channel IS NULL;` lines (idempotent). A 404 conversation yields no line (left NULL = "other/unknown").
3. Orchestrator applies the printed SQL through MCP `execute_sql` and re-SELECTs `count(*) FILTER (WHERE channel IS NULL)`.
`ADD COLUMN` itself is applied first via MCP `apply_migration` (executors have no Supabase MCP, per memory `project_gsd_execute_phase_mechanics`).

### Pattern 7: Routes, period handling, page structure

Route (mandatory admin order per memory `project_api_patterns`; GET has no body so skip `enforceMaxBody`): `getAdminUser()` -> 401/403 -> zod parse of `from`,`to` -> 400 -> RPC -> 500 `{ error: 'DB read failed' }` without leaking the Postgres message (existing stats route returns exactly `{ error: 'DB read failed' }`, status 500). Import `getAdminUser` from `@/lib/supabase/server` (the existing stats route re-implements it locally; use the shared export like accounts/route.ts does). Service client: `createSupabaseServiceClient()` from `@/lib/supabase`.

Param contract: `from`,`to` both `YYYY-MM-DD`, must be real calendar dates (round-trip through `Date.UTC` and compare), `from <= to`, span at most ~10 years; reject otherwise 400 (it is a shape error; there is no body, so the 400/422 split reduces to 400 for malformed, 422 optional for `from > to`). "All time" = client sends `from=2000-01-01` (constant `ALL_TIME_FROM` in `lib/admin-stats.ts`); the route passes it through and the SQL needs no NULL branch. Presets resolve to concrete dates in `lib/admin-stats.ts` using `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' })` so "today" is the Prague day. Do not copy the Overview route's `new Date().toISOString().split('T')[0]` (UTC, wrong for the first hour after Prague midnight).

Page: `stats/page.tsx` is a `'use client'` component fetching JSON in `useEffect`. Keep the project's precedent for URL state: read `window.location.search` after mount (see `app/(internal)/admin/login/page.tsx:7-14` and `BookingsTable.tsx:1058-1073`) and write back with `window.history.replaceState(window.history.state, '', ...)` (keep `history.state`, Next stores bookkeeping there). That avoids `useSearchParams` and its Suspense requirement. URL shape: `?tab=conversion&from=...&to=...`; `tab` defaults to overview; Overview ignores the period. Move the current body of `page.tsx` verbatim into `OverviewTab` (D-16: unchanged), keep its existing loading/error markup. Fetch the active tab only, abort/ignore stale responses when the period changes quickly (use a request counter or `AbortController`).

Table styling to copy: `accounts/page.tsx` — `<table style={{ width: '100%', borderCollapse: 'collapse' }}>`, header row `borderBottom: '1px solid var(--anthracite-light)'`, `<th>` uppercase montserrat 11px, `emptyCellStyle`/`cellStyle` constants, row `Link` to detail, right-aligned numeric cells; cards via `KPICard({label, value, subLabel})` (`components/admin/KPICard.tsx`, props verified). Inline styles with CSS vars (`--offwhite`, `--warmgrey`, `--copper`, `--anthracite-mid`, `--anthracite-light`, `--font-cormorant`, `--font-montserrat`). Amounts: `Intl.NumberFormat('cs-CZ')` then the literal word `EUR` in a label; never a typed `€NN` (pre-commit guard is on `app/` and `components/`; a `€` glyph next to a computed value via a template is the risk — use "EUR" text).

Links: B2B row -> `/admin/accounts/${user_id}` (route exists: `accounts/[id]/page.tsx`). Repeat row -> `/admin/bookings?search=${encodeURIComponent(email)}`; see Pitfall 1.

### Anti-Patterns to Avoid
- **Re-implementing identity matching in TypeScript** (drifts from the CRM sync; 080 header explains why it is SQL).
- **Summing per-row revenue for the funnel total** (one booking can close several inquiries).
- **Counting both round-trip legs** (`leg IS DISTINCT FROM 'return'` always).
- **Casting `pickup_date` to `date`** (a bad text value would raise and 500 the whole tab; the 080 test forbids it).
- **Showing % without counts** (n is tiny: ~80 bookings, ~9 chat leads, ~4 form inquiries; CONTEXT "specifics").
- **Calling Chatwoot or EspoCRM at render time** (D-04).
- **`CREATE OR REPLACE` with a changed argument list without DROP** (creates a second overload).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Person matching | JS email/phone merging | `booking_identity`, `identity_emails`, `identity_normalize_email`, shared-phone rule from `panel_bookings` | Same identity the CRM/Chatwoot use; handles GNet placeholders, erased emails, shared phones |
| Abandoned detection | `status='unpaid' AND ...` copy | `public.identity_is_abandoned(status, source, payment_link_id)` | One definition (80 D-08) |
| Round-trip de-dup | grouping by `payment_intent_id` | `leg IS DISTINCT FROM 'return'` | Panel + CRM use it; group payments have NULL `payment_intent_id` |
| Order amount | `amount_czk` conversion | `COALESCE(amount_eur, round-trip fallback)` from 080 | `amount_eur` already holds the checkout total on the outbound row |
| Prague date arithmetic in JS | manual UTC offsets | SQL `AT TIME ZONE 'Europe/Prague'`; `Intl.DateTimeFormat(..., {timeZone:'Europe/Prague'})` client/route | DST-correct |
| Chat channel mapping | a second mapping in the script | `chat_channel_bucket()` in SQL | One source for intake and backfill |
| Admin auth | custom check | `getAdminUser()` | Existing guard |
| Query validation | hand parsing | zod | Existing pattern |

**Key insight:** every hard rule here (who is the same person, what is a trip, what is abandoned) already exists as a tested SQL helper from phases 80-84. The phase is mostly composition; the risk is divergence, so reuse the helpers and pin the composition with static SQL tests.

## Runtime State Inventory

Not a rename/refactor phase. One state-adjacent item: Category "Stored data" — `chat_leads` rows created before this phase have `channel = NULL`; they need the one-time backfill (Pattern 6). Live service config, OS-registered state, secrets/env vars (the Chatwoot token already exists on the owner Mac; no new env var), and build artifacts: none — verified by reading the code paths above.

## Common Pitfalls

### Pitfall 1: The `?search=<email>` deep link is dead
**What goes wrong:** D-11's link opens `/admin/bookings?search=jane@example.com` but `BookingsTable` ignores it: `readBookingDeepLink` only accepts `/^[A-Za-z0-9-]{1,40}$/` (`components/admin/BookingsTable.tsx:1058-1066`), and `tests/BookingsTable.test.tsx:784-788` pins several rejections. `lib/chatwoot-mapping.ts:92` already emits the same email link (`admin_bookings_url`), so the Chatwoot panel has the same latent bug.
**How to avoid:** add a task: accept either a booking reference (existing regex) OR a well-formed email (`^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}$`-style, max 254), keep all existing rejection cases (empty, whitespace, 41 chars, `PRG<script>`, `PRG_2026 0928`) rejected, add tests for an accepted email and a rejected `<script>@x`. The server side already supports it (migration 071 adds `OR b.client_email ILIKE v_like`; the term is bound, not interpolated).
**Warning signs:** clicking a top-customer row lands on the default future-bookings list.

### Pitfall 2: D-02 vs `pending`
**What goes wrong:** "status not `unpaid` and not `cancelled`" includes `pending`: unpriced website quotes and GNet bookings awaiting acceptance would be counted as revenue and as conversions.
**How to avoid:** use the five paid statuses in `stats_trips()` (the CRM's own "Converted" set). Flag to the user (O-1). One place to change.

### Pitfall 3: Right-censored funnel
**What goes wrong:** with the default "last 90 days" period every inquiry is younger than 90 days, so conversion looks artificially low.
**How to avoid:** return and show `window_open` counts; footnote text "N inquiries are still inside their 90-day window".

### Pitfall 4: CZK vs EUR, rounding
**What goes wrong:** the Overview is CZK and unfiltered (it counts `unpaid`/`cancelled`, `amount_czk` per leg); the new tabs are EUR and filtered; numbers will legitimately differ.
**How to avoid:** EUR labels on every new figure; a one-line note on the Overview is NOT added (D-16 says unchanged). Round-trip: `amount_czk` of the outbound row is only the outbound leg (supabase.ts:380-386), never use it for a trip total.

### Pitfall 5: Time zones
**What goes wrong:** period boundaries in UTC shift inquiries near midnight; DST changes the 90-day arithmetic if done on dates.
**How to avoid:** boundaries via `(date::timestamp AT TIME ZONE 'Europe/Prague')`; `interval '90 days'` on timestamptz (calendar-day arithmetic in session TZ is fine for a 90-day window; keep the session default, do not rely on it for boundaries). `pickup_date` is already local text, no conversion. [ASSUMED: `AT TIME ZONE` result semantics; the smoke must assert one boundary case, e.g. an inquiry at 23:30 Prague time on the last period day]

### Pitfall 6: Identity gaps and asynchrony
**What goes wrong:** `booking_identity` is written by the async sync/backfill, not by a trigger (84-01-smoke.sql header: "Identity rows are NOT created by the bookings trigger"). A just-created booking may lack a link; an abandoned row never has one.
**How to avoid:** the `'e:'||normalized email` fallback in `stats_trips()` and in the inquiry/abandoned person key; smoke counts trips with no `booking_identity` row and reports it.

### Pitfall 7: GNet leakage
GNet bookings may carry a real passenger email and therefore an identity; exclude by `booking_source <> 'gnet'` in the repeat population, not by absence of identity. GNet stays in overall revenue, the B2B share denominator, and the "GNet" direct row.

### Pitfall 8: Abandoned-checkout inflation
Each failed attempt is a separate `attempt_id`, hence a separate unpaid row; one hesitant visitor can produce several "inquiries". Default: one inquiry per unpaid order row (D-01 literal). Offer collapsing to one per person per Prague day as an Open Question (O-4); do not decide silently.

### Pitfall 9: Erased people
Inquiries and chat leads of erased people are deleted (075, 078 `chat_erase`), anonymised bookings keep revenue but lose `user_id` and identity. Expect small drifts in historic conversion after an erasure; do not treat as a bug. Anonymised rows have a NULL person key and are excluded from repeat/B2B-by-account but included in overall B2B-share denominator and direct "unknown" rows.

### Pitfall 10: Function privileges
Every new/recreated SECURITY DEFINER function needs `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` with the FULL argument list of the NEW signature plus `GRANT ... TO service_role`, and `SET search_path = ''` (a test counts `SET search_path` occurrences equal to function count, as in `panel-bookings-migration.test.ts`). With `search_path = ''`, every object reference must be schema-qualified (`public.bookings`, `public.stats_trips()`), including inside the functions that call `stats_trips()`.

### Pitfall 11: Next.js build
`useSearchParams()` in a client page needs a Suspense boundary at build; avoid it (precedent above). Route handlers that read cookies are dynamic automatically. Keep new routes out of any static export assumption.

## Code Examples

### Route skeleton (admin order, generic 500)
```ts
// Source: pattern from app/api/admin/accounts/route.ts + app/api/admin/stats/route.ts
import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { parsePeriod } from '@/lib/admin-stats'

export async function GET(request: Request) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const period = parsePeriod(new URL(request.url).searchParams)
  if (!period.ok) return NextResponse.json({ error: 'Invalid period' }, { status: 400 })

  const { data, error: dbError } = await createSupabaseServiceClient()
    .rpc('stats_conversion', { p_from: period.from, p_to: period.to })
  if (dbError) {
    console.error('[admin/stats/conversion.GET] rpc failed:', dbError.message)
    return NextResponse.json({ error: 'DB read failed' }, { status: 500 })
  }
  return NextResponse.json(data)
}
```

### Live smoke pattern (rolled back)
Follow `.planning/phases/84-chatwoot-dashboard-app/84-01-smoke.sql`: one `DO $smoke$ ... $smoke$` block that inserts synthetic bookings/inquiries/chat leads (ids and emails like `smoke-85-a@example.test`), resolves identities with `public.identity_resolve_booking(id)`, calls each RPC, asserts with `RAISE EXCEPTION 'SMOKE_FAIL_<step> ...'`, and ends with `RAISE EXCEPTION 'SMOKE_OK_85_01'`, so everything rolls back. Only `SMOKE_OK_85_xx` means pass. The orchestrator runs it with MCP `execute_sql` after `apply_migration` named `081_stats`. Fill every NOT NULL `bookings` column without default (list in 82-LIVE-SCHEMA.md and the 84-01 INSERT; `pickup_utc` is generated, never insert it).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Overview stats: JS reduce in route over `bookings` in CZK, no status filter | Per-tab SQL RPC in EUR with paid-status filter | this phase | Two different revenue definitions coexist; intentional per D-15/D-16 |
| Email-only joins (e.g. accounts page) | Identity-based person key | 82 | Use identity for new stats |

**Deprecated/outdated:** nothing relevant. `quote_leads` is a dead table (065 header) — not an inquiry source.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `(date::timestamp AT TIME ZONE 'Europe/Prague')` yields the Prague-local midnight as timestamptz | Pitfall 5 / Pattern 3 | Off-by-hours period edges; smoke boundary assertion catches it |
| A2 | `tests/chat-store.test.ts` / `tests/chat-intake.test.ts` assert the exact 5-arg `chat_lead_reserve` call / fake store shape | Pattern 6 | Executor must read and update them; low risk |
| A3 | All qualifying legacy bookings already have a `booking_identity` row (74 backfill + 82-09 pass) | Pitfall 6 | The `'e:'` fallback covers gaps, but two emails of one person would split; smoke reports unlinked count |
| A4 | Live row counts (80 bookings, 9 chat leads, 20 conversations, 4 inquiries) are as in CONTEXT; not re-queried (no MCP in this session) | Summary | Only affects small-n UI copy |
| A5 | `meta.channel` is populated on `GET /conversations/<id>` for all 20 historical conversations | Backfill | Missing => channel stays NULL => shown as "Chat - Other/unknown"; acceptable |
| A6 | `~/.config/prestigo/chatwoot-api.env` holds CHATWOOT_BASE_URL / ACCOUNT_ID / API_TOKEN (README line 150 says so; file not read) | Backfill | Script fails with `ChatwootConfigError`, owner fixes file |
| A7 | Chatwoot channel classes beyond the four mapped (e.g. `Channel::Api`) exist and should bucket to 'other' | Pattern 6 | None; unknown => 'other' |

## Open Questions

1. **O-1: Does `pending` count as a booking?**
   - Known: D-02 literally says "not unpaid and not cancelled" (includes `pending`); the CRM/panel "paid" set excludes `pending` (quotes, GNet awaiting acceptance).
   - Unclear: owner's intent for unpriced quotes.
   - Recommendation: exclude `pending` (five paid statuses), state it in the tab footnote, change in one place if the owner disagrees.
2. **O-2: B2B linkage: `user_id` only (D-07 literal) or also guest bookings of the account's identity?**
   - Known: `/admin/accounts` and the detail page match by `user_id` OR account email, so numbers can differ from the stats table.
   - Recommendation: follow D-07 (user_id) in v1 and add `OR t.person_key = <the account's contact_identities.id::text>` only if the owner wants parity; surface the choice, do not silently widen a locked decision.
3. **O-3: "including the same row being reconciled to paid" (D-03).** Impossible by construction (reconciled rows leave the abandoned set). Recommendation: implement as written (different paid row converts) and tell the user the clause is vacuous.
4. **O-4: Abandoned attempts dedup.** One row per attempt (literal) vs one per person per day. Recommendation: literal for v1, revisit after seeing real counts.
5. **O-5: Explicit `converted_booking_id` beyond 90 days** (the CRM converts without a window). Recommendation: count it regardless of the window as long as the booking is still a qualifying trip.
6. **O-6: Live verification pending.** Orchestrator should run read-only MCP probes before/while planning: (a) `SELECT count(*) FROM bookings WHERE status IN (paid five) AND leg<>'return' AND NOT EXISTS (booking_identity)`; (b) qualifying trips with `amount_eur IS NULL`; (c) `chat_leads` by `closed_reason`/`converted_booking_id`; (d) corporate profiles with their booking counts by `user_id` vs by email; (e) group-payment bookings (amount 0) among corporate accounts.
7. **O-7: Repeat revenue-share denominator.** Recommendation: same population as the rate (non-GNet, non-anonymised), footnoted.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase MCP (apply_migration, execute_sql) | applying 081, smoke, backfill SQL, read-only probes | Orchestrator only (not executors, not this research session) | - | none; migration must be applied by the orchestrator BEFORE deploy |
| Chatwoot API token (`~/.config/prestigo/chatwoot-api.env`) | channel backfill | Owner Mac only | - | leave `channel` NULL for the 9 old leads ("Chat - Other/unknown") |
| node / npx tsc / vitest | tests | Yes (project baseline) | project | - |
| Postgres 17.6 | RPCs | Yes (82-LIVE-SCHEMA.md) | 17.6 | - |

**Missing dependencies with no fallback:** none. **With fallback:** Chatwoot token (backfill optional but wanted by D-04).
Note: `npm install` is blocked in subagents (memory); this phase installs nothing.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.1 (jsdom default; `// @vitest-environment node` for server/SQL-text tests) [VERIFIED: package.json, vitest.config.ts] |
| Config file | `vitest.config.ts` (alias `@`, `setupFiles ./tests/setup.ts`, `globals: true`) |
| Quick run command | `npx vitest run tests/stats-migration.test.ts tests/admin-stats-routes.test.ts tests/admin-stats-period.test.ts tests/stats-page.test.tsx` |
| Full suite command | `npx vitest run` (~90s) + `npx tsc --noEmit` + `npx eslint --quiet <changed files>` (the `verify` skill). `vitest related` crashes here — grep `tests/` instead. |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STAT-01 | 081 text contract: channel column + CHECK values, `chat_channel_bucket` four class strings equal `leadSourceForChannel` strings, old 5-arg reserve dropped, new 6-arg REVOKE/GRANT, `stats_*` STABLE SECURITY DEFINER `SET search_path = ''` (count == function count), no writes in stats functions, 90-day interval, `LIMIT 1` in the lateral, `Europe/Prague`, five paid statuses, `identity_is_abandoned(`, `leg IS DISTINCT FROM 'return'`, no `pickup_date ::` | unit (static SQL) | `npx vitest run tests/stats-migration.test.ts` | Wave 0 |
| STAT-01 | live funnel correctness (converts once, one booking closes two inquiries, window edge at exactly 90 days, explicit converted_booking_id, cancelled booking not counted, period-edge Prague midnight, abandoned two-leg counted once, channel buckets, direct rows split, totals reconcile) | live rolled-back SQL smoke | MCP `execute_sql` `85-01-smoke.sql` -> `SMOKE_OK_85_01` | Wave 0 (orchestrator) |
| STAT-01 | `reserveLead` passes raw channel; intake passes `s.conversation.channel`; old call shape still valid | unit | `npx vitest run tests/chat-store.test.ts tests/chat-intake.test.ts` | exists, must be edited |
| STAT-01 | conversion route: 401, 403, 400 (bad/missing/reversed dates, impossible date `2026-02-30`), 200 passes `p_from/p_to`, 500 generic on rpc error without message leak | unit (hoisted mocks, pattern of `tests/admin-settings.test.ts`) | `npx vitest run tests/admin-stats-routes.test.ts` | Wave 0 |
| STAT-01 | period helper: presets (last 30/90, this month, this year, all time) with injected `now` including a Prague-midnight case, `parsePeriod` | unit | `npx vitest run tests/admin-stats-period.test.ts` | Wave 0 |
| STAT-02 | text contract for `stats_customers`: GNet excluded by `booking_source`, anonymised excluded, `>= 2`, `LIMIT 10`, order by revenue | unit (static SQL) | `npx vitest run tests/stats-migration.test.ts` | Wave 0 |
| STAT-02 | live: round trip counts as one trip, repeat rate numerator/denominator, revenue share, top 10 order/columns, GNet with real email excluded, anonymised booking ignored | live smoke | MCP `85-02-smoke.sql` -> `SMOKE_OK_85_02` | Wave 0 (orchestrator) |
| STAT-02 | customers route + tab renders rate with counts ("3 of 12"), top list rows link to `/admin/bookings?search=<encoded email>`, empty state | unit/component | `npx vitest run tests/admin-stats-routes.test.ts tests/stats-page.test.tsx` | Wave 0 |
| STAT-02 | `BookingsTable` accepts an email deep link and still rejects the old invalid set | component | `npx vitest run tests/BookingsTable.test.tsx` | exists, must be edited |
| STAT-03 | text contract for `stats_b2b`: `account_type = 'corporate'`, join on `user_id`, period on `pickup_date` text, share inputs returned | unit (static SQL) | `npx vitest run tests/stats-migration.test.ts` | Wave 0 |
| STAT-03 | live: personal accounts excluded, cancelled/unpaid excluded, avg and last trip correct, share of total revenue, zero-activity account omitted | live smoke | MCP `85-03-smoke.sql` -> `SMOKE_OK_85_03` | Wave 0 (orchestrator) |
| STAT-03 | B2B tab: rows sorted by revenue, link `/admin/accounts/<id>`, share line, "n/a" when total revenue 0 | component | `npx vitest run tests/stats-page.test.tsx` | Wave 0 |
| D-13/D-16 | tab shell: default 90 days, URL `?tab&from&to` read and written (replaceState), tab switch fetches only the active tab, Overview renders unchanged content | component | `npx vitest run tests/stats-page.test.tsx` | Wave 0 |
| D-04 | backfill script: pure parsing/SQL-emitting function unit-tested; never prints names/emails | unit | `npx vitest run tests/channel-backfill.test.ts` | Wave 0 |
| CLAUDE.md | no hard-coded `€` price in `app/`/`components/` | static | pre-commit / `verify` skill step 4 | enforced |

### Sampling Rate
- **Per task commit:** the quick run command (files touched).
- **Per wave merge:** quick run + `tests/chat-store.test.ts tests/chat-intake.test.ts tests/BookingsTable.test.tsx tests/panel-bookings-migration.test.ts tests/infra-vps-isolation-guard.test.ts` + `npx tsc --noEmit`.
- **Phase gate:** full suite green, `verify` skill PASS, the three live smokes returned `SMOKE_OK_85_xx`, backfill applied and `channel IS NULL` count reported.

### Wave 0 Gaps
- [ ] `tests/stats-migration.test.ts` — static contract for 081 (covers STAT-01/02/03; model: `tests/panel-bookings-migration.test.ts` `load()` strips `--` comment lines, then regexes)
- [ ] `tests/admin-stats-routes.test.ts` — three routes, `vi.hoisted` mocks for `@/lib/supabase/server` and `@/lib/supabase` (model: `tests/admin-settings.test.ts`)
- [ ] `tests/admin-stats-period.test.ts` — `lib/admin-stats.ts` presets/validation
- [ ] `tests/stats-page.test.tsx` — tab shell + three tabs (model: `tests/identities-page.test.tsx`: mock `next/link`, stub `fetch`)
- [ ] `tests/channel-backfill.test.ts` — script's pure helper
- [ ] `.planning/phases/85-statistics/85-01-smoke.sql`, `85-02-smoke.sql`, `85-03-smoke.sql` — live smokes (orchestrator-run)
- [ ] Edit existing: `tests/chat-store.test.ts`, `tests/chat-intake.test.ts`, `tests/BookingsTable.test.tsx`

## Security Domain

`security_enforcement` is not set to false in `.planning/config.json` (key absent), so this applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (admin only) | Supabase session; `getAdminUser()` in each route; dashboard layout redirect |
| V3 Session Management | inherited | existing Supabase SSR cookies; no change |
| V4 Access Control | yes | `app_metadata.is_admin` check (403); RPCs REVOKEd from PUBLIC/anon/authenticated, GRANT service_role only; helper `stats_trips()` also revoked |
| V5 Input Validation | yes | zod on `from`/`to` (real dates, order, span); RPC args typed `date`; no string interpolation in SQL; email deep link regex + server-side bound parameter |
| V6 Cryptography | no | none introduced |
| V8 Data Protection | yes | top-customer list exposes name + email to admins only; no PII in logs (log `dbError.message` only, no row data); backfill script prints no names/emails/bodies |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| RPC callable by anon via PostgREST (PUBLIC EXECUTE regrant after DROP+CREATE) | Information disclosure / Elevation | explicit REVOKE on every new signature + static test + live `aclexplode(proacl)` check by orchestrator (end state `{postgres, service_role}`) |
| Cross-schema hijack in SECURITY DEFINER | Elevation | `SET search_path = ''` + fully qualified names |
| Non-admin reading stats | Information disclosure | `getAdminUser` before any DB call; tests for 401/403 |
| DB error text leaking to client | Information disclosure | generic `{ error: 'DB read failed' }`, log server-side |
| Open redirect / XSS via deep-link email | Tampering | strict email regex, value rendered only in an input and sent as a bound query param |
| Unbounded range DoS | DoS | max span in zod; tables tiny; indexed `created_at` columns exist on `inquiries` |
| Secret exposure in backfill | Information disclosure | token read by `loadChatwootConfig` from owner's file, never argv, never printed (`infra/chatwoot` conventions) |

Security-work rule (CLAUDE.md): commit auth/validation/privilege changes with a `security:` prefix.

## Project Constraints (from CLAUDE.md)

- No hard-coded `€` prices in `app/` or `components/` (pre-commit enforces). Amounts shown come from data; use the word "EUR" in labels.
- No secrets or `.env*` in commits; never read `.env.local` (use owner-run scripts / MCP).
- `middleware.ts` matcher: not touched (admin routes, no static files added).
- next-intl: not applicable (English internal tool, D-17); no new `messages/en.json` strings, so no 7-locale translation obligation.
- Golden-HTML/JSON-LD snapshot tests: not touched.
- Commands: `npx tsc --noEmit` (baseline 8 old errors in `tests/` only), `npx eslint --quiet <files>` (baseline `<a>`->`<Link>` in both `not-found.tsx`), `npx vitest run [files]`, never `vitest related`, never `npm run dev` in Bash (use `preview_start` name `prestigo`).
- Security work: run tests, commit with `security:` prefix.
- Migrations: next = 081, applied live by the orchestrator via Supabase MCP BEFORE the dependent code deploys; idempotent (`IF NOT EXISTS`, `DROP ... IF EXISTS`); SECURITY DEFINER functions must REVOKE FROM PUBLIC, anon, authenticated.
- Vercel Preview always fails (missing Supabase env) — non-blocking; production merges auto-deploy (memory).
- Project skill `verify` (`.claude/skills/verify/SKILL.md`): run for changed files; steps include price/secret guard and, for any new API route, the admin auth guard order check.

## Sources

### Primary (HIGH confidence) — read this session
- `/Users/romanustyugov/Desktop/Prestigo/.planning/phases/85-statistics/85-CONTEXT.md`
- `supabase/migrations/065_inquiries.sql`, `066_bookings_lead_channel.sql`, `069_identity_core_sync_triggers.sql` (lines 1-330, 370-420), `072_identity_phone_rules.sql` (header), `075_erasure.sql` (360-430), `078_chat_registry.sql` (all), `080_panel_bookings.sql` (all), `053_unpaid_booking_status.sql`, `039_gnet_bookings.sql`, `044_customer_profiles.sql`, `071_admin_search_bookings_email.sql` (header)
- `.planning/phases/82-site-crm-chatwoot-sync-foundation/82-LIVE-SCHEMA.md` (live columns/constraints)
- `lib/chat-intake.ts` (record/leadFor/createLead), `lib/chat-io.ts` (ChatConversation, readConversation), `lib/chat-classify.ts` (leadSourceForChannel), `lib/chat-store.ts`, `lib/crm-sync.ts` (convertChatLeads), `lib/lead-mapping.ts` (statuses, bookingLeadAmountEur), `lib/supabase.ts` (buildBookingRows, captureUnpaidBooking, reconcile), `lib/currency.ts`, `lib/sync-origin.ts` (aggregateUuid)
- `app/api/admin/stats/route.ts`, `app/(internal)/admin/(dashboard)/stats/page.tsx`, `app/api/admin/accounts/route.ts`, `accounts/page.tsx`, `components/admin/KPICard.tsx`, `StatsChart.tsx`, `BookingsTable.tsx` (deep link), `lib/supabase/server.ts`, dashboard `layout.tsx`
- `tests/panel-bookings-migration.test.ts`, `tests/admin-settings.test.ts`, `tests/identities-page.test.tsx`, `tests/BookingsTable.test.tsx` (deep-link cases), `vitest.config.ts`, `package.json`
- `.planning/phases/84-chatwoot-dashboard-app/84-01-smoke.sql` (smoke pattern), `infra/chatwoot/inboxes.json`, `infra/chatwoot/lib/client.mjs`, `infra/chatwoot/inspect.mjs` (script pattern)
- Project memory: api patterns, function PUBLIC EXECUTE gotcha, GSD execute-phase mechanics, `.env.local` restriction, group payment link

### Secondary (MEDIUM confidence)
- Web search on Chatwoot channel class names (third-party summaries: DeepWiki, Chatwoot docs): confirms `Channel::WebWidget`, `Channel::Whatsapp`, `Channel::Telegram`, `Channel::Api`; the repo's production mapping is the authority for the four used classes.

### Tertiary (LOW confidence)
- none beyond the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all verified in repo.
- Architecture: HIGH — mirrors 080/84-01 patterns and existing route/page conventions.
- Pitfalls: HIGH for items traced to code (deep-link regex, pending semantics, reconcile clause, group-payment zero amounts); MEDIUM for time-zone semantics until the smoke asserts them.
- Live data shape: MEDIUM — counts taken from CONTEXT, not re-queried.

**Research date:** 2026-10-31
**Valid until:** 2026-11-30 (schema is stable; re-check only if a migration after 080 lands before 081)
