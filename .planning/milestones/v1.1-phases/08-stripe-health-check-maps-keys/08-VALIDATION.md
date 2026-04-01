---
phase: 8
slug: stripe-health-check-maps-keys
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.1 |
| **Config file** | `prestigo/vitest.config.ts` |
| **Quick run command** | `cd prestigo && npx vitest run tests/health.test.ts` |
| **Full suite command** | `cd prestigo && npx vitest run` |
| **Estimated runtime** | ~5 seconds |

> **Known constraint:** Vitest 4.x requires Node 18+. Project runs Node 16. `npx vitest run` may fail with `styleText` error — pre-existing incompatibility from STATE.md; does not affect production builds.

---

## Sampling Rate

- **After every task commit:** Run `cd prestigo && npx vitest run tests/health.test.ts`
- **After every plan wave:** Run `cd prestigo && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 0 | STRP-03 | unit | `cd prestigo && npx vitest run tests/health.test.ts` | ❌ W0 | ⬜ pending |
| 8-02-01 | 02 | 1 | STRP-01 | manual-only | — Stripe Dashboard verification | N/A | ⬜ pending |
| 8-02-02 | 02 | 1 | STRP-02 | manual-only | — Vercel Dashboard + curl health check | N/A | ⬜ pending |
| 8-02-03 | 02 | 1 | STRP-03 | manual-only (smoke) | `curl -H "Authorization: Bearer TOKEN" https://rideprestige.com/api/health` | N/A | ⬜ pending |
| 8-03-01 | 03 | 1 | MAPS-01 | manual-only | — Google Cloud Console verification | N/A | ⬜ pending |
| 8-03-02 | 03 | 1 | MAPS-02 | manual-only | — Google Cloud Console verification | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/health.test.ts` — unit tests for `/api/health` GET handler: 401 on missing/wrong auth, 200 shape with mocked Supabase/Stripe/Resend, 503 on probe failure (STRP-03)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Stripe live-mode webhook registered at production URL | STRP-01 | External service dashboard — no API to verify from code | Stripe Dashboard (Live mode) → Workbench → Webhooks → confirm endpoint URL `https://rideprestige.com/api/webhooks/stripe` exists with `payment_intent.succeeded` |
| `STRIPE_WEBHOOK_SECRET` set in Vercel, redeploy done | STRP-02 | Vercel env vars not accessible programmatically | Vercel Dashboard → Settings → Environment Variables → confirm `STRIPE_WEBHOOK_SECRET` present → Deployments → confirm latest deploy after var was set |
| `/api/health` returns 200 with all services ok | STRP-03 | Production-only smoke test | `curl -s -H "Authorization: Bearer <HEALTH_SECRET>" https://rideprestige.com/api/health \| jq .` → expect `{"status":"ok","services":{"supabase":{"ok":true},"stripe":{"ok":true},"resend":{"ok":true}}}` |
| Google Maps server-side key has no HTTP referrer restriction | MAPS-01 | Google Cloud Console config | Google Cloud Console → Credentials → edit `GOOGLE_MAPS_API_KEY` → confirm Application restrictions = None (not HTTP referrers) |
| Google Maps client-side key restricted to `https://rideprestige.com/*` | MAPS-02 | Google Cloud Console config | Google Cloud Console → Credentials → edit `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` → confirm HTTP referrers includes `https://rideprestige.com/*` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
