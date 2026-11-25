---
phase: "94"
slug: "driver-cabinet"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-25"
---

# Phase 94 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 94-RESEARCH.md §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1 + @testing-library/react (jsdom; `// @vitest-environment node` for source gates) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/driver-cabinet-*.test.ts tests/driver-offer.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~90 seconds (full), ~15 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** the changed test file via `npx vitest run <file>` plus `npx tsc --noEmit` (baseline: 8 old errors in `tests/` only)
- **After every plan wave:** all `tests/driver-*.test.ts`, `tests/admin-assignment.test.ts`, `tests/admin-drivers.test.ts`, `tests/middleware-*.test.ts`, `tests/next-config-headers.test.ts`, `tests/status-writers-gate.test.ts`
- **Before `/gsd-verify-work`:** full suite green, then the `verify` skill
- **Max feedback latency:** 90 seconds

---

## Per-Requirement Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DCAB-01 | request-code: unknown / not-invited / disabled email → identical 200, no email, no row; invited → code row (hash only) + email; rate limits (IP, per-email) fail-closed; verify: wrong code increments, 6th try locked, expired/consumed rejected, success returns cookie | unit (route + auth module, Supabase/Resend/rate-limit mocked) | `npx vitest run tests/driver-cabinet-auth.test.ts` | ❌ Wave 0 |
| DCAB-01 | RPC `consume_driver_login_code` exists, SECURITY DEFINER, `attempts < 5`, REVOKE FROM PUBLIC, anon, authenticated, GRANT service_role | migration text | `npx vitest run tests/driver-cabinet-migration.test.ts` | ❌ Wave 0 |
| DCAB-02 | cookie attrs (httpOnly, sameSite lax, maxAge 30 d, path /), DB holds only hash, expired row rejected, sign-out deletes row + clears cookie | unit | `npx vitest run tests/driver-cabinet-session.test.ts` | ❌ Wave 0 |
| DCAB-03 | admin invite/disable route: 401/403 guards, uuid, sets flag, disable deletes sessions + codes + subscriptions; `requireDriver` rejects right after disable with the same cookie | unit | `npx vitest run tests/admin-driver-cabinet.test.ts` | ❌ Wave 0 |
| DCAB-04 | `lib/driver-cabinet/**` and cabinet routes import nothing from `@/lib/supabase/server`; `getAdminUser`/customer pages ignore the driver cookie (driver cookie only → 401/redirect); `/account` unchanged | source gate + unit | `npx vitest run tests/driver-cabinet-isolation.test.ts` | ❌ Wave 0 |
| DCAB-05 | every query function requires `driverId` and applies `.eq('driver_id', …)`; foreign `assignmentId` → uniform not-found; select strings contain none of `amount_eur|amount_czk|payment_|client_email|client_phone` (list queries) | unit + source gate | `npx vitest run tests/driver-cabinet-queries.test.ts` | ❌ Wave 0 |
| DCAB-06 | Upcoming/Past partition, Prague day grouping across DST (2026-10-25 and 2027-03-28 boundaries), month totals only from completed priced rides, no "0 CZK", plate or "Pending", cancelled badge in Past | unit (pure view-model in `lib/driver-cabinet/format.ts`) | `npx vitest run tests/driver-cabinet-rides.test.ts` | ❌ Wave 0 |
| DCAB-07 | offers predicate: pending + newest-of-booking + non-terminal; superseded and cancelled hidden; first name only (no last name/phone); fee omitted when null | unit | `npx vitest run tests/driver-cabinet-offers.test.ts` | ❌ Wave 0 |
| DCAB-08 | `respondToOffer` token caller keeps today's outcomes (`invalid_token`, `used`, expiry); session caller ignores expiry, burns `token_used_at`, rejects foreign/superseded/non-pending; both fire the same effects; existing respond tests still pass | unit | `npx vitest run tests/driver-offer.test.ts tests/admin-assignment.test.ts tests/driver-accept-email.test.ts` | ❌ Wave 0 (new) + ✅ existing |
| DCAB-09 | `/driver/rides/[assignmentId]` renders TripScreen for own assignment, uniform not-found for others, Back link, fee label shown; token page unchanged (existing `tests/driver-trip.test.ts`, `tests/driver-trip-progress.test.ts`, `tests/status-writers-gate.test.ts` stay green); no `bookings` write in cabinet files | unit/RTL + source gate | `npx vitest run tests/driver-cabinet-ride-detail.test.tsx tests/driver-trip.test.ts tests/status-writers-gate.test.ts` | ❌ Wave 0 + ✅ existing |
| DCAB-10 | stats math (denominator 0 → "—"), help route session-gated and passes fixed reference, sign-out clears `cw_*` cookies | unit | `npx vitest run tests/driver-cabinet-you.test.ts` | ❌ Wave 0 |
| DCAB-11 | assign route: cabinet driver → cabinet CTA email + push; non-cabinet → byte-identical old email; `notification_flags.driver_assigned === false` suppresses both | unit | `npx vitest run tests/admin-assignment.test.ts tests/driver-cabinet-assign-email.test.ts` | ✅ existing + ❌ Wave 0 |
| DCAB-12 | `sendOfferPush`: no env → no-op; 404/410 prune; other error logged without endpoint/keys; payload has no passenger name/fee/token; subscribe route validates endpoint (https) + keys, upserts by endpoint, session-gated; `public/driver/sw.js` always calls `showNotification`, never `importScripts`; manifest JSON scope `/driver/`, display standalone | unit + file gate | `npx vitest run tests/driver-cabinet-push.test.ts tests/driver-cabinet-pwa.test.ts` | ❌ Wave 0 |
| DCAB-13 | `/api/driver/cabinet` in both CSRF lists (evil Origin 403, missing Origin 403, same-origin pass); rate-limit keys exist; `worker-src 'self'` in `buildCsp` and help CSP; `/driver/sw.js` header entry; matcher test still green | unit | `npx vitest run tests/middleware-csrf-forms.test.ts tests/middleware-i18n.test.ts tests/next-config-headers.test.ts tests/middleware-matcher.test.ts tests/driver-cabinet-security.test.ts` | ✅ existing (extend) + ❌ Wave 0 |

