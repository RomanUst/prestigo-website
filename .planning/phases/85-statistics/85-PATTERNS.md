# Phase 85: Statistics - Pattern Map

**Mapped:** 2026-10-31
**Files analyzed:** 26 new/modified
**Analogs found:** 24 / 26 (all analog paths verified git-tracked)

Full SQL bodies, routes and test matrix are in `85-RESEARCH.md` (Patterns 2-7); this map only says which tracked file to copy from.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `supabase/migrations/081_stats.sql` | migration (SECURITY DEFINER RPCs + column) | batch/read aggregate | `supabase/migrations/080_panel_bookings.sql` (+ `078_chat_registry.sql` for `chat_lead_reserve`) | exact |
| `.planning/phases/85-statistics/85-0{1,2,3}-smoke.sql` | test (live rolled-back smoke) | request-response | `.planning/phases/84-chatwoot-dashboard-app/84-01-smoke.sql` | exact |
| `lib/admin-stats.ts` | utility (zod period, presets, RPC callers, types) | transform | `app/api/admin/accounts/route.ts` (zod/guards) + `lib/currency.ts` | role-match |
| `app/api/admin/stats/conversion/route.ts` | route | request-response | `app/api/admin/accounts/route.ts` (GET) | exact |
| `app/api/admin/stats/customers/route.ts` | route | request-response | same | exact |
| `app/api/admin/stats/b2b/route.ts` | route | request-response | same | exact |
| `app/(internal)/admin/(dashboard)/stats/page.tsx` | component (tab shell, client) | request-response | itself (old body moves to OverviewTab) + `BookingsTable.tsx` URL-state | exact |
| `components/admin/stats/OverviewTab.tsx` | component | request-response | current `stats/page.tsx` body (move verbatim) | exact |
| `components/admin/stats/ConversionTab.tsx`, `CustomersTab.tsx`, `B2BTab.tsx` | component | request-response | `accounts/page.tsx` + `KPICard.tsx` | role-match |
| `components/admin/stats/StatsTable.tsx`, `PeriodSelector.tsx` | component | UI | `accounts/page.tsx` table markup | role-match |
| `infra/chatwoot/channel-backfill.mjs` | script (owner-run, GET-only) | batch | `infra/chatwoot/inspect.mjs` | exact |
| `lib/chat-store.ts` (modify `reserveLead`) | service | request-response (RPC) | itself, lines 61-67, 229-237 | exact |
| `lib/chat-intake.ts` (modify `leadFor`) | service | event-driven | itself, lines 466-481 | exact |
| `components/admin/BookingsTable.tsx` (widen `readBookingDeepLink`) | component | UI | itself, lines 1058-1066 | exact |
| `tests/stats-migration.test.ts` | test (static SQL) | - | `tests/panel-bookings-migration.test.ts` | exact |
| `tests/admin-stats-routes.test.ts` | test | request-response | `tests/admin-settings.test.ts` | exact |
| `tests/admin-stats-period.test.ts` | test | transform | `tests/admin-settings.test.ts` (plain unit style) | partial |
| `tests/stats-page.test.tsx` | test (component) | - | `tests/identities-page.test.tsx` | exact |
| `tests/channel-backfill.test.ts` | test | transform | none specific; use vitest node env as in `tests/panel-bookings-migration.test.ts` | partial |
| `tests/chat-store.test.ts`, `tests/chat-intake.test.ts`, `tests/BookingsTable.test.tsx` (edit) | test | - | themselves | exact |

## Pattern Assignments

### `supabase/migrations/081_stats.sql` (migration)

**Analog:** `supabase/migrations/080_panel_bookings.sql` (header lines 1-30 show style: purpose, read-only/STABLE rationale, helper reuse).

Copy: header-comment style explaining why logic is in SQL; `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''`; every object schema-qualified (`public.bookings`, `public.stats_trips()`); `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` with the FULL new arg list, then `GRANT ... TO service_role`. Reuse verbatim from 080 (lines ~68-91 and ~160-175): the shared-phone resolution and the amount fallback:

