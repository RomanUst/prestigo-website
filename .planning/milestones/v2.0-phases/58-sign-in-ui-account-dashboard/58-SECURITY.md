---
phase: 58
slug: sign-in-ui-account-dashboard
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-16
---

# Phase 58 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| test harness → production modules | Tests import production symbols; risk is encoding the wrong security expectation. | Test assertions only, no runtime input. |
| authenticated client → saved_passengers / customer_profiles rows | Any authenticated user could attempt to read/mutate another user's rows. RLS is the enforcement point. | Profile + passenger PII (name, phone, email, ico, vat_id). |
| concurrent writers → is_default | Two concurrent "set default" requests could both try to set is_default=true. | saved_passengers.is_default flag. |
| browser session → Nav UI | Nav reflects auth state read client-side; gates only UI affordances, not data access. | Session presence/absence only (cosmetic). |
| sign-out action → redirect | Sign out must not become an open-redirect vector. | None (hardcoded destination). |
| unauthenticated request → /account, /account/trips, /account/profile | All three live under the /account/* middleware gate (Phase 57). | Session cookie. |
| client form → server action | FormData is fully untrusted; may carry forged user_id, extra fields, hostile strings. | Profile/passenger form fields. |
| passenger name/notes → rendered HTML | User-controlled strings displayed back in the UI. | Passenger PII. |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-58-01 | Tampering | profile/passenger action tests | mitigate | Tests assert ownership is derived from session `getUser()`; forged `user_id` in FormData cannot override it (RED expectation enforced at GREEN time). | closed |
| T-58-02 | Repudiation | test correctness | accept | Tests run in CI/local only; no production data exposure. | closed |
| T-58-03 | Elevation of Privilege (IDOR) | saved_passengers rows | mitigate | Own-row RLS for SELECT/INSERT/UPDATE/DELETE using `(select auth.uid()) = user_id` (migration 048, verified). | closed |
| T-58-04 | Tampering | is_default uniqueness | mitigate | Partial unique index `WHERE is_default = true` enforces single default atomically at the DB layer (migration 048, verified). | closed |
| T-58-05 | Information Disclosure | customer_profiles new columns (phone, ico, vat_id) | mitigate | Existing migration 044 SELECT policy scopes reads to own row; new columns inherit it. | closed |
| T-58-06 | Denial of Service | orphaned passenger rows | accept | `user_id` FK `ON DELETE CASCADE` removes passengers when the auth user is deleted; low-value target. | closed |
| T-58-07 | Spoofing | Nav signed-in affordance | accept | Nav UI state is cosmetic; every protected route is enforced by middleware + RLS server-side, not by client Nav state. | closed |
| T-58-08 | Tampering (open redirect) | Sign out | mitigate | `customerSignOut` hardcodes `redirect('/')` with no caller-supplied destination (verified in app/login/actions.ts). | closed |
| T-58-09 | Information Disclosure | static-page rendering | mitigate | Nav reads auth only via client `onAuthStateChange`/`getUser()` (D-09); no server `createClient()` import, confirmed in components/Nav.tsx — marketing pages stay static. | closed |
| T-58-10 | Elevation of Privilege | /account, /account/trips, /account/profile access | mitigate | All three declare `export const dynamic = 'force-dynamic'` and read `getUser()` server-side; the /account/* middleware gate (Phase 57) redirects unauthenticated requests to /login. | closed |
| T-58-11 | Information Disclosure | trips history scope | mitigate | Per D-01 the trips page makes NO bookings query this phase — no data path to leak; deferred to Phase 60. | closed |
| T-58-12 | Information Disclosure | XSS via email display | mitigate | "Signed in as {email}" rendered through React JSX (auto-escaped); no `dangerouslySetInnerHTML`. | closed |
| T-58-13 | Elevation of Privilege (IDOR) | updateProfile / passenger actions | mitigate | Ownership derived from `supabase.auth.getUser()` only; `user_id` in FormData is never read; writes scoped by `.eq('user_id', user.id)` backed by own-row RLS. `deletePassenger`/`updatePassenger` scope by `id` AND session `user_id` (verified directly in app/account/actions.ts during code-review fix pass). | closed |
| T-58-14 | Tampering (mass assignment) | updateProfile / updatePassenger | mitigate | Actions name each updatable column explicitly; raw FormData is never spread into the update/upsert object (verified — also hardened further by CR-01/CR-02 review fixes: `account_type` enum validation + upsert for missing rows). | closed |
| T-58-15 | Tampering (CSRF) | profile/passenger mutations | mitigate | Server actions use same-origin cookies with SameSite=Lax; not exposed through a CSRF-exempt API prefix. | closed |
| T-58-16 | Tampering (XSS) | passenger name/notes display in ProfileForm | mitigate | Rendered via React JSX (auto-escaped); no `dangerouslySetInnerHTML`. | closed |
| T-58-17 | Tampering (data integrity) | is_default single-default | mitigate | Partial unique index (T-58-04) backstops the action, which clears other defaults before setting one and maps a `23505` unique-violation to a user-facing error. | closed |
| T-58-18 | Information Disclosure | profile data load | mitigate | /account/profile reads only `.eq('user_id', user.id)` rows under own-row RLS, with explicit column lists (hardened by WR-04 review fix — no `SELECT *` leaking `user_id`/timestamps to the client). | closed |
| T-58-SC | Tampering | npm/pip/cargo installs | accept | No package installs across any of the 5 plans — RESEARCH Package Legitimacy Audit confirmed zero new dependencies. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| AR-58-01 | T-58-02 | Test-correctness risk has no production exposure path. | Plan author (58-01) | 2026-06-12 |
| AR-58-02 | T-58-06 | Orphaned-row DoS is low-value; cascade delete already bounds it. | Plan author (58-02) | 2026-06-12 |
| AR-58-03 | T-58-07 | Nav auth state is cosmetic only; data access is enforced server-side regardless of client state. | Plan author (58-03) | 2026-06-12 |
| AR-58-04 | T-58-SC | Zero new dependencies introduced in this phase. | Plan authors (58-01..05) | 2026-06-12 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-16 | 18 | 18 | 0 | Claude (gsd-secure-phase, plan-time register — short-circuit, all dispositions mitigate/accept) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-16