Manual-only (human UAT, cannot be automated here): real Android Chrome and iOS 16.4+ Home-Screen push receipt; email deep link opens `/driver/offers` and survives a login; light-theme visual check on a phone-sized viewport (use the preview tools, not manual asks to the user, per the self-verify rule); one production sign-in by the owner after invite.

*Status per task is filled by the planner/executor (⬜ pending · ✅ green · ❌ red · ⚠️ flaky).*

---

## Wave 0 Requirements

- [ ] `tests/driver-cabinet-*.test.ts` / `tests/driver-offer.test.ts` / `tests/admin-driver-cabinet.test.ts` — files listed above (all new)
- [ ] `tests/helpers/fake-driver-cabinet-db.ts` — small in-memory fake for `drivers`, `driver_login_codes`, `driver_sessions`, `driver_assignments`, `bookings` (pattern: `tests/helpers/fake-payments-db.ts`, `fake-tours-db.ts`) so auth/queries tests exercise real filtering instead of chained mocks
- [ ] Extend `tests/driver-trip.test.ts` mock helpers only if the shared loader changes call counts (the select is still one call)
- [ ] Update `tests/middleware-i18n.test.ts` / `tests/middleware-tour-photos-csp.test.ts` for `worker-src 'self'`
- [ ] Framework install: none (vitest present). Package install: `web-push@3.6.7` behind a human-verify checkpoint
- Golden rule from CLAUDE.md: snapshot/JSON-LD tests must normalize `priceValidUntil`; not touched by this phase.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Push received on a real Android Chrome and an iOS 16.4+ Home-Screen install | DCAB-12 | needs a real device and OS permission prompt | owner installs the cabinet on the home screen, allows notifications, operator assigns a test ride |
| Offer email deep link opens `/driver/offers` and survives the code sign-in | DCAB-11 | real inbox + device | owner as test driver receives an offer email and taps the button |
| One production sign-in after invite | DCAB-01, DCAB-03 | live email delivery | owner invites their own test driver row and signs in |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
