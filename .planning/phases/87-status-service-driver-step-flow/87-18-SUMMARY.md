---
phase: 87-status-service-driver-step-flow
plan: 18
subsystem: driver-help-chat
tags: [chatwoot, hmac-identity, driver-trip, security, gap-closure]
status: complete
requirements: [DRV-01]
requires:
  - phase: 87-17
    provides: lib/driver-help-contract.ts (driverChatIdentifier, DriverHelpConfigResponse, DRIVER_HELP_CONTEXT_KEYS)
provides:
  - "POST /api/driver/trip/[token]/help: token-gated driver Chatwoot widget config"
  - "buildDriverWidgetConfig() in lib/chatwoot-identity.ts"
  - "LIMITS '/api/driver/trip/help': 10"
  - "Chatwoot conversation attributes chat_role and driver_trip_ref (config as code)"
affects: [87-19, 87-20]
tech-stack:
  added: []
  patterns: ["fail-closed widget config", "env-pair inbox selection (driver pair, else Website pair)"]
key-files:
  created:
    - "app/api/driver/trip/[token]/help/route.ts"
    - tests/driver-help-route.test.ts
  modified:
    - lib/chatwoot-identity.ts
    - lib/rate-limit.ts
    - tests/infra-vps-isolation-guard.test.ts
    - tests/middleware-csrf-forms.test.ts
    - infra/chatwoot/custom-attributes.json
    - tests/chat-visit-context.test.ts
    - tests/chatwoot-config.test.ts
key-decisions:
  - "Separate route under the CSRF-protected /api/driver/trip prefix instead of widening the public /api/chatwoot/identity (which derives identity only from the Supabase session)"
  - "Driver identity carries a name only (no email, phone) so Chatwoot cannot merge a driver into a customer contact"
  - "Fail closed: missing base URL, website token or HMAC secret returns { enabled: false }; a non-uuid driver id or empty booking reference does too"
  - "Inbox choice is env only: CHATWOOT_DRIVER_WEBSITE_TOKEN + CHATWOOT_DRIVER_WIDGET_HMAC_SECRET used when BOTH set, else the Website pair"
metrics:
  tasks: 3
  completed: 2026-11-03
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
plan_head_before: af012c8f84eecc11862c37efcf1ac15eee8cde45
plan_head_after: 595ca46d495fce7a1f97a7e516881c4d3febd5ad
---

# Phase 87 Plan 18: Driver help identity endpoint Summary

Token-gated POST /api/driver/trip/[token]/help that turns a live trip link into an HMAC-identified Chatwoot widget config (`driver:<uuid>`, name only, conversation attributes chat_role=driver and driver_trip_ref), so driver Help chats are no longer anonymous and cannot become CRM Leads (87-UAT gap 3, server half).

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | Live trip link gets identified driver widget config | 452f7e8b |
| 2 | Uniform rejections, driver-inbox env pair, fail closed, hygiene, CSRF | bd33546b |
| 3 | Chatwoot conversation attributes chat_role, driver_trip_ref | 595ca46d |

## What was built

- Route: size guard (1 KB), rate limit `/api/driver/trip/help` (10/min/IP), uuid check before any DB call, one live lookup (`driver_assignments` + `bookings!inner` + `drivers`), `isTripLinkValid`, one identical `400 { error: 'invalid_token' }` for every rejection reason, `Cache-Control: no-store`, POST only, no token/name/HMAC logging.
- `buildDriverWidgetConfig`: reuses `computeIdentifierHash`, `normalizeBaseUrl`, `trimOrNull`, `isSafeWidgetBaseUrl`; name `<driver> (driver)` capped at 120 or `Driver`; booking reference stripped of control characters and capped at 60.
- Guard allowlist entry in `tests/infra-vps-isolation-guard.test.ts` (route reads env and computes the HMAC locally, no VPS call).
- CSRF: no middleware change; two new tests prove the `/api/driver/trip` prefix gives 403 on a foreign Origin.
- `infra/chatwoot/custom-attributes.json`: 17 conversation attributes; key tests accept visit-context keys plus `DRIVER_HELP_CONTEXT_KEYS`.

## Verification

- `npx vitest run` on driver-help-route, infra-vps-isolation-guard, middleware-csrf-forms, chat-visit-context, chatwoot-config, driver-help-contract: 6 files, 197 tests passed.
- `npx tsc --noEmit`: no errors outside `tests/` (baseline). Scoped eslint clean.

## Deviations from Plan

None - plan executed exactly as written. One small addition inside the plan's intent (Rule 2): `buildDriverWidgetConfig` also returns `{ enabled: false }` instead of throwing when the driver id is not a uuid or the booking reference is empty after cleaning, so a bad row can never produce a 500 or an unlabelled chat.

## Owner steps (87-20, not done here)

- Set `CHATWOOT_DRIVER_WEBSITE_TOKEN` and `CHATWOOT_DRIVER_WIDGET_HMAC_SECRET` in Vercel for the Drivers inbox (until then the Website pair is used; if neither pair is complete the endpoint answers `{ enabled: false }`).
- Dry-run then run `node infra/chatwoot/sync.mjs --only attributes` to create the two attribute definitions live.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-87-56..60 mitigated and covered by tests).

## Self-Check: PASSED

Created files found: `app/api/driver/trip/[token]/help/route.ts`, `tests/driver-help-route.test.ts`; commits 452f7e8b, bd33546b, 595ca46d present.
