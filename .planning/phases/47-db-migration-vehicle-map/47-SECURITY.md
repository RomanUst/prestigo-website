---
phase: 47
phase_name: db-migration-vehicle-map
status: SECURED
asvs_level: 2
threats_total: 8
threats_closed: 8
threats_open: 0
accepted_risks: 2
unregistered_flags: 0
audited: "2026-05-04"
---

# Phase 47 Security Audit — DB Migration & Vehicle Map

**Status:** SECURED
**ASVS Level:** 2
**Threats Closed:** 8/8

## Threat Verification

| Threat ID | Category | Disposition | Evidence |
|-----------|----------|-------------|----------|
| T-47-01 | Tampering | mitigate | `supabase/migrations/039_gnet_bookings.sql:33-53` — `ENABLE ROW LEVEL SECURITY` + 4 deny-all policies (SELECT/INSERT/UPDATE/DELETE) using `USING (false)` / `WITH CHECK (false)`. Live Supabase confirmed via MCP: 4 RLS policies present. |
| T-47-02 | Tampering | mitigate | `supabase/migrations/039_gnet_bookings.sql:26` — `CONSTRAINT gnet_bookings_transaction_id_key UNIQUE (transaction_id)`. Live Supabase confirmed via MCP. Duplicate INSERT raises 23505. |
| T-47-03 | Repudiation | mitigate | `supabase/migrations/039_gnet_bookings.sql:17` — `REFERENCES public.bookings(id) ON DELETE RESTRICT`. Live Supabase confirmed via MCP. Parent deletion blocked while child rows exist. |
| T-47-04 | Tampering | mitigate | `supabase/migrations/039_gnet_bookings.sql:17` — `booking_id UUID NOT NULL REFERENCES public.bookings(id)`. Live Supabase confirmed: column is_nullable = NO + FK enforced. |
| T-47-05 | Information Disclosure | accept | RLS deny-all on gnet_bookings restricts raw_payload exposure to service-role only. Documented as accepted risk — see Accepted Risks log below. |
| T-47-06 | Tampering | mitigate | `lib/gnet-vehicle-map.ts:42-46` — `mapGnetVehicle` contains no `throw`; returns `null` for falsy input and uses `?? null` fallback. Tests `tests/gnet-vehicle-map.test.ts:25-30` assert null returns for `'UNKNOWN_CODE'`, `''`, `'EXECUTIVE'`, `'HELICOPTER'`. |
| T-47-07 | Information Disclosure | accept | VehicleClass values (`business`/`first_class`/`business_van`) are public knowledge displayed on `/fleet`. Documented as accepted risk — see Accepted Risks log below. |
| T-47-08 | Tampering | mitigate | `lib/gnet-vehicle-map.ts:15` — `Object.freeze({...})` + `Readonly<Record<string, VehicleClass>>` typing. Test `tests/gnet-vehicle-map.test.ts:38-40` asserts `Object.isFrozen(GNET_VEHICLE_MAP) === true`. |

## Accepted Risks Log

### T-47-05 — raw_payload may contain partner-sensitive fields
- **Rationale:** GNet Farm In payloads are stored verbatim for audit/debugging. Service-role-only access via RLS deny-all (T-47-01 mitigation). No client-side or anon access path.
- **Compensating Controls:** RLS USING (false) + WITH CHECK (false) on all 4 ops; admin UI (Phase 51) will display summary fields only, never raw payload.
- **Owner:** Roman Ustyugov
- **Review Date:** Phase 51 admin UI ships

### T-47-07 — Lookup table exposing internal vehicle taxonomy
- **Rationale:** VehicleClass values are public — displayed on `/fleet` page and exposed in booking widget UI. The mapping itself (GNet code → class) discloses no secret information.
- **Compensating Controls:** None required.
- **Owner:** Roman Ustyugov
- **Review Date:** N/A

## Unregistered Flags

None — SUMMARY.md `## Threat Flags` sections were not present in either 47-01-SUMMARY.md or 47-02-SUMMARY.md (no executor-detected attack surface beyond registered threats).

## Verification Notes

- DB-side threats (T-47-01..04) cross-checked against live Supabase via MCP per `<constraints>` block (4 RLS policies, 2 UNIQUE constraints, FK ON DELETE RESTRICT, booking_id NOT NULL, booking_source CHECK includes 'gnet').
- Code-side threats (T-47-06, T-47-08) verified by reading `lib/gnet-vehicle-map.ts` and the corresponding Vitest assertions.
- No implementation files modified during audit.

## Audit Result

**SECURED** — All 8 registered threats have evidence of mitigation or accepted-risk documentation. No open threats. No unregistered flags. Phase 47 cleared for downstream consumption (Phase 49 Farm In endpoint).
