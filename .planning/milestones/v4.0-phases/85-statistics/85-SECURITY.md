---
phase: "85"
slug: "statistics"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-01"
---

# Phase 85 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| PostgREST -> SECURITY DEFINER stats functions | only service_role may execute stats_trips / stats_conversion / stats_customers / stats_b2b / chat_lead_reserve / chat_channel_bucket | booking, inquiry and revenue aggregates; customer names and emails (auth.users) |
| Chatwoot webhook -> intake -> chat_lead_reserve(p_channel) | raw channel string from a verified webhook payload | channel label (low) |
| browser -> /api/admin/stats/{conversion,customers,b2b} | untrusted from/to query string and session cookie | revenue and customer PII (high) |
| route -> service-role Supabase | the route holds the service key; only admins reach the RPC | aggregates (high) |
| Chatwoot API -> backfill script -> SQL text | external conversation payloads become SQL the orchestrator executes; API token stays on the owner machine | conversation ids, channel; API token (secret) |
| address bar -> stats page state / BookingsTable ?search= | tab/from/to/search come from a craftable URL | none stored; drives UI and a bound query parameter |
| stats API JSON -> rendered tables and hrefs | names and emails are customer-entered | PII rendered to the admin |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-85-01 | Elevation of Privilege | 081 functions executable by anon/authenticated | high | mitigate | 081: 4 functions, 4 `REVOKE ... FROM PUBLIC, anon, authenticated` + 4 `GRANT EXECUTE ... TO service_role`; 083 same (1/1); `tests/stats-migration.test.ts`, `stats-conversion-083-migration.test.ts` | closed |
| T-85-02 | Elevation of Privilege | search_path hijack in SECURITY DEFINER | high | mitigate | `SET search_path = ''` on every function (081 4/4, 082 2/2, 083 1/1), schema-qualified names; count tests | closed |
| T-85-03 | Tampering | arbitrary channel text stored from webhook | medium | mitigate | SQL bucket to five literals + `chat_leads_channel_check` (081:48-49) | closed |
| T-85-04 | Denial of Service | malformed pickup_date breaking aggregates | low | mitigate | no `pickup_date` cast in 081-083 (grep empty); static test | closed |
| T-85-05 | Information Disclosure | RPC error text reaching a client | low | transfer | transferred to 85-02 routes: generic 500 `DB read failed`, message only in `console.error` | closed |
| T-85-06 | Spoofing / Elevation | non-admin caller reading stats | high | mitigate | `getAdminUser()` is the first call in all three routes (line 7); `tests/admin-stats-routes.test.ts` asserts 401/403 and no rpc call | closed |
| T-85-07 | Tampering | hostile from/to | medium | mitigate | `parsePeriod` (zod `periodSchema`) -> 400 before any DB call; RPC args typed `date` and bound | closed |
| T-85-08 | Information Disclosure | Postgres error text in response | medium | mitigate | all routes return `{ error: 'DB read failed' }` (lines 21, 27); test asserts leaked word absent | closed |
| T-85-09 | Information Disclosure | server code/keys bundled via lib/admin-stats.ts | medium | mitigate | `lib/admin-stats.ts` imports only `zod` | closed |
| T-85-10 | Information Disclosure | stats_customers / stats_b2b executable by anon/authenticated | high | mitigate | 082: 2 REVOKE + 2 GRANT service_role; `tests/stats-customers-b2b-migration.test.ts` | closed |
| T-85-11 | Elevation of Privilege | search_path hijack reading auth.users | high | mitigate | 082 `SET search_path = ''` 2/2, `public.*` / `auth.users` qualified | closed |
| T-85-12 | Information Disclosure | trip attributed to wrong account | medium | mitigate | single `COALESCE(t.user_id, o.id)` key (082:74); live smoke SMOKE_OK_85_03 covers guest-email and user_id precedence | closed |
| T-85-13 | Tampering | SQL injection via backfill output | high | mitigate | `UUID_RE` / `CHANNEL_RE` strict regexes before building statements; quote-injection unit test in `tests/channel-backfill.test.ts` | closed |
| T-85-14 | Information Disclosure | API token / contact PII printed | high | mitigate | token only via `loadChatwootConfig()`; never argv or printed; test asserts token, sender name/email absent | closed |
| T-85-15 | Tampering | backfill mutating Chatwoot | medium | mitigate | no POST/PUT/PATCH/DELETE in `infra/chatwoot/channel-backfill.mjs`; every fake fetch asserted GET | closed |
| T-85-16 | Tampering | unbounded channel text in chat_leads | low | mitigate | same SQL bucket + 081 CHECK as T-85-03 | closed |
| T-85-17 | Tampering | crafted ?tab / ?from / ?to | low | mitigate | `page.tsx` checks tab against `TABS`, period via `periodSchema.safeParse` with default; server re-validates | closed |
| T-85-18 | Tampering (XSS) | names/emails in B2B table | medium | mitigate | React text nodes only (no `dangerouslySetInnerHTML` in stats components); account links from RPC `user_id` uuid | closed |
| T-85-19 | Information Disclosure | stats page reachable without admin rights | medium | transfer | transferred to dashboard layout redirect + `getAdminUser` 401/403 on every API (T-85-06) | closed |
| T-85-20 | Tampering (XSS / injection) | email deep link `?search=` | medium | mitigate | `DEEP_LINK_EMAIL` allowlist (no whitespace, `<>"'\``), length cap 254 (`BookingsTable.tsx:1065-1073`); hostile-value tests | closed |
| T-85-21 | Tampering (XSS) | names/emails in Conversion/Customers + search href | medium | mitigate | React text only; `href` via `encodeURIComponent(c.email)` (`CustomersTab.tsx:72`); `<img onerror>` name test | closed |
| T-85-22 | Information Disclosure | misleading percentages on tiny samples | low | mitigate | counts printed next to every percentage; `formatPct` returns `n/a` for zero denominators (`lib/admin-stats.ts:247`) | closed |
| T-85-SC | Tampering | npm/pip/cargo installs | high | mitigate | no package installs in any plan (zod already present) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

Note: migration `083_stats_conversion_period_totals.sql` (WR-01 fix, added after the plans) follows the same pattern as T-85-01/T-85-02: one function, `SET search_path = ''`, REVOKE from PUBLIC/anon/authenticated, GRANT to service_role, covered by `tests/stats-conversion-083-migration.test.ts`.

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-01 | 23 | 23 | 0 | orchestrator (L1 grep + 9 stats test files, 266/266 pass) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-01
