---
phase: 66
slug: driver-trip-portal-permanent-link-trip-sheet
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-01
---

# Phase 66 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Driver Trip Portal — permanent per-assignment `trip_token`, token-gated noindex `/driver/trip/[token]` trip sheet, and delivery of the link via the assignment email + admin copy-link control.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| driver browser → /driver/trip/[token] | Unauthenticated; the `trip_token` IS the credential (token-as-credential, same model as /driver/response) | Booking PII (passenger name/phone, addresses, flight, special requests) |
| server → Supabase | `createSupabaseServiceClient()` bypasses RLS for this public read — scope enforced in app code | Full booking + assignment + driver read |
| server-rendered page → Google Maps JS SDK | Client-side map draw using the existing shared Maps key (no new credential) | Origin/destination coordinates |
| admin browser → POST /assign, GET /assignment | Authenticated admin routes (`getAdminUser` guard, unchanged) | Assignment create + trip_token read |
| assignment email → driver's inbox | Trip link travels as a URL in email; the token is the credential | Permanent trip-sheet URL |
| admin browser → navigator.clipboard | Client-side copy of the trip URL built from the GET-exposed `trip_token` | Trip-sheet URL |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-66-01 | Information Disclosure | /driver/trip/[token] invalid-state responses | high | mitigate | Single neutral `InvalidTripLinkView` for unknown / bad-UUID / terminal / reassigned / orphaned — no branch reveals the reason (D-11). `z.string().uuid().safeParse` rejects malformed tokens **before** any query (page.tsx:166). | closed |
| T-66-02 | Information Disclosure | validity predicate (lib/trip-token) | high | mitigate | `isTripLinkValid` re-checks driver_id match + non-terminal status live on every request — no stored expiry, no cache (page.tsx:194). Link stops resolving the instant the booking completes/cancels or is reassigned. | closed |
| T-66-03 | Spoofing (token guessing) | trip_token column | high | mitigate | `gen_random_uuid()` = 122-bit random UUIDv4 (DB default); no hand-rolled generator; unique index `driver_assignments_trip_token_idx`. Not brute-forceable at realistic rate. | closed |
| T-66-06 | Access Control (scope) | trip-sheet query | high | mitigate | Query keyed solely by `.eq('trip_token', …)` → exactly one assignment → its own booking (`bookings!inner`) and that assignment's driver — no cross-booking data, no enumeration parameter (page.tsx:178-179). | closed |
| T-66-04 | Information Disclosure | noindex / referrer | medium | mitigate | `robots: { index:false, follow:false }` on the page (page.tsx:12); /driver inherits the existing nonce-CSP middleware branch (no middleware change). | closed |
| T-66-05 | Tampering / Elevation | trip-sheet page | medium | mitigate | GET-only server component performing a single `select` — asserted 0 insert/update/delete/upsert; no mutation surface until Phase 67. | closed |
| T-66-07 | Information Disclosure | assign POST response body | high | mitigate | `trip_token` selected server-side only to build the email URL; NOT added to the POST JSON response (SEC-18 comment at assign/route.ts:205). Reaches the browser only via the email URL and the admin GET. | closed |
| T-66-08 | Tampering / XSS | assignment email HTML | high | mitigate | `escapeHtml(data.tripUrl)` wraps the URL exactly like every other interpolated value in `buildDriverAssignmentHtml` (email.ts:1497) — no raw interpolation. | closed |
| T-66-09 | Elevation (regression) | accept/decline flow | high | mitigate | `trip_token` purely additive; `/api/driver/respond`, `app/driver/response/page.tsx`, `DriverResponseClient.tsx`, and the single-use token columns are untouched by Phase 66 (git log over phase range is empty for these files); DTRIP-07 regression tests green. | closed |
| T-66-10 | Tampering (CSRF) | assignment GET | low | accept | GET is read-only; middleware CSRF only guards mutation methods — no CSRF-list entry needed, no new POST endpoint. Below the `high` block threshold. | closed |
| T-66-SC | Tampering (supply chain) | package installs | low | accept | No new packages installed this phase (`lucide-react` already present; migration/type/page reuse existing deps) — no install vector. Below the `high` block threshold. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-66-01 | T-66-10 | Assignment GET is read-only; CSRF protection applies only to state-changing methods. No new mutation endpoint is introduced. Low severity, below the `high` block threshold. | Roman (operator) | 2026-09-01 |
| AR-66-02 | T-66-SC | No new third-party packages were installed in Phase 66 — no supply-chain install vector. Low severity, below the `high` block threshold. | Roman (operator) | 2026-09-01 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-01 | 11 | 11 | 0 | Claude (orchestrator, L1 grep-depth per ASVS L1 short-circuit) |

Method: register authored at plan time (both 66-01 and 66-02 PLANs carry `<threat_model>` blocks); ASVS level 1 → mitigations verified at grep depth against the implementation, no new-threat scan required (per secure-phase short-circuit rule). Migration 060 confirmed applied live and verified via Supabase MCP during phase execution.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-01
