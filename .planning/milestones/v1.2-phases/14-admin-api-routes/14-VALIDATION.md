---
phase: 14
slug: admin-api-routes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.1 |
| **Config file** | `prestigo/vitest.config.ts` (existing) |
| **Quick run command** | `nvm use 22 && npx vitest run --reporter=verbose 2>&1 \| tail -20` |
| **Full suite command** | `nvm use 22 && npx vitest run 2>&1` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `nvm use 22 && npx vitest run --reporter=verbose 2>&1 | tail -20`
- **After every plan wave:** Run `nvm use 22 && npx vitest run 2>&1`
- **Before `/gsd:verify-work`:** Full suite must be green + manual curl verification of all 7 curl commands
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-W0-01 | 01 | 0 | PRICING-06, ZONES-02, ZONES-03, BOOKINGS-01 | unit stubs | `nvm use 22 && npx vitest run tests/admin-pricing.test.ts tests/admin-zones.test.ts tests/admin-bookings.test.ts` | ❌ W0 | ⬜ pending |
| 14-01-01 | 01 | 1 | PRICING-06 | unit (mock) | `nvm use 22 && npx vitest run tests/admin-pricing.test.ts -x` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 1 | ZONES-02, ZONES-03 | unit (mock) | `nvm use 22 && npx vitest run tests/admin-zones.test.ts -x` | ❌ W0 | ⬜ pending |
| 14-03-01 | 03 | 1 | BOOKINGS-01 | unit (mock) | `nvm use 22 && npx vitest run tests/admin-bookings.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `prestigo/tests/admin-pricing.test.ts` — stubs for PRICING-06 (auth guard, revalidateTag call, Zod validation)
- [ ] `prestigo/tests/admin-zones.test.ts` — stubs for ZONES-02/ZONES-03 (auth guard, Zod GeoJSON rejection, toggle)
- [ ] `prestigo/tests/admin-bookings.test.ts` — stubs for BOOKINGS-01 (auth guard, pagination response shape)

*(Existing vitest infrastructure and mock patterns from `tests/health.test.ts` and `tests/create-payment-intent.test.ts` are sufficient — no new framework config needed)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GET after PUT reflects updated rates in /api/calculate-price | PRICING-06 | Requires live Supabase + session cookie | 1. PUT pricing with new rates. 2. GET /api/calculate-price — confirm new rates in response |
| POST /api/admin/zones with valid GeoJSON → row inserted | ZONES-02 | Requires live Supabase + session cookie | `curl -s -X POST .../api/admin/zones -d '{"name":"Prague Center","geojson":{...}}'` → verify `{ ok: true }` + DB row |
| PATCH /api/admin/zones toggles active flag | ZONES-03 | Requires live Supabase + session cookie | `curl -s -X PATCH .../api/admin/zones -d '{"id":"<uuid>","active":false}'` → verify row `active=false` in DB |
| Authenticated non-admin → 403 on all routes | All routes | Requires second test user without is_admin flag | Use non-admin JWT, call each route, verify 403 response |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
