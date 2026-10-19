---
phase: 82-site-crm-chatwoot-sync-foundation
plan: 06
subsystem: outbox-digest
tags: [outbox, digest, resend, cron, SYNC-05, D-11]
requires:
  - "82-02: outboxHealth (lib/outbox-admin-store.ts), outboxEventLabel (lib/outbox-labels.ts)"
  - "existing daily outbox sweep (81-10)"
provides:
  - "lib/outbox-digest.ts: buildOutboxDigest, sendOutboxDigest ('sent' | 'no_problems' | 'unconfigured')"
  - "sweep step digest_failed + response field digest"
affects: [outbox sweep response shape (new field `digest`)]
tech-stack:
  added: []
  patterns: [step() isolation, injectable sender/env/clock for pure tests]
key-files:
  created:
    - lib/outbox-digest.ts
    - tests/outbox-digest.test.ts
  modified:
    - app/api/cron/outbox-sweep/route.ts
    - tests/outbox-sweep.test.ts
decisions:
  - "Subject uses the singular 'Prestigo sync: 1 event needs attention' when N = 1; N >= 2 follows the spec literal"
  - "Failed rows are grouped by human label (all lead.* types are one 'Lead' row), sorted by count desc then label"
  - "Site URL is trimmed and trailing slashes stripped (a pasted env var with a trailing newline gave a broken link before in Phase 81)"
  - "The default Resend sender throws on a Resend {error} result, so a rejected send surfaces as digest_failed in the sweep"
  - "no_problems is checked before configuration, so a missing env var never matters on a healthy day"
status: complete
commits: 2
plan_head_before: c7ab2f3fe2d25f16e1be293b798a025cbf3d38e2
plan_head_after: 9fb1de69048e222e1a8abbb81630cd118a49d2db
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
metrics:
  completed: 2026-10-19
---

# Phase 82 Plan 06: Daily outbox problems digest Summary

The existing 04:00 UTC outbox sweep now emails the owner (MANAGER_EMAIL) once, only when sync events have failed or are stuck, with counts, a per-type list and one link to /admin/outbox (SYNC-05, D-11). The step is isolated, so a digest problem never stops the nightly re-publish.

## Status

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Tracer: sweep -> outboxHealth -> digest only when problems -> one Resend email | Done | caff9572 |
| 2 | Digest privacy, caps and failure isolation tests | Done | 9fb1de69 |

## What was built

- **lib/outbox-digest.ts**
  - `buildOutboxDigest(health, { siteUrl, asOf })` is pure. It returns null when failed + stuck is 0. Otherwise: subject `Prestigo sync: {N} events need attention`, body `{F} failed and {S} stuck sync events as of 19 October 2026, 04:00 UTC. Check that the CRM server is reachable, then open the Outbox to retry.`, a "Failed by type" list (at most 20 rows, then `+{N} more`), a single `Stuck: {S}` line, and the `Open Outbox` link. All interpolated text is HTML-escaped. Plain inline-styled HTML, no images, only standard entities.
  - `sendOutboxDigest(health, deps?)` returns `no_problems`, `unconfigured` (RESEND_API_KEY, MANAGER_EMAIL or NEXT_PUBLIC_SITE_URL missing or blank) or `sent`. It throws only when the send itself throws. Sender, env and clock are injectable.
- **Sweep route**: `const digest = await step('digest_failed', errors, async () => sendOutboxDigest(await outboxHealth()))` after the two enqueue steps and before `dueKeys`; `digest` added to the JSON response. All existing steps, codes and fields are unchanged. The route still imports no CRM or Chatwoot module (isolation guard passes).
- **Privacy (T-82-17)**: only counts and event-type labels are used. Tests assert no email, `+\d{8,}` phone, uuid or `sync.booking:`/`lead.*:` key in subject, HTML or text.
- **Isolation (T-82-18)**: tests prove that a throwing sender, or a failing health read, yields `digest_failed` and the sweep still publishes every due key and still reports the failed count.

## Verification

- `npx vitest run tests/outbox-digest.test.ts tests/outbox-sweep.test.ts tests/infra-vps-isolation-guard.test.ts`: 3 files, 64 tests passed.
- `npx eslint --quiet` on the four files: clean.
- `npx tsc --noEmit`: no errors mentioning the new or changed files.
- No hard-coded currency, no secrets, no package installs.
- Tracer gate: the end-to-end ordering test (digest sent once before the first publish, `digest: 'sent'` in the JSON) re-passed before expansion. No live email was sent from this worktree.

## Deviations from Plan

None to the code scope. Process notes:
- Task 1 included the hardening (20-row cap, escaping, URL trim, unconfigured handling) and the sender-failure sweep tests, because they were cheap to build in. Task 2 therefore added the remaining privacy/cap/escape/unconfigured tests, which passed on first run; its RED step was not observed separately.
- Existing sweep tests that used `toEqual` on the whole response were updated for the new `digest` field, and the digest/health modules are mocked in that file so no Supabase or Resend call is made.
- The `verify` skill file is absent in this worktree; tsc, eslint, scoped vitest and the currency/secret checks were run by hand.
- `plan_head_before` is the known base commit, not a ledger file (the sandbox rejects the compound git command that writes it).

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-82-17 (digest content) and T-82-18 (digest blocking the sweep) are mitigated and covered by tests.

## Self-Check: PASSED

- Files exist: lib/outbox-digest.ts, tests/outbox-digest.test.ts, changed route and sweep test.
- Commits exist: caff9572, 9fb1de69.