```sql
COALESCE(b.amount_eur,
  CASE WHEN b.trip_type = 'round_trip'
        AND (b.outbound_amount_czk IS NOT NULL OR b.return_amount_czk IS NOT NULL)
  THEN round((COALESCE(b.outbound_amount_czk,0) + COALESCE(b.return_amount_czk,0)) * 0.04)::integer END)
```
Rules from RESEARCH: paid statuses `confirmed, assigned, en_route, on_location, completed` only in `stats_trips()` (D-18); `b.leg IS DISTINCT FROM 'return'`; never cast `pickup_date` (compare as text); `identity_is_abandoned(...)`; Prague boundaries via `AT TIME ZONE 'Europe/Prague'`; 90-day LATERAL with `LIMIT 1`; D-19: B2B join on `user_id` OR `client_email` = account user's email; D-21: `converted_booking_id` counts regardless of window.

**chat_lead_reserve re-create:** body from `supabase/migrations/078_chat_registry.sql` lines ~122-174; `DROP FUNCTION IF EXISTS public.chat_lead_reserve(text, uuid, bigint, text, text);` first, add trailing `p_channel text DEFAULT NULL`, INSERT `channel = public.chat_channel_bucket(p_channel)`, then REVOKE/GRANT on the 6-arg signature (function PUBLIC EXECUTE gotcha). Next migration number is 081.

---

### `app/api/admin/stats/{conversion,customers,b2b}/route.ts` (route, request-response)

**Analog:** `app/api/admin/accounts/route.ts`

**Imports + guard** (lines 1-5, 22-30):
```ts
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export async function GET() {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const supabase = createSupabaseServiceClient()
```
**Error handling** (lines 37-40): `console.error('[admin/accounts.GET] ... failed:', pErr.message)` then `NextResponse.json({ error: 'DB read failed' }, { status: 500 })` (generic, no leak).

Do NOT copy the local `getAdminUser` + UTC date helpers from `app/api/admin/stats/route.ts` (lines 1-40); use the shared export and Prague dates. Add `request: Request`, `parsePeriod` -> 400, then `.rpc('stats_x', { p_from, p_to })`. Leave `app/api/admin/stats/route.ts` untouched.

---

### `app/(internal)/admin/(dashboard)/stats/page.tsx` + `components/admin/stats/*` (client components)

**Analog (tables):** `app/(internal)/admin/(dashboard)/accounts/page.tsx` lines 62-139.

Imports/conventions: `'use client'`, `Link` from `next/link`, `Intl.NumberFormat('cs-CZ')`. Table wrapper `border: '1px solid var(--anthracite-light)', borderRadius: '4px', overflow: 'hidden'`; `<thead>` row `background: 'var(--anthracite)'`, `height: '40px'`; `<th>` montserrat 11px uppercase `letterSpacing: '0.4em'` `color: 'var(--warmgrey)'`, `textAlign: i >= N ? 'right' : 'left'`; body row `background: hovered ? 'var(--anthracite-light)' : 'var(--anthracite-mid)'`; loading/empty via `<td colSpan style={emptyCellStyle}>Loading...</td>`; row link `style={{ color: 'var(--copper)', textDecoration: 'none', fontWeight: 500 }}` to `/admin/accounts/${user_id}`.

**KPIs:** `components/admin/KPICard.tsx` props `{ label: string; value: string; subLabel?: string }` (use subLabel for "3 of 12" counts next to every %).

**URL state:** copy from `components/admin/BookingsTable.tsx` 1058-1073: read `window.location.search` after mount, write with `window.history.replaceState(window.history.state, '', ...)`; no `useSearchParams`. Currency: print the word "EUR" in labels, never a typed `€`.

**OverviewTab:** move current `stats/page.tsx` body verbatim (D-16), keep its loading/error markup.

---

### `components/admin/BookingsTable.tsx` (deep-link fix)

