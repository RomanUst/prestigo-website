---
phase: "81"
slug: "lead-capture-site-forms-supabase-espocrm"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-18"
---

# Phase 81 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser -> form API routes | untrusted form input enters the server | contact / corporate / multi-day PII |
| route -> Supabase (service role) | server writes PII into a new table (`inquiries`) | PII |
| anon/authenticated PostgREST -> new tables/RPCs | public API surface of the database | none allowed (deny-all) |
| admin browser -> /api/admin/bookings | authenticated admin input | `lead_channel` enum |
| any bookings writer -> trigger | DB-side code runs inside every booking transaction | booking ids |
| Postgres trigger -> outbox | DB-side enqueue inside the customer's write transaction | outbox keys (ids only) |
| Supabase pg_net -> /api/integrations/kick | server-to-server call over the public Internet | key + Bearer secret |
| Internet -> /api/integrations/kick | anyone can reach the URL | untrusted body |
| Internet -> /api/integrations/dispatch | only QStash may call it; anyone can reach the URL | signed `{key}` body |
| Internet -> /api/cron/outbox-sweep | Vercel cron (and anyone) can reach the URL | Bearer CRON_SECRET |
| Vercel function -> EspoCRM REST (VPS) | API key over TLS to an external host | Lead PII, API key |
| CRM responses -> logs/outbox | response bodies can contain PII | error codes only persisted |
| stored form/booking data -> CRM payload | customer-supplied text is copied into CRM records | PII |
| dispatcher -> EspoCRM DELETE | destructive CRM write | Lead ids |
| EspoCRM roles -> human operators | who may see customer Leads | Lead PII |
| translation catalogs -> rendered HTML | catalog text rendered via next-intl rich text | repo-controlled strings |
| workstation scripts / config sync -> EspoCRM admin/API/metadata | config and probe calls with service identities | CRM structure, synthetic probes |
| local merged file -> CRM custom metadata volume | a broken file would break CRM metadata | entityDefs JSON |
| workstation -> VPS shell (ssh/scp) | privileged commands on the production host | owner-approved commands only |
| owner workstation / dashboards -> Vercel env and Supabase Vault | secrets enter production | API keys, kick secret |
| Claude session -> production site, DB and VPS | live smoke writes and the drill | marker test data |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-81-01 | Information Disclosure | inquiries / integration_outbox via PostgREST | high | mitigate | RLS + deny-all + REVOKE ALL from anon/authenticated (064, 065); function EXECUTE only service_role; has_*_privilege smoke | closed |
| T-81-02 | Denial of Service | form routes depending on Supabase | high | mitigate | `storeInquiry` never throws, env pre-check, 3 s race (`lib/inquiries.ts`); failure tests per route | closed |
| T-81-03 | Elevation of Privilege | SECURITY DEFINER functions | medium | mitigate | `SET search_path = ''`, schema-qualified, no dynamic SQL, EXECUTE service_role only (064, 065) | closed |
| T-81-04 | Information Disclosure | outbox rows / logs carrying PII | medium | mitigate | ids-only rows; `last_error` CHECK `^[a-z0-9_]{1,40}$` (064); code-only log line | closed |
| T-81-05 | Tampering | admin deep link from booking_reference | low | mitigate | `^[A-Za-z0-9-]{1,40}$` allowlist + URL-encoding (`lib/lead-mapping.ts`) | closed |
| T-81-06 | Tampering | purge predicate | high | mitigate | five-condition `isPurgeEligible` with boundary tests; re-checked on the live row by the dispatcher | closed |
| T-81-07 | Information Disclosure | Leads visible to Dispatcher | medium | mitigate | Dispatcher `Lead: false` (`infra/espocrm/roles.json`); live verify-acl GET /Lead -> 403 | closed |
| T-81-08 | Elevation of Privilege | Sync writer delete on Leads | medium | accept | see Accepted Risks AR-81-01 | closed |
| T-81-09 | Information Disclosure | inspect output leaking PII | medium | mitigate | ids/flags/counts only; tests assert no `@` in output | closed |
| T-81-10 | Tampering | arbitrary lead_channel values | low | mitigate | zod enum in route + DB CHECK (066) | closed |
| T-81-11 | Denial of Service | code deployed before the column exists | medium | mitigate | 066 applied live before ship; `ADD COLUMN IF NOT EXISTS` | closed |
| T-81-12 | Tampering | rich-text chunk rendering | low | accept | see Accepted Risks AR-81-02 | closed |
| T-81-13 | Tampering | owner enum values / layouts overwritten | medium | mitigate | empty retire, append-only layouts (`infra/espocrm/sync.mjs`); second-run zero counts live | closed |
| T-81-14 | Tampering | duplicate link creation on re-run | low | mitigate | final-name existence check; second-run create=0 (fake + live) | closed |
| T-81-15 | Spoofing | forged dispatch calls | high | mitigate | Upstash-Signature verified over raw body with expected URL before parse; 401 otherwise (`app/api/integrations/dispatch/route.ts`); go-live confirmed fail-closed on URL mismatch | closed |
| T-81-16 | Tampering | oversized / malformed dispatch bodies | medium | mitigate | `enforceMaxBody` 1 KB, zod strict `{key}`, `parseOutboxKey` allowlist | closed |
| T-81-17 | Denial of Service | EspoCRM IP ban after repeated 401 | high | mitigate | first 401 poisons the client, one request per invocation, 6 h `crm_auth` breaker | closed |
| T-81-18 | Information Disclosure | API key or PII in logs/errors/outbox | high | mitigate | errors carry method/path/status/code only, key redaction, DB CHECK on codes, PII-free log asserted by test | closed |
| T-81-19 | Tampering | duplicate Leads | medium | mitigate | lease claim + advisory lock (064), cSupabaseRef lookup before POST, unique index (81-08) | closed |
| T-81-20 | Elevation of Privilege | CRM client reachable from user request path | high | mitigate | `ESPOCRM_*` only in `lib/espocrm-client.ts`; isolation guard test over importers | closed |
| T-81-21 | Spoofing | redirect sending the API key elsewhere | medium | mitigate | `redirect: 'error'`, https-only base URL | closed |
| T-81-22 | Tampering | custom Lead metadata replaced with broken file | high | mitigate | merge refuses files without `cSupabaseRef` (`infra/espocrm/overlay.mjs`); restic snapshot first; rollback kept | closed |
| T-81-23 | Elevation of Privilege | broad SSH from agent session | medium | mitigate | only the four listed commands (L1–L4), owner-approved | closed |
| T-81-24 | Tampering | duplicate keys blocking index creation | low | mitigate | precheck scan; unique probe keys; `unique=enforced` proven twice | closed |
| T-81-25 | Denial of Service | trigger error aborting a paid booking write | critical | mitigate | trigger body + kick in `EXCEPTION WHEN OTHERS` (067); smoke (e) and structural test | closed |
| T-81-26 | Spoofing | forged kick calls burning QStash quota | medium | mitigate | Bearer `OUTBOX_KICK_SECRET` + `timingSafeEqual`, fail-closed, `lead.booking` keys only, `enforceMaxBody` 512 | closed |
| T-81-27 | Elevation of Privilege | SECURITY DEFINER trigger/kick functions | medium | mitigate | `SET search_path = ''`, schema-qualified, REVOKE from PUBLIC/anon/authenticated (067) | closed |
| T-81-28 | Information Disclosure | PII copied into outbox or kick body | medium | mitigate | key-only rows and kick body; PII re-read at send time | closed |
| T-81-29 | Tampering | pre-deploy history turned into Leads | low | mitigate | `lead_capture_start` cutoff in trigger (067) and dispatcher (`lib/lead-sync.ts`) | closed |
| T-81-30 | Spoofing | forged sweep calls | medium | mitigate | CRON_SECRET + `timingSafeEqual`, fail-closed; date-based purge selection | closed |
| T-81-31 | Tampering | purge deleting the wrong Leads | high | mitigate | SQL predicate + live `isPurgeEligible` re-check + Lead must be Dead; negative smoke rows | closed |
| T-81-32 | Repudiation | silent deletions | low | accept | see Accepted Risks AR-81-03 | closed |
| T-81-33 | Denial of Service | sweep republishing too much | low | mitigate | 200-key cap per run, per-day dedup suffix, sent rows never selected (068) | closed |
| T-81-34 | Information Disclosure | secrets passing through the Claude session | high | mitigate | owner set ESPOCRM_API_KEY / OUTBOX_KICK_SECRET / Vault secret; Claude created only the non-secret kick URL (one `length(decrypted_secret)` check, no value read — noted in 81-11-SUMMARY) | closed |
| T-81-35 | Tampering | smoke data left in production | medium | mitigate | marker email, cleanup by exact refs, all `count=0` and 0 rows left (81-11-SUMMARY) | closed |
| T-81-36 | Denial of Service | drill leaving the CRM down | medium | mitigate | only D1/D2, owner-approved; probe 401 three minutes after D2 | closed |
| T-81-37 | Information Disclosure | runbook leaking secrets | medium | mitigate | names only; runbook guard tests reject 32+ char hex/base64 | closed |
| T-81-38 | Tampering | lead-smoke delete removing real Leads | medium | mitigate | exact `inquiry:<uuid>` / `booking:<uuid>` refs validated before any request (`infra/espocrm/lead-smoke.mjs`) | closed |
| T-81-SC | Tampering | npm/pip/cargo installs | high | mitigate | no package installs in any plan (RESEARCH Package Legitimacy Audit: none new) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-81-01 | T-81-08 | Sync writer needs delete on Lead for the D-15/D-20 90-day purge; scope limited to Lead (Contact/Account/CBooking keep delete: no); API key only in ~/.config and Vercel env; rotate via UserSecurity on suspicion | owner (plan 81-03) | 2026-10-18 |
| AR-81-02 | T-81-12 | Catalogs are repo-controlled; `t.rich` renders only the declared `privacy` tag through a React component, no raw HTML | owner (plan 81-05) | 2026-10-18 |
| AR-81-03 | T-81-32 | Each purge leaves its outbox row (key, status sent, timestamps) as the audit record; Phase 82 adds the admin outbox view | owner (plan 81-10) | 2026-10-18 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-18 | 39 | 39 | 0 | /gsd-secure-phase (L1 grep-depth, short-circuit: register authored at plan time, ASVS 1) |

## Security Audit 2026-10-18
| Metric | Count |
|--------|-------|
| Threats found | 39 |
| Closed | 39 |
| Open | 0 |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-18
