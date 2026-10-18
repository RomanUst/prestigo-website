---
phase: 81-lead-capture-site-forms-supabase-espocrm
plan: 04
subsystem: admin-bookings
tags: [lead-capture, admin, supabase-migration, zod]
requires: []
provides:
  - "bookings.lead_channel column + bookings_lead_channel_check (migration 066, applied live 2026-10-18)"
  - "POST /api/admin/bookings requires channel and stores lead_channel"
  - "Required CHANNEL select in ManualBookingForm and AdminStep6Create"
affects: [81-09 booking-to-Lead mapper, Phase 85 conversion-by-channel stats]
tech-stack:
  added: []
  patterns: ["zod enum + DB CHECK (defence in depth)", "idempotent migration (ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS then ADD)"]
key-files:
  created:
    - supabase/migrations/066_bookings_lead_channel.sql
    - tests/manual-booking-channel.test.tsx
    - tests/lead-channel-migration.test.ts
  modified:
    - app/api/admin/bookings/route.ts
    - components/admin/ManualBookingForm.tsx
    - components/admin/AdminStep6Create.tsx
    - tests/admin-bookings.test.ts
    - tests/admin-bookings-payment-link.test.ts
decisions:
  - "CHANNEL select has no HTML required attribute so the visible error 'Please choose the booking channel.' is what blocks submit (same as plan behaviour spec)"
  - "tests/manual-booking-form-send-confirmation.test.tsx needed no change: it never submits the form"
metrics:
  duration: ~15m
  completed: 2026-10-18
status: partial
actuals:
  tokens: 4200
  tasks: 1
  commits: 1
plan_head_before: e402616a5fe02ad76897effbe173c320ad8aad3e
plan_head_after: 6033b558a4ea49e6aba8c0a7d5e1ef6570ffe036
requirements: [LEAD-06]
---

# Phase 81 Plan 04: Admin booking channel (D-08) Summary

Manual bookings now require a Channel (WhatsApp / Phone / Email / Partner / Other) that is validated by zod in the admin create API and stored in the new `bookings.lead_channel` column; migration 066 is written but NOT yet applied live.

## Tasks

| Task | Name | Status | Commit |
| ---- | ---- | ------ | ------ |
| 1 (tracer) | admin picks channel -> API validates -> lead_channel stored | DONE | 6033b558 |
| 2 | [BLOCKING] apply migration 066 to live Supabase | DONE - orchestrator applied via Supabase MCP | n/a |

### Task 1 details
- `supabase/migrations/066_bookings_lead_channel.sql`: `ADD COLUMN IF NOT EXISTS lead_channel text NULL`; `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT bookings_lead_channel_check CHECK (lead_channel IS NULL OR lead_channel IN ('whatsapp','phone','email','partner','other'))`; no backfill (existing rows stay NULL = unknown).
- `app/api/admin/bookings/route.ts`: `channel: z.enum([...])` required in `manualBookingSchema`; `lead_channel: d.channel` in the insert row.
- `ManualBookingForm.tsx`: `channel` state (''), CHANNEL select as first field of PASSENGER DETAILS, blocked with 'Please choose the booking channel.' before any fetch, `channel` in payload.
- `AdminStep6Create.tsx`: same select above the create button, same error text, `channel` in payload.
- Tests: fixtures in `admin-bookings.test.ts` and `admin-bookings-payment-link.test.ts` gained `channel: 'phone'`; new tests 5a/5c/5d (stored value, missing -> 400 and no insert, 'telegram' -> 400); new `manual-booking-channel.test.tsx` (options + placeholder, blocked submit with no fetch, POST body carries `email`); new `lead-channel-migration.test.ts` (idempotent column, CHECK values, no UPDATE).

### Task 2: DONE (applied by orchestrator via Supabase MCP, 2026-10-18)
- `apply_migration` `066_bookings_lead_channel` on project enakcryrtxlnjvjutfpv: success.
- `information_schema.columns`: one row `lead_channel | text | YES`.
- `pg_get_constraintdef(bookings_lead_channel_check)`: `CHECK (((lead_channel IS NULL) OR (lead_channel = ANY (ARRAY['whatsapp','phone','email','partner','other']))))`, contains 'whatsapp' and 'other'.
- `count(*) where lead_channel is not null`: 0.
T-81-11 closed: the column exists live before the admin route that writes it ships.

## Verification (run in worktree)
- `npx vitest run` on the 5 plan test files: 5 files, 121 tests passed. Also ran `gnet-status-push`, `admin-bookings-kpi-decoupling`, `BookingsTable` tests: 52 passed.
- `npx eslint --quiet` on the 3 source files + 2 new tests: clean.
- `npx tsc --noEmit`: 8 errors (the known baseline, tests/ only), none new.
- Not done: browser check of the admin form via preview `prestigo` and the `verify` skill (executor sandbox, node_modules symlinked from main checkout and not committed).

## Deviations from Plan
None to the code plan. Note: `tests/manual-booking-form-send-confirmation.test.tsx` listed in the plan was left unchanged because none of its tests submit the form. The worktree had no `node_modules`; an untracked (gitignored) symlink to the main checkout's `node_modules` was used to run tests.

## Known Stubs
None.

## Threat Flags
None. T-81-10 mitigated (zod enum + DB CHECK). T-81-11 mitigated (live apply done before ship).

## Self-Check: PASSED
- supabase/migrations/066_bookings_lead_channel.sql, tests/manual-booking-channel.test.tsx, tests/lead-channel-migration.test.ts exist.
- Commit 6033b558 exists on branch worktree-agent-a8c6863139eb64011.