Current (lines 1058-1066): `return /^[A-Za-z0-9-]{1,40}$/.test(value) ? value : ''`. Extend to also accept a strict email (<=254, `^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}$`); keep rejected cases pinned in `tests/BookingsTable.test.tsx` ~784-788 and add accepted-email and rejected `<script>@x` cases.

---

### `lib/chat-store.ts` and `lib/chat-intake.ts` (channel capture)

`chat-store.ts` lines 61-67: add `channel?: string | null` to the `reserveLead` input type. Lines 229-237: add `p_channel: input.channel ?? null` to the `rpc('chat_lead_reserve', {...})` args.
`chat-intake.ts` lines 470-476: inside `chat.reserveLead({...})` add `channel: s.conversation.channel`.
Channel strings must match `lib/chat-classify.ts` 53-66 (`Channel::WebWidget`, `Channel::Email`, `Channel::Telegram`, `Channel::Whatsapp`, else other); pin with a static test. Update fakes/assertions in `tests/chat-store.test.ts` and `tests/chat-intake.test.ts` (read them first).

---

### `infra/chatwoot/channel-backfill.mjs` (owner-run script)

**Analog:** `infra/chatwoot/inspect.mjs` (header lines 1-50; imports `createChatwootClient, loadChatwootConfig, ChatwootApiError, ChatwootConfigError` from `./lib/client.mjs`).
Copy: GET-only; token via `loadChatwootConfig` (never argv, never printed); API failures print HTTP status only; no names/emails/bodies. Export a pure SQL-emitting function for unit testing; emit idempotent `UPDATE public.chat_leads SET channel = public.chat_channel_bucket('<raw>') WHERE id = '<uuid>' AND channel IS NULL;`. Orchestrator applies via MCP.

---

### Tests

- `tests/stats-migration.test.ts`: copy `load()` (strips `--` comment lines) and `fnBody()` from `tests/panel-bookings-migration.test.ts` lines 1-30; `// @vitest-environment node`; assert SET search_path count == function count, REVOKE/GRANT per signature, no `pickup_date\s*::`, five paid statuses once, `LIMIT 1`, `Europe/Prague`, `leg IS DISTINCT FROM 'return'`.
- `tests/admin-stats-routes.test.ts`: `vi.hoisted` mocks for `@/lib/supabase/server` and `@/lib/supabase`, per `tests/admin-settings.test.ts`; cover 401/403/400/200/500-generic.
- `tests/stats-page.test.tsx`: mock `next/link`, stub `fetch`, per `tests/identities-page.test.tsx`.

## Shared Patterns

### Admin auth order
**Source:** `app/api/admin/accounts/route.ts` 22-26. **Apply to:** all three new routes. `getAdminUser()` -> 401/403 -> validate -> DB -> generic 500.

### SECURITY DEFINER hygiene
**Source:** `080_panel_bookings.sql` + `078_chat_registry.sql`. **Apply to:** every function in 081 (including `stats_trips()` and `chat_channel_bucket`): `SET search_path = ''`, schema-qualified names, REVOKE from PUBLIC/anon/authenticated on the NEW signature, GRANT service_role.

### Admin dark-theme styling
**Source:** `accounts/page.tsx`, `KPICard.tsx`. CSS vars `--offwhite --warmgrey --copper --anthracite --anthracite-mid --anthracite-light --font-cormorant --font-montserrat`. English strings, no next-intl.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `lib/admin-stats.ts` period presets (Prague-local "today") | utility | No existing Prague-timezone preset helper; the old stats route uses UTC `toISOString()` (do not copy). Use `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' })` per RESEARCH Pattern 7. |
| `tests/channel-backfill.test.ts` | test | No prior test of an `infra/chatwoot` script found in this pass; model on a node-env vitest file. |

## Metadata

**Analog search scope:** `app/api/admin`, `app/(internal)/admin/(dashboard)`, `components/admin`, `lib/chat-*`, `infra/chatwoot`, `supabase/migrations`, `tests`
**Tracked check:** `git ls-files` run on all analog paths above (all returned).
**Pattern extraction date:** 2026-10-31
